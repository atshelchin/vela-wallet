/**
 * RPC & Bundler endpoint pool — WEB, routed by the portable Rust state machine
 * (spec 017, group G8; `rust/crates/vela-core/src/app/rpc_pool.rs`).
 *
 * Same module specifier, same exports, same on-the-wire behaviour as
 * `rpc-pool.ts`; what changes is *who decides*. Every routing rule the
 * TypeScript pool carried — six-tier source scoring, the EMA latency penalty,
 * the exponential failure cooldown, the temp-1h / permanent-24h ban system,
 * the four-way error classification (permanent auth / transient / 429 /
 * `eth_getLogs` range cap), the three-pass jittered sweep, the fastest-RPC
 * ping race behind `X-Rpc-Url`, the all-banned self-rescue and the
 * failed-vs-rate-limited chain verdict — now lives in Rust and is tested
 * there. This file owns exactly two things the core cannot have: the fetch,
 * and the promise the caller is waiting on.
 *
 * Endpoint collection, the range-cap parser and the single-URL probe live in
 * `rpc-pool-endpoints.ts` — split out when this file had a TypeScript twin,
 * kept split because they are pure and have importers of their own.
 *
 * Deliberate differences from the native module, each also listed in the
 * integration notes:
 *
 * - `refreshPool()` resolves as soon as the reload is *requested* (the core
 *   answers no event for it) rather than after the pool is rebuilt. Both leave
 *   the chain marked stale, so the next call re-reads config either way.
 * - `isUsingBuiltinBundler()` cannot see per-endpoint failure counts (they are
 *   core state), so a user-configured bundler counts as external even while it
 *   is failing. It gates the built-in relay's funding prompt, which a
 *   custom-bundler user never wanted anyway.
 * - `poolRpcCall`'s `attempt` argument is accepted and ignored: passes are the
 *   core's business now.
 * - A ban whose TTL expired is dropped from selection immediately (the core
 *   re-checks TTLs live), where the TypeScript pool could pin an endpoint at
 *   -Infinity until restart. That is `rpc_pool.rs`'s ban-truth unification,
 *   invariant ⑧. Note that this module holds no ban TTLs of its own: it used to
 *   keep a copy for `getChainRpcUrl`'s selection, and a third copy of a policy
 *   constant is a third thing to forget to change.
 *
 * Dev fault injection stays in TypeScript on purpose: it short-circuits
 * *before* any routing, so the core never sees those calls — which is what
 * keeps `e2e/parallel-rate-limit.spec.ts`'s `__velaRpcState` seam reading the
 * same values it always did.
 */

import { rpcLatencyMs, rpcShouldFail, rpcShouldRateLimit } from './dev/fault-injection';
import { recordNet } from './metrics';
import {
  collectBundlerUrls,
  collectRpcUrls,
  getBuiltinBundlerUrl,
  NEVER_BANNED,
  type CollectedEndpoint,
  type RPCResponse,
} from './rpc-pool-endpoints';
import { readStoredBans } from './wallet-state-core/rpc-pool-executor';
import { createRpcPoolSession, type RpcPoolSession } from './wallet-state-core/rpc-pool-session';
import type { RpcCallVerdict } from './wallet-state-core/generated/RpcCallVerdict';
import type { RpcKind } from './wallet-state-core/generated/RpcKind';
import type { RpcPoolView } from './wallet-state-core/generated/RpcPoolView';
import type { RpcPoolCallRegistry } from './wallet-state-core/rpc-pool-types';

export { getBuiltinBundlerUrl, getLogsRangeCap, probeRpcChainId } from './rpc-pool-endpoints';

// ---------------------------------------------------------------------------
// Projected core state
// ---------------------------------------------------------------------------

let coreFailedChains: number[] = [];
let coreRateLimitedChains: number[] = [];

/**
 * Fault-injected chains. Kept apart from the projected core sets because the
 * view is a full replacement on every push: folding a dev fault into it would
 * be erased the moment any *other* chain concluded a call.
 */
const faultFailedChains = new Set<number>();
const faultRateLimitedChains = new Set<number>();
const faultHardFailedChains = new Set<number>();

/**
 * Get the set of chain IDs whose RPC endpoints are all currently failing.
 *
 * Reading interface unchanged (`bug-report`, `feedback`, `wallet-api` and
 * `HomeScreen` are not on the core yet); the source is now the pushed
 * `RpcPoolView` instead of a set this module mutates.
 */
