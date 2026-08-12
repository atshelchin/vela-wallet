/**
 * Network administration — NATIVE controllers.
 *
 * Thin wrappers over the TypeScript services that stay the mobile
 * implementation: Hermes has no WebAssembly, so the `network_admin` Rust machine
 * cannot run here (FR-202). Every fetch, every ordering and every string below
 * is the one `SettingsScreen.tsx` and `RpcProvidersModal.tsx` executed inline
 * before these hooks existed — the code moved, the behaviour did not.
 *
 * `use-network-admin.web.ts` is the web twin, driven by the `network_admin`
 * core.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { DEFAULT_NETWORKS, getAllNetworks, refreshCustomNetworks, type Network } from '@/models/network';
import type { CompatibilityResult, CustomNetwork, NetworkConfig, ServiceEndpoints } from '@/models/types';
import { DEFAULT_SERVICE_ENDPOINTS } from '@/models/types';
import { clearBundlerCache } from '@/services/bundler-service';
import { fetchChainInfo, searchChains, type ChainInfo, type ChainSearchResult } from '@/services/chain-registry';
import { checkNetworkCompatibility } from '@/services/network-checker';
import {
  buildProviderRpcUrl,
  PROVIDER_ORDER,
  providerChainIds,
  type ProviderId,
  type RpcProviderKeys,
} from '@/services/rpc-providers';
import { invalidateAllPools, probeRpcChainId, refreshPool } from '@/services/rpc-pool';
import {
  getBundlerServiceURL,
  getRpcProviderKeys,
  loadCustomNetworks,
  loadNetworkConfigs,
  loadRpcProviders,
  loadServiceEndpoints,
  removeCustomNetwork,
  saveCustomNetwork,
  saveNetworkConfig,
  saveRpcProviders,
  saveServiceEndpoints,
} from '@/services/storage';

import type {
  AddNetworkController,
  EndpointHealth,
  NetworkCardView,
  NetworkEditorController,
  ProviderTestView,
  RpcProvidersController,
  ServiceEndpointsController,
  ServiceHealth,
} from './network-admin-controller-types';

// ---------------------------------------------------------------------------
// Probes (moved verbatim from SettingsScreen.tsx)
// ---------------------------------------------------------------------------

async function checkEndpointHealth(url: string, type: 'rpc' | 'explorer' | 'bundler'): Promise<EndpointHealth> {
  if (!url) return { status: 'error' };
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    if (type === 'rpc') {
      if (url.startsWith('wss://') || url.startsWith('ws://')) {
        // WebSocket RPC: open connection, send eth_chainId, wait for response
        return await new Promise<EndpointHealth>((resolve) => {
          const ws = new WebSocket(url);
          const done = (result: EndpointHealth) => { try { ws.close(); } catch {} clearTimeout(timeout); resolve(result); };
          ws.onopen = () => { ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })); };
          ws.onmessage = (e) => { try { const d = JSON.parse(e.data); if (d.result) done({ status: 'ok', latencyMs: Date.now() - start }); else done({ status: 'error' }); } catch { done({ status: 'error' }); } };
          ws.onerror = () => done({ status: 'error' });
          controller.signal.addEventListener('abort', () => done({ status: 'error' }));
        });
      }
      // HTTPS RPC: send eth_chainId, check for valid JSON-RPC response
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) return { status: 'error' };
      const json = await res.json();
      if (json.result) return { status: 'ok', latencyMs: Date.now() - start };
      return { status: 'error' };
    } else if (type === 'bundler') {
      // Bundler: may require API key, just check if server responds (even 401/403 means reachable)
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      // Any HTTP response means the server is reachable
      return { status: 'ok', latencyMs: Date.now() - start };
    } else {
      // Explorer: it's a website, not a JSON API — it sends no CORS headers (and
      // usually sits behind Cloudflare), so on web a normal fetch is blocked and
      // every explorer falsely reads "offline". Use no-cors: the opaque response
      // can't be inspected, but the request still goes out, so "resolved without
      // throwing" == host reachable. That's the only honest liveness signal we can
      // get for a cross-origin site, and it matches the bundler check above.
      await fetch(url, { method: 'GET', mode: 'no-cors', signal: controller.signal, redirect: 'follow' });
      clearTimeout(timeout);
      return { status: 'ok', latencyMs: Date.now() - start };
    }
  } catch {
    clearTimeout(timeout);
    return { status: 'error' };
  }
}

const SERVICE_IDENTITY: Record<string, string> = {
  data: 'ethereum-data',
  passkey: 'webauthn-p256-publickey-index',
  bundler: 'vela-relay',
};

async function checkServiceEndpointHealth(
  url: string, type: 'data' | 'passkey' | 'bundler' | 'fiat',
): Promise<ServiceHealth> {
  if (!url) return { status: 'unreachable', detail: 'Empty URL' };

  // 1. HTTPS check (allow http for localhost / 127.0.0.1 during development)
  const isLocalhost = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url);
  if (!url.startsWith('https://') && !isLocalhost) {
    return { status: 'not_https', detail: 'HTTPS required' };
  }

  // Fiat-rate provider: third-party (no /api/health) — GET the URL itself and
  // validate it returns a USD-based `{ rates: {...} }` map.
  if (type === 'fiat') {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(url.trim().replace(/[\r\n]/g, ''), { method: 'GET', signal: controller.signal });
      clearTimeout(timeout);
      const latencyMs = Date.now() - start;
      if (!res.ok) return { status: 'unreachable', latencyMs, detail: `HTTP ${res.status}` };
      const data = await res.json();
      // Accept Frankfurter v2's array shape or an object `{rates:{…}}` (open.er-api / v1).
      const n = Array.isArray(data)
        ? data.length
        : (data?.rates && typeof data.rates === 'object' ? Object.keys(data.rates).length : 0);
      if (!n) return { status: 'invalid_response', latencyMs, detail: 'No rates returned' };
      return { status: 'ok', latencyMs, detail: `${n} currencies` };
    } catch {
      clearTimeout(timeout);
      return { status: 'unreachable', detail: 'Connection failed' };
    }
  }

  // 2. Connectivity + 3. Response validation via /api/health
  const base = url.trim().replace(/[\r\n]/g, '').replace(/\/$/, '');
  const expected = SERVICE_IDENTITY[type];
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    console.log(`[HealthCheck] ${type} → GET ${base}/api/health?_t=${start}`);
    const res = await fetch(
      `${base}/api/health?_t=${start}`,
      { method: 'GET', signal: controller.signal },
    );
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;
    console.log(`[HealthCheck] ${type} → HTTP ${res.status}, ${latencyMs}ms`);
    if (!res.ok) return { status: 'unreachable', latencyMs, detail: `HTTP ${res.status}` };
    const text = await res.text();
    console.log(`[HealthCheck] ${type} → body: ${text}`);
    const json = JSON.parse(text);
    if (json.service !== expected || json.status !== 'ok') {
      console.log(`[HealthCheck] ${type} → INVALID: expected service="${expected}", got service="${json.service}" status="${json.status}"`);
      return { status: 'invalid_response', latencyMs, detail: `Not a valid ${expected} service` };
    }
    return { status: 'ok', latencyMs };
  } catch (e: any) {
    clearTimeout(timeout);
    console.log(`[HealthCheck] ${type} → CATCH: ${e?.message ?? e}`);
    return { status: 'unreachable', detail: 'Connection failed' };
  }
}

/** The four service-endpoint fields, in the order the editor renders them. */
export const ENDPOINT_FIELDS: {
  key: keyof ServiceEndpoints;
  healthType: 'data' | 'passkey' | 'bundler' | 'fiat';
}[] = [
  { key: 'ethereumDataURL', healthType: 'data' },
  { key: 'passkeyIndexURL', healthType: 'passkey' },
  { key: 'bundlerServiceURL', healthType: 'bundler' },
  { key: 'fiatRatesURL', healthType: 'fiat' },
];

