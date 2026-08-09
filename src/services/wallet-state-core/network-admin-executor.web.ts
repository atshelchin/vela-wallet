/**
 * The only place the `network_admin` core touches the outside world.
 *
 * Sixteen operations, each one existing service call or one HTTP request. No
 * branching on business meaning: the dedup gate, the candidate assembly, the
 * fastest-RPC pick, the contract verdict, the identity check and the
 * clear-key-removes-provider rule are all decided (and tested) in Rust.
 *
 * Two things this file owns deliberately, because the core's module doc assigns
 * them to the shell:
 *
 * - **Timeouts.** The four legacy `eth_chainId` probes (`checkEndpointHealth`,
 *   `testRpcLatency`, `probeRpcChainId`, the provider modal's) collapse into one
 *   `probe_rpc` operation, so one budget serves them: `NET_TIMEOUTS.networkCheck`
 *   (10s), the value three of the four already used. The provider modal's 6s
 *   becomes 10s — a slow key now reads slow instead of unavailable.
 * - **Transport.** `ws://` / `wss://` RPC URLs are probed over a WebSocket, the
 *   `checkEndpointHealth` branch; everything else is a JSON-RPC POST. The
 *   explorer probe stays a `no-cors` GET, the only honest cross-origin liveness
 *   signal.
 *
 * Wire vs stored shape: the core speaks snake_case (`rpc_url`, `added_at_iso`),
 * the four AsyncStorage keys hold the camelCase records `services/storage.ts`
 * writes today (`rpcURL`, `addedAt`). Translating between them is this file's
 * job — the stored bytes stay byte-compatible with the TypeScript services so
 * native and web read the same records.
 *
 * Failure contract (shared effect loop): nothing rejects. Every rejection is
 * converted into the result variant that operation answers with.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { refreshCustomNetworks } from '@/models/network';
import type { CustomNetwork, NetworkConfig } from '@/models/types';
import { clearBundlerCache } from '@/services/bundler-service';
import { fetchRawChainData, loadSearchIndex } from '@/services/chain-registry';
import { fetchWithTimeout, NET_TIMEOUTS } from '@/services/net';
import { invalidateAllPools, refreshPool } from '@/services/rpc-pool';
import type { RpcProviderKeys } from '@/services/rpc-providers';
import { saveRpcProviders, saveServiceEndpoints } from '@/services/storage';

import type { NetChainIndexEntry } from './generated/NetChainIndexEntry';
import type { NetCustomNetwork } from './generated/NetCustomNetwork';
import type { NetHealthBody } from './generated/NetHealthBody';
import type { NetNetworkConfig } from './generated/NetNetworkConfig';
import type { NetProviderKeys } from './generated/NetProviderKeys';
import type { NetRawChainData } from './generated/NetRawChainData';
import type { NetServiceEndpoints } from './generated/NetServiceEndpoints';
import type { NetShellResult } from './generated/NetShellResult';
import type { NetStoredEndpoints } from './generated/NetStoredEndpoints';
import type { NetEffect } from './network-admin-types';

/** The same four keys `services/storage.ts` owns; the value formats are unchanged. */
const KEYS = {
  customNetworks: 'vela.customNetworks',
  networkConfig: 'vela.networkConfig',
  serviceEndpoints: 'vela.serviceEndpoints',
  rpcProviders: 'vela.rpcProviders',
} as const;

/** `rpcCall`'s / `testRpcLatency`'s / `checkEndpointHealth`'s shared budget. */
const PROBE_TIMEOUT_MS = NET_TIMEOUTS.networkCheck;

/** RIP-7212 P256 precompile address (network-checker.ts:180). */
const P256_PRECOMPILE = '0x0000000000000000000000000000000000000100';

/** sha256("test") signed with a known P-256 key — network-checker.ts:183-189. */
const VALID_P256_CALL =
  '0x' +
  '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08' +
  '7bf0e18d07660f15994adce5c3836d7bd6167cdb5726f631098f433ebe0be9c0' +
  '3936edbe5c791477e714e58244afb690b9b88b833ff4acdf0fbd1b28bf0b1182' +
  '3be8cbcb3f590087711ae5ed74b9cd06a88058d0bbe700b5f0ec5a1bfac15592' +
  'f989ef9bfaae0fee03c36625e88eae99806a879d813411f876e7e03a2ffd8314';

