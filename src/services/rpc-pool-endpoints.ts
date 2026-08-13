/**
 * Endpoint COLLECTION and the shell-side pure helpers of the RPC pool — the
 * half that is identical on every platform (spec 017, group G8).
 *
 * Split out of `rpc-pool.ts` in the platform-pair days so the two halves
 * could share one copy. The pair is gone; the split stays because everything
 * here is pure and has importers of its own.
 *
 * What is here is deliberately *not* decision-making: building each chain's
 * candidate list from config, probing a single URL, parsing a provider's
 * range-cap wording. Which endpoint to try, when to ban it, how long to back
 * off — those live in `rpc-pool.ts` (native) and in Rust (web).
 *
 * Everything below was moved verbatim from `rpc-pool.ts`; the ONE change is
 * that `collectRpcUrls`/`collectBundlerUrls` take the ban predicate as a
 * parameter. Native passes its own `isBanned` (byte-identical behaviour); the
 * web path passes a predicate that is always false, because there the ban map
 * is core state and the core filters bans at SELECTION, not at collection
 * (`rpc_pool.rs` invariant ⑧ — "Do NOT filter banned URLs").
 */

import { DEFAULT_NETWORKS, getAllNetworksSync } from '@/models/network';
import { fetchChainInfo } from './chain-registry';
import { getBundlerServiceURL, getNetworkConfig, getRpcProviderKeys } from './storage';
import { buildProviderRpcUrl, PROVIDER_ORDER } from './rpc-providers';

/**
 * Priority tier (see SOURCE_PRIORITY in the pool):
 *   user     = per-network override
 *   provider = configured key (Alchemy/dRPC/Ankr)
 *   default  = Vela built-in (CHAINS table)
 *   public   = Vela curated public fallback
 *   builtin  = ethereum-data chain-index (first few)
 *   fallback = the rest of the chain-index list, tried last
 */
export type RpcEndpointSource = 'user' | 'provider' | 'builtin' | 'default' | 'public' | 'fallback';

/** One collected candidate, before any stats or scoring exist for it. */
export interface CollectedEndpoint {
  url: string;
  source: RpcEndpointSource;
}

export interface RPCResponse {
  jsonrpc: string;
  id: number;
   
  result?: any;
   
  error?: { code: number; message: string; data?: any };
}

/** Persisted ban map key. One key, one format, both platforms. */
export const BANNED_STORAGE_KEY = 'vela.rpc.banned';

/** The persisted ban record — `BanEntry`, unchanged on disk since before 017. */
export interface StoredBanEntry {
  url: string;
  bannedAt: number;
  permanent: boolean;
}

/** Built-in bundler base URL (reads user config, falls back to default) */
const getBuiltinBundler = () => getBundlerServiceURL();

/** Get the built-in bundler base URL (for REST API calls). */
export function getBuiltinBundlerUrl(): string {
  return getBuiltinBundler();
}

/** Reliable public RPCs per chain (curated, known to work without auth). */
const PUBLIC_RPCS: Record<number, string[]> = {
  1:     ['https://ethereum-rpc.publicnode.com', 'https://1rpc.io/eth'],
  // 1rpc.io/bnb was dropped — it shares a global rate limit and returns -32001
  // "usage limit" under load. These three are CORS-enabled and reliable.
  56:    ['https://bsc-rpc.publicnode.com', 'https://bsc.drpc.org', 'https://bsc.meowrpc.com'],
  137:   ['https://polygon-bor-rpc.publicnode.com', 'https://1rpc.io/matic'],
  42161: ['https://arbitrum-one-rpc.publicnode.com', 'https://1rpc.io/arb'],
  10:    ['https://optimism-rpc.publicnode.com', 'https://1rpc.io/op'],
  8453:  ['https://base-rpc.publicnode.com', 'https://1rpc.io/base'],
  43114: ['https://avalanche-c-chain-rpc.publicnode.com', 'https://1rpc.io/avax/c'],
  100:   ['https://gnosis-rpc.publicnode.com', 'https://1rpc.io/gnosis'],
  // X Layer (OKB gas). Alchemy DOES cover X Layer (slug xlayer-mainnet, see rpc-providers.ts), so
  // the managed provider is now the primary getCode/nonce read; these curated public endpoints are
  // the FALLBACK. Both matter: without a working RPC here an xLayer send has NO way to read
  // eth_getCode, and (pre-fix) isDeployed fail-opened to "deployed" → empty initCode → bundler
  // "AA20 account not deployed". rpc.xlayer.tech is OKX's official endpoint; xlayer.drpc.org is the
  // same public dRPC endpoint the bundler uses. isDeployed now fails CLOSED, so a total read outage
  // surfaces as a retryable error instead of a doomed empty-initCode op.
  196:   ['https://rpc.xlayer.tech', 'https://xlayer.drpc.org'],
};

