// The `clear_signing` core (Rust/wasm) driven through the WEB shell.
//
// The machine's own rules — the five-level decode fallback, the ERC-165
// disambiguation, the decimals trust rule, the risk floors, the SIWE
// adjudication — are covered by the Rust suite
// (`rust/crates/vela-core/tests/app_clear_signing.rs`). What only exists on
// this side is:
//
//   - the EXECUTOR: which service each operation maps to, and above all the
//     difference between an RPC that ANSWERED with an error object (a revert:
//     definitively "not ERC-165") and one that could not be reached (unknown,
//     and never cached). Collapsing those two is how a transient outage
//     permanently mis-renders a real NFT's tokenId as a fungible amount.
//   - the wire codec: `snake_case` roles back to the `kebab-case` the signing
//     views render from, and explicit `null`s back to optional properties.
//   - the verdicts the sheet dispatches on (surface, confirm semantics,
//     danger haptic), end to end through the session.

const fetchWithTimeout = jest.fn();
jest.mock('@/services/net', () => ({
  fetchWithTimeout: (...args: unknown[]) => fetchWithTimeout(...args),
  NET_TIMEOUTS: { descriptor: 5000 },
}));

const poolRpcCall = jest.fn();
jest.mock('@/services/rpc-pool', () => ({
  poolRpcCall: (...args: unknown[]) => poolRpcCall(...args),
}));

const lookupSelector = jest.fn();
jest.mock('@/services/selector-registry', () => ({
  lookupSelector: (...args: unknown[]) => lookupSelector(...args),
}));

jest.mock('@/services/storage', () => ({
  getEthereumDataURL: () => 'https://data.example',
}));

// Load-bearing, and easy to get wrong: jest lists no `.web.ts` in
// `moduleFileExtensions`, so a bare `@/services/vela-core` resolves the NATIVE
// index and the wasm is never initialized (metro resolves the same specifier
// to `index.web.ts`, which is why the session module imports it bare).
// Importing the web entry by explicit path first runs `initSync`.
import '@/services/vela-core/index.web';
import {
  clearOperationFailure,
  executeClearOperation,
} from '@/services/wallet-state-core/clear-executor.web';
import { createClearSigningSession } from '@/services/wallet-state-core/clear-session.web';
import { toShellResult } from '@/services/wallet-state-core/clear-types';
import type { ClearSigningEvent } from '@/services/wallet-state-core/generated/ClearSigningEvent';
import type { ClearSigningView } from '@/services/wallet-state-core/generated/ClearSigningView';

const LOCALE = {
  number_format: 'comma_dot',
  date_format: 'mdy_slash',
  time_format: 'h24',
  tz_offset_minutes: 0,
} as const;

const UNKNOWN = '0x1234567890abcdef1234567890abcdef12345678';
const ME = '0x00000000000000000000000000000000000000aa';

