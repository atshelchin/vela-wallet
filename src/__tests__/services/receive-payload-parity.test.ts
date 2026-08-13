// What the Receive screen hands out: the QR's contents and the clipboard.
//
// Both are money-routing decisions — a wrong payload sends someone else's
// payment somewhere else — and the `payment_request` core has owned the rules
// since spec 016 (`qr_value`, `copy_payload`, `can_copy`, `can_save`, `mode`).
// `ReceiveScreen.tsx` nevertheless re-decided all five in TSX, and because it
// kept `mode` in its own `useState` the core's `ModeChanged` was NEVER
// dispatched: `model.mode` stayed `Address` forever, so the very fields meant
// to be authoritative answered with the bare address in request mode. Fields
// nobody used, and that nobody could have used.
//
// This pins the wiring:
//   - the core's payloads track the tab now that the tab reaches it, and
//   - they equal what the screen used to compute, so connecting them changed
//     no destination on screen — and
//   - they equal what the TypeScript builders (`buildEIP681` / `buildPayLink`)
//     produce — the surviving statement of the rule outside the core.

// `expo-localization` ships untransformed ESM and rides in on the shared
// executor barrel; nothing below asserts on it.
jest.mock('expo-localization', () => ({ getLocales: () => [] }));
jest.mock('@/services/platform', () => ({
  hapticSuccess: jest.fn(),
  hapticError: jest.fn(),
  hapticLight: jest.fn(),
  isAppActive: () => true,
  showAlert: jest.fn(),
}));

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

import '@/services/vela-core';
// The REAL native builders — the ones `use-receive-request.ts` calls.
import { buildEIP681, buildPayLink } from '@/services/eip681';
import { createPaymentRequestSession } from '@/services/wallet-state-core/session';
import type { PaymentRequestEvent } from '@/services/wallet-state-core/generated/PaymentRequestEvent';
import type { PaymentRequestView } from '@/services/wallet-state-core/generated/PaymentRequestView';

const ME = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const BASE_URL = 'https://wallet.getvela.app/pay';
const ACK_KEY = `vela.receiveWarned.${ME}`;

const ETH_ASSET = { chainId: 1, tokenAddress: null as string | null, symbol: 'ETH', decimals: 18, networkName: 'Ethereum' };
const USDC_ASSET = { chainId: 1, tokenAddress: USDC as string | null, symbol: 'USDC', decimals: 6, networkName: 'Ethereum' };

const settle = async () => {
  for (let i = 0; i < 12; i += 1) await new Promise<void>((r) => setTimeout(r, 0));
};

function open(recipient = ME) {
  let view: PaymentRequestView | null = null;
  const session = createPaymentRequestSession({
    onView: (next) => {
      view = next;
    },
    onError: (error) => {
      throw error;
    },
  });
  session.start({ type: 'start', account: ME, recipient, base_url: BASE_URL });
  return {
    session,
    dispatch: (event: PaymentRequestEvent) => session.dispatch(event),
    latest: () => view as PaymentRequestView,
  };
}

/**
 * `ReceiveScreen.tsx:73` and `:78` exactly as they stood — the two expressions
 * this round deleted, kept here as the oracle they are being replaced by.
 */
const oldScreenQr = (isRequest: boolean, uri: string, address: string) =>
  isRequest ? uri || address : address;
const oldScreenCopy = (isRequest: boolean, payLink: string, address: string) =>
  isRequest ? payLink : address;

let sessions: { dispose: () => void }[] = [];
afterEach(() => {
  sessions.forEach((s) => s.dispose());
  sessions = [];
  mockStorage.clear();
});

async function receiving(recipient = ME) {
  const app = open(recipient);
  sessions.push(app.session);
  await settle();
  return app;
}

