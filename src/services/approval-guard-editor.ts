/**
 * The spending-cap editor's rules, in TypeScript — the NATIVE half of the
 * never-unlimited mandate.
 *
 * Hermes has no WebAssembly, so iOS/Android cannot run `approval_guard`
 * (`rust/crates/vela-core/src/app/approval_guard.rs`). These functions are its
 * line-for-line twin for the editor: which editor a detected approval mounts
 * with, what a preset press re-seeds, and — the one that matters — the mode →
 * choice derivation, where `choice === null` is what keeps the confirm control
 * disabled.
 *
 * It lives beside `services/approval-guard.ts` (the native detect / rewrite /
 * submit guard) rather than inside the hook for the reason the cap-parity suite
 * states: a copy that cannot be deleted must at least be pinned, and a pinned
 * copy has to be importable by a test.
 * `src/__tests__/services/approval-guard-parity.test.ts` drives these and the
 * real Rust core over the same scenarios and compares, so a one-sided edit is
 * red rather than a platform quietly signing what the other refuses.
 *
 * Amount text here is CANONICAL (ASCII digits, '.' decimal); the card
 * localizes for display and `parseLocaleNumber`s on the way back in, exactly
 * as the core's `CustomAmountChanged` contract requires.
 */
import {
  formatTokenAmount, isUnboundedAmount, parseTokenAmount,
  type DetectedApproval,
} from '@/services/approval-guard';

import type {
  ApprovalChoiceView, ApprovalEditorMode, ApprovalEditorState, ApprovalTokenMeta,
} from '@/hooks/approval-guard-controller-types';

export type EditorSlot =
  | { kind: 'amount'; mode: ApprovalEditorMode; customText: string }
  | { kind: 'boolean'; selected: 'grant' | 'revoke' | null }
  | null;

export const CANONICAL = { group: '', decimal: '.' } as const;

export const LOADING_META: ApprovalTokenMeta = { symbol: '…', decimals: 18, verified: false, loading: true };
export const IDLE_META: ApprovalTokenMeta = { symbol: '…', decimals: 18, verified: false, loading: false };

/** `{ symbol: addr.slice(0, 6)…, decimals: 18, verified: false }`. */
export function fallbackMeta(token: string): ApprovalTokenMeta {
  return { symbol: `${token.slice(0, 6)}…`, decimals: 18, verified: false, loading: false };
}

/**
 * The editor a freshly-detected calldata approval mounts with. A grant-all
 * preselects NOTHING (the deliberate tap is the consent); an unbounded amount
 * starts blank in Custom; a finite request is pre-accepted and seeded with the
 * 18-decimals fallback, because metadata has not resolved yet.
 */
export function initEditor(approval: DetectedApproval | null): EditorSlot {
  if (!approval || approval.locus.type !== 'calldata-word') return null;
  if (approval.isBooleanGrant) {
    return { kind: 'boolean', selected: approval.isUnbounded ? null : 'revoke' };
  }
  const requested = approval.amountRaw ?? 0n;
  const requestedFinite = !approval.isUnbounded && requested > 0n;
  return requestedFinite
    ? { kind: 'amount', mode: 'requested', customText: formatTokenAmount(requested, 18, 6, CANONICAL) }
    : { kind: 'amount', mode: 'custom', customText: '' };
}

/** Show the inline cap editor for this leg? Unbounded / grant-all only. */
export function legShowsEditor(editable: boolean, approval: DetectedApproval | null): boolean {
  return (
    editable
    && !!approval
    && approval.editable
    && !approval.isReducing
    && (approval.isUnbounded || approval.isBooleanGrant)
  );
}

