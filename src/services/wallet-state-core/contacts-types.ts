/**
 * Platform-neutral types for the `contacts` core (spec 017).
 *
 * Separate from `contacts-executor.ts` for the same reason `types.ts` is
 * separate from `executors.ts`: the retired native stub needed these declarations without
 * the web service graph behind them. The stub is gone; the split stays
 * because the vocabulary has importers of its own and keeps the wasm graph
 * out of anything that must not load it, where the wasm cannot load
 * at all.
 */

import type { ContactOperation } from './generated/ContactOperation';
import type { ContactsView } from './generated/ContactsView';

/** One request from the core, carrying the id it will be answered by. */
export type ContactEffect = { id: number; operation: ContactOperation };

export type ContactsSessionOptions = {
  /** Called with every view the core produces, including the first. */
  onView: (view: ContactsView) => void;
  /** A core-level fault (malformed event, bad JSON) — never a user-facing error. */
  onError?: (error: unknown) => void;
};
