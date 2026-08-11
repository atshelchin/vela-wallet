/**
 * What a swipe-dismiss of the signing sheet MEANS — NATIVE.
 *
 * Native (Hermes, no WebAssembly) has no `sign_request` core, so the rule is
 * evaluated here, in TypeScript. This file is a deliberate, documented PORT of
 * `rust/crates/vela-core/src/app/sign_request.rs::swipe_action` and must stay
 * one; `swipe-dismiss.web.ts` does not use it at all — web asks the core.
 *
 * The rule, and why it is a rule rather than a preference:
 *
 *   funding up            → cancel the pending request (matches the funding
 *                           view's own "取消" button; BUG-1's in-sheet swap
 *                           means a swipe here IS a funding cancel)
 *   error / submitted /   → DISMISS. The tx is committed. Answering 4001 here
 *   submitting              tells the dApp the user refused while the very
 *                           same op still broadcasts and later reports success
 *                           — a contradiction the dApp cannot reconcile
 *                           (docs/KNOWN-BUGS.md BUG-2).
 *   otherwise             → REJECT (4001). Nothing has been committed yet, so
 *                           closing the sheet IS the refusal.
 *
 * The return type is the CORE's `SignSwipeAction` (a generated, type-only
 * import — erased at build, so no wasm reaches the native bundle). That is the
 * drift gate this seam can actually have: if the core ever grows a fifth
 * meaning, `swipeAction`'s `switch` stops being exhaustive and `tsc` fails
 * here instead of the two halves silently disagreeing.
 */
import type { SignSwipeAction } from '@/services/wallet-state-core/generated/SignSwipeAction';
import type { SwipeDismissFacts, SwipeDismissHandlers } from './swipe-dismiss-types';

/**
 * Grade a swipe. Pure, total, and the only place the native ternary lives.
 *
 * `'none'` is never produced: `SigningRequestModal` returns `null` when there
 * is no request, so the sheet that could be swiped does not exist — which is
 * exactly the branch the core answers `None` for (`model.pending.is_none()`).
 * It stays in the union so the switch below has to keep handling it.
 */
export function swipeAction(facts: SwipeDismissFacts): SignSwipeAction {
  if (facts.fundingNeeded) return 'funding_cancel';
  if (facts.signError || facts.pendingOpHash || facts.isSubmitting) return 'dismiss';
  return 'reject';
}

/** Run the graded action. Called from an event handler, never during render. */
export function performSwipeDismiss(
  facts: SwipeDismissFacts,
  handlers: SwipeDismissHandlers,
): void {
  switch (swipeAction(facts)) {
    case 'funding_cancel':
      handlers.fundingCancel();
      return;
    case 'dismiss':
      handlers.dismiss();
      return;
    case 'reject':
      handlers.reject();
      return;
    case 'none':
      return;
  }
}