export function getFailedRpcChains(): ReadonlySet<number> {
  return new Set([...coreFailedChains, ...faultFailedChains]);
}

/**
 * Get the set of chain IDs currently failing specifically due to rate-limiting
 * — the transient, self-healing subset. The UI must NOT nag the user to swap
 * in their own RPC for these (`rpc_pool.rs` invariant ④).
 */
export function getRateLimitedChains(): ReadonlySet<number> {
  const merged = new Set([...coreRateLimitedChains, ...faultRateLimitedChains]);
  // A hard injected fault is persistent, never rate-limiting — the `delete`
  // the TypeScript fault branch performs.
  for (const chainId of faultHardFailedChains) merged.delete(chainId);
  return merged;
}

// Dev/e2e introspection: expose the live failure sets so a harness can assert the
// classification directly (no-op in prod builds — __DEV__ is false there).
if (typeof __DEV__ !== 'undefined' && __DEV__) {
  (globalThis as { __velaRpcState?: unknown }).__velaRpcState = {
    failed: () => [...getFailedRpcChains()],
    rateLimited: () => [...getRateLimitedChains()],
  };
}

// ---------------------------------------------------------------------------
// The calls in flight
// ---------------------------------------------------------------------------

type PendingCall = {
  kind: RpcKind;
  chainId: number;
  method: string;
  resolve: (body: RPCResponse) => void;
  reject: (error: unknown) => void;
};

const payloads = new Map<string, { method: string; params: unknown[] }>();
/** Response bodies, per call and then per URL — the core concludes by URL. */
const bodies = new Map<string, Map<string, RPCResponse>>();
const pendingCalls = new Map<string, PendingCall>();
const pendingBases = new Map<string, (baseUrl: string) => void>();
/** `getChainRpcUrl` queries awaiting the core's ranking. */
const pendingBestRpc = new Map<string, (url: string | null) => void>();
/** Last collected candidate lists per chain, for the config queries. */
const seeds = new Map<number, { rpc: CollectedEndpoint[]; bundler: CollectedEndpoint[] }>();

let sequence = 0;

function forget(callId: string): void {
  payloads.delete(callId);
  bodies.delete(callId);
  pendingCalls.delete(callId);
}

function settle(callId: string, verdict: RpcCallVerdict): void {
  if (verdict.type === 'bundler_base') {
    const resolve = pendingBases.get(callId);
    pendingBases.delete(callId);
    // `null` ⇒ every bundler endpoint is banned or the pool is empty; the
    // built-in base is shell config, so the fallback is applied here.
    resolve?.(verdict.base_url ?? getBuiltinBundlerUrl());
    return;
  }

  if (verdict.type === 'best_rpc_url') {
    const resolve = pendingBestRpc.get(callId);
    pendingBestRpc.delete(callId);
    // `null` passes straight through: no eligible endpoint means no `X-Rpc-Url`
    // header and no fork source. There is no shell-side fallback to apply here —
    // inventing one is exactly the wrong-chain hand-off invariant ② forbids.
    resolve?.(verdict.url);
    return;
  }

  const call = pendingCalls.get(callId);
  const held = verdict.type === 'failed' ? undefined : bodies.get(callId)?.get(verdict.url);
  forget(callId);
  if (!call) return;

  const service = call.kind === 'bundler' ? 'bundler' : 'rpc';
  if (verdict.type === 'failed') {
    recordNet(service, 'final_failure', {
      note: `all endpoints failed: ${call.method} chain ${call.chainId}`,
    });
    call.reject(
      new Error(
        call.kind === 'bundler'
          ? `All bundler endpoints failed for chain ${call.chainId}`
          : `All RPC endpoints failed for chain ${call.chainId}`,
      ),
    );
    return;
  }

  if (!held) {
    // Unreachable by construction (a `respond`/`range_cap` verdict always names
    // the URL whose body was just kept). Fail the call rather than leave the
    // caller hanging if it ever happens.
    recordNet(service, 'final_failure', {
      note: `verdict without body: ${call.method} chain ${call.chainId}`,
    });
    call.reject(new Error(`No response body for chain ${call.chainId}`));
    return;
  }

  recordNet(service, 'success');
  call.resolve(held);
}

