// The `approval_guard` core (Rust/wasm) driven through the WEB shell.
//
// The machine's own rules are covered by the Rust suite
// (`rust/crates/vela-core/tests/app_approval_guard.rs`). What only exists on
// this side is the EXECUTOR and the wire codec: which service each of the
// three reads maps to, the two different metadata fallbacks (a whole-read
// failure vs a token simply missing from the resolved map — the core answers
// them differently, and a shell that collapsed them would silently turn a
// short-address fallback into `…`), the decimal-string ↔ bigint round trip
// that exists precisely so a uint256 never becomes a JS number, and the
// snake_case ↔ `DetectedApproval` shape the signing components render.
//
// Getting any of that wrong is a security-surface bug: a mis-scaled decimals
// makes the cap editor sign 10^12 times the amount the user read.

const resolveTokenMetadata = jest.fn();
jest.mock('@/services/token-metadata', () => ({
  resolveTokenMetadata: (chainId: number, addresses: string[]) => resolveTokenMetadata(chainId, addresses),
}));

const readErc20Allowance = jest.fn();
const readErc20Balance = jest.fn();
jest.mock('@/services/token-reads', () => ({
  readErc20Allowance: (...args: unknown[]) => readErc20Allowance(...args),
  readErc20Balance: (...args: unknown[]) => readErc20Balance(...args),
}));

// Load-bearing, and easy to get wrong: jest lists no `.web.ts` in
// `moduleFileExtensions`, so a bare `@/services/vela-core` resolves the NATIVE
// index and the wasm is never initialized (metro resolves the same specifier
// to `index.web.ts`, which is why the session module imports it bare).
// Importing the web entry by explicit path first runs `initSync`.
import '@/services/vela-core';
import { createApprovalGuardSession } from '@/services/wallet-state-core/guard-session.web';
import type { GuardView } from '@/services/wallet-state-core/generated/GuardView';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const SPENDER = '0x111111125421cA6dc452d289314280a0f8842A65';
const WALLET = '0x00000000000000000000000000000000000000aa';
const MAX_U256 = (1n << 256n) - 1n;

