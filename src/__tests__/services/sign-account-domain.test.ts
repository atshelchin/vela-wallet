// §12.1.6, the SHELL half: which list the granted-account switch is indexed in.
//
// `sign_request` answers "the origin was granted 0xBOB" with a POSITION in the
// account list it was given. That position is consumed by the SESSION core,
// where `SwitchAccount` with an index that names no row is a silent WHOLE
// no-op (`session.rs::switch_account`, invariant ①). Silent is the danger: the
// core would then believe it had switched, ack, open the approval surface, and
// the wallet would sign from an account the origin was never granted — the
// exact failure §12.1.6 exists to prevent.
//
// Two things are asserted here, and neither can be asserted in Rust (the core
// cannot see which list the shell handed it):
//
//   1. The supported entry point (`setSignAccounts`) cannot be talked into a
//      second index domain at all — it feeds the session's own rows.
//   2. If the core is nonetheless holding a foreign list, the switch is CAUGHT
//      before anything is signed, loudly, and fails closed: never acked, so
//      `confirm_gate_open` stays false and approve is inert.
//
// Driven against the real wasm core, the real resident and the real executor;
// only the session boundary is a double, because what is under test is exactly
// the handover across it.

const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, val: string) => { mockStorage.set(key, val); }),
  removeItem: jest.fn(async (key: string) => { mockStorage.delete(key); }),
}));

jest.mock('@/modules/passkey', () => ({
  PasskeyErrorCode: { CANCELLED: 'PASSKEY_CANCELLED', FAILED: 'PASSKEY_FAILED' },
}));

jest.mock('@/models/network', () => ({
  nativeSymbol: () => 'ETH',
  getAllNetworksSync: () => [{ chainId: 1 }],
}));

jest.mock('@/services/tx-simulation', () => ({ serializeAssetSim: (sim: unknown) => sim }));
jest.mock('@/services/token-autoadd', () => ({ autoAddReceivedTokens: async () => 0 }));
jest.mock('@/services/rpc-adapter', () => ({ rpcCall: jest.fn(async () => ({ result: null })) }));

jest.mock('@/services/bundler-service', () => ({
  checkBundlerFunding: async () => null,
  attemptSilentSponsorship: async () => ({ outcome: 'funded', sponsored: false }),
  clearBundlerCache: () => {},
  fetchBundlerAccountInfo: async () => null,
  parseBundlerUnderfunded: () => null,
  recommendedFundingWei: (threshold: bigint, current: bigint) => threshold - current,
  underfundedRequiredWei: () => null,
  formatWei: (wei: bigint) => `${wei.toString()} wei`,
}));

// The one I/O call the whole machine exists to sequence. Its `safeAddress` and
// `account.id` are the signer the wallet actually signs with.
const mockSubmits: { address: string; credentialId: string }[] = [];
jest.mock('@/hooks/use-dapp-signing', () => ({
  handleDAppRequest: async (
    _request: unknown, account: { id: string }, safeAddress: string,
  ) => {
    mockSubmits.push({ address: safeAddress, credentialId: account.id });
    return '0xsig';
  },
}));

// The session boundary, reproducing the ONLY behaviour that matters here:
// `switch_account` is applied synchronously, and an out-of-range index is a
// silent whole no-op that changes nothing and reports nothing.
const mockSession = {
  rows: [] as { address: string; id: string; name: string }[],
  active: 0,
  switches: [] as number[],
};
jest.mock('@/services/wallet-state-core/session-resident', () => ({
  dispatchWalletSession: (event: { type: string; index?: number }) => {
    if (event.type !== 'switch_account') return;
    const index = event.index ?? -1;
    mockSession.switches.push(index);
    if (index < 0 || index >= mockSession.rows.length) return; // silent no-op
    mockSession.active = index;
  },
  walletSessionAccounts: () => mockSession.rows,
  walletSessionView: () => ({ active_index: mockSession.active }),
}));

// Importing the facade first is load-bearing: `@/services/vela-core` runs
// `initSync` on the planted wasm bytes at import time, so the core is
// initialised before anything below constructs a session.
import '@/services/vela-core';
import {
  bindSignRequest,
  dispatchSign,
  registerSignTransport,
  setSignAccounts,
  signRequestView,
} from '@/services/wallet-state-core/sign-resident';
import type { DAppTransport } from '@/services/dapp-transport';
import type { SignEvent } from '@/services/wallet-state-core/generated/SignEvent';

const NOW = 1_770_000_000_000;
const ALICE = '0x1111111111111111111111111111111111111111';
const BOB = '0x2222222222222222222222222222222222222222';

const row = (address: string, id: string) => ({ address, id, name: id });

/** Let the effect loop's round trips settle. */
const settle = async () => {
  for (let i = 0; i < 12; i += 1) await new Promise<void>((r) => setTimeout(r, 0));
};

const answers: { id: string; error?: { code: number; message: string } }[] = [];
const transport = {
  name: 'fake',
  connected: true,
  connect: async () => {},
  disconnect: () => {},
  sendResponse: (id: string, _result?: unknown, error?: { code: number; message: string }) => {
    answers.push({ id, error });
  },
  pushWalletInfo: () => {},
  fetchDAppInfo: async () => null,
  on: () => () => {},
} as unknown as DAppTransport;