const registry: RpcPoolCallRegistry = {
  payload: (callId) => payloads.get(callId),
  keepBody: (callId, url, body) => {
    const perUrl = bodies.get(callId) ?? new Map<string, RPCResponse>();
    perUrl.set(url, body);
    bodies.set(callId, perUrl);
  },
  settle,
  noteEndpoints: (chainId, rpc, bundler) => {
    seeds.set(chainId, { rpc, bundler });
  },
  noteBackoff: (callId) => {
    const call = pendingCalls.get(callId);
    if (call) recordNet(call.kind === 'bundler' ? 'bundler' : 'rpc', 'retry');
  },
};

/**
 * A core-level fault (malformed event, serialization failure) means the machine
 * may never conclude the calls it was routing. Every caller here is holding a
 * promise, so silence would be a permanent hang — the worst failure this module
 * has, since it would freeze balances, sends and dApp requests alike with no
 * error anywhere. Fail them instead: callers already handle a rejected pool
 * call, and the bundler-base query falls back to the built-in relay exactly as
 * an empty pool would.
 */
function abandonInFlight(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  for (const [callId, call] of [...pendingCalls]) {
    forget(callId);
    call.reject(new Error(`RPC pool fault for chain ${call.chainId}: ${message}`));
  }
  for (const [callId, resolve] of [...pendingBases]) {
    pendingBases.delete(callId);
    resolve(getBuiltinBundlerUrl());
  }
  for (const [callId, resolve] of [...pendingBestRpc]) {
    pendingBestRpc.delete(callId);
    // No ranking means no verified endpoint: answer `null` (send no header,
    // skip the fork) rather than fall back to an unranked guess.
    resolve(null);
  }
}

// ---------------------------------------------------------------------------
// The one resident session
// ---------------------------------------------------------------------------

/**
 * ONE module-level session, the `use-display-currency.ts` pattern and the
 * one the integration plan mandates for resident machines. It is not a screen's
 * state: the ban map, the per-endpoint stats and the fastest-RPC winners are
 * facts about the network that every caller in the app shares.
 */
let session: RpcPoolSession | null = null;
let ready: Promise<void> | null = null;

function ensureReady(): Promise<void> {
  if (!ready) {
    const created = createRpcPoolSession({
      onView: (view: RpcPoolView) => {
        coreFailedChains = view.failed_chains;
        coreRateLimitedChains = view.rate_limited_chains;
      },
      onError: (error) => {
        console.error('[rpc-pool] core fault:', error);
        abandonInFlight(error);
      },
      registry,
    });
    session = created;
    // `loadBans()`'s place in the order: the persisted map must be in the core
    // before the first selection, or a banned endpoint gets one free attempt.
    ready = readStoredBans().then(
      (entries) => created.start({ type: 'bans_loaded', entries }),
      () => created.start({ type: 'bans_loaded', entries: [] }),
    );
  }
  return ready;
}

async function route(
  kind: RpcKind,
  method: string,
  params: unknown[],
  chainId: number,
): Promise<RPCResponse> {
  await ensureReady();
  const callId = `${kind}:${chainId}:${(sequence += 1)}`;
  payloads.set(callId, { method, params });
  return new Promise<RPCResponse>((resolve, reject) => {
    pendingCalls.set(callId, { kind, chainId, method, resolve, reject });
    session?.dispatch({
      type: 'call_requested',
      call_id: callId,
      chain_id: chainId,
      kind,
      method,
      now_ms: Date.now(),
    });
  });
}

