/**
 * The only place the `rpc_pool` core touches the outside world (spec 017,
 * group G8 — `rust/crates/vela-core/src/app/rpc_pool.rs`).
 *
 * The split this file exists to enforce: **execution here, meaning in Rust**.
 * It performs the fetch, applies the timeout, sets the `X-Rpc-Url` header,
 * reads the clock, draws the random for the jitter, and writes the ban map to
 * storage. It reports what happened *mechanically* — an HTTP status, a JSON
 * `error` member, a timeout, a socket failure — and never decides what any of
 * that means. Which endpoint next, ban vs cool-down vs deliver, 401 vs 429,
 * permanent vs transient vs `getLogs` range cap, how many passes and how long
 * to back off: all of that is the core's, and none of it is repeated here.
 *
 * The one `switch` is on operation type, as the recipe requires.
 *
 * Wire vs stored shape: the core speaks `RpcBanEntry` (`banned_at_ms`), the
 * store holds `BanEntry` (`bannedAt`) under `vela.rpc.banned` — the same key
 * and the same bytes native writes. Translating between them is this file's
 * job; getting it wrong would silently drop every persisted ban (and, worse,
 * hand a fresh install's bans to native in a shape it cannot read).
 *
 * Failure contract (shared effect loop): nothing rejects. Every rejection is
 * converted into the result variant that operation answers with — a failed
 * POST is a `network` outcome, i.e. one more endpoint failure for the core to
 * route around, never an exception thrown into the loop.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  BANNED_STORAGE_KEY,
  collectBundlerUrls,
  collectRpcUrls,
  NEVER_BANNED,
  type RPCResponse,
} from '@/services/rpc-pool-endpoints';
import { loadServiceEndpoints } from '@/services/storage';

import type { RpcBanEntry } from './generated/RpcBanEntry';
import type { RpcShellResult } from './generated/RpcShellResult';
import type { RpcTransportOutcome } from './generated/RpcTransportOutcome';
import type { RpcPoolCallRegistry, RpcPoolEffect } from './rpc-pool-types';

// ---------------------------------------------------------------------------
// Ban map storage codec
// ---------------------------------------------------------------------------

/** The record shape actually on disk (`BanEntry` in `rpc-pool.ts`). */
type StoredBan = { url: string; bannedAt: number; permanent: boolean };

/**
 * Decode one stored ban. A codec, not a policy: serde rejects a record whose
 * fields are missing or mistyped, and a rejected `BansLoaded` would leave the
 * core with no ban map at all, so junk is coerced rather than allowed through.
 * A record without a usable URL is dropped — a ban on `""` bans nothing.
 */
function decodeBan(raw: unknown): RpcBanEntry | null {
  if (raw === null || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.url !== 'string' || record.url === '') return null;
  const bannedAt = Number(record.bannedAt);
  return {
    url: record.url,
    banned_at_ms: Number.isFinite(bannedAt) ? bannedAt : 0,
    permanent: record.permanent === true,
  };
}

function encodeBan(entry: RpcBanEntry): StoredBan {
  return { url: entry.url, bannedAt: entry.banned_at_ms, permanent: entry.permanent };
}

/**
 * Read the persisted ban map (`loadBans`). An absent, unparseable or non-array
 * store reads as "no bans" — the TypeScript `loadBans()` swallows exactly the
 * same failures.
 */
