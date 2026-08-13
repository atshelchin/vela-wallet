// The number under the user's thumb on the signing page.
//
// A 1→1 send already read it from the core. A SPLIT did not: `ConfirmStep.tsx`
// summed the recipient rows itself with `sumSplitBaseUnits` + `fromBaseUnits`,
// so the total someone reviewed before sliding was derived independently of the
// total the core gates on (`Continue`'s over-balance refusal), measures against
// the same-asset fee ceiling with, and turns into the signed transfers with
// `build_split_calls`. Two derivations of one number, no gate between them.
//
// Worse, they disagreed about failure: the core DECLINES a row it cannot turn
// into base units (`sum_split_base_units → None`), while TS `toBaseUnits`
// throws — from a render, which is a blank confirm page instead of a refusal.
//
// This pins the replacement: `SendView.confirm_amount` is the core's own total,
// equal to the old TS math wherever that math had an answer, and `''` (printed
// as zero) exactly where it used to throw. Native keeps the TS expression, moved
// verbatim into `useSendController.ts`, so the two sides are compared here for
// real rather than transcribed.

const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, val: string) => {
    mockStorage.set(key, val);
  }),
  removeItem: jest.fn(async (key: string) => {
    mockStorage.delete(key);
  }),
}));
jest.mock('@/modules/passkey', () => ({
  PasskeyErrorCode: { CANCELLED: 'PASSKEY_CANCELLED', FAILED: 'PASSKEY_FAILED' },
  sign: jest.fn(),
  cancelSign: jest.fn(),
}));
jest.mock('@/services/platform', () => ({
  hapticSuccess: jest.fn(),
  hapticError: jest.fn(),
  showAlert: jest.fn(),
}));
const mockFetchTokens = jest.fn<Promise<unknown[]>, [string, unknown]>(async () => []);
jest.mock('@/services/wallet-api', () => ({
  fetchTokens: (address: string, options: unknown) => mockFetchTokens(address, options),
  clearTokenCache: jest.fn(),
}));
jest.mock('@/services/safe-transaction', () => ({
  ...jest.requireActual('@/services/safe-transaction'),
  prefetchForSend: jest.fn(),
  estimateTransactionFee: jest.fn(async () => null),
}));
jest.mock('@/services/recipient-identity', () => ({
  resolveRecipientIdentity: jest.fn(async () => null),
}));
jest.mock('@/services/recipient-risk', () => ({
  resolveRecipientRisk: jest.fn(async () => null),
}));
jest.mock('@/services/tx-simulation', () => ({
  simulateAssetChanges: jest.fn(async () => null),
  serializeAssetSim: (sim: unknown) => sim,
}));

import '@/services/vela-core';
import { networkId } from '@/models/network';
import { tokenId, type APIToken } from '@/models/types';
// The exact pair `ConfirmStep` used to call, and that native still calls.
import { sumSplitBaseUnits } from '@/services/batch-send';
import { fromBaseUnits } from '@/services/eip681';
import { createSendSession } from '@/services/wallet-state-core/send-session.web';
import type { SendEvent } from '@/services/wallet-state-core/generated/SendEvent';
import type { SendRecipientDraft } from '@/services/wallet-state-core/generated/SendRecipientDraft';
import type { SendView } from '@/services/wallet-state-core/generated/SendView';

const CHAIN = 1;
const ME = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
const BOB = '0x2222222222222222222222222222222222222222';
const CAROL = '0x3333333333333333333333333333333333333333';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

const NATIVE: APIToken = {
  network: networkId(CHAIN),
  chainName: 'Ethereum',
  symbol: 'ETH',
  balance: '20',
  decimals: 18,
  logo: null,
  name: 'Ether',
  tokenAddress: null,
  priceUsd: 2000,
  spam: false,
};

const STABLE: APIToken = {
  ...NATIVE,
  symbol: 'USDC',
  balance: '500',
  decimals: 6,
  name: 'USD Coin',
  tokenAddress: USDC,
  priceUsd: 1,
};

const settle = async () => {
  for (let i = 0; i < 16; i += 1) await new Promise<void>((r) => setTimeout(r, 0));
};

const row = (id: string, address: string, amount: string): SendRecipientDraft => ({
  id,
  address,
  amount,
  name: null,
});

/** `ConfirmStep.tsx:85-87` as it stood before this round. */
const oldShellTotal = (rows: SendRecipientDraft[], decimals: number) =>
  fromBaseUnits(
    sumSplitBaseUnits(
      rows.map((r) => ({ address: r.address, amount: r.amount })),
      decimals,
    ),
    decimals,
  );

function open(tokens: APIToken[]) {
  let view: SendView | null = null;
  const holder: { session: ReturnType<typeof createSendSession> | null } = { session: null };
  mockFetchTokens.mockImplementation(async () => tokens);
  const session = createSendSession({
    onView: (next) => {
      view = next;
    },
    onError: (error) => {
      throw error;
    },
    ports: {
      tokensFetched: () => {},
      tokensPartial: (partial) => holder.session?.dispatch({ type: 'tokens_partial', tokens: partial }),
      credentialId: () => 'cred-1',
      credentialLoaded: () => {},
      signingStarted: () => {},
      receiptUpdate: () => {},
      alert: () => {},
      close: () => {},
      // The fee seam. `EstimateFee` is answered by the screen's live
      // `fee_policy` session in production; this suite is not about the
      // quote, so it refuses one — the same answer a failed estimate gives.
      feeQuote: async () => ({ type: 'failed' as const, kind: 'estimate_failed' as const }),
    },
  });
  holder.session = session;
  session.start({
    type: 'open',
    account: { id: 'cred-1', address: ME, name: 'Me' },
    params: {
      preselected_symbol: null,
      preselected_network: null,
      prefilled_recipient: null,
      prefilled_chain_id: null,
      prefilled_token_address: null,
      prefilled_amount_base: null,
      locked: false,
      preselected_multi: null,
    },
    display: { code: 'USD', rate: 1, fiat_decimals: 2 },
  });
  return {
    session,
    dispatch: (event: SendEvent) => session.dispatch(event),
    latest: () => view as SendView,
  };
}

