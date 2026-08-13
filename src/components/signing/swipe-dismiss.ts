/**
 * What a swipe-dismiss of the signing sheet MEANS — WEB.
 *
 * Nothing is decided here. The `sign_request` core already models this exact
 * question as `SignView.swipe_action` / `SignEvent::SwipeDismissed`
 * (`sign_request.rs::swipe_action`, dispatched in `update`), so the shell's job
 * is to report the gesture and let the machine route it — the same relationship
 * `rejectRequest` / `dismissRequest` / `handleFundingCancel` already have with
 * `reject_tapped` / `dismiss_tapped` / `funding_cancelled`.
 *
 * INVARIANT (no test can assert this — nothing here renders): the handlers and
 * facts this function is given are IGNORED on web, on purpose. Re-deriving the
 * verdict from projected booleans is how the two halves drift: the core's
 * "committed" set is `Stage::{Submitting, PersistingResult, ReactiveSponsoring}`
 * plus `sign_error`/`pending_op_hash`, and the shell only ever saw a flattened
 * `isSubmitting` boolean. A `Stage` added in Rust would extend the core's set
 * and leave the TypeScript ternary answering 4001 past the commitment point —
 * BUG-2, the dApp told the user refused while the op still broadcasts.
 *
 * It is not purely hypothetical today either: the shell's `signError` is the
 * FORMATTED string, and `signErrorMessage({kind:'submit_failed', detail:''})`
 * is `''` — falsy — so a bundler failure with an empty message already graded
 * as "reject" in the shell while the core graded it "dismiss".
 *
 * Imported by explicit `.web` specifier is NOT possible here (the component is
 * platform-neutral), so this file is reached only through Metro's `.web`
 * resolution — and it must never import `./swipe-dismiss`, which Metro would
 * resolve straight back to this file.
 */
import { dispatchSign } from '@/services/wallet-state-core/sign-resident';
import type { SwipeDismissFacts, SwipeDismissHandlers } from './swipe-dismiss-types';

/**
 * Report the gesture. The core answers it with its own `reject` / `dismiss` /
 * `funding_cancel` — the very functions `reject_tapped` / `dismiss_tapped` /
 * `funding_cancelled` run — or with nothing at all when no request is pending.
 */
export function performSwipeDismiss(
  _facts: SwipeDismissFacts,
  _handlers: SwipeDismissHandlers,
): void {
  dispatchSign({ type: 'swipe_dismissed' });
}