/** Never-banned predicate, for the web path where bans are core state. */
export const NEVER_BANNED = (_url: string): boolean => false;

export async function collectRpcUrls(
  chainId: number,
  isBanned: (url: string) => boolean,
): Promise<CollectedEndpoint[]> {
  const entries: CollectedEndpoint[] = [];
  const seen = new Set<string>();

  const add = (url: string, source: RpcEndpointSource) => {
    if (!url || seen.has(url) || isBanned(url)) return;
    seen.add(url);
    entries.push({ url, source });
  };

  // Chain index (configurable ethereum-data service, eip155-{id}.json) —
  // fetched once and reused for both the primary and the deep-fallback tiers.
  let indexRpcs: string[] = [];
  try {
    const info = await fetchChainInfo(chainId);
    indexRpcs = info?.rpcUrls ?? [];
  } catch { /* ignore */ }

  // 1. User-configured per-network override (highest)
  try {
    const config = await getNetworkConfig(chainId);
    const defaultNet = DEFAULT_NETWORKS.find(n => n.chainId === chainId);
    if (config?.rpcURL && config.rpcURL !== defaultNet?.rpcURL) {
      add(config.rpcURL, 'user');
    }
  } catch { /* ignore */ }

  // 2. Third-party provider keys (Alchemy/dRPC/Ankr). One global key per
  //    provider unlocks every network it serves. Added in PROVIDER_ORDER so that
  //    order is the cold-start tiebreak; measured latency takes over once known.
  try {
    const providerKeys = getRpcProviderKeys();
    for (const id of PROVIDER_ORDER) {
      const key = providerKeys[id];
      if (!key) continue;
      const url = buildProviderRpcUrl(id, chainId, key);
      if (url) add(url, 'provider');
    }
  } catch { /* ignore */ }

  // 3. Network default — Vela built-in (CHAINS table)
  const defaultNet = DEFAULT_NETWORKS.find(n => n.chainId === chainId);
  if (defaultNet?.rpcURL) add(defaultNet.rpcURL, 'default');

  // Custom network default
  const customNet = getAllNetworksSync().find(n => n.chainId === chainId);
  if (customNet?.rpcURL) add(customNet.rpcURL, 'default');

  // 4. Public fallback (curated reliable, CORS-friendly RPCs)
  for (const url of PUBLIC_RPCS[chainId] ?? []) add(url, 'public');

  // 5. ethereum-data chain index — first few entries.
  indexRpcs.slice(0, 5).forEach(url => add(url, 'builtin'));

  // 6. Deep fallback — the rest of the chain index (~15-20 RPCs/chain). Lowest
  //    priority, so it's only reached when everything above is rate-limited or
  //    banned. Bad/non-CORS entries get scored down or banned on first use.
  indexRpcs.slice(5, 20).forEach(url => add(url, 'fallback'));

  return entries;
}

