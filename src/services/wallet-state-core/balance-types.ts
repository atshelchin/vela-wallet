/**
 * Platform-neutral types for the `balance_dashboard` core (spec 017, group G10).
 *
 * Standalone, and NOT folded into `types.ts`, for the reason that file states
 * for itself: the retired native stub needed these declarations without
 * the web service graph behind them. The stub is gone; the split stays
 * because the vocabulary has importers of its own and keeps the wasm graph
 * out of anything that must not load it. One module per machine also keeps the parallel
 * integration waves off each other's files.
 */

import type { BalanceOperation } from './generated/BalanceOperation';
import type { BalanceToken } from './generated/BalanceToken';
import type { BalanceView } from './generated/BalanceView';
import type { SessionOptions } from './types';

/** One request from the core, carrying the id it will be answered by. */
export type BalanceEffect = { id: number; operation: BalanceOperation };

/**
 * The persisted "hide amounts" byte. Declared here — the graph's leaf — so the
 * boot-time read (`balance-resident.ts`), the core's `WritePrivacy` write
 * (`balance-executor.ts`) and the native store (`use-balance-privacy.ts`)
 * all name the same key without importing one another.
 */
export const BALANCE_PRIVACY_KEY = 'vela.balanceHidden';

/**
 * Where the mid-fetch stream goes.
 *
 * `FetchTokens` is the one operation that speaks twice: it streams every
 * chain's snapshot as it lands and *then* settles once. The settle rides the
 * operation's own result; the snapshots have nowhere to ride, so they are
 * dispatched as [`Event::ChainAssetsArrived`] through this sink. Injected
 * rather than imported so the executor keeps no module-level session handle
 * (the `RpcPoolCallRegistry` split, same reason: it stays drivable from a test
 * with its own sink).
 */
export interface BalanceStreamSink {
  /** One `onProgress` snapshot: the accumulated, USD-sorted tokens so far. */
  chainAssetsArrived(address: string, tokens: BalanceToken[]): void;
}

export type BalanceSessionOptions = SessionOptions<BalanceView> & {
  /** Where the executor pushes `fetchTokens`'s progress snapshots. */
  stream: BalanceStreamSink;
};
