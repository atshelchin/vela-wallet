/**
 * Platform-neutral types for the `manage_tokens` core (spec 017, group G2).
 *
 * Standalone, and NOT folded into `types.ts`, for the reason that file states
 * for itself: the retired native stub needed these declarations without
 * the web service graph behind them. The stub is gone; the split stays
 * because the vocabulary has importers of its own and keeps the wasm graph
 * out of anything that must not load it. Keeping one module per
 * machine also keeps the parallel integration waves from editing one file.
 */

import type { MtokOperation } from './generated/MtokOperation';
import type { MtokView } from './generated/MtokView';
import type { SessionOptions } from './types';

/** One request from the core, carrying the id it will be answered by. */
export type ManageTokensEffect = { id: number; operation: MtokOperation };

export type ManageTokensSessionOptions = SessionOptions<MtokView> & {
  /**
   * The active wallet address, read at the moment the core asks for a cache
   * invalidation — `fetchTokens` is keyed by wallet address and the account
   * can be switched while the panel is open. A getter, not a value, so the
   * panel's session survives an account switch instead of being rebuilt (which
   * would wipe the form).
   */
  account: () => string;
  /**
   * Fired with the same cache drop the core orders after a confirmed save or
   * delete — this is today's `onChanged` host refresh, now on the machine's
   * schedule rather than the component's.
   */
  onInvalidated?: () => void;
};
