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