/** Let the effect loop's async round-trips settle. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function open(event: ClearSigningEvent) {
  const faults: unknown[] = [];
  let view: ClearSigningView | null = null;
  const session = createClearSigningSession({
    onView: (next) => { view = next; },
    onError: (error) => { faults.push(error); },
  });
  session.start(event);
  return {
    session,
    faults,
    get view(): ClearSigningView {
      if (!view) throw new Error('no view committed');
      return view;
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchWithTimeout.mockResolvedValue({ ok: false, text: async () => '' });
  poolRpcCall.mockResolvedValue({ result: null });
  lookupSelector.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

describe('clear-signing executor', () => {
  it('fetches a descriptor off the ethereum-data host with the descriptor timeout', async () => {
    fetchWithTimeout.mockResolvedValue({ ok: true, text: async () => '{"ok":1}' });
    const result = await executeClearOperation(
      { id: 1, operation: { type: 'http_get', path: '/erc7730/x.json' } },
      new AbortController().signal,
    );
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://data.example/erc7730/x.json',
      {},
      { timeoutMs: 5000 },
    );
    expect(result).toEqual({ type: 'descriptor_fetched', path: '/erc7730/x.json', json: '{"ok":1}' });
  });

  it('reports a non-200 descriptor as absent, never as an exception', async () => {
    fetchWithTimeout.mockResolvedValue({ ok: false, text: async () => 'nope' });
    const result = await executeClearOperation(
      { id: 1, operation: { type: 'http_get', path: '/missing.json' } },
      new AbortController().signal,
    );
    expect(result).toEqual({ type: 'descriptor_fetched', path: '/missing.json', json: null });
  });

  it('distinguishes an RPC error object (a revert) from an unreachable RPC', async () => {
    const probe = {
      id: 1,
      operation: {
        type: 'rpc_eth_call' as const,
        chain_id: 1,
        to: UNKNOWN,
        data: '0x01ffc9a7',
        probe: 'supports_erc721' as const,
      },
    };

    poolRpcCall.mockResolvedValue({ error: { code: -32000, message: 'execution reverted' } });
    const reverted = await executeClearOperation(probe, new AbortController().signal);
    expect(reverted).toMatchObject({ rpc_error: true, result: null });

    // Unreachable is NOT a revert: `rpc_error` stays false so the core reads
    // "unknown" and refuses to cache a verdict it never got.
    const unreachable = clearOperationFailure(probe, new Error('offline'));
    expect(unreachable).toMatchObject({ rpc_error: false, result: null, probe: 'supports_erc721' });
  });

  it('echoes the probe, chain and address so a late answer can never be misrouted', async () => {
    poolRpcCall.mockResolvedValue({ result: '0x12' });
    const result = await executeClearOperation(
      {
        id: 1,
        operation: { type: 'rpc_eth_call', chain_id: 56, to: UNKNOWN, data: '0x313ce567', probe: 'decimals' },
      },
      new AbortController().signal,
    );
    expect(result).toEqual({
      type: 'rpc_answer',
      probe: 'decimals',
      chain_id: 56,
      to: UNKNOWN,
      result: '0x12',
      rpc_error: false,
    });
    expect(poolRpcCall).toHaveBeenCalledWith(
      'eth_call',
      [{ to: UNKNOWN, data: '0x313ce567' }, 'latest'],
      56,
    );
  });

  it('answers a cancelled timer instead of holding the run open', async () => {
    const controller = new AbortController();
    const pending = executeClearOperation(
      { id: 1, operation: { type: 'timer', ms: 60_000, token: 7 } },
      controller.signal,
    );
    controller.abort();
    await expect(pending).resolves.toEqual({ type: 'timed_out', token: 7 });
  });

  it('never rejects: every failure becomes the variant its operation answers with', () => {
    expect(clearOperationFailure({ id: 1, operation: { type: 'http_get', path: '/x' } }, new Error('x')))
      .toEqual({ type: 'descriptor_fetched', path: '/x', json: null });
    expect(clearOperationFailure({ id: 1, operation: { type: 'selector_db_lookup', selector: '0xdeadbeef' } }, new Error('x')))
      .toEqual({ type: 'selector_candidates', sigs: [] });
    expect(clearOperationFailure({ id: 1, operation: { type: 'timer', ms: 1, token: 3 } }, new Error('x')))
      .toEqual({ type: 'timed_out', token: 3 });
  });
});

// ---------------------------------------------------------------------------
// Wire codec
// ---------------------------------------------------------------------------

describe('clear-signing wire codec', () => {
  it('maps roles and drops the wire nulls the display shape declares optional', () => {
    const shell = toShellResult({
      intent: 'Swap',
      contract_name: 'Uniswap V3 Router',
      owner: null,
      risk: 'caution',
      contract_address: UNKNOWN,
      verified: true,
      sign_type: 'transaction',
      partial: false,
      best_effort: true,
      fields: [
        {
          label: 'Amount', value: '100 USDC', format: 'tokenAmount',
          token_address: UNKNOWN, warning: true, unverified: true,
          role: 'send_amount', detail: false, expired: false,
          address: null, usd_value: 100,
        },
        {
          label: 'To', value: 'vitalik.eth', format: 'addressName',
          token_address: null, warning: false, unverified: false,
          role: 'receive_amount', detail: true, expired: true,
          address: ME, usd_value: null,
        },
      ],
    });

    expect(shell.type).toBe('transaction');
    expect(shell.bestEffort).toBe(true);
    expect(shell.contractName).toBe('Uniswap V3 Router');
    expect('owner' in shell).toBe(false);
    expect(shell.fields[0]).toEqual({
      label: 'Amount', value: '100 USDC', format: 'tokenAmount',
      role: 'send-amount', warning: true, unverified: true, detail: false, expired: false,
      tokenAddress: UNKNOWN, usdValue: 100,
    });
    expect(shell.fields[1].role).toBe('receive-amount');
    expect('tokenAddress' in shell.fields[1]).toBe(false);
    expect(shell.fields[1].address).toBe(ME);
  });
});

// ---------------------------------------------------------------------------
// Verdicts, end to end
// ---------------------------------------------------------------------------

describe('clear-signing verdicts through the session', () => {
  it('a plain native transfer needs no network and confirms as "send"', () => {
    const sheet = open({
      type: 'resolve_transaction',
      to: ME, data: '0x', value: '0xde0b6b3a7640000', chain_id: 1, locale: LOCALE,
    });
    expect(fetchWithTimeout).not.toHaveBeenCalled();
    expect(sheet.view.resolving).toBe(false);
    expect(sheet.view.surface).toBe('blind_transaction');
    expect(sheet.view.confirm).toEqual({ type: 'confirm_intent', intent: 'send' });
    sheet.session.dispose();
  });

  it('holds the loading surface while a descriptor resolves, then falls to blind', async () => {
    const sheet = open({
      type: 'resolve_transaction',
      to: UNKNOWN, data: '0xdeadbeef', value: '0x0', chain_id: 1, locale: LOCALE,
    });
    expect(sheet.view.surface).toBe('loading');
    expect(sheet.view.resolving).toBe(true);

    for (let i = 0; i < 12 && sheet.view.resolving; i += 1) await settle();
    expect(sheet.view.surface).toBe('blind_transaction');
    expect(sheet.view.result).toBeNull();
    // Neutral confirm for an undecodable call — never "Approve".
    expect(sheet.view.confirm).toEqual({ type: 'confirm' });
    expect(sheet.faults).toEqual([]);
    sheet.session.dispose();
  });

  it('eth_sign shows params[1] on the hard-warning surface and always buzzes', () => {
    const digest = '0x9c22ff5f21f0b81b113e63f7db6da94fedef11b2119b4088b89664fb9a3cb658';
    const sheet = open({
      type: 'message_presented',
      method: 'eth_sign',
      params: [ME, digest],
      request_origin: 'https://app.example',
    });
    expect(sheet.view.surface).toBe('eth_sign');
    expect(sheet.view.message?.payload).toBe(digest);
    expect(sheet.view.danger_haptic).toBe(true);
    sheet.session.dispose();
  });

  it('a SIWE domain that does not bind to the origin is one verdict: banner AND buzz', () => {
    const siwe = [
      'app.uniswap.org wants you to sign in with your Ethereum account:',
      ME,
      '',
      'Sign in to Uniswap.',
      '',
      'URI: https://app.uniswap.org',
    ].join('\r\n'); // CRLF: the line-1 anchor must survive it
    const payload = `0x${Buffer.from(siwe, 'utf8').toString('hex')}`;

    const phish = open({
      type: 'message_presented',
      method: 'personal_sign',
      params: [payload, ME],
      request_origin: 'https://uniswap-airdrop.xyz',
    });
    expect(phish.view.message?.danger_class).toBe('siwe_phish');
    expect(phish.view.message?.binding).toBe('mismatch');
    expect(phish.view.danger_haptic).toBe(true);
    phish.session.dispose();

    const bound = open({
      type: 'message_presented',
      method: 'personal_sign',
      params: [payload, ME],
      request_origin: 'https://app.uniswap.org',
    });
    expect(bound.view.message?.binding).toBe('ok');
    expect(bound.view.danger_haptic).toBe(false);
    bound.session.dispose();
  });

  it('a readable non-ASCII message is text, and is NOT flagged as a disguised hash', () => {
    const text = 'Hello from biubiu.tools 👋 签名消息';
    const sheet = open({
      type: 'message_presented',
      method: 'personal_sign',
      params: [`0x${Buffer.from(text, 'utf8').toString('hex')}`],
      request_origin: 'https://app.example',
    });
    expect(sheet.view.message?.decoded_text).toBe(text);
    expect(sheet.view.message?.non_printable).toBe(false);
    expect(sheet.view.message?.danger_class).toBe('plain');
    expect(sheet.view.confirm).toEqual({ type: 'sign' });
    sheet.session.dispose();
  });

  it('a non-printable payload keeps its hex preview and the caution verdict', () => {
    const sheet = open({
      type: 'message_presented',
      method: 'personal_sign',
      params: ['0xdeadbeefcafebabe0102030405060708091011121314151617181920212223242526272829303132'],
      request_origin: 'https://app.example',
    });
    expect(sheet.view.message?.decoded_text).toBeNull();
    expect(sheet.view.message?.binary_preview?.startsWith('0xdeadbeef')).toBe(true);
    expect(sheet.view.message?.non_printable).toBe(true);
    expect(sheet.view.message?.danger_class).toBe('opaque_hash');
    // A caution, not a danger: it never buzzes like eth_sign does.
    expect(sheet.view.danger_haptic).toBe(false);
    sheet.session.dispose();
  });

  it('projects an undecodable typed payload in payload order, capped at five rows', () => {
    const sheet = open({
      type: 'resolve_typed_data',
      typed_data_json: JSON.stringify({
        primaryType: 'CustomOrder',
        domain: { name: 'Unknown Protocol' },
        message: {
          maker: '0xaF5e8917831Ef08A64e18b2Cde9f8f5D32C7b3e1',
          amount: '5000000000000000000',
          expiry: '1750000000',
          salt: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          extra: 1,
          sixth: 2,
        },
      }),
      chain_id: 1,
      locale: LOCALE,
    });
    // No `verifyingContract` → blind immediately, no descriptor fetch.
    expect(fetchWithTimeout).not.toHaveBeenCalled();
    expect(sheet.view.surface).toBe('blind_typed_data');
    expect(sheet.view.confirm).toEqual({ type: 'sign' });
    const blind = sheet.view.blind_typed!;
    expect(blind.primary_type).toBe('CustomOrder');
    expect(blind.domain_name).toBe('Unknown Protocol');
    expect(blind.fields.map((f) => f.key)).toEqual(['maker', 'amount', 'expiry', 'salt', 'extra']);
    expect(blind.fields[3].value).toBe('0xabcdef12…34567890');
    sheet.session.dispose();
  });

  it('a superseded request never renders the previous one', () => {
    const sheet = open({
      type: 'resolve_transaction',
      to: UNKNOWN, data: '0xdeadbeef', value: '0x0', chain_id: 1, locale: LOCALE,
    });
    expect(sheet.view.resolving).toBe(true);
    sheet.session.dispatch({
      type: 'message_presented',
      method: 'personal_sign',
      params: [`0x${Buffer.from('hi', 'utf8').toString('hex')}`],
      request_origin: null,
    });
    expect(sheet.view.resolving).toBe(false);
    expect(sheet.view.result).toBeNull();
    expect(sheet.view.surface).toBe('message_sign');
    sheet.session.dispose();
  });
});