export async function readStoredBans(): Promise<RpcBanEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(BANNED_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(decodeBan).filter((entry): entry is RpcBanEntry => entry !== null);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/** A chain id must survive the trip through the core's `u32`. */
function asChainId(value: number): number | null {
  return Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff ? value : null;
}

type PostResult = { outcome: RpcTransportOutcome; body?: RPCResponse };

/**
 * One JSON-RPC POST, classified mechanically. Mirrors `tryEndpoint`'s wire
 * behaviour byte for byte (same headers, same body, same content-type gate,
 * same abort-on-timeout) — but where `tryEndpoint` throws typed errors that
 * encode a *decision* (`HttpBanError`, `RateLimitError`), this returns the raw
 * transport fact and lets the core decide.
 */
async function post(
  url: string,
  method: string,
  params: unknown[],
  extraHeaders: Record<string, string> | undefined,
  timeoutMs: number,
): Promise<PostResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    });

    // Every non-2xx is reported with its status. 401/403/404 → ban, 429 →
    // rate-limited cooldown, anything else → plain failover: all decided in
    // Rust, none of it re-derived here.
    if (!res.ok) return { outcome: { type: 'http_error', status: res.status } };

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('json')) return { outcome: { type: 'non_json' } };

    const json: unknown = await res.json();
    if (!json || typeof json !== 'object') return { outcome: { type: 'non_json' } };

    const body = json as RPCResponse;
    const error = body.error
      ? { code: body.error.code ?? null, message: body.error.message ?? null }
      : null;
    return { outcome: { type: 'response', error }, body };
  } catch {
    return { outcome: { type: timedOut ? 'timeout' : 'network' } };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `pickFastestRpcUrl`'s per-endpoint ping, reduced to its observation: the
 * decimal chain id the endpoint reports, or `null` for unreachable / not valid
 * JSON-RPC. Whether a mismatch disqualifies the endpoint (invariant ②) is the
 * core's call, not this function's.
 */
async function probe(url: string, timeoutMs: number): Promise<{ reported: number | null; latencyMs: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      signal: controller.signal,
    });
    if (!res.ok) return { reported: null, latencyMs: Date.now() - t0 };
    const json: unknown = await res.json();
    const result = (json as { result?: unknown } | null)?.result;
    if (typeof result !== 'string') return { reported: null, latencyMs: Date.now() - t0 };
    return { reported: asChainId(parseInt(result, 16)), latencyMs: Date.now() - t0 };
  } catch {
    return { reported: null, latencyMs: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// The executor
// ---------------------------------------------------------------------------

export type RpcPoolExecutor = {
  execute(effect: RpcPoolEffect): Promise<RpcShellResult>;
  toFailure(effect: RpcPoolEffect, error: unknown): RpcShellResult;
};

/**
 * Bind the executor to the shell's call registry. A factory rather than two
 * module-level functions so the payloads and response bodies it needs are
 * reached through an object the caller owns — which is also what lets a test
 * drive the real core through the real executor with its own registry.
 */
export function createRpcPoolExecutor(registry: RpcPoolCallRegistry): RpcPoolExecutor {
  async function execute(effect: RpcPoolEffect): Promise<RpcShellResult> {
    const operation = effect.operation;
    switch (operation.type) {
      case 'load_pool_config': {
        const chainId = operation.chain_id;
        // Same order as `initPool`: user-configured service endpoints first, so
        // the built-in bundler URL is the one the user actually configured.
        await loadServiceEndpoints();
        // NEVER_BANNED is load-bearing: the core owns the ban map and filters
        // at selection (invariant ⑧). Filtering here would hide a URL whose
        // temp ban has since expired until the next pool refresh.
        const [rpcEndpoints, bundlerEndpoints] = await Promise.all([
          collectRpcUrls(chainId, NEVER_BANNED),
          collectBundlerUrls(chainId, NEVER_BANNED),
        ]);
        registry.noteEndpoints?.(chainId, rpcEndpoints, bundlerEndpoints);
        return {
          type: 'pool_config',
          chain_id: chainId,
          rpc_endpoints: rpcEndpoints,
          bundler_endpoints: bundlerEndpoints,
          now_ms: Date.now(),
        };
      }

      case 'json_rpc_post': {
        const held = registry.payload(operation.call_id);
        const t0 = Date.now();
        const { outcome, body } = held
          ? await post(
              operation.url,
              operation.method,
              held.params,
              operation.x_rpc_url ? { 'X-Rpc-Url': operation.x_rpc_url } : undefined,
              operation.timeout_ms,
            )
          : // The caller is already gone (concluded, or the payload was never
            // registered). Nothing to send; report it as the endpoint failing
            // so the core routes on rather than waiting forever.
            { outcome: { type: 'network' } as RpcTransportOutcome, body: undefined };
        if (body) registry.keepBody(operation.call_id, operation.url, body);
        return {
          type: 'post_outcome',
          call_id: operation.call_id,
          url: operation.url,
          outcome,
          latency_ms: Date.now() - t0,
          now_ms: Date.now(),
        };
      }

      case 'probe_chain_id': {
        const { reported, latencyMs } = await probe(operation.url, operation.timeout_ms);
        return {
          type: 'chain_id_probed',
          chain_id: operation.chain_id,
          url: operation.url,
          reported,
          latency_ms: latencyMs,
          now_ms: Date.now(),
        };
      }

      case 'draw_jitter':
        // The core has no randomness; this is the only source of it.
        return { type: 'jitter', call_id: operation.call_id, value: Math.random() };

      case 'start_backoff': {
        registry.noteBackoff?.(operation.call_id);
        await new Promise<void>((resolve) => setTimeout(resolve, operation.delay_ms));
        return { type: 'backoff_elapsed', call_id: operation.call_id, now_ms: Date.now() };
      }

      case 'persist_bans': {
        await AsyncStorage.setItem(
          BANNED_STORAGE_KEY,
          JSON.stringify(operation.entries.map(encodeBan)),
        );
        return { type: 'persisted' };
      }

      case 'conclude': {
        registry.settle(operation.call_id, operation.verdict);
        return { type: 'concluded' };
      }
    }
  }

  function toFailure(effect: RpcPoolEffect, _error: unknown): RpcShellResult {
    const operation = effect.operation;
    switch (operation.type) {
      case 'load_pool_config':
        // Config that cannot be read is an empty pool, which the core sweeps
        // and fails — the same end the TypeScript `initPool` rejection reaches
        // (a rejected `poolRpcCall`), just via the core's own passes.
        return {
          type: 'pool_config',
          chain_id: operation.chain_id,
          rpc_endpoints: [],
          bundler_endpoints: [],
          now_ms: Date.now(),
        };
      case 'json_rpc_post':
        return {
          type: 'post_outcome',
          call_id: operation.call_id,
          url: operation.url,
          outcome: { type: 'network' },
          latency_ms: 0,
          now_ms: Date.now(),
        };
      case 'probe_chain_id':
        return {
          type: 'chain_id_probed',
          chain_id: operation.chain_id,
          url: operation.url,
          reported: null,
          latency_ms: 0,
          now_ms: Date.now(),
        };
      case 'draw_jitter':
        // No jitter drawn ⇒ 0ms delay, which is what `setTimeout(NaN)` does in
        // the TypeScript path too.
        return { type: 'jitter', call_id: operation.call_id, value: 0 };
      case 'start_backoff':
        return { type: 'backoff_elapsed', call_id: operation.call_id, now_ms: Date.now() };
      case 'persist_bans':
        // Best-effort, as `saveBans()` swallows storage errors today; the
        // in-memory ban map stays authoritative.
        return { type: 'persisted' };
      case 'conclude':
        return { type: 'concluded' };
    }
  }

  return { execute, toFailure };
}
