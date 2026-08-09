/**
 * §12.1.6 — WEB: deliberately nothing.
 *
 * The `sign_request` core owns the granted-account reconcile on web. It reads
 * `RequestArrived.granted_address`, resolves the index against the SESSION's own
 * rows (`walletSessionAccounts()` — one list, one index domain), emits
 * `SwitchActiveAccount`, and keeps `confirm_gate_open` false until the shell
 * acks it. Dispatching a second `SWITCH_ACCOUNT` from a caller would be a second
 * writer computing the same index from a possibly different list — exactly the
 * failure §12.1.6 exists to prevent.
 *
 * The parameters are kept so the two platform variants are call-compatible; the
 * base module (`dapp-account-reconcile.ts`) is what `tsc` type-checks callers
 * against.
 */
export function reconcileGrantedAccount(
  _accounts: { address: string }[],
  _activeIndex: number,
  _grantedAddress: string | undefined | null,
  _switchAccount: (index: number) => void,
): void {
  /* the core does it */
}