let sessions: { dispose: () => void }[] = [];
afterEach(() => {
  sessions.forEach((s) => s.dispose());
  sessions = [];
  jest.clearAllMocks();
});

async function splitting(token: APIToken, rows: SendRecipientDraft[]) {
  const app = open([NATIVE, STABLE]);
  sessions.push(app.session);
  await settle();
  app.dispatch({ type: 'select_token', token_id: tokenId(token) });
  await settle();
  app.dispatch({ type: 'set_recipient', recipient: BOB });
  app.dispatch({ type: 'enter_split_mode' });
  app.dispatch({ type: 'recipients_changed', recipients: rows });
  await settle();
  return app;
}

describe('the confirm page headline is one number, and it is the core’s', () => {
  it.each([
    ['whole and fractional', [row('r1', BOB, '1.5'), row('r2', CAROL, '0.25')]],
    ['many rows', [row('r1', BOB, '1'), row('r2', CAROL, '2'), row('r3', BOB, '3.125')]],
    ['a row that is exactly zero', [row('r1', BOB, '2'), row('r2', CAROL, '0')]],
    ['over-precise digits the token cannot hold', [row('r1', BOB, '0.1234567890123456789'), row('r2', CAROL, '1')]],
  ])('matches the shell math it replaced — %s', async (_name, rows) => {
    const app = await splitting(NATIVE, rows);
    expect(app.latest().split_mode).toBe(true);
    expect(app.latest().confirm_amount).toBe(oldShellTotal(rows, NATIVE.decimals));
  });

  it('matches on a 6-decimal token too (truncation, not rounding)', async () => {
    const rows = [row('r1', BOB, '10.1234567'), row('r2', CAROL, '0.0000004')];
    const app = await splitting(STABLE, rows);
    expect(app.latest().confirm_amount).toBe(oldShellTotal(rows, STABLE.decimals));
    expect(app.latest().confirm_amount).toBe('10.123456');
  });

  it('is the SUM, not the single-send figure the rows were seeded from', async () => {
    const app = open([NATIVE, STABLE]);
    sessions.push(app.session);
    await settle();
    app.dispatch({ type: 'select_token', token_id: tokenId(NATIVE) });
    await settle();
    app.dispatch({ type: 'set_recipient', recipient: BOB });
    app.dispatch({ type: 'set_amount', amount: '1.5' });
    await settle();
    // 1→1: the headline is the resolved figure.
    expect(app.latest().confirm_amount).toBe('1.5');
    expect(app.latest().confirm_amount).toBe(app.latest().token_amount);

    app.dispatch({ type: 'enter_split_mode' });
    app.dispatch({
      type: 'recipients_changed',
      recipients: [row('r1', BOB, '1.5'), row('r2', CAROL, '2.5')],
    });
    await settle();
    expect(app.latest().confirm_amount).toBe('4');
    // The seeded single-send field is still 1.5 — reading it would have shown
    // the user a third of what the batch actually moves.
    expect(app.latest().token_amount).toBe('1.5');
  });

  it('declines where the old shell math THREW, instead of blanking the page', async () => {
    const rows = [row('r1', BOB, '1,5'), row('r2', CAROL, '0.25')];
    // What `ConfirmStep` used to do, from inside a render.
    expect(() => oldShellTotal(rows, NATIVE.decimals)).toThrow();
    const app = await splitting(NATIVE, rows);
    expect(app.latest().confirm_amount).toBe('');
    // …and the page's own `|| '0'` turns that into a plain zero.
    expect(parseFloat(app.latest().confirm_amount || '0')).toBe(0);
  });

  it('never disagrees with the total the money gates read', async () => {
    const rows = [row('r1', BOB, '3.5'), row('r2', CAROL, '4.25')];
    const app = await splitting(NATIVE, rows);
    const gateTotal = sumSplitBaseUnits(
      app.latest().recipients.map((r) => ({ address: r.address, amount: r.amount })),
      NATIVE.decimals,
    );
    expect(app.latest().confirm_amount).toBe(fromBaseUnits(gateTotal, NATIVE.decimals));
    // The same sum the over-balance refusal uses: push it past the balance and
    // `Continue` refuses, with the headline still naming that exact figure.
    app.dispatch({
      type: 'recipients_changed',
      recipients: [row('r1', BOB, '19'), row('r2', CAROL, '19')],
    });
    await settle();
    expect(app.latest().confirm_amount).toBe('38');
    expect(app.latest().split_over_balance).toBe(true);
  });

  it('has no headline in multiSelect — those rows come from multi_specs', async () => {
    const app = open([NATIVE, STABLE]);
    sessions.push(app.session);
    await settle();
    app.dispatch({ type: 'set_multi_network', chain_id: CHAIN });
    app.dispatch({
      type: 'toggle_all_multi_tokens',
      visible_ids: [tokenId(NATIVE), tokenId(STABLE)],
    });
    await settle();
    app.dispatch({ type: 'confirm_multi_selection' });
    await settle();
    expect(app.latest().multi_select_mode).toBe(true);
    expect(app.latest().confirm_amount).toBe('');
  });
});