/** Let the effect loop's RPC round-trips settle. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const addrWord = (a: string) => a.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const amtWord = (v: bigint) => v.toString(16).padStart(64, '0');
const approveCalldata = (spender: string, amount: bigint) =>
  `0x095ea7b3${addrWord(spender)}${amtWord(amount)}`;
const increaseCalldata = (spender: string, amount: bigint) =>
  `0x39509351${addrWord(spender)}${amtWord(amount)}`;

function open(method: string, params: unknown[], opts?: { readOnly?: boolean; wallet?: string | null }) {
  const faults: unknown[] = [];
  let view: GuardView | null = null;
  const session = createApprovalGuardSession({
    onView: (next) => { view = next; },
    onError: (error) => { faults.push(error); },
  });
  session.start({
    type: 'approval_detected',
    method,
    params_json: JSON.stringify(params),
    chain_id: 1,
    wallet_address: opts?.wallet === undefined ? WALLET : opts.wallet,
    read_only: opts?.readOnly ?? false,
    now_ms: 1_754_700_000_000,
  });
  return { session, faults, latest: () => view as GuardView };
}

beforeEach(() => {
  resolveTokenMetadata.mockReset();
  readErc20Allowance.mockReset();
  readErc20Balance.mockReset();
  resolveTokenMetadata.mockResolvedValue(new Map());
  readErc20Allowance.mockResolvedValue(null);
  readErc20Balance.mockResolvedValue(null);
});

describe('approval_guard core (web shell)', () => {
  test('an unbounded approve gates confirm until a finite cap is typed, and re-encodes it', async () => {
    resolveTokenMetadata.mockResolvedValue(new Map([[USDC.toLowerCase(), { symbol: 'USDC', decimals: 6 }]]));
    readErc20Balance.mockResolvedValue(null);
    const m = open('eth_sendTransaction', [{ to: USDC, data: approveCalldata(SPENDER, MAX_U256), value: '0x0' }]);
    await settle();

    expect(m.latest().surface).toBe('approval_editor');
    expect(m.latest().detected?.is_unbounded).toBe(true);
    // No default choice — the whole point of the mandate.
    expect(m.latest().editor?.choice).toBeNull();
    expect(m.latest().confirm_allowed).toBe(false);
    expect(m.latest().rewritten_params_json).toBeNull();
    // The read really did go through `resolveTokenMetadata`, with the token
    // the machine detected off the calldata.
    expect(resolveTokenMetadata).toHaveBeenCalledWith(1, [USDC.toLowerCase()]);
    expect(m.latest().meta).toEqual({ symbol: 'USDC', decimals: 6, verified: true, loading: false });

    m.session.dispatch({ type: 'custom_amount_changed', text: '100' });
    expect(m.latest().confirm_allowed).toBe(true);
    // Scaled by the ON-CHAIN decimals the executor reported, not the 18 default.
    expect(m.latest().editor?.choice).toEqual({ type: 'amount', amount_raw: '100000000' });

    const rewritten = JSON.parse(m.latest().rewritten_params_json!);
    expect(rewritten[0].data).toBe(approveCalldata(SPENDER, 100_000000n));
    expect(rewritten[0].value).toBe('0x0');
    expect(m.faults).toEqual([]);
    m.session.dispose();
  });

  test('an amount at or above the cap derives no choice — a huge number can never be smuggled through', async () => {
    resolveTokenMetadata.mockResolvedValue(new Map([[USDC.toLowerCase(), { symbol: 'USDC', decimals: 6 }]]));
    const m = open('eth_sendTransaction', [{ to: USDC, data: approveCalldata(SPENDER, MAX_U256), value: '0x0' }]);
    await settle();

    // 2^200 base units at 6 decimals — past the uint256 cap.
    m.session.dispatch({ type: 'custom_amount_changed', text: ((1n << 200n) / 1_000000n + 1n).toString() });
    expect(m.latest().editor?.error).toBe('unlimited_disabled');
    expect(m.latest().editor?.choice).toBeNull();
    expect(m.latest().confirm_allowed).toBe(false);
    expect(m.latest().rewritten_params_json).toBeNull();
    m.session.dispose();
  });

  test('a WHOLE metadata failure and a merely-absent token take the two different fallbacks', async () => {
    // Rejected read → `metas: null` → the short-address symbol.
    resolveTokenMetadata.mockRejectedValue(new Error('rpc down'));
    const failed = open('eth_sendTransaction', [{ to: USDC, data: approveCalldata(SPENDER, 5n), value: '0x0' }]);
    await settle();
    expect(failed.latest().meta).toEqual({
      symbol: `${USDC.toLowerCase().slice(0, 6)}…`, decimals: 18, verified: false, loading: false,
    });
    expect(failed.faults).toEqual([]);
    failed.session.dispose();

    // Resolved but empty → also the short-address symbol for a SINGLE approval.
    resolveTokenMetadata.mockResolvedValue(new Map());
    const missing = open('eth_sendTransaction', [{ to: USDC, data: approveCalldata(SPENDER, 5n), value: '0x0' }]);
    await settle();
    expect(missing.latest().meta.symbol).toBe(`${USDC.toLowerCase().slice(0, 6)}…`);
    expect(missing.latest().meta.verified).toBe(false);
    missing.session.dispose();
  });

  test('increaseAllowance reads the on-chain allowance and reports the resulting total', async () => {
    resolveTokenMetadata.mockResolvedValue(new Map([[USDC.toLowerCase(), { symbol: 'USDC', decimals: 6 }]]));
    readErc20Allowance.mockResolvedValue(250_000000n);
    const m = open('eth_sendTransaction', [{ to: USDC, data: increaseCalldata(SPENDER, 100_000000n), value: '0x0' }]);
    await settle();

    expect(readErc20Allowance).toHaveBeenCalledWith(1, USDC.toLowerCase(), WALLET, SPENDER.toLowerCase());
    expect(m.latest().increase_total).toEqual({
      current: '250000000', increment: '100000000', total: '350000000',
    });
    m.session.dispose();
  });

  test('an allowance read failure still warns the increment is ADDITIVE instead of hiding the row', async () => {
    resolveTokenMetadata.mockResolvedValue(new Map([[USDC.toLowerCase(), { symbol: 'USDC', decimals: 6 }]]));
    readErc20Allowance.mockRejectedValue(new Error('reverted'));
    const m = open('eth_sendTransaction', [{ to: USDC, data: increaseCalldata(SPENDER, 100_000000n), value: '0x0' }]);
    await settle();

    expect(m.latest().increase_total).toEqual({ current: null, increment: '100000000', total: null });
    expect(m.faults).toEqual([]);
    m.session.dispose();
  });

  test('a resolved balance offers the one-tap finite Balance cap; a failed read does not', async () => {
    resolveTokenMetadata.mockResolvedValue(new Map([[USDC.toLowerCase(), { symbol: 'USDC', decimals: 6 }]]));
    readErc20Balance.mockResolvedValue(1_240_000000n);
    const m = open('eth_sendTransaction', [{ to: USDC, data: approveCalldata(SPENDER, MAX_U256), value: '0x0' }]);
    await settle();
    expect(readErc20Balance).toHaveBeenCalledWith(1, USDC.toLowerCase(), WALLET);
    expect(m.latest().editor?.has_balance_cap).toBe(true);

    m.session.dispatch({ type: 'preset_selected', mode: 'balance' });
    expect(m.latest().editor?.choice).toEqual({ type: 'amount', amount_raw: '1240000000' });
    // A balance cap is FINITE — never the forbidden unlimited grant.
    expect(m.latest().confirm_allowed).toBe(true);
    m.session.dispose();

    readErc20Balance.mockResolvedValue(null);
    const noBalance = open('eth_sendTransaction', [{ to: USDC, data: approveCalldata(SPENDER, MAX_U256), value: '0x0' }]);
    await settle();
    expect(noBalance.latest().editor?.has_balance_cap).toBe(false);
    noBalance.session.dispose();
  });

  test('no wallet address means neither the allowance nor the balance read is attempted', async () => {
    const m = open(
      'eth_sendTransaction',
      [{ to: USDC, data: increaseCalldata(SPENDER, 5n), value: '0x0' }],
      { wallet: null },
    );
    await settle();
    expect(readErc20Allowance).not.toHaveBeenCalled();
    expect(readErc20Balance).not.toHaveBeenCalled();
    m.session.dispose();
  });

  test('an off-chain permit is never editable and never rewritten — capping it would desync the signature', async () => {
    const typed = {
      types: { Permit: [] },
      primaryType: 'Permit',
      domain: { name: 'USD Coin', chainId: 1, verifyingContract: USDC },
      message: { owner: WALLET, spender: SPENDER, value: MAX_U256.toString(), nonce: '0', deadline: '1750000000' },
    };
    const m = open('eth_signTypedData_v4', [WALLET, JSON.stringify(typed)]);
    await settle();

    expect(m.latest().surface).toBe('permit_sign');
    expect(m.latest().detected?.editable).toBe(false);
    expect(m.latest().detected?.block_reason).toBe('off_chain_permit');
    expect(m.latest().editor).toBeNull();
    expect(m.latest().rewritten_params_json).toBeNull();
    // Nothing to gate: the surface is deliberate consent, not a cap editor.
    expect(m.latest().confirm_allowed).toBe(true);
    // The deadline is in the past for this clock.
    expect(m.latest().expired).toBe(true);
    m.session.dispose();
  });

  test('a batch gates only its granting legs and rebuilds just those calls', async () => {
    resolveTokenMetadata.mockResolvedValue(new Map([[USDC.toLowerCase(), { symbol: 'USDC', decimals: 6 }]]));
    const transfer = `0xa9059cbb${addrWord(SPENDER)}${amtWord(1000n)}`;
    const m = open('wallet_sendCalls', [{
      version: '1.0',
      chainId: '0x1',
      calls: [
        { to: USDC, data: transfer, value: '0x0' },
        { to: USDC, data: approveCalldata(SPENDER, MAX_U256), value: '0x0' },
        { to: USDC, data: approveCalldata(SPENDER, 500_000000n), value: '0x0' },
      ],
    }]);
    await settle();

    const batch = m.latest().batch!;
    expect(batch.legs.map((l) => l.needs_choice)).toEqual([false, true, false]);
    // Only the leg that mounts a card has an editor: a finite leg can never
    // acquire a choice, so its calldata stays byte-identical.
    expect(batch.legs.map((l) => l.editor !== null)).toEqual([false, true, false]);
    expect(m.latest().confirm_allowed).toBe(false);

    m.session.dispatch({ type: 'leg_custom_amount_changed', index: 1, text: '500' });
    expect(m.latest().confirm_allowed).toBe(true);
    expect(m.latest().batch!.any_uncapped).toBe(false);

    const rewritten = JSON.parse(m.latest().rewritten_params_json!);
    expect(rewritten[0].calls[0].data).toBe(transfer);
    expect(rewritten[0].calls[1].data).toBe(approveCalldata(SPENDER, 500_000000n));
    expect(rewritten[0].calls[2].data).toBe(approveCalldata(SPENDER, 500_000000n));
    // Everything outside `calls` rides along untouched.
    expect(rewritten[0].version).toBe('1.0');
    m.session.dispose();
  });

  test('a batch leg that sends a token to its own contract is flagged as a burn', async () => {
    const transfer = `0xa9059cbb${addrWord(USDC)}${amtWord(1000n)}`;
    const m = open('wallet_sendCalls', [{
      calls: [{ to: USDC, data: transfer, value: '0x0' }],
    }]);
    await settle();
    expect(m.latest().batch!.any_to_own_token).toBe(false);

    // The shell forwards the descriptor pipeline's recipients; the core rules.
    m.session.dispatch({ type: 'batch_recipients_resolved', recipients: [[USDC.toUpperCase()]] });
    expect(m.latest().batch!.any_to_own_token).toBe(true);
    m.session.dispose();
  });

  test('a read-only replay mounts no leg editors but still flags the raw unlimited request', async () => {
    const m = open(
      'wallet_sendCalls',
      [{ calls: [{ to: USDC, data: approveCalldata(SPENDER, MAX_U256), value: '0x0' }] }],
      { readOnly: true },
    );
    await settle();
    const batch = m.latest().batch!;
    expect(batch.legs[0].needs_editor).toBe(false);
    expect(batch.legs[0].editor).toBeNull();
    expect(batch.any_uncapped).toBe(true);
    m.session.dispose();
  });

  test('a non-approval request is inert — nothing detected, nothing gated', async () => {
    const m = open('eth_sendTransaction', [{ to: SPENDER, data: '0x', value: '0x2386f26fc10000' }]);
    await settle();
    expect(m.latest().surface).toBe('none');
    expect(m.latest().detected).toBeNull();
    expect(m.latest().confirm_allowed).toBe(true);
    expect(resolveTokenMetadata).not.toHaveBeenCalled();
    m.session.dispose();
  });
});