let rid = 0;
/** One `eth_sendTransaction` from `origin`, granted to `grantedAddress`. */
function arrive(grantedAddress: string): string {
  rid += 1;
  const id = `req-${rid}`;
  const transportId = registerSignTransport(transport);
  bindSignRequest(id, transportId, null);
  const event: SignEvent = {
    type: 'request_arrived',
    id,
    method: 'eth_sendTransaction',
    params_json: JSON.stringify([{ from: ALICE, to: BOB, value: '0x1' }]),
    origin: 'https://dapp.example',
    transport_id: transportId,
    dedicated_transport: true,
    per_request_chain: 1,
    dapp: { name: 'Example', url: 'https://dapp.example' },
    granted_address: grantedAddress,
    requested_address: null,
    request_ts_ms: null,
    now_ms: NOW,
  };
  dispatchSign(event);
  return id;
}

const APPROVE: SignEvent = {
  type: 'approve_tapped',
  opts: {
    max_fee_per_gas: '1500000000',
    bundler_cost_wei: null,
    gas_fee_token: null,
    quoted_fee: null,
    fee_collector: null,
    params_override_json: null,
    intent: null,
  },
};

let errors: jest.SpyInstance;

beforeEach(() => {
  mockStorage.clear();
  mockSubmits.length = 0;
  answers.length = 0;
  mockSession.rows = [row(ALICE, 'cred-alice'), row(BOB, 'cred-bob')];
  mockSession.active = 0;
  mockSession.switches.length = 0;
  errors = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  // The resident is a module singleton — clear whatever this test left on it.
  dispatchSign({ type: 'dismiss_tapped' });
  await settle();
  errors.mockRestore();
});

describe('§12.1.6 — the granted-account switch is indexed in the session domain', () => {
  test('the switch lands, acks immediately, and the signer is the core\'s own', async () => {
    setSignAccounts(mockSession.rows, 0);
    arrive(BOB.toUpperCase());
    await settle();

    // The index is the SESSION's row for BOB, and the session really moved.
    expect(mockSession.switches).toEqual([1]);
    expect(mockSession.active).toBe(1);
    expect(errors).not.toHaveBeenCalled();

    // Acked — with no `setTimeout(0)` yield left on the path, so a single
    // settle of the loop is enough for the approval surface to open.
    const view = signRequestView();
    expect(view.reconcile_pending).toBe(false);
    expect(view.confirm_gate_open).toBe(true);
    // The signer the sheet shows comes from the core, not from React.
    expect(view.request?.signer_address).toBe(BOB);

    dispatchSign(APPROVE);
    await settle();
    expect(mockSubmits).toEqual([{ address: BOB, credentialId: 'cred-bob' }]);
  });

  test('a foreign accounts list is caught before anything is signed', async () => {
    // The machine is holding a REORDERED list — a second caller dispatching
    // `accounts_changed` itself, or any future list that is not the session's
    // rows. BOB is row 0 here and row 1 in the session.
    dispatchSign({
      type: 'accounts_changed',
      accounts: [
        { address: BOB, credential_id: 'cred-bob' },
        { address: ALICE, credential_id: 'cred-alice' },
      ],
      active_index: 1,
    });
    arrive(BOB);
    await settle();

    // Loud, and the session was never moved to the wrong account.
    expect(errors).toHaveBeenCalled();
    expect(String(errors.mock.calls[0][0])).toContain('§12.1.6');
    expect(mockSession.switches).toEqual([]);
    expect(mockSession.active).toBe(0);

    // Fail-closed: never acked, so the approval surface stays shut and an
    // approve does nothing. The wrong-account signature is not merely
    // unlikely — it is unreachable.
    expect(signRequestView().reconcile_pending).toBe(true);
    expect(signRequestView().confirm_gate_open).toBe(false);
    dispatchSign(APPROVE);
    await settle();
    expect(mockSubmits).toEqual([]);
  });

  test('an index the session has no row for is caught, not silently absorbed', async () => {
    dispatchSign({
      type: 'accounts_changed',
      accounts: [
        { address: ALICE, credential_id: 'cred-alice' },
        { address: BOB, credential_id: 'cred-bob' },
        { address: '0x3333333333333333333333333333333333333333', credential_id: 'cred-carol' },
      ],
      active_index: 0,
    });
    // The session only has two rows, so index 2 is the silent whole no-op.
    mockSession.rows = [row(ALICE, 'cred-alice'), row(BOB, 'cred-bob')];
    arrive('0x3333333333333333333333333333333333333333');
    await settle();

    expect(errors).toHaveBeenCalled();
    expect(mockSession.switches).toEqual([]);
    expect(signRequestView().confirm_gate_open).toBe(false);
    dispatchSign(APPROVE);
    await settle();
    expect(mockSubmits).toEqual([]);
  });

  test('setSignAccounts cannot be talked into a second index domain', async () => {
    // A caller hands over a REVERSED list. The resident says so and feeds the
    // session's rows anyway, so the switch still lands in the right domain.
    setSignAccounts([row(BOB, 'cred-bob'), row(ALICE, 'cred-alice')], 1);
    expect(errors).toHaveBeenCalled();
    expect(String(errors.mock.calls[0][0])).toContain('§12.1.6');

    arrive(BOB);
    await settle();
    expect(mockSession.switches).toEqual([1]);
    expect(signRequestView().request?.signer_address).toBe(BOB);
    expect(signRequestView().confirm_gate_open).toBe(true);
  });
});
