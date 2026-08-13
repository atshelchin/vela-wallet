/**
 * The contract `use-clear-signing.ts` (native) and `use-clear-signing.ts`
 * (web, Rust-driven) both satisfy — the signing sheet's parse pipeline and
 * message adjudication.
 *
 * Every field here is a VERDICT, not an input: which surface to render, what the
 * confirm button means, whether the sheet should buzz. The sheet renders them;
 * it re-derives none of them. The wire shapes are the core's own
 * (`ClearMessageView`, `ClearBlindTyped`, `ClearSurface`, `ClearConfirm`) so a
 * second shell-side shape cannot drift from them; only `ClearSignResult` is
 * translated, into the display shape the signing views have always rendered.
 */

import type { ClearSignResult } from '@/services/clear-signing';
import type { ClearBlindTyped } from '@/services/wallet-state-core/generated/ClearBlindTyped';
import type { ClearConfirm } from '@/services/wallet-state-core/generated/ClearConfirm';
import type { ClearMessageView } from '@/services/wallet-state-core/generated/ClearMessageView';
import type { ClearSurface } from '@/services/wallet-state-core/generated/ClearSurface';

export type { ClearBlindTyped, ClearConfirm, ClearMessageView, ClearSurface };

/** One `eth_sendTransaction`-shaped call: the single request, or one batch leg. */
export interface ClearCall {
  to?: string;
  data?: string;
  value?: string;
}

/** The request the sheet is showing, as far as this machine is concerned. */
export interface ClearSigningRequest {
  method: string;
  params: any[] | undefined;
  /** `dappInfo.url ?? request.origin` — the origin a SIWE domain must bind to. */
  requestOrigin?: string;
}

export interface ClearSigningController {
  /**
   * A descriptor is resolving. Holds the loading surface AND gates confirm —
   * a blind view must never flash before the clear one.
   */
  resolving: boolean;
  /** The resolved descriptor result, or `null` for every blind outcome. */
  clearSign: ClearSignResult | null;
  /** `personal_sign` / `eth_sign` adjudication, computed once. */
  message: ClearMessageView | null;
  /** The raw EIP-712 projection; present for every typed-data request. */
  blindTyped: ClearBlindTyped | null;
  /** Which of this machine's surfaces the sheet renders. */
  surface: ClearSurface;
  /** Confirm-button semantics — the words stay in the sheet. */
  confirm: ClearConfirm;
  /**
   * This machine's half of the danger buzz: `eth_sign`, or a SIWE message whose
   * domain does not bind to the requesting origin. The unbounded-approval half
   * belongs to the approval guard; the sheet ORs the two.
   */
  dangerHaptic: boolean;
  /**
   * Resolve one EIP-5792 batch leg through the same pipeline. Imperative
   * because a batch has N of them and the sheet composes each leg's row from
   * this result plus the approval guard's.
   */
  resolveCall(call: ClearCall, chainId: number): Promise<ClearSignResult | null>;
}
