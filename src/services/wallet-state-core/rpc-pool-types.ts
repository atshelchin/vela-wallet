/**
 * Platform-neutral types for the `rpc_pool` core (spec 017, group G8).
 *
 * Standalone, and NOT folded into `types.ts` (016's three machines), for the
 * reason that file states for itself: the retired native stub needed these declarations without
 * the web service graph behind them. The stub is gone; the split stays
 * because the vocabulary has importers of its own and keeps the wasm graph
 * out of anything that must not load it.
 * One module per machine also keeps parallel integration waves off each
 * other's files.
 */

import type { RpcCallVerdict } from './generated/RpcCallVerdict';
import type { RpcOperation } from './generated/RpcOperation';
import type { RpcPoolView } from './generated/RpcPoolView';
import type { CollectedEndpoint, RPCResponse } from '@/services/rpc-pool-endpoints';
import type { SessionOptions } from './types';

/** One request from the core, carrying the id it will be answered by. */
export type RpcPoolEffect = { id: number; operation: RpcOperation };

/**
 * The shell's side of a routed call.
 *
 * The core is a pure router: it decides *which URL next and why* and carries
 * no JSON-RPC params and no response bodies. Everything the shell must hold
 * between `CallRequested` and `Conclude` is reached through this handle, which
 * `rpc-pool.ts` owns and the executor only reads/writes — that keeps the
 * executor free of module-level mutable state and makes it drivable from a
 * test with its own registry.
 */
export interface RpcPoolCallRegistry {
  /**
   * The payload to POST for `callId`. `undefined` once the call concluded —
   * a late `json_rpc_post` for a settled call posts nothing and answers
   * `network`, which the core treats as one more endpoint failure.
   */
  payload(callId: string): { method: string; params: unknown[] } | undefined;
  /**
   * Remember the body `url` returned for `callId`. The core answers
   * `Respond{url}` / `RangeCap{url}` by URL, so bodies are keyed by both.
   */
  keepBody(callId: string, url: string, body: RPCResponse): void;
  /** A verdict arrived — settle whatever promise the shell is holding. */
  settle(callId: string, verdict: RpcCallVerdict): void;
  /**
   * The chain's candidate lists, as just collected. Observational only, and for
   * exactly one caller: `isUsingBuiltinBundler` asks a question *about config*
   * (is any bundler endpoint user-supplied) that the view does not carry, and
   * re-collecting for it would re-fetch the chain index. `getChainRpcUrl` used
   * to read these too and no longer does — which endpoint ranks first is a pool
   * decision, so it is asked of the core (`best_rpc_url_requested`).
   */
  noteEndpoints?(chainId: number, rpc: CollectedEndpoint[], bundler: CollectedEndpoint[]): void;
  /**
   * The core is about to sleep before another full-pool pass — the moment
   * `rpc-pool.ts` records `recordNet(kind, 'retry')`.
   */
  noteBackoff?(callId: string): void;
}

export type RpcPoolSessionOptions = SessionOptions<RpcPoolView> & {
  /** Where the executor reaches the payloads and delivers bodies/verdicts. */
  registry: RpcPoolCallRegistry;
};