/** The chain's candidate lists — from the last core-driven load, else collected. */
async function endpointsFor(
  chainId: number,
): Promise<{ rpc: CollectedEndpoint[]; bundler: CollectedEndpoint[] }> {
  const cached = seeds.get(chainId);
  if (cached) return cached;
  const [rpc, bundler] = await Promise.all([
    collectRpcUrls(chainId, NEVER_BANNED),
    collectBundlerUrls(chainId, NEVER_BANNED),
  ]);
  const collected = { rpc, bundler };
  seeds.set(chainId, collected);
  return collected;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Make an RPC call with automatic load balancing and failover. Which endpoint,
 * in which order, with how many passes and what to do with each failure is
 * decided by the core.
 */
export async function poolRpcCall(
  method: string,
   
  params: any[],
  chainId: number,
  // Accepted for signature compatibility with the native module; the sweep
  // passes are the core's now.
  _attempt = 0,
): Promise<RPCResponse> {
  // Dev fault injection (no-op in production / when no faults are set). Runs
  // ahead of the core exactly as it ran ahead of the pool.
  const injectedLatency = rpcLatencyMs();
  if (injectedLatency > 0) await new Promise((r) => setTimeout(r, injectedLatency));
  if (rpcShouldFail(chainId)) {
    faultFailedChains.add(chainId);
    faultHardFailedChains.add(chainId);
    faultRateLimitedChains.delete(chainId); // a hard fault is persistent, not rate-limiting
    throw new Error(`[fault] RPC forced to fail for chain ${chainId}`);
  }
  if (rpcShouldRateLimit(chainId)) {
    // Simulate every endpoint being rate-limited: the chain reads fail now, but
    // it's transient — mark it so the UI keeps the cached balance and stays calm.
    faultFailedChains.add(chainId);
    faultRateLimitedChains.add(chainId);
    faultHardFailedChains.delete(chainId);
    throw new Error(`[fault] RPC rate-limited for chain ${chainId}`);
  }

  return route('rpc', method, params, chainId);
}

/**
 * Make a bundler RPC call with automatic failover. The `X-Rpc-Url` header is
 * filled from the core's verified fastest-RPC pick (invariant ②: an endpoint
 * that reported the wrong chain id is never handed to the bundler).
 */
export async function poolBundlerCall(
  method: string,
   
  params: any[],
  chainId: number,
  _retried = false,
): Promise<RPCResponse> {
  return route('bundler', method, params, chainId);
}

/**
 * Check whether the built-in vela relay will be used for a given chain.
 * Returns true if no user-configured bundler is available.
 */
export async function isUsingBuiltinBundler(chainId: number): Promise<boolean> {
  const { bundler } = await endpointsFor(chainId);
  // User-configured endpoints pointing at the built-in bundler still count as built-in.
  const builtinHost = getBuiltinBundlerUrl();
  return !bundler.some((e) => e.source === 'user' && !e.url.includes(builtinHost));
}

/**
 * REST base URL of the bundler the pool would submit `eth_sendUserOperation` to
 * for `chainId`. Answered by the core so it is the SAME bundler the pool would
 * submit to — Tempo's in-band gas reimbursement is paid to that bundler's
 * per-Safe EOA, and reading the deposit address from a different bundler makes
 * the wallet reimburse the wrong EOA (`rpc_pool.rs` invariant ③).
 */
export async function getActiveBundlerBaseUrl(chainId: number): Promise<string> {
  await ensureReady();
  const callId = `base:${chainId}:${(sequence += 1)}`;
  return new Promise<string>((resolve) => {
    pendingBases.set(callId, resolve);
    session?.dispatch({
      type: 'bundler_base_requested',
      call_id: callId,
      chain_id: chainId,
      now_ms: Date.now(),
    });
  });
}

/**
 * Get the best RPC URL for a chain (for passing to bundler via X-Rpc-Url).
 *
 * Answered by the core, for the same reason `getActiveBundlerBaseUrl` is: this
 * is not a question about config, it is the pool's own ranking, and the answer
 * is consequential. It rides `X-Rpc-Url` into `/v1/account` and `/v1/sponsor` —
 * the bundler reads the Safe's code, nonce and balance through this URL and
 * transfers from its treasury on what it finds — and it seeds the Tevm fork.
 *
 * Deriving it here from the collected list would mean six-tier source priority
 * and nothing else: no EMA latency, no failure cooldown, and no memory of an
 * endpoint that answered `eth_chainId` with another chain's id. That is weaker
 * than the TypeScript pool this module replaced, and invariant ② would hold for
 * the JSON-RPC leg's header while quietly not holding for the REST leg's.
 */
export async function getChainRpcUrl(chainId: number): Promise<string | null> {
  await ensureReady();
  const callId = `rpc-url:${chainId}:${(sequence += 1)}`;
  return new Promise<string | null>((resolve) => {
    pendingBestRpc.set(callId, resolve);
    session?.dispatch({
      type: 'best_rpc_url_requested',
      call_id: callId,
      chain_id: chainId,
      now_ms: Date.now(),
    });
  });
}

/**
 * Force refresh the endpoint pool for a chain. Resolves once the reload is
 * requested — the core marks the pool stale, drops the chain's cached
 * fastest-RPC winner and re-reads config immediately.
 */
export async function refreshPool(chainId: number): Promise<void> {
  await ensureReady();
  seeds.delete(chainId);
  session?.dispatch({ type: 'refresh_chain', chain_id: chainId });
}

/** Invalidate all pools so they re-read config on next use. */
export function invalidateAllPools(): void {
  seeds.clear();
  // No session yet ⇒ no pool has been loaded, so there is nothing to stale.
  session?.dispatch({ type: 'invalidate_all' });
}