describe('receive payloads: the core decides, and its answer is the screen’s', () => {
  it('tracks the tab now that the tab reaches it', async () => {
    const app = await receiving();
    expect(app.latest().mode).toBe('address');
    expect(app.latest().qr_value).toBe(ME);
    expect(app.latest().copy_payload).toBe(ME);

    app.dispatch({ type: 'mode_changed', mode: 'request' });
    await settle();
    expect(app.latest().mode).toBe('request');
    // The bug this closes: without ModeChanged both of these stayed `ME`.
    expect(app.latest().qr_value).toBe(app.latest().eip681_uri);
    expect(app.latest().qr_value).not.toBe(ME);
    expect(app.latest().copy_payload).toBe(app.latest().pay_link);
    expect(app.latest().copy_payload.startsWith(`${BASE_URL}?`)).toBe(true);

    app.dispatch({ type: 'mode_changed', mode: 'address' });
    await settle();
    expect(app.latest().qr_value).toBe(ME);
    expect(app.latest().copy_payload).toBe(ME);
  });

  it('request mode copies the pay-LINK, never the raw ethereum: URI', async () => {
    const app = await receiving();
    app.dispatch({ type: 'mode_changed', mode: 'request' });
    app.dispatch({ type: 'asset_picked', chain_id: 1, token_address: USDC, symbol: 'USDC', decimals: 6, network_name: 'Ethereum' });
    app.dispatch({ type: 'amount_changed', text: '12.5' });
    await settle();
    const view = app.latest();
    expect(view.copy_payload.startsWith('ethereum:')).toBe(false);
    expect(view.qr_value.startsWith('ethereum:')).toBe(true);
    // FR-015, stated as the difference it makes: what a scanner reads and what
    // a chat message carries are deliberately different artefacts.
    expect(view.qr_value).not.toBe(view.copy_payload);
  });

  it.each([
    ['open request, native', ETH_ASSET, ''],
    ['native with an amount', ETH_ASSET, '0.25'],
    ['erc-20 with an amount', USDC_ASSET, '12.5'],
    ['erc-20, open request', USDC_ASSET, ''],
    ['an amount the token cannot hold', USDC_ASSET, '1.2345678'],
  ])('equals the screen expression it replaced and the native builders — %s', async (_name, asset, amount) => {
    const app = await receiving();
    app.dispatch({
      type: 'asset_picked',
      chain_id: asset.chainId,
      token_address: asset.tokenAddress,
      symbol: asset.symbol,
      decimals: asset.decimals,
      network_name: asset.networkName,
    });
    app.dispatch({ type: 'amount_changed', text: amount });
    await settle();

    for (const mode of ['address', 'request'] as const) {
      app.dispatch({ type: 'mode_changed', mode });
      await settle();
      const view = app.latest();
      const isRequest = mode === 'request';

      // ① the deleted screen expressions, fed the same builder output
      expect(view.qr_value).toBe(oldScreenQr(isRequest, view.eip681_uri, ME));
      expect(view.copy_payload).toBe(oldScreenCopy(isRequest, view.pay_link, ME));

      // ② the native builders, called for real
      const nativeUri = buildEIP681({
        recipient: ME,
        chainId: asset.chainId,
        tokenAddress: asset.tokenAddress,
        decimals: asset.decimals,
        amount: view.amount,
      });
      const nativeLink = buildPayLink({
        recipient: ME,
        chainId: asset.chainId,
        tokenAddress: asset.tokenAddress,
        amount: view.amount,
        symbol: asset.symbol,
        decimals: asset.decimals,
        networkName: asset.networkName,
      });
      expect(view.qr_value).toBe(oldScreenQr(isRequest, nativeUri, ME));
      expect(view.copy_payload).toBe(oldScreenCopy(isRequest, nativeLink, ME));
    }
  });

  it('an address-less screen has nothing to hand out, in either tab', async () => {
    const app = await receiving('');
    for (const mode of ['address', 'request'] as const) {
      app.dispatch({ type: 'mode_changed', mode });
      await settle();
      // Falsy, exactly as `isRequest ? (qrValue || address) : address` was with
      // `address === undefined` — the screen still renders its own placeholder.
      expect(app.latest().qr_value).toBe('');
      expect(app.latest().copy_payload).toBe('');
    }
  });

  it('copy and save stay shut until the poisoning warning is acknowledged', async () => {
    const app = await receiving();
    expect(app.latest().gate_loading).toBe(false);
    expect(app.latest().acknowledged).toBe(false);
    expect(app.latest().can_copy).toBe(false);
    expect(app.latest().can_save).toBe(false);

    app.dispatch({ type: 'acknowledge' });
    await settle();
    expect(app.latest().can_copy).toBe(true);
    expect(app.latest().can_save).toBe(true);
    // Both permissions are the ONE gate — they can never disagree.
    expect(app.latest().can_copy).toBe(app.latest().acknowledged);
    expect(app.latest().can_save).toBe(app.latest().acknowledged);

    // A returning account skips the gate: the flag was persisted.
    expect(mockStorage.get(ACK_KEY)).toBe('1');
    const again = await receiving();
    expect(again.latest().can_copy).toBe(true);
  });

  it('switching tabs never re-opens the gate', async () => {
    const app = await receiving();
    app.dispatch({ type: 'acknowledge' });
    app.dispatch({ type: 'mode_changed', mode: 'request' });
    await settle();
    expect(app.latest().can_copy).toBe(true);
    expect(app.latest().can_save).toBe(true);
  });
});
