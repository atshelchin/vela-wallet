// The DESCRIPTOR RESOLUTION exists twice, and this pins the screens it produces.
//
// The app runs the Rust `clear_signing` machine; `services/clear-signing.ts`
// survives from the retired Expo-native path with callers of its own (the
// descriptor fetch). Every string compared here
// is rendered verbatim on a signing surface, so a drift is not a refactor
// nit — it is one platform showing a different amount, a different recipient or
// a different risk colour than the other for the same calldata.
//
// The network is stubbed to "no descriptor anywhere" on both sides, which is the
// interesting case: it exercises the LOCAL descriptors, the token-standard
// selectors and the decimals trust rule rather than a server's answer.

const poolRpcCall = jest.fn();
jest.mock('@/services/rpc-pool', () => ({
  poolRpcCall: (...args: unknown[]) => poolRpcCall(...args),
}));

const lookupSelector = jest.fn();
jest.mock('@/services/selector-registry', () => ({
  lookupSelector: (...args: unknown[]) => lookupSelector(...args),
}));

const fetchWithTimeout = jest.fn();
jest.mock('@/services/net', () => ({
  ...jest.requireActual('@/services/net'),
  fetchWithTimeout: (...args: unknown[]) => fetchWithTimeout(...args),
}));

jest.mock('@/services/storage', () => ({
  ...jest.requireActual('@/services/storage'),
  getEthereumDataURL: () => 'https://data.example',
}));

import '@/services/vela-core';
import {
  clearDescriptorCache,
  clearTokenStandardCache,
  resolveTransaction,
  type ClearSignResult,
} from '@/services/clear-signing';
import { createClearSigningSession } from '@/services/wallet-state-core/clear-session';
import { toShellResult } from '@/services/wallet-state-core/clear-types';
import type { ClearSigningView } from '@/services/wallet-state-core/generated/ClearSigningView';

const LOCALE = {
  number_format: 'comma_dot',
  date_format: 'mdy_slash',
  time_format: 'h24',
  tz_offset_minutes: 0,
} as const;

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const UNIV2 = '0x7a250d5630b4cf539739df2c5dacb4c659f2488d';
const VITALIK = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
const SPENDER = '0x111111125421ca6dc452d289314280a0f8842a65';
const MAX_U256 = (1n << 256n) - 1n;

const word = (hexish: string) => hexish.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const amount = (v: bigint) => v.toString(16).padStart(64, '0');

/** Drive the core to a concluded resolution and project it as the sheet does. */
function coreResolve(to: string, data: string, value: string): Promise<ClearSignResult | null> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const session = createClearSigningSession({
      onView: (view: ClearSigningView) => {
        if (settled || view.resolving || !view.resolved) return;
        settled = true;
        resolve(view.result ? toShellResult(view.result) : null);
        queueMicrotask(() => session.dispose());
      },
      onError: reject,
    });
    session.start({
      type: 'resolve_transaction',
      to, data, value, chain_id: 1, locale: LOCALE,
    });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  clearDescriptorCache();
  clearTokenStandardCache();
  // No descriptor anywhere, no 4-byte candidate: both sides fall back on their
  // own baked-in knowledge.
  fetchWithTimeout.mockResolvedValue({ ok: false, json: async () => ({}), text: async () => '' });
  lookupSelector.mockResolvedValue([]);
  // `decimals()` answers 6 for anything that asks; the ERC-165 probes revert
  // (a plain ERC-20), which is a DEFINITIVE "not an NFT" on both sides.
  poolRpcCall.mockImplementation(async (_method: string, params: any[]) => {
    const data: string = params[0]?.data ?? '';
    if (data.startsWith('0x313ce567')) return { result: `0x${(6).toString(16).padStart(64, '0')}` };
    return { error: { code: -32000, message: 'execution reverted' } };
  });
});

