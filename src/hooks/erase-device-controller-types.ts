/**
 * Shared shape for the "erase this device" controller pair (spec 017).
 *
 * A standalone module for the same reason `session-controller-types.ts` is
 * one: a platform pair (`use-erase-device.ts` / `.web.ts`) must never
 * value-import its own base file — on web, Metro resolves that specifier back
 * to the `.web.ts` variant itself and the import recurses at module init.
 * Both variants import the shape from here.
 */

/**
 * The destructive settings action, as the settings screen consumes it.
 *
 * Deliberately NOT a plain boolean modal flag on the screen: `confirm()` is
 * the only path that erases, `dismiss()` is inert while the erase is in
 * flight (there is no way to close the dialog on top of a half-finished
 * erase), and `failed` exists because an erase that did not complete must not
 * be reported as one — the screen keeps the dialog open and says so instead of
 * sending the user to onboarding.
 */
export interface EraseDeviceController {
  /** The confirmation dialog is up. */
  visible: boolean;
  /** The user confirmed — the destructive button shows its spinner. */
  erasing: boolean;
  /**
   * The last attempt did not finish and data is still on this device. Cleared
   * when the dialog is reopened or the user tries again.
   */
  failed: boolean;
  /** The danger-zone row: open the confirmation. */
  open: () => void;
  /** Cancel / backdrop dismiss. Ignored while `erasing`. */
  dismiss: () => void;
  /**
   * The destructive button: erase every `vela.` key except the pending-upload
   * outbox, then leave the app at onboarding. On success the app restarts
   * (web) or the session is dropped and the router returns to `/` (native).
   */
  confirm: () => void;
}
