// The spending-cap editor exists TWICE on purpose, and this pins the two together.
//
// The app runs the Rust `approval_guard` machine; `services/approval-guard-editor.ts` survives from the retired
// Expo-native path and is due to go with the rest of the native-only code.
// Until that cut lands, the thing to remove is not the duplication but the DRIFT.
//
// A red test here means one platform would grant what the other refuses: relax
// the TS derivation alone and native starts signing an unbounded approve web
// gates; relax the Rust alone and the reverse. Same spirit as
// `approval-guard-cap-parity.test.ts`, one level up — that pins the two
// constants, this pins the decision they feed.
//
// The Rust core is driven for real (through the web session), not transcribed
// into a snapshot someone can regenerate without looking at the other side.

jest.mock('@/services/token-metadata', () => ({
  resolveTokenMetadata: jest.fn(async () => new Map()),
}));
jest.mock('@/services/token-reads', () => ({
  readErc20Allowance: jest.fn(async () => null),
  readErc20Balance: jest.fn(async () => null),
}));

import '@/services/vela-core';
import { createApprovalGuardSession } from '@/services/wallet-state-core/guard-session';
import type { GuardView } from '@/services/wallet-state-core/generated/GuardView';
import type { GuardEvent } from '@/services/wallet-state-core/generated/GuardEvent';

import { detectApproval } from '@/services/approval-guard';
import {
  applyPreset, deriveEditor, initEditor,
  type EditorSlot,
} from '@/services/approval-guard-editor';
import type { ApprovalEditorMode, ApprovalTokenMeta } from '@/hooks/approval-guard-controller-types';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const SPENDER = '0x111111125421cA6dc452d289314280a0f8842A65';
const MAX_U256 = (1n << 256n) - 1n;

const addrWord = (a: string) => a.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const amtWord = (v: bigint) => v.toString(16).padStart(64, '0');
const approve = (amount: bigint) => `0x095ea7b3${addrWord(SPENDER)}${amtWord(amount)}`;
const decrease = (amount: bigint) => `0xa457c2d7${addrWord(SPENDER)}${amtWord(amount)}`;
const setApprovalForAll = (on: boolean) => `0xa22cb465${addrWord(SPENDER)}${amtWord(BigInt(on))}`;

/** The shape both sides are compared in — the verdicts, never the words. */
interface Snapshot {
  mode: string | null;
  customText: string;
  error: string | null;
  choice: string | null;
  displayAmountRaw: string | null;
  requestedFinite: boolean;
  hasBalanceCap: boolean;
  confirmAllowed: boolean;
}

type Step =
  | { type: 'text'; text: string }
  | { type: 'preset'; mode: ApprovalEditorMode }
  | { type: 'grant' }
  | { type: 'revoke' };

const NO_SNAPSHOT: Snapshot = {
  mode: null, customText: '', error: null, choice: null, displayAmountRaw: null,
  requestedFinite: false, hasBalanceCap: false, confirmAllowed: true,
};

function choiceKey(choice: { type: string; amountRaw?: bigint } | { type: string; amount_raw?: string } | null): string | null {
  if (!choice) return null;
  if (choice.type !== 'amount') return choice.type;
  const raw = 'amountRaw' in choice && choice.amountRaw !== undefined
    ? choice.amountRaw.toString()
    : (choice as { amount_raw?: string }).amount_raw ?? '';
  return `amount:${raw}`;
}

// --- the Rust core, driven for real -----------------------------------------

function coreSnapshot(data: string, steps: Step[]): Snapshot {
  let view: GuardView | null = null;
  const session = createApprovalGuardSession({
    onView: (next) => { view = next; },
    onError: (error) => { throw error; },
  });
  try {
    session.start({
      type: 'approval_detected',
      method: 'eth_sendTransaction',
      params_json: JSON.stringify([{ to: USDC, data, value: '0x0' }]),
      chain_id: 1,
      wallet_address: '0x00000000000000000000000000000000000000aa',
      read_only: false,
      now_ms: 1_754_700_000_000,
    });
    // The metadata / balance reads the core just asked for are left in flight
    // on purpose (see DECIMALS/BALANCE below) — this suite compares RULES, and
    // the executor is covered by `approval-guard-core.test.ts`.
    for (const step of steps) session.dispatch(toEvent(step));
    const v = view as GuardView | null;
    if (!v?.editor) return { ...NO_SNAPSHOT, confirmAllowed: v?.confirm_allowed ?? true };
    return {
      mode: v.editor.mode,
      customText: v.editor.custom_text,
      error: v.editor.error,
      choice: choiceKey(v.editor.choice),
      displayAmountRaw: v.editor.display_amount_raw,
      requestedFinite: v.editor.requested_finite,
      hasBalanceCap: v.editor.has_balance_cap,
      confirmAllowed: v.confirm_allowed,
    };
  } finally {
    session.dispose();
  }
}

function toEvent(step: Step): GuardEvent {
  switch (step.type) {
    case 'text': return { type: 'custom_amount_changed', text: step.text };
    case 'preset': return { type: 'preset_selected', mode: step.mode };
    case 'grant': return { type: 'grant_deliberately_chosen' };
    case 'revoke': return { type: 'revoke_chosen' };
  }
}

