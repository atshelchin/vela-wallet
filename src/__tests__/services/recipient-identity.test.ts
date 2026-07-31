/**
 * Hermetic tests for recipient identity resolution.
 *
 * The live counterpart (`recipient-identity.live.test.ts`) queries real RPCs and real
 * name registries. It is excluded from the default jest run because it asserts on data
 * other people control: on 2026-07-31 CI reported `second.g` coming back as
 * `alternativename.base.eth`, not because anything in this repo changed but because
 * Gravity (chain 1625) was unreachable from the runner and the resolver fell through to
 * the next service in its priority list. A test that fails when a stranger registers a
 * name is not a gate on our code.
 *
 * What IS our code — and what this file covers — is the resolution policy: the order
 * services are consulted in, that one unreachable service cannot change the answer given
 * by a higher-priority one, and that the cheap exits happen before any network call.
 * `rpcCall` is mocked, so these run offline and in milliseconds.
 */

jest.mock('react-native', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(() => Promise.resolve(null)), setItem: jest.fn(() => Promise.resolve()) },
}));
jest.mock('@/services/public-key-index', () => ({ queryByWalletRef: jest.fn(() => Promise.resolve(null)) }));
jest.mock('@/services/rpc-adapter', () => ({ rpcCall: jest.fn() }));

import { resolveRecipientIdentity } from '@/services/recipient-identity';
import { rpcCall } from '@/services/rpc-adapter';
import { queryByWalletRef } from '@/services/public-key-index';

const mockRpc = rpcCall as jest.MockedFunction<typeof rpcCall>;
const mockPasskey = queryByWalletRef as jest.MockedFunction<typeof queryByWalletRef>;

const ADDR = '0x1C4e5b02e73b12f374744f6dc1c8469ec9EcD62E';
const RESOLVER = '0x1111111111111111111111111111111111111111';

/** a 32-byte word carrying an address, as `registry.resolver(node)` returns it */
const word = (addr: string) => '0x' + '0'.repeat(24) + addr.slice(2).toLowerCase();

/** ABI-encode a string the way `resolver.name(node)` returns it: offset, length, padded data */
const abiString = (s: string) => {
  const bytes = Buffer.from(s, 'utf8');
  const len = bytes.length.toString(16).padStart(64, '0');
  const data = bytes.toString('hex').padEnd(Math.ceil(bytes.length / 32) * 64, '0');
  return '0x' + (32).toString(16).padStart(64, '0') + len + data;
};

/**
 * Answer as if exactly the named chains have a reverse record. Every other chain behaves
 * like an unreachable RPC — which is the CI failure mode this file exists to pin down.
 */
const rpcForChains = (names: Record<number, string>, unreachable: number[] = []) => {
  mockRpc.mockImplementation(async (_method: string, params: any[], chainId: number) => {
    if (unreachable.includes(chainId)) throw new Error('network unreachable');
    const name = names[chainId];
    if (!name) return { jsonrpc: '2.0', id: 1, result: '0x' };
    const to = String(params[0].to).toLowerCase();
    // reverseRegistrar.node(address) — Basenames only; any 32-byte word will do
    if (to === '0x79ea96012eea67a83431f1701b3dff7e37f9e282') return { jsonrpc: '2.0', id: 1, result: '0x' + 'ab'.repeat(32) };
    if (to === RESOLVER.toLowerCase()) return { jsonrpc: '2.0', id: 1, result: abiString(name) };
    return { jsonrpc: '2.0', id: 1, result: word(RESOLVER) };
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPasskey.mockResolvedValue(null as any);
});

describe('resolveRecipientIdentity — cheap exits', () => {
  it('rejects a malformed address without any network call', async () => {
    expect(await resolveRecipientIdentity('not-an-address')).toBeNull();
    expect(await resolveRecipientIdentity('0x123')).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects the zero address without any network call', async () => {
    // it is a mint/burn counterparty in EIP-7708 events, not a recipient, and asking the
    // passkey index about it would 404 on every native transfer the wallet displays
    expect(await resolveRecipientIdentity('0x' + '0'.repeat(40))).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockPasskey).not.toHaveBeenCalled();
  });
});

describe('resolveRecipientIdentity — priority', () => {
  it('prefers the passkey index over every name service', async () => {
    mockPasskey.mockResolvedValue({ name: 'A Vela user' } as any);
    rpcForChains({ 1: 'vitalik.eth' });
    const r = await resolveRecipientIdentity(ADDR);
    expect(r).toEqual({ name: 'A Vela user', source: 'passkey' });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('prefers .g over Basename when BOTH resolve', async () => {
    // the exact ordering the CI failure turned on: .g sits above Basename in NAME_SERVICES,
    // so an address carrying both names must display the .g one
    rpcForChains({ 1625: 'second.g', 8453: 'alternativename.base.eth' });
    const r = await resolveRecipientIdentity(ADDR);
    expect(r).toEqual({ name: 'second.g', source: '.g' });
  });

  it('prefers .bnb over everything below it', async () => {
    rpcForChains({ 56: 'spaceid.bnb', 1625: 'second.g', 8453: 'x.base.eth', 1: 'x.eth' });
    expect((await resolveRecipientIdentity(ADDR))!.source).toBe('.bnb');
  });
});

describe('resolveRecipientIdentity — degradation', () => {
  it('falls through to the next service when a higher-priority chain is unreachable', async () => {
    // the CI failure, reproduced offline: Gravity down, Basename up
    rpcForChains({ 1625: 'second.g', 8453: 'alternativename.base.eth' }, [1625]);
    const r = await resolveRecipientIdentity(ADDR);
    expect(r).toEqual({ name: 'alternativename.base.eth', source: 'Basename' });
  });

  it('does not let an unreachable chain change an answer a higher-priority service gave', async () => {
    // .bnb answers; .g is down. The outage must be invisible in the result.
    rpcForChains({ 56: 'spaceid.bnb', 8453: 'x.base.eth' }, [1625]);
    expect((await resolveRecipientIdentity(ADDR))!.name).toBe('spaceid.bnb');
  });

  it('returns null when no service has a record', async () => {
    rpcForChains({});
    expect(await resolveRecipientIdentity(ADDR)).toBeNull();
  });

  it('returns null when every chain is unreachable', async () => {
    rpcForChains({ 1: 'vitalik.eth' }, [1, 56, 42161, 1625, 8453]);
    expect(await resolveRecipientIdentity(ADDR)).toBeNull();
  });

  it('ignores a registry that answers with the zero resolver', async () => {
    mockRpc.mockResolvedValue({ jsonrpc: '2.0', id: 1, result: word('0x' + '0'.repeat(40)) } as any);
    expect(await resolveRecipientIdentity(ADDR)).toBeNull();
  });
});
