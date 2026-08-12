/**
 * Shared shapes for the two `session` controller pairs (spec 017, group G9).
 *
 * A standalone module for the same reason `ext-cache-controller-types.ts` is
 * one: a platform pair (`use-session-route.ts` / `.web.ts`,
 * `use-session-signout.ts` / `.web.ts`) must never import its own base file —
 * on web, Metro resolves that specifier back to the `.web.ts` variant itself,
 * and a self-referential import recurses at module init. Every variant imports
 * from here instead.
 */

/**
 * Where the app is allowed to be. The core rules, the shell navigates
 * (invariant ⑧) — `'loading'` means "make NO redirect judgment yet", which is
 * why it is a state of its own and not `hasWallet: false`.
 *
 * Structurally the `SessionRoute` the core projects; declared here so the
 * native variant (which derives it from the reducer's state, as
 * `src/app/index.tsx` always has) needs no wasm-side type.
 */
export type SessionRouteName = 'loading' | 'onboarding' | 'wallet';

/**
 * The sign-out confirmation, as the settings screen consumes it.
 *
 * Deliberately not "open a modal": the pending-upload check runs FIRST and the
 * dialog only exists once it has answered, so there is no path to an unwarned
 * logout (invariant ⑤). A check that throws leaves `visible` false — the user
 * can tap again, which is what the async handler did when it died before
 * `setShowSignOut(true)`.
 */
export interface SessionSignOutController {
  /** The confirmation dialog is up. */
  visible: boolean;
  /** Un-synced passkeys exist: show the warning and relabel the button. */
  pendingSync: boolean;
  /** The user confirmed — the destructive button shows its spinner. */
  signingOut: boolean;
  /** The settings row: run the pending-upload check, then open the dialog. */
  open: () => void;
  /** Cancel / backdrop dismiss. */
  dismiss: () => void;
  /**
   * The destructive button. Clears the session in memory and — on web, where
   * the `session` core drives this — ends the sign-in on disk too, by dropping
   * the stored account list and active index. Native still clears memory only
   * (FR-202: its reducer path is untouched).
   */
  confirm: () => void;
}