// ---------------------------------------------------------------------------
// Codecs — wire (snake_case) vs stored (camelCase)
// ---------------------------------------------------------------------------

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');
const asOptionalString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

/**
 * Decode one stored `CustomNetwork`. A codec, not a policy: serde rejects a
 * record whose fields are missing or mistyped, and a rejected `StoreLoaded`
 * would strand the core unloaded forever (every write is then dropped), so junk
 * is coerced to the empty/zero value — the same nothing-useful a record with
 * `undefined` fields renders as today.
 */
function decodeCustomNetwork(raw: unknown): NetCustomNetwork | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const chainId = Number(r.chainId);
  return {
    id: asString(r.id),
    display_name: asString(r.displayName),
    chain_id: Number.isFinite(chainId) ? chainId : 0,
    icon_label: asString(r.iconLabel),
    icon_color: asString(r.iconColor),
    icon_bg: asString(r.iconBg),
    logo_url: asString(r.logoURL),
    is_l2: r.isL2 === true,
    rpc_url: asString(r.rpcURL),
    explorer_url: asString(r.explorerURL),
    bundler_url: asString(r.bundlerURL),
    native_symbol: asString(r.nativeSymbol),
    added_at_iso: asString(r.addedAt),
  };
}

function encodeCustomNetwork(n: NetCustomNetwork): CustomNetwork {
  return {
    id: n.id,
    displayName: n.display_name,
    chainId: n.chain_id,
    iconLabel: n.icon_label,
    iconColor: n.icon_color,
    iconBg: n.icon_bg,
    logoURL: n.logo_url,
    isL2: n.is_l2,
    rpcURL: n.rpc_url,
    explorerURL: n.explorer_url,
    bundlerURL: n.bundler_url,
    nativeSymbol: n.native_symbol,
    addedAt: n.added_at_iso,
  };
}

function decodeNetworkConfig(raw: unknown): NetNetworkConfig | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const chainId = Number(r.chainId);
  return {
    chain_id: Number.isFinite(chainId) ? chainId : 0,
    rpc_url: asString(r.rpcURL),
    explorer_url: asString(r.explorerURL),
    bundler_url: asString(r.bundlerURL),
  };
}

function encodeNetworkConfig(c: NetNetworkConfig): NetworkConfig {
  return {
    chainId: c.chain_id,
    rpcURL: c.rpc_url,
    explorerURL: c.explorer_url,
    bundlerURL: c.bundler_url,
  };
}

/** `loadArray`'s body: absent, unparseable or non-array contents read as empty. */
function decodeArray<T>(raw: string | null, decode: (item: unknown) => T | null): T[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map(decode).filter((item): item is T => item !== null);
}

/**
 * The RAW endpoints blob — absent fields stay absent so the core applies the
 * same `{...DEFAULT_SERVICE_ENDPOINTS, ...JSON.parse(raw)}` merge storage.ts
 * does. (`loadServiceEndpoints()` would have merged them here already, which is
 * why this reads the key itself.)
 */
function decodeStoredEndpoints(raw: string | null): NetStoredEndpoints {
  const empty: NetStoredEndpoints = {
    ethereum_data_url: null,
    passkey_index_url: null,
    bundler_service_url: null,
    fiat_rates_url: null,
  };
  if (!raw) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (parsed === null || typeof parsed !== 'object') return empty;
  const r = parsed as Record<string, unknown>;
  return {
    ethereum_data_url: asOptionalString(r.ethereumDataURL),
    passkey_index_url: asOptionalString(r.passkeyIndexURL),
    bundler_service_url: asOptionalString(r.bundlerServiceURL),
    fiat_rates_url: asOptionalString(r.fiatRatesURL),
  };
}

function decodeProviderKeys(raw: string | null): NetProviderKeys {
  const empty: NetProviderKeys = { alchemy: null, drpc: null, ankr: null };
  if (!raw) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (parsed === null || typeof parsed !== 'object') return empty;
  const r = parsed as Record<string, unknown>;
  return {
    alchemy: asOptionalString(r.alchemy),
    drpc: asOptionalString(r.drpc),
    ankr: asOptionalString(r.ankr),
  };
}