const CHECKING: [EndpointHealth, EndpointHealth] = [{ status: 'checking' }, { status: 'checking' }];

// ---------------------------------------------------------------------------
// Network editor (per-chain RPC / explorer overrides)
// ---------------------------------------------------------------------------

export function useNetworkEditor(): NetworkEditorController {
  const [savedConfigs, setSavedConfigs] = useState<NetworkConfig[]>([]);
  const [allNetworks, setAllNetworks] = useState<Network[]>(DEFAULT_NETWORKS);
  const [customIds, setCustomIds] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<number, { rpcURL: string; explorerURL: string }>>({});
  const [healths, setHealths] = useState<Record<number, [EndpointHealth, EndpointHealth]>>({});
  const [expanded, setExpanded] = useState<number[]>([]);
  /** Last probed `[rpc, explorer]` pair per card — the effect's dependency check. */
  const probed = useRef<Record<number, string>>({});

  const open = useCallback(() => {
    loadNetworkConfigs().then(setSavedConfigs);
    getAllNetworks().then(setAllNetworks);
    loadCustomNetworks().then(cn => setCustomIds(new Set(cn.map(c => c.id))));
  }, []);

  // Re-seed the inputs whenever the saved config arrives or changes. The load is
  // asynchronous, so on the first render it can still be missing — and the
  // fallback (the built-in default) now differs from a saved URL only by its
  // query string, so without this sync a saved "…publicnode.com/?apikey=X"
  // rendered as the bare default and the user's key appeared to vanish.
  useEffect(() => {
    setDrafts(() => {
      const next: Record<number, { rpcURL: string; explorerURL: string }> = {};
      for (const n of allNetworks) {
        const saved = savedConfigs.find(c => c.chainId === n.chainId);
        next[n.chainId] = {
          rpcURL: saved?.rpcURL ?? n.rpcURL,
          explorerURL: saved?.explorerURL ?? n.explorerURL,
        };
      }
      return next;
    });
  }, [allNetworks, savedConfigs]);

  // One health run per expanded card, re-run when that card's values change —
  // the `[expanded, rpcURL, explorerURL]` effect each card used to own.
  useEffect(() => {
    for (const chainId of expanded) {
      const draft = drafts[chainId];
      if (!draft) continue;
      const signature = `${draft.rpcURL} ${draft.explorerURL}`;
      if (probed.current[chainId] === signature) continue;
      probed.current[chainId] = signature;
      setHealths(prev => ({ ...prev, [chainId]: CHECKING }));
      const fields: [string, 'rpc' | 'explorer'][] = [[draft.rpcURL, 'rpc'], [draft.explorerURL, 'explorer']];
      fields.forEach(([url, type], i) => {
        checkEndpointHealth(url, type).then(h => {
          setHealths(prev => {
            const current = prev[chainId] ?? CHECKING;
            const next = [...current] as [EndpointHealth, EndpointHealth];
            next[i] = h;
            return { ...prev, [chainId]: next };
          });
        });
      });
    }
  }, [expanded, drafts]);

  const expand = useCallback((chainId: number) => {
    delete probed.current[chainId];
    setExpanded(prev => (prev.includes(chainId) ? prev : [...prev, chainId]));
  }, []);

  const collapse = useCallback((chainId: number) => {
    delete probed.current[chainId];
    setExpanded(prev => (prev.includes(chainId) ? prev.filter(id => id !== chainId) : prev));
  }, []);

  const setRpcURL = useCallback((chainId: number, value: string) => {
    setDrafts(prev => ({ ...prev, [chainId]: { rpcURL: value, explorerURL: prev[chainId]?.explorerURL ?? '' } }));
  }, []);

  const setExplorerURL = useCallback((chainId: number, value: string) => {
    setDrafts(prev => ({ ...prev, [chainId]: { rpcURL: prev[chainId]?.rpcURL ?? '', explorerURL: value } }));
  }, []);

  const save = useCallback(async (chainId: number) => {
    const network = allNetworks.find(n => n.chainId === chainId);
    const draft = drafts[chainId];
    if (!network || !draft) return;
    // The bundler isn't editable per-network: the one configured in Service
    // Endpoints applies to every chain (the pool appends `/<chainId>`). Preserve
    // whatever was already saved so we never clobber a custom network's bundler.
    const saved = savedConfigs.find(c => c.chainId === chainId);
    await saveNetworkConfig({
      chainId,
      rpcURL: draft.rpcURL,
      explorerURL: draft.explorerURL,
      bundlerURL: saved?.bundlerURL ?? network.bundlerURL,
    });
    setSavedConfigs(await loadNetworkConfigs());
    // Flush caches so new endpoints take effect immediately
    refreshPool(chainId);
    clearBundlerCache(chainId);
  }, [allNetworks, drafts, savedConfigs]);

  const remove = useCallback(async (id: string) => {
    await removeCustomNetwork(id);
    await refreshCustomNetworks();
    // Drop the removed chain's cached endpoint list so nothing keeps querying it.
    invalidateAllPools();
    setAllNetworks(await getAllNetworks());
    setCustomIds(prev => { const next = new Set(prev); next.delete(id); return next; });
  }, []);

  const cards: NetworkCardView[] = allNetworks.map((network) => {
    const saved = savedConfigs.find(c => c.chainId === network.chainId);
    const draft = drafts[network.chainId];
    return {
      network,
      isCustom: customIds.has(network.id),
      rpcURL: draft?.rpcURL ?? saved?.rpcURL ?? network.rpcURL,
      explorerURL: draft?.explorerURL ?? saved?.explorerURL ?? network.explorerURL,
      healths: healths[network.chainId] ?? CHECKING,
    };
  });

  return {
    cards,
    open,
    expand,
    collapse,
    setRpcURL,
    setExplorerURL,
    save: (chainId) => { void save(chainId); },
    remove: (id) => { void remove(id); },
  };
}

