/**
 * §12.1.6 — reconcile the active account to the one the origin was GRANTED,
 * before the approval surface can be acted on. NATIVE implementation.
 *
 * Two entries need this and must not each grow their own copy: the Safari
 * extension hand-off (`ExtensionSignController`) and the web popup entry
 * (`web-request.tsx`). Both used to call `signAccountIndex` + dispatch inline,
 * which is a second writer of the same fact — and the index they computed came
 * from `useWallet().accounts`, a DIFFERENT list from the one the consumer
 * indexes into on web. A mismatched index is a silent whole no-op there, and a
 * silent no-op here means signing from the wrong account.
 *
 * On web the `sign_request` core owns this (it emits `SwitchActiveAccount` from
 * `RequestArrived.granted_address`, against the session's own row indices, and
 * gates the approval surface on the ack), so `dapp-account-reconcile.web.ts` is
 * an intentional no-op. Native keeps the dispatch, byte-identically.
 */
import { signAccountIndex } from '@/models/dapp-request-routing';

export function reconcileGrantedAccount(
  accounts: { address: string }[],
  activeIndex: number,
  grantedAddress: string | undefined | null,
  switchAccount: (index: number) => void,
): void {
  const next = signAccountIndex(accounts, activeIndex, grantedAddress);
  if (next !== activeIndex) switchAccount(next);
}