/** `NetProviderKeys` → the `RpcProviderKeys` shape `saveRpcProviders` cleans. */
function encodeProviderKeys(keys: NetProviderKeys): RpcProviderKeys {
  const out: RpcProviderKeys = {};
  if (keys.alchemy !== null) out.alchemy = keys.alchemy;
  if (keys.drpc !== null) out.drpc = keys.drpc;
  if (keys.ankr !== null) out.ankr = keys.ankr;
  return out;
}

/**
 * `/chains/eip155-{id}.json` as the core wants it: raw, unfiltered. Only the
 * explorer entries are flattened to their `url` (the core's field is a string
 * list); every parsing *decision* — the `??` defaults, the HTTPS filter, the
 * key-placeholder rejection — belongs to `parse_chain_data` in Rust.
 */
function decodeRawChainData(data: unknown): NetRawChainData | null {
  if (data === null || typeof data !== 'object') return null;
  const r = data as Record<string, unknown>;
  const native = (r.nativeCurrency ?? null) as Record<string, unknown> | null;
  const chainId = typeof r.chainId === 'number' ? r.chainId : null;
  const decimals =
    native && typeof native.decimals === 'number' ? native.decimals : null;
  return {
    chain_id: chainId,
    name: asOptionalString(r.name),
    short_name: asOptionalString(r.shortName),
    native_currency_name: native ? asOptionalString(native.name) : null,
    native_currency_symbol: native ? asOptionalString(native.symbol) : null,
    native_currency_decimals: decimals,
    rpc: Array.isArray(r.rpc) ? r.rpc.filter((u): u is string => typeof u === 'string') : [],
    explorers: Array.isArray(r.explorers)
      ? r.explorers.map((e) =>
          e !== null && typeof e === 'object'
            ? asString((e as Record<string, unknown>).url)
            : '',
        )
      : [],
    testnet: r.testnet === true,
  };
}

function decodeSearchIndex(rows: unknown): NetChainIndexEntry[] {
  if (!Array.isArray(rows)) return [];
  const out: NetChainIndexEntry[] = [];
  for (const raw of rows) {
    if (raw === null || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const chainId = Number(r.chainId);
    if (!Number.isFinite(chainId)) continue;
    out.push({
      chain_id: chainId,
      name: asString(r.name),
      short_name: asString(r.shortName),
      native_currency_symbol: asString(r.nativeCurrencySymbol),
      has_logo: r.hasLogo === true,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

/** `parseInt(json.result, 16)` guarded exactly as `probeRpcChainId` guards it. */
function parseReportedChainId(result: unknown): number | null {
  if (typeof result !== 'string') return null;
  const id = parseInt(result, 16);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function jsonRpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    },
    { timeoutMs: PROBE_TIMEOUT_MS },
  );
  if (!res.ok) return null;
  const json = await res.json();
  if (json.error) return null;
  return json.result ?? null;
}

/**
 * The WebSocket half of `checkEndpointHealth`'s rpc branch, reporting the chain
 * id rather than mere truthiness so it answers the unified probe vocabulary.
 */
function probeWebSocket(url: string, start: number): Promise<NetShellResult> {
  return new Promise<NetShellResult>((resolve) => {
    let settled = false;
    const ws = new WebSocket(url);
    const done = (reported: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {}
      resolve({
        type: 'probed',
        url,
        reported_chain_id: reported,
        latency_ms: Date.now() - start,
      });
    };
    const timer = setTimeout(() => done(null), PROBE_TIMEOUT_MS);
    ws.onopen = () => {
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }));
    };
    ws.onmessage = (event: MessageEvent) => {
      try {
        done(parseReportedChainId(JSON.parse(String(event.data)).result));
      } catch {
        done(null);
      }
    };
    ws.onerror = () => done(null);
  });
}

async function probeRpc(url: string): Promise<NetShellResult> {
  const start = Date.now();
  if (url.startsWith('wss://') || url.startsWith('ws://')) {
    return probeWebSocket(url, start);
  }
  const result = await jsonRpc(url, 'eth_chainId', []);
  return {
    type: 'probed',
    url,
    reported_chain_id: parseReportedChainId(result),
    latency_ms: Date.now() - start,
  };
}

