/**
 * Platform-neutral types for the onboarding cores.
 *
 * Separate from `executor.web.ts` on purpose: the native stub (`session.ts`)
 * needs these declarations, and importing them from a `.web` module would drag
 * the web-only service graph into the native bundle — where the wasm cannot
 * load at all.
 */

import type { CompletionMode } from './generated/CompletionMode';
import type { CreateView } from './generated/CreateView';
import type { LoginView } from './generated/LoginView';
import type { ShellOperation } from './generated/ShellOperation';
import type { Translate } from './copy';

/** One request from the core, carrying the id it will be answered by. */
export type OnboardingEffect = { id: number; operation: ShellOperation };

export type OnboardingExecutorDeps = {
  t: Translate;
  /** Hand the wallet to the app: context dispatch, then navigate or resume. */
  complete: (mode: CompletionMode) => void | Promise<void>;
};

export type SessionOptions<View> = {
  /** Called with every view the core produces, including the first. */
  onView: (view: View) => void;
  deps: OnboardingExecutorDeps;
  /** A core-level fault (malformed event, bad JSON) — never a user-facing error. */
  onError?: (error: unknown) => void;
};

export type CreateWalletSessionOptions = SessionOptions<CreateView>;
export type LoginSessionOptions = SessionOptions<LoginView>;
