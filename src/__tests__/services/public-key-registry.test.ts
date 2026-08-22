// The registry health gate must accept BOTH identities during the migration:
// the legacy index server answers `webauthn-p256-publickey-index`, the v2
// registry answers `webauthn-p256-publickey-registry`. A wallet pointed at
// either must treat it as healthy, so neither string can be dropped.

import {
  isRegistryServiceIdentity,
  REGISTRY_SERVICE_IDENTITIES,
} from '@/services/public-key-registry';

describe('isRegistryServiceIdentity', () => {
  it('accepts the v2 registry identity', () => {
    expect(isRegistryServiceIdentity('webauthn-p256-publickey-registry')).toBe(true);
  });

  it('accepts the legacy index identity', () => {
    expect(isRegistryServiceIdentity('webauthn-p256-publickey-index')).toBe(true);
  });

  it('rejects anything else, including non-strings', () => {
    expect(isRegistryServiceIdentity('webauthn-p256-something-else')).toBe(false);
    expect(isRegistryServiceIdentity('')).toBe(false);
    expect(isRegistryServiceIdentity(undefined)).toBe(false);
    expect(isRegistryServiceIdentity(null)).toBe(false);
    expect(isRegistryServiceIdentity({ service: 'webauthn-p256-publickey-registry' })).toBe(false);
  });

  it('exposes both identities so the health probe and Settings badge agree', () => {
    expect([...REGISTRY_SERVICE_IDENTITIES]).toEqual([
      'webauthn-p256-publickey-registry',
      'webauthn-p256-publickey-index',
    ]);
  });
});

// ---------------------------------------------------------------------------
// queryUnit — the group fetch a multi-key login reconstructs a wallet from
// ---------------------------------------------------------------------------

jest.mock('@/services/storage', () => ({
  loadServiceEndpoints: jest.fn(async () => ({ passkeyIndexURL: 'https://reg.test' })),
}));
const fetchMock = jest.fn();
jest.mock('@/services/net', () => ({
  fetchWithTimeout: (...args: any[]) => fetchMock(...args),
  isTimeoutError: () => false,
  NET_TIMEOUTS: { keyIndexRead: 1000, keyIndexWrite: 1000 },
}));

import { queryUnit } from '@/services/public-key-registry';

function ok(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

const MEMBER = {
  entryId: 1,
  publicKey: '04' + 'ab'.repeat(64),
  attestation: '',
  credentialId: 'cred-1',
};

describe('queryUnit', () => {
  beforeEach(() => fetchMock.mockReset());

  it('fetches by unitId with the 7-member page and returns the detail', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        unit: { unitId: 3, rpId: 'getvela.app', metadata: 'aa', groupPublicKey: '04', contentHash: '0x', memberCount: 1 },
        members: { total: 1, items: [MEMBER] },
        references: { total: 0, referenceIds: [] },
      }),
    );
    const detail = await queryUnit(3);
    expect(fetchMock.mock.calls[0][0]).toBe('https://reg.test/api/query?unitId=3&pageSize=7&order=asc');
    expect(detail.members.items).toHaveLength(1);
    expect(detail.unit.metadata).toBe('aa');
  });

  it('refuses a group larger than a wallet founding set', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        unit: { unitId: 9, rpId: 'x', metadata: '', groupPublicKey: '', contentHash: '', memberCount: 8 },
        members: { total: 8, items: new Array(7).fill(MEMBER) },
        references: { total: 0, referenceIds: [] },
      }),
    );
    await expect(queryUnit(9)).rejects.toThrow(/cap 7/);
  });

  it('refuses a page that does not hold every member', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        unit: { unitId: 4, rpId: 'x', metadata: '', groupPublicKey: '', contentHash: '', memberCount: 3 },
        members: { total: 3, items: [MEMBER] },
        references: { total: 0, referenceIds: [] },
      }),
    );
    await expect(queryUnit(4)).rejects.toThrow(/holds 1 of 3/);
  });

  it('surfaces a non-OK response as a query failure', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 } as Response);
    await expect(queryUnit(404)).rejects.toThrow('Query failed: 404');
  });
});