// --- the TypeScript twin -----------------------------------------------------

function nativeSnapshot(data: string, steps: Step[]): Snapshot {
  const approval = detectApproval('eth_sendTransaction', [{ to: USDC, data, value: '0x0' }]);
  if (!approval) return NO_SNAPSHOT;
  const meta: ApprovalTokenMeta = { symbol: '…', decimals: DECIMALS, verified: false, loading: true };
  let slot: EditorSlot = initEditor(approval);
  for (const step of steps) {
    if (step.type === 'text') {
      slot = slot?.kind === 'amount' ? { ...slot, customText: step.text } : slot;
    } else if (step.type === 'preset') {
      slot = applyPreset(slot, approval, meta, BALANCE, step.mode);
    } else if (step.type === 'grant') {
      slot = slot?.kind === 'boolean' ? { ...slot, selected: 'grant' } : slot;
    } else {
      slot = slot?.kind === 'boolean' ? { ...slot, selected: 'revoke' } : slot;
    }
  }
  const editor = deriveEditor(slot, approval, meta, BALANCE);
  const confirmAllowed = !(approval.editable && !editor?.choice);
  if (!editor) return { ...NO_SNAPSHOT, confirmAllowed };
  return {
    mode: editor.mode,
    customText: editor.customText,
    error: editor.error === 'invalid-amount'
      ? 'invalid_amount'
      : editor.error === 'unlimited-disabled'
        ? 'unlimited_disabled'
        : null,
    choice: choiceKey(editor.choice),
    displayAmountRaw: editor.displayAmountRaw === null ? null : editor.displayAmountRaw.toString(),
    requestedFinite: editor.requestedFinite,
    hasBalanceCap: editor.hasBalanceCap,
    confirmAllowed,
  };
}

// Metadata is never resolved in these scenarios, so BOTH sides scale by the
// 18-decimals fallback and offer no Balance chip. That is the state the editor
// mounts in — the one a user can type into before any RPC comes back, and the
// one a drift would be least likely to be noticed in.
const DECIMALS = 18;
const BALANCE: bigint | null = null;

const SCENARIOS: { name: string; data: string; steps: Step[] }[] = [
  { name: 'unbounded approve, untouched', data: approve(MAX_U256), steps: [] },
  { name: 'unbounded approve, finite cap typed', data: approve(MAX_U256), steps: [{ type: 'text', text: '100' }] },
  { name: 'unbounded approve, empty text', data: approve(MAX_U256), steps: [{ type: 'text', text: '   ' }] },
  { name: 'unbounded approve, junk text', data: approve(MAX_U256), steps: [{ type: 'text', text: '12abc' }] },
  { name: 'unbounded approve, over-precise text', data: approve(MAX_U256), steps: [{ type: 'text', text: '1.1234567890123456789' }] },
  {
    name: 'unbounded approve, amount at the cap',
    data: approve(MAX_U256),
    steps: [{ type: 'text', text: ((1n << 200n) / 10n ** 18n + 1n).toString() }],
  },
  { name: 'unbounded approve, revoked', data: approve(MAX_U256), steps: [{ type: 'preset', mode: 'revoke' }] },
  {
    name: 'unbounded approve, balance preset with no balance falls through to custom',
    data: approve(MAX_U256),
    steps: [{ type: 'preset', mode: 'balance' }],
  },
  { name: 'finite approve, pre-accepted', data: approve(500n * 10n ** 18n), steps: [] },
  {
    name: 'finite approve, requested preset re-seeds',
    data: approve(500n * 10n ** 18n),
    steps: [{ type: 'preset', mode: 'custom' }, { type: 'text', text: '3' }, { type: 'preset', mode: 'requested' }],
  },
  { name: 'approve to zero (a revoke)', data: approve(0n), steps: [] },
  { name: 'decreaseAllowance', data: decrease(100n * 10n ** 18n), steps: [] },
  { name: 'setApprovalForAll(true) — nothing preselected', data: setApprovalForAll(true), steps: [] },
  { name: 'setApprovalForAll(true) — deliberate grant', data: setApprovalForAll(true), steps: [{ type: 'grant' }] },
  { name: 'setApprovalForAll(true) — revoked', data: setApprovalForAll(true), steps: [{ type: 'revoke' }] },
  { name: 'setApprovalForAll(false) — safe action preselected', data: setApprovalForAll(false), steps: [] },
  { name: 'non-approval calldata', data: '0xdeadbeef', steps: [] },
];

describe('spending-cap editor: Rust core vs the native TypeScript twin', () => {
  test.each(SCENARIOS)('$name', ({ data, steps }) => {
    const core = coreSnapshot(data, steps);
    const native = nativeSnapshot(data, steps);
    expect(native).toEqual(core);
  });

  test('the gate itself agrees: every scenario that grants must be chosen on BOTH sides', () => {
    for (const scenario of SCENARIOS) {
      const core = coreSnapshot(scenario.data, scenario.steps);
      const native = nativeSnapshot(scenario.data, scenario.steps);
      expect([scenario.name, native.confirmAllowed]).toEqual([scenario.name, core.confirmAllowed]);
      expect([scenario.name, native.choice]).toEqual([scenario.name, core.choice]);
    }
  });
});
