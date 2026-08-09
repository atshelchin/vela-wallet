/**
 * Platform-neutral types for the `contacts` core (spec 017).
 *
 * Separate from `contacts-executor.web.ts` for the same reason `types.ts` is
 * separate from `executors.web.ts`: the native stub (`contacts-session.ts`)
 * needs these declarations, and importing them from a `.web` module would drag
 * the web-only service graph into the native bundle, where the wasm cannot load
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