/** `checkServiceEndpointHealth`'s `/api/health` fetch, verdict left to the core. */
async function fetchServiceHealthBody(baseURL: string): Promise<{ body: NetHealthBody; latencyMs: number }> {
  const start = Date.now();
  const res = await fetchWithTimeout(
    `${baseURL}/api/health?_t=${start}`,
    { method: 'GET' },
    { timeoutMs: PROBE_TIMEOUT_MS },
  );
  const latencyMs = Date.now() - start;
  if (!res.ok) return { body: { type: 'http_error', status: res.status }, latencyMs };
  const json = JSON.parse(await res.text());
  return {
    body: {
      type: 'identity',
      service: asOptionalString(json?.service),
      status: asOptionalString(json?.status),
    },
    latencyMs,
  };
}

/**
 * The fiat probe. `normalizeRates`' two accepted shapes decide the COUNT here
 * (a shell-side shape question); whether a count of zero is a failure is the
 * core's call.
 */
async function fetchFiatRatesBody(url: string): Promise<{ body: NetHealthBody; latencyMs: number }> {
  const start = Date.now();
  const res = await fetchWithTimeout(url, { method: 'GET' }, { timeoutMs: PROBE_TIMEOUT_MS });
  const latencyMs = Date.now() - start;
  if (!res.ok) return { body: { type: 'http_error', status: res.status }, latencyMs };
  const data = await res.json();
  const count = Array.isArray(data)
    ? data.length
    : data?.rates && typeof data.rates === 'object'
      ? Object.keys(data.rates).length
      : 0;
  return { body: { type: 'rates', rate_count: count }, latencyMs };
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

export async function executeNetworkAdminOperation(effect: NetEffect): Promise<NetShellResult> {
  const operation = effect.operation;
  switch (operation.type) {
    case 'read_store': {
      const [customNetworks, networkConfigs, endpoints, providers] = await Promise.all([
        AsyncStorage.getItem(KEYS.customNetworks),
        AsyncStorage.getItem(KEYS.networkConfig),
        AsyncStorage.getItem(KEYS.serviceEndpoints),
        AsyncStorage.getItem(KEYS.rpcProviders),
      ]);
      return {
        type: 'store_loaded',
        custom_networks: decodeArray(customNetworks, decodeCustomNetwork),
        network_configs: decodeArray(networkConfigs, decodeNetworkConfig),
        endpoints: decodeStoredEndpoints(endpoints),
        provider_keys: decodeProviderKeys(providers),
      };
    }

    case 'write_custom_networks': {
      await AsyncStorage.setItem(
        KEYS.customNetworks,
        JSON.stringify(operation.networks.map(encodeCustomNetwork)),
      );
      // `saveCustomNetwork` / `removeCustomNetwork` were always followed by this
      // in the TypeScript callers: the synchronous lookups (`networkForChainId`,
      // the home chain selector) read a cache, and a stale cache means a network
      // the user just added is invisible everywhere but this modal.
      await refreshCustomNetworks();
      return { type: 'written' };
    }

    case 'write_network_configs':
      await AsyncStorage.setItem(
        KEYS.networkConfig,
        JSON.stringify(operation.configs.map(encodeNetworkConfig)),
      );
      return { type: 'written' };

    case 'write_service_endpoints': {
      const endpoints: NetServiceEndpoints = operation.endpoints;
      // The TS saver, not a raw write: it also refreshes the in-memory cache the
      // synchronous getters (`getEthereumDataURL`, `getBundlerServiceURL`) read.
      await saveServiceEndpoints({
        ethereumDataURL: endpoints.ethereum_data_url,
        passkeyIndexURL: endpoints.passkey_index_url,
        bundlerServiceURL: endpoints.bundler_service_url,
        fiatRatesURL: endpoints.fiat_rates_url,
      });
      return { type: 'written' };
    }

    case 'write_rpc_providers':
      // Likewise: `saveRpcProviders` refreshes the cache the RPC pool reads
      // synchronously while building each chain's endpoint list.
      await saveRpcProviders(encodeProviderKeys(operation.keys));
      return { type: 'written' };

    case 'start_search_debounce':
      await new Promise<void>((resolve) => setTimeout(resolve, operation.ms));
      return { type: 'debounce_elapsed' };

    case 'fetch_search_index':
      return { type: 'search_index', chains: decodeSearchIndex(await loadSearchIndex()) };

    case 'fetch_chain_info':
      return {
        type: 'chain_info',
        chain_id: operation.chain_id,
        data: decodeRawChainData(await fetchRawChainData(operation.chain_id)),
      };

    case 'probe_rpc':
      return probeRpc(operation.url);

    case 'probe_reachable': {
      // An explorer is a website, not a JSON API: it sends no CORS headers, so a
      // normal fetch is blocked on web and every explorer falsely reads offline.
      // `no-cors` still sends the request, and "resolved without throwing" is the
      // only honest cross-origin liveness signal.
      const start = Date.now();
      await fetchWithTimeout(
        operation.url,
        { method: 'GET', mode: 'no-cors', redirect: 'follow' },
        { timeoutMs: PROBE_TIMEOUT_MS },
      );
      return { type: 'reachable', url: operation.url, ok: true, latency_ms: Date.now() - start };
    }

    case 'rpc_get_code': {
      const code = await jsonRpc(operation.url, 'eth_getCode', [operation.address, 'latest']);
      return {
        type: 'code',
        url: operation.url,
        address: operation.address,
        code: typeof code === 'string' ? code : null,
      };
    }

    case 'rpc_call_p256': {
      // `gas: 0x100000` is the zkSync-compatibility quirk of the legacy call.
      const result = await jsonRpc(operation.url, 'eth_call', [
        { to: P256_PRECOMPILE, data: VALID_P256_CALL, gas: '0x100000' },
        'latest',
      ]);
      return {
        type: 'p256_call',
        url: operation.url,
        result: typeof result === 'string' ? result : null,
      };
    }

    case 'fetch_service_health': {
      const { body, latencyMs } = await fetchServiceHealthBody(operation.base_url);
      return { type: 'service_health', field: operation.field, body, latency_ms: latencyMs };
    }

    case 'fetch_fiat_rates': {
      const { body, latencyMs } = await fetchFiatRatesBody(operation.url);
      return { type: 'fiat_rates', body, latency_ms: latencyMs };
    }

    case 'invalidate_pools':
      if (operation.chain_id === null) invalidateAllPools();
      else await refreshPool(operation.chain_id);
      return { type: 'invalidated' };

    case 'clear_bundler_cache':
      clearBundlerCache(operation.chain_id);
      return { type: 'bundler_cache_cleared' };
  }
}

export function networkAdminOperationFailure(
  effect: NetEffect,
  _error: unknown,
): NetShellResult {
  const operation = effect.operation;
  switch (operation.type) {
    case 'read_store':
      // An unreadable store reads as "nothing configured" — today's `catch { [] }`.
      // It still marks the core loaded, so writes are never silently dropped.
      return {
        type: 'store_loaded',
        custom_networks: [],
        network_configs: [],
        endpoints: {
          ethereum_data_url: null,
          passkey_index_url: null,
          bundler_service_url: null,
          fiat_rates_url: null,
        },
        provider_keys: { alchemy: null, drpc: null, ankr: null },
      };
    case 'write_custom_networks':
    case 'write_network_configs':
    case 'write_service_endpoints':
    case 'write_rpc_providers':
      // Best-effort, as the TS savers' callers swallow storage errors today; the
      // core's in-memory ledger stays authoritative.
      return { type: 'written' };
    case 'start_search_debounce':
      return { type: 'debounce_elapsed' };
    case 'fetch_search_index':
      // `loadSearchIndex`'s own `catch` already answers the stale cache or [].
      return { type: 'search_index', chains: [] };
    case 'fetch_chain_info':
      return { type: 'chain_info', chain_id: operation.chain_id, data: null };
    case 'probe_rpc':
      return { type: 'probed', url: operation.url, reported_chain_id: null, latency_ms: 0 };
    case 'probe_reachable':
      return { type: 'reachable', url: operation.url, ok: false, latency_ms: 0 };
    case 'rpc_get_code':
      return { type: 'code', url: operation.url, address: operation.address, code: null };
    case 'rpc_call_p256':
      return { type: 'p256_call', url: operation.url, result: null };
    case 'fetch_service_health':
      // The fetch threw, timed out, or the body was not JSON — TS lands all three
      // in the same `catch` ("Connection failed").
      return {
        type: 'service_health',
        field: operation.field,
        body: { type: 'failed' },
        latency_ms: 0,
      };
    case 'fetch_fiat_rates':
      return { type: 'fiat_rates', body: { type: 'failed' }, latency_ms: 0 };
    case 'invalidate_pools':
      return { type: 'invalidated' };
    case 'clear_bundler_cache':
      return { type: 'bundler_cache_cleared' };
  }
}
