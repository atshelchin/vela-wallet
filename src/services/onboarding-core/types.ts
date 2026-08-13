/**
 * Platform-neutral types for the onboarding cores.
 *
 * Separate from `executor.ts` on purpose: the retired native stub needed these declarations without
 * the web service graph behind them. The stub is gone; the split stays
 * because the vocabulary has importers of its own and keeps the wasm graph
 * out of anything that must not load it.
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
