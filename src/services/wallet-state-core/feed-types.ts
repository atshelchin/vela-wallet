/**
 * Platform-neutral types for the `activity_feed` core (spec 017, group G10).
 *
 * Standalone, and NOT folded into `types.ts`, for the reason that file states
 * for itself: the retired native stub needed these declarations without
 * the web service graph behind them. The stub is gone; the split stays
 * because the vocabulary has importers of its own and keeps the wasm graph
 * out of anything that must not load it. One module per machine also keeps the parallel integration
 * waves off each other's files.
 */

import type { FeedOperation } from './generated/FeedOperation';
import type { FeedView } from './generated/FeedView';
import type { LocalTransaction } from '@/services/storage';
import type { SessionOptions } from './types';

/** One request from the core, carrying the id it will be answered by. */
export type FeedEffect = { id: number; operation: FeedOperation };

/** The user's own accounts, as `ResolveRecipientIdentity` checks them first. */
export interface FeedOwnAccount {
  address: string;
  name: string;
}

/**
 * Where the shell keeps the records the core does not carry.
 *
 * `FeedTxRecord` is the projection the feed folds — it deliberately drops
 * `dappOrigin`, `intent`, `signedRequest`, `assetSim` and the rest, which the
 * transaction detail sheet still needs. Rather than round-trip a lossy shape,
 * the executor hands the raw rows it just mapped straight to the shell, which
 * indexes them by id (the `txByIdRef` port). Injected rather than imported so
 * the executor holds no module-level mutable state.
 */
export interface FeedRecordSink {
  /** Every stored record, exactly as `loadTransactions()` returned it. */
  storeLoaded(records: LocalTransaction[]): void;
}

export type FeedSessionOptions = SessionOptions<FeedView> & {
  /** Local names win over the network — the shell owns the accounts list. */
  ownAccounts: () => FeedOwnAccount[];
  /** Where the raw rows behind each `StoreLoaded` are kept. */
  records: FeedRecordSink;
};
