/**
 * The swipe-dismiss seam's SHAPE — the part that is the same on every platform.
 *
 * Split out for the `dapp-connection-shape.ts` reason: `swipe-dismiss.web.ts`
 * must never import `swipe-dismiss.ts` (Metro resolves a `.web` file's own
 * specifier back to itself — infinite recursion at module init, learned in
 * 016), so the two variants share types through this neutral third module and
 * nothing else.
 *
 * No rule lives here. This file is types only.
 */

/**
 * The shell facts a swipe-dismiss is graded against, as booleans.
 *
 * Booleans and not the values themselves on purpose: the only thing any grader
 * — here or in `sign_request.rs::swipe_action` — asks of `signError` /
 * `pendingOpHash` is whether it is THERE. Passing presence keeps the input
 * domain finite (16 cases), which is what makes the native rule exhaustively
 * testable in `src/__tests__/components/swipe-dismiss.test.ts`.
 */
export interface SwipeDismissFacts {
  /** The in-sheet funding view is up (BUG-1: never a stacked second modal). */
  readonly fundingNeeded: boolean;
  /** A signing error is on screen — the response already went out. */
  readonly signError: boolean;
  /** A userOp hash exists: submitted, awaiting the receipt. */
  readonly pendingOpHash: boolean;
  /** Past the commitment point (passkey/submit has started). */
  readonly isSubmitting: boolean;
}

/**
 * The three things a swipe can DO. Deliberately the provider's own callbacks —
 * a swipe must be indistinguishable from tapping the corresponding control, or
 * the dApp gets a different answer depending on how the sheet was closed.
 */
export interface SwipeDismissHandlers {
  /** EIP-1193 4001. Only ever correct BEFORE the commitment point. */
  readonly reject: () => void;
  /** Close the sheet; the op proceeds and delivers its real result. */
  readonly dismiss: () => void;
  /** Cancel the pending request the funding view is gating. */
  readonly fundingCancel: () => void;
}
