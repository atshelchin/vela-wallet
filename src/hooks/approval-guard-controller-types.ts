/**
 * The approval-detection + spending-cap-editor controller, as the signing
 * components see it (spec 017, audit items ⑪–⑳).
 *
 * Platform-neutral on purpose: `use-approval-guard.web.ts` projects the Rust
 * `approval_guard` machine into this shape and `use-approval-guard.ts`
 * reproduces it on Hermes (no WebAssembly there), so `SigningSheet`,
 * `ApprovalView`, `PermitSignView`, `BatchCallsView` and
 * `EditableApproveCard` render ONE shape and decide nothing.
 *
 * Everything here is a VERDICT or a value, never a word: risk wording,
 * localized number formatting and the 14+ language catalog stay in the shell
 * (011's rule — no copy in wasm). `error` is a semantic key the card maps to
 * `t()`; amounts travel as `bigint` base units because that is what
 * `formatTokenAmount` consumes.
 */

import type { BLEIncomingRequest } from '@/models/types';
import type { DetectedApproval } from '@/services/approval-guard';

/** Everything the guard needs about the request under review. */
export interface ApprovalGuardInput {
  request: BLEIncomingRequest | null;
  chainId: number;
  /** The signer, for the allowance + balance reads. Absent → neither fires. */
  walletAddress?: string;
  /** A read-only replay mounts no editors and flags the RAW request. */
  readOnly?: boolean;
}

/** Which surface this request belongs on (`SigningSheet.renderContent`). */
export type ApprovalGuardSurface = 'none' | 'permit-sign' | 'approval-editor' | 'batch';

/** The cap editor's active preset. `grant` only ever appears on a boolean card. */
export type ApprovalEditorMode = 'requested' | 'balance' | 'custom' | 'revoke' | 'grant';

/** Why the typed amount produced no choice — the card owns the sentence. */
export type ApprovalAmountError = 'invalid-amount' | 'unlimited-disabled';

/** The user's decision for one approval. */
export type ApprovalChoiceView =
  | { type: 'amount'; amountRaw: bigint }
  | { type: 'revoke' }
  | { type: 'grant' };

export interface ApprovalTokenMeta {
  symbol: string;
  decimals: number;
  verified: boolean;
  loading: boolean;
}

/**
 * One editor's whole state. `choice === null` is the gate: it is what keeps
 * the confirm control disabled (⑬/⑭/⑮), and it is derived — never typed in by
 * a component.
 */
export interface ApprovalEditorState {
  /** `null` only on the boolean card before the deliberate tap (⑭). */
  mode: ApprovalEditorMode | null;
  customText: string;
  error: ApprovalAmountError | null;
  choice: ApprovalChoiceView | null;
  /** What the value row shows, in raw base units. */
  displayAmountRaw: bigint | null;
  /** The "Requested" chip exists (a finite, non-zero incoming amount). */
  requestedFinite: boolean;
  /** The one-tap finite Balance cap is offered (issue #86). */
  hasBalanceCap: boolean;
}

/** One leg of an EIP-5792 batch, as the guard sees it (⑯). */
export interface ApprovalLegState {
  to: string;
  approval: DetectedApproval | null;
  meta: ApprovalTokenMeta;
  /** Present exactly on the legs that mount an inline cap editor. */
  editor: ApprovalEditorState | null;
  choice: ApprovalChoiceView | null;
  needsEditor: boolean;
  needsChoice: boolean;
  grantsBroad: boolean;
}

export interface ApprovalBatchState {
  legs: ApprovalLegState[];
  /** The effective-state danger banner. */
  anyUncapped: boolean;
  /** A leg sends a token to the token's OWN contract — a burn (⑰). */
  anyToOwnToken: boolean;
  allSettled: boolean;
}

/** The increaseAllowance resulting-total row (⑱). */
export interface ApprovalIncreaseTotal {
  /** The on-chain allowance, when the read succeeded. */
  current: bigint | null;
  increment: bigint;
  /**
   * `null` = the read failed — the row still warns the increment ADDS to an
   * existing allowance rather than hiding.
   */
  total: bigint | null;
}

export interface ApprovalGuardController {
  surface: ApprovalGuardSurface;
  /** The single request's detection (⑪/⑫); `null` for a batch or a non-approval. */
  approval: DetectedApproval | null;
  meta: ApprovalTokenMeta;
  editor: ApprovalEditorState | null;
  /** This machine's contribution to `confirmDisabled` (⑮/⑯). */
  confirmAllowed: boolean;
  /** The finite re-encode, ready to submit (⑳). `null` = submit verbatim. */
  rewrittenParams: any[] | null;
  increaseTotal: ApprovalIncreaseTotal | null;
  decimalsUnverified: boolean;
  expired: boolean;
  batch: ApprovalBatchState | null;

  // --- inputs (single approval) ---
  selectPreset: (mode: ApprovalEditorMode) => void;
  setCustomText: (text: string) => void;
  chooseGrant: () => void;
  chooseRevoke: () => void;

  // --- inputs (one batch leg) ---
  selectLegPreset: (index: number, mode: ApprovalEditorMode) => void;
  setLegCustomText: (index: number, text: string) => void;
  chooseLegGrant: (index: number) => void;
  chooseLegRevoke: (index: number) => void;
  /**
   * The recipient addresses the descriptor pipeline resolved for each leg, in
   * leg order. Raw data — the "token sent to its own contract" verdict (⑰) is
   * the guard's.
   */
  reportBatchRecipients: (recipients: string[][]) => void;
}

/** The inert controller: no request, nothing to gate. */
export const IDLE_APPROVAL_GUARD: Omit<
  ApprovalGuardController,
  | 'selectPreset' | 'setCustomText' | 'chooseGrant' | 'chooseRevoke'
  | 'selectLegPreset' | 'setLegCustomText' | 'chooseLegGrant' | 'chooseLegRevoke'
  | 'reportBatchRecipients'
> = {
  surface: 'none',
  approval: null,
  meta: { symbol: '…', decimals: 18, verified: false, loading: false },
  editor: null,
  confirmAllowed: true,
  rewrittenParams: null,
  increaseTotal: null,
  decimalsUnverified: false,
  expired: false,
  batch: null,
};