const VECTORS: { name: string; to: string; data: string; value: string }[] = [
  {
    name: 'a known-token transfer',
    to: USDC,
    data: `0xa9059cbb${word(VITALIK)}${amount(1_000_000n)}`,
    value: '0x0',
  },
  {
    name: 'an unlimited approve',
    to: USDC,
    data: `0x095ea7b3${word(SPENDER)}${amount(MAX_U256)}`,
    value: '0x0',
  },
  {
    name: 'a bounded approve',
    to: USDC,
    data: `0x095ea7b3${word(SPENDER)}${amount(500_000_000n)}`,
    value: '0x0',
  },
  {
    name: 'a Uniswap V2 swap (local descriptor, no network)',
    to: UNIV2,
    data: `0x7ff36ab5${amount(0n)}${amount(0x80n)}${word(VITALIK)}${amount(9_999_999_999n)}${amount(1n)}${word(USDC)}`,
    value: '0xde0b6b3a7640000',
  },
  {
    name: 'a raw contract deployment',
    to: '',
    data: '0x6080604052348015600f57600080fd5b50',
    value: '0x0',
  },
  {
    name: 'an undecodable call',
    to: '0x1234567890abcdef1234567890abcdef12345678',
    data: '0xdeadbeef',
    value: '0x0',
  },
];

/**
 * Drop the falsy flags so "stated as `false`" and "absent" compare equal.
 *
 * The wire states every boolean; the display shape declares them optional and
 * every consumer reads them as booleans (`f.warning`, `cs.partial`, …), so the
 * two spellings are the same screen. Nothing else is normalized: labels, values,
 * roles, addresses, USD magnitudes and the risk grade must match exactly.
 */
function normalize(result: ClearSignResult | null): unknown {
  if (!result) return null;
  const strip = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== false && v !== undefined));
  return {
    ...strip(result as unknown as Record<string, unknown>),
    fields: result.fields.map((f) => strip(f as unknown as Record<string, unknown>)),
  };
}

describe('descriptor resolution parity (Rust core ↔ native TypeScript)', () => {
  it.each(VECTORS)('$name', async ({ to, data, value }) => {
    const core = await coreResolve(to, data, value);
    const native = await resolveTransaction(to, data, value, 1);
    expect(normalize(core)).toEqual(normalize(native));
  });

  // The headline invariant: an unknown token's decimals are READ, never
  // assumed. Rendering a 6-decimal token at 18 shows an amount 10¹² times wrong
  // on the one screen where the number is the whole point.
  const UNKNOWN_TOKEN = '0x1234567890abcdef1234567890abcdef12345678';
  const unknownTransfer = `0xa9059cbb${word(VITALIK)}${amount(1_000_000n)}`;

  it('scales an unknown token by the decimals the chain reports', async () => {
    const core = await coreResolve(UNKNOWN_TOKEN, unknownTransfer, '0x0');
    const native = await resolveTransaction(UNKNOWN_TOKEN, unknownTransfer, '0x0', 1);
    expect(normalize(core)).toEqual(normalize(native));
    const shown = core?.fields.find((f) => f.role === 'send-amount');
    expect(shown?.value.startsWith('1 ')).toBe(true); // 1_000_000 at 6 decimals
    expect(shown?.unverified).toBeFalsy();
  });

  it('falls back to 18 with an EXPLICIT unverified flag when decimals cannot be read', async () => {
    // A DIFFERENT address than the test above: the TypeScript decimals cache is
    // a process singleton with no reset seam, so reusing it would compare a
    // fresh core against a warm shell and prove nothing.
    const COLD_TOKEN = '0xfedcba9876543210fedcba9876543210fedcba98';
    poolRpcCall.mockRejectedValue(new Error('offline'));
    const core = await coreResolve(COLD_TOKEN, unknownTransfer, '0x0');
    const native = await resolveTransaction(COLD_TOKEN, unknownTransfer, '0x0', 1);
    expect(normalize(core)).toEqual(normalize(native));
    const shown = core?.fields.find((f) => f.role === 'send-amount');
    expect(shown?.unverified).toBe(true);
    // Never silently safe: an unverified amount floors the sheet at caution.
    expect(core?.risk).toBe('caution');
  });
});