// ---------------------------------------------------------------------------
// Service endpoints
// ---------------------------------------------------------------------------

export function useServiceEndpoints(): ServiceEndpointsController {
  const [endpoints, setEndpoints] = useState<ServiceEndpoints>({ ...DEFAULT_SERVICE_ENDPOINTS });
  const [healths, setHealths] = useState<Record<string, ServiceHealth>>({});
  const [refreshCount, setRefreshCount] = useState(0);
  const [opened, setOpened] = useState(false);

  const open = useCallback(() => {
    setOpened(true);
    loadServiceEndpoints().then(setEndpoints);
  }, []);

  // Health checks on open and manual refresh
  useEffect(() => {
    if (!opened) return;
    setHealths(Object.fromEntries(ENDPOINT_FIELDS.map(f => [f.key, { status: 'checking' as const }])));
    ENDPOINT_FIELDS.forEach(({ key, healthType }) => {
      checkServiceEndpointHealth(endpoints[key], healthType).then(h => {
        setHealths(prev => ({ ...prev, [key]: h }));
      });
    });
    // `endpoints` is deliberately not a dependency: the original effect re-ran on
    // open and on the refresh counter only, so typing does not fire a probe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, refreshCount]);

  const setValue = useCallback((key: keyof ServiceEndpoints, value: string) => {
    setEndpoints(prev => ({ ...prev, [key]: value }));
  }, []);

  const save = useCallback(async (key: keyof ServiceEndpoints) => {
    const clean = endpoints[key].trim().replace(/[\r\n]/g, '');
    const updated = { ...endpoints, [key]: clean };
    setEndpoints(updated);
    await saveServiceEndpoints(updated);
    invalidateAllPools();
    setRefreshCount(c => c + 1);
  }, [endpoints]);

  const refresh = useCallback(() => setRefreshCount(c => c + 1), []);

  const resetToDefaults = useCallback(() => {
    setEndpoints({ ...DEFAULT_SERVICE_ENDPOINTS });
    saveServiceEndpoints({ ...DEFAULT_SERVICE_ENDPOINTS });
    setRefreshCount(c => c + 1);
  }, []);

  return {
    fields: ENDPOINT_FIELDS.map(({ key }) => ({
      key,
      value: endpoints[key],
      health: healths[key] ?? { status: 'checking' },
    })),
    open,
    setValue,
    save: (key) => { void save(key); },
    refresh,
    resetToDefaults,
  };
}

// ---------------------------------------------------------------------------
// Add-network wizard
// ---------------------------------------------------------------------------

export function useAddNetworkWizard(): AddNetworkController {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<ChainSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedChainId, setSelectedChainId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [chainInfo, setChainInfo] = useState<ChainInfo | null>(null);
  const [compatResult, setCompatResult] = useState<CompatibilityResult | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [customRpc, setCustomRpc] = useState('');
  const [addedChainId, setAddedChainId] = useState<number | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    setQuery(''); setSuggestions([]); setSelectedChainId(null);
    setChainInfo(null); setCompatResult(null); setError(''); setCustomRpc('');
  }, []);

  // Debounced search
  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    setSelectedChainId(null);
    setChainInfo(null);
    setCompatResult(null);
    setError('');

    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!text.trim()) { setSuggestions([]); return; }

    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchChains(text);
        setSuggestions(results);
      } catch {} finally { setSearching(false); }
    }, 300);
  }, []);

  // Select a chain from suggestions
  const handleSelect = useCallback(async (chainId: number, keepCustomRpc = false) => {
    setSelectedChainId(chainId);
    setSuggestions([]);
    setLoading(true);
    setError('');
    setChainInfo(null);
    setCompatResult(null);
    if (!keepCustomRpc) setCustomRpc('');

    // Check if already exists
    const existing = DEFAULT_NETWORKS.find(n => n.chainId === chainId);
    const custom = await loadCustomNetworks();
    if (existing || custom.find(n => n.chainId === chainId)) {
      setError(`This network is already added`);
      setLoading(false);
      return;
    }

    try {
      const info = await fetchChainInfo(chainId);
      if (!info) { setError(`Chain ${chainId} not found`); setLoading(false); return; }
      setChainInfo(info);
      setQuery(info.name);

      const rpcs = [
        ...(customRpc.trim() ? [customRpc.trim()] : []),
        ...(info.rpcUrls.length > 0 ? info.rpcUrls : info.rpcUrl ? [info.rpcUrl] : []),
      ];
      if (rpcs.length > 0) {
        const compat = await checkNetworkCompatibility(rpcs, chainId);
        setCompatResult(compat);
      } else {
        setError('No RPC endpoint available for this network');
      }
    } catch (e: any) {
      setError(e.message ?? 'Check failed');
    } finally { setLoading(false); }
  }, [customRpc]);

  const handleAdd = useCallback(async () => {
    if (!chainInfo || !compatResult?.compatible) return;
    setSaving(true);
    try {
      const network: CustomNetwork = {
        id: `custom-${chainInfo.chainId}`,
        displayName: chainInfo.name,
        chainId: chainInfo.chainId,
        iconLabel: chainInfo.nativeCurrency.symbol.slice(0, 4),
        iconColor: '#888888',
        iconBg: '#F0F0F0',
        logoURL: chainInfo.logoURL,
        isL2: false,
        rpcURL: compatResult.bestRpcUrl ?? chainInfo.rpcUrl, // Use the fastest RPC
        explorerURL: chainInfo.explorerUrl,
        bundlerURL: `${getBundlerServiceURL()}/${chainInfo.chainId}`,
        nativeSymbol: chainInfo.nativeCurrency.symbol,
        addedAt: new Date().toISOString(),
      };
      await saveCustomNetwork(network);
      await refreshCustomNetworks();
      setAddedChainId(network.chainId);
      reset();
    } catch (e: any) { setError(e.message ?? 'Failed to save'); }
    finally { setSaving(false); }
  }, [chainInfo, compatResult, reset]);

  return {
    query,
    suggestions: suggestions.map(s => ({
      chainId: s.chainId,
      name: s.name,
      nativeCurrencySymbol: s.nativeCurrencySymbol,
    })),
    searching,
    loading,
    saving,
    error,
    chainInfo: chainInfo
      ? {
          chainId: chainInfo.chainId,
          name: chainInfo.name,
          nativeSymbol: chainInfo.nativeCurrency.symbol,
          isTestnet: chainInfo.isTestnet,
        }
      : null,
    compat: compatResult,
    selectedChainId,
    customRpc,
    addedChainId,
    setQuery: handleQueryChange,
    setCustomRpc,
    select: (chainId, keepCustomRpc) => { void handleSelect(chainId, keepCustomRpc); },
    add: () => { void handleAdd(); },
    reset,
  };
}