/** A preset press re-seeds the input with the CURRENT decimals. */
export function applyPreset(
  slot: EditorSlot,
  approval: DetectedApproval,
  meta: ApprovalTokenMeta,
  balance: bigint | null,
  mode: ApprovalEditorMode,
): EditorSlot {
  if (!slot || slot.kind !== 'amount') return slot;
  const requested = approval.amountRaw ?? 0n;
  const requestedFinite = !approval.isUnbounded && requested > 0n;
  const hasBalanceCap = approval.kind !== 'decreaseAllowance' && balance != null && balance > 0n;
  if (mode === 'requested' && requestedFinite) {
    return { kind: 'amount', mode, customText: formatTokenAmount(requested, meta.decimals, 6, CANONICAL) };
  }
  if (mode === 'balance' && hasBalanceCap) {
    return { kind: 'amount', mode, customText: formatTokenAmount(balance!, meta.decimals, 6, CANONICAL) };
  }
  if (mode === 'custom' || mode === 'revoke') return { ...slot, mode };
  // `grant` is not an amount-card mode, and a chip that isn't rendered can't
  // be pressed.
  return slot;
}

/**
 * The mode → choice derivation. `choice === null` is what keeps confirm
 * disabled: an unbounded request that has not been capped, a boolean grant
 * with no deliberate tap, and a custom amount at or above the cap.
 */
export function deriveEditor(
  slot: EditorSlot,
  approval: DetectedApproval,
  meta: ApprovalTokenMeta,
  balance: bigint | null,
): ApprovalEditorState | null {
  if (!slot) return null;
  if (slot.kind === 'boolean') {
    return {
      mode: slot.selected,
      customText: '',
      error: null,
      choice: slot.selected === 'grant' ? { type: 'grant' } : slot.selected === 'revoke' ? { type: 'revoke' } : null,
      displayAmountRaw: null,
      requestedFinite: false,
      hasBalanceCap: false,
    };
  }
  const requested = approval.amountRaw ?? 0n;
  const requestedFinite = !approval.isUnbounded && requested > 0n;
  // The card's `isReducing` is by KIND (decrease only), unlike the detection
  // flag which also covers approve-to-0.
  const hasBalanceCap = approval.kind !== 'decreaseAllowance' && balance != null && balance > 0n;
  const base = {
    mode: slot.mode,
    customText: slot.customText,
    requestedFinite,
    hasBalanceCap,
  };
  if (slot.mode === 'revoke') {
    return { ...base, error: null, choice: { type: 'revoke' }, displayAmountRaw: 0n };
  }
  if (slot.mode === 'requested') {
    return { ...base, error: null, choice: { type: 'amount', amountRaw: requested }, displayAmountRaw: requested };
  }
  if (slot.mode === 'balance' && hasBalanceCap) {
    return { ...base, error: null, choice: { type: 'amount', amountRaw: balance! }, displayAmountRaw: balance! };
  }
  // Balance without a cap falls through to the custom evaluation.
  const trimmed = slot.customText.trim();
  if (trimmed === '') return { ...base, error: null, choice: null, displayAmountRaw: null };
  const raw = parseTokenAmount(trimmed, meta.decimals);
  if (raw === null) return { ...base, error: 'invalid-amount', choice: null, displayAmountRaw: null };
  if (isUnboundedAmount(raw, approval.amountBits ?? 256)) {
    // custom ≥ cap → NO choice, confirm stays disabled, the error names why.
    return { ...base, error: 'unlimited-disabled', choice: null, displayAmountRaw: raw };
  }
  return { ...base, error: null, choice: { type: 'amount', amountRaw: raw }, displayAmountRaw: raw };
}

/**
 * Does this batch approval leg still need a deliberate decision before the
 * bundle can be confirmed? Finite amounts are pre-accepted.
 */
export function legNeedsChoice(ap: DetectedApproval | null, choice: ApprovalChoiceView | null): boolean {
  if (!ap || !ap.editable || ap.isReducing) return false;
  if (ap.isBooleanGrant) return !choice;
  if (ap.isUnbounded) return !(choice && (choice.type === 'amount' || choice.type === 'revoke'));
  return false;
}

/** After the user's choice, does this leg still grant broad/unbounded access? */
export function legGrantsBroad(ap: DetectedApproval | null, choice: ApprovalChoiceView | null): boolean {
  if (!ap || ap.isReducing) return false;
  if (ap.isBooleanGrant) return choice?.type === 'grant' || !choice;
  if (ap.isUnbounded) return !(choice && (choice.type === 'amount' || choice.type === 'revoke'));
  return false;
}