export async function collectBundlerUrls(
  chainId: number,
  isBanned: (url: string) => boolean,
): Promise<CollectedEndpoint[]> {
  const entries: CollectedEndpoint[] = [];
  const seen = new Set<string>();
  const defaultChainIds = new Set(DEFAULT_NETWORKS.map(n => n.chainId));

  const add = (url: string, source: RpcEndpointSource) => {
    if (!url || seen.has(url) || isBanned(url)) return;
    seen.add(url);
    entries.push({ url, source });
  };

  // 1. User-configured override (from NetworkConfig editor)
  try {
    const config = await getNetworkConfig(chainId);
    if (config?.bundlerURL) {
      const defaultNet = DEFAULT_NETWORKS.find(n => n.chainId === chainId);
      // Skip if it's the unchanged default URL (user never intentionally set it)
      if (!defaultNet || config.bundlerURL !== defaultNet.bundlerURL) {
        add(config.bundlerURL, 'user');
      }
    }
  } catch { /* ignore */ }

  // 2. Custom network's own bundlerURL (set during "Add Network")
  if (!defaultChainIds.has(chainId)) {
    const net = getAllNetworksSync().find(n => n.chainId === chainId);
    if (net?.bundlerURL) add(net.bundlerURL, 'user');
  }

  // 3. Built-in vela relay (always available as fallback)
  add(`${getBuiltinBundler()}/${chainId}`, 'builtin');

  return entries;
}

/**
 * Classify an `eth_getLogs` error as a *range/size limit* (the request spanned
 * too many blocks, or would return too many results) rather than an endpoint
 * fault. These are request-specific: the endpoint is healthy but capped, so the
 * caller should split the block range and retry — failing over (the next
 * endpoint usually has the same cap) or banning a working endpoint is wrong.
 *
 * Returns the endpoint's stated max *block span* when the message includes one
 * ("...limited to a 100 range" → 100), `0` when it's a range/result error with
 * no usable block number (caller should just halve), or `null` when it isn't a
 * range error at all.
 */
export function getLogsRangeCap(error: RPCResponse['error']): number | null {
  if (!error?.message) return null;
  const msg = error.message.toLowerCase();

  // Result-count caps ("query returned more than 10000 results"): narrow the
  // span, but the number is a result count not a block span — signal "halve".
  if (msg.includes('result') &&
      (msg.includes('more than') || msg.includes('exceed') || msg.includes('limit') || msg.includes('too many'))) {
    return 0;
  }

  // Block-span caps, worded many different ways across providers.
  const isRangeError =
    msg.includes('block range') ||
    msg.includes('block height') ||
    msg.includes('too many blocks') ||
    msg.includes('range is too') ||
    msg.includes('range too') ||
    msg.includes('range limit') ||
    msg.includes('limited to') ||
    (msg.includes('range') &&
      (msg.includes('exceed') || msg.includes('large') || msg.includes('wide') || msg.includes('maximum')));
  if (!isRangeError) return null;

  // Recover the stated max block span if present (first integer in the message),
  // honouring a k/m suffix ("up to a 2K block range" → 2000) so we don't shrink
  // to a needlessly tiny chunk.
  const m = msg.match(/(\d[\d,_]*)\s*([km])?/);
  if (m) {
    let n = parseInt(m[1].replace(/[,_]/g, ''), 10);
    if (m[2] === 'k') n *= 1_000;
    else if (m[2] === 'm') n *= 1_000_000;
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/**
 * Probe a single RPC URL with `eth_chainId` and return the chain id it reports
 * (decimal), or `null` if it's unreachable / not a valid JSON-RPC endpoint.
 * Used to validate a user-entered RPC before saving it as an override. Probes
 * over HTTP because the pool only ever calls endpoints via fetch — a `wss://`
 * URL that "works" here still couldn't be used by the pool.
 */
export async function probeRpcChainId(url: string, timeoutMs = 8_000): Promise<number | null> {
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (typeof json?.result !== 'string') return null;
    const id = parseInt(json.result, 16);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function shorten(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname + u.pathname;
  } catch {
    return url.slice(0, 40);
  }
}