// ---------------------------------------------------------------------------
// RPC providers
// ---------------------------------------------------------------------------

const PROBE_TIMEOUT_MS = 6000;

export function useRpcProviders(): RpcProvidersController {
  const [draft, setDraft] = useState<RpcProviderKeys>({});
  const [tests, setTests] = useState<Partial<Record<ProviderId, ProviderTestView>>>({});

  const runTest = useCallback(async (id: ProviderId, rawKey: string) => {
    const key = rawKey.trim();
    if (!key) {
      setTests(prev => ({ ...prev, [id]: undefined }));
      return;
    }
    const chainIds = providerChainIds(id);
    const base = chainIds.map(cid => ({ chainId: cid, ok: false, latencyMs: 0 }));
    setTests(prev => ({ ...prev, [id]: { status: 'testing', results: base } }));

    const results = await Promise.all(
      base.map(async (r) => {
        const url = buildProviderRpcUrl(id, r.chainId, key);
        if (!url) return { ...r, ok: false, latencyMs: 0 };
        const t0 = Date.now();
        const reported = await probeRpcChainId(url, PROBE_TIMEOUT_MS);
        return { ...r, ok: reported === r.chainId, latencyMs: Date.now() - t0 };
      }),
    );
    setTests(prev => ({ ...prev, [id]: { status: 'done', results } }));
  }, []);

  // Seed drafts and auto-test configured providers whenever the sheet opens.
  const open = useCallback(() => {
    loadRpcProviders().then(() => {
      const saved = getRpcProviderKeys();
      setDraft({ ...saved });
      setTests({});
      for (const id of PROVIDER_ORDER) {
        if (saved[id]) void runTest(id, saved[id]!);
      }
    });
  }, [runTest]);

  // Persist all keys + invalidate pools so the next RPC call picks them up.
  const persist = useCallback(async (next: RpcProviderKeys) => {
    await saveRpcProviders(next);
    invalidateAllPools();
  }, []);

  const blur = useCallback((id: ProviderId) => {
    const next = { ...draft, [id]: (draft[id] ?? '').trim() };
    setDraft(next);
    void persist(next);
    void runTest(id, next[id] ?? '');
  }, [draft, persist, runTest]);

  const setKey = useCallback((id: ProviderId, value: string) => {
    setDraft(prev => ({ ...prev, [id]: value }));
    // Drop stale results so the old latency isn't shown against a new key.
    setTests(prev => ({ ...prev, [id]: undefined }));
  }, []);

  return {
    keys: draft,
    tests,
    open,
    setKey,
    blur,
    test: (id) => { void runTest(id, draft[id] ?? ''); },
  };
}
