/**
 * The fixture signer (spec 026 T220): its assertions must be the real thing.
 *
 * Not "shaped like" a WebAuthn assertion — actually one. The three properties
 * below are what make a fixture Safe able to settle a UserOp on a real chain:
 * the core's client-data validator accepts it, the DER signature parses, and
 * the signature verifies against that account's public key over the exact
 * bytes a real authenticator would have signed.
 */
import '$lib/i18n/wasm-init.server';
import { beforeEach, describe, expect, it } from 'vitest';
import { p256 } from '@noble/curves/p256';
import { sha256 } from '@noble/hashes/sha256';
import {
	concatBytes,
	derSignatureToRaw,
	extractPublicKey,
	fromHex,
	stripHexPrefix,
	toHex,
	verifySafeWebAuthn
} from '$lib/core/kernels';
import {
	buildMockAssertion,
	fixtureAccount,
	fixtureAccounts,
	fixtureAddresses,
	fixtureMultiAddress,
	buildMockRegistration,
	fixtureByCredentialId,
	nextFixtureRegistration,
	resetFixtureRegistrationCursor,
	setPreferredMockSigner
} from './passkey-fixture';

const CHALLENGE = '0x' + '7a'.repeat(32);

beforeEach(() => {
	resetFixtureRegistrationCursor();
	setPreferredMockSigner(null);
});

describe('the fixture keyset', () => {
	it('derives three distinct accounts and the golden multi-key Safe', () => {
		expect(fixtureAccounts()).toHaveLength(3);
		expect(new Set(fixtureAddresses()).size).toBe(3);
		expect(fixtureAddresses()[0]).toBe('0xD400866e00B055B20752a826CD5C89b811de130b');
		expect(fixtureMultiAddress()).toBe('0x88cCA0EeDbF2C4426110bbFc998F048689266894');
	});

	it('looks an account up by credential id, case- and prefix-tolerantly', () => {
		const id = fixtureAccounts()[1].id;
		expect(fixtureByCredentialId(id)?.name).toBe('Parallel Two');
		expect(fixtureByCredentialId('0x' + id.toUpperCase())?.name).toBe('Parallel Two');
		expect(fixtureByCredentialId('0xdeadbeef')).toBeUndefined();
		expect(fixtureByCredentialId(null)).toBeUndefined();
	});
});

describe('an assertion is a REAL WebAuthn assertion', () => {
	it('the core accepts its client data (field order, UV flag, authData length)', () => {
		const assertion = buildMockAssertion(CHALLENGE);
		expect(verifySafeWebAuthn(assertion)).toEqual({ ok: true });
		// 32-byte rpIdHash + 1 flags + 4 signCount = 37 bytes, exactly.
		expect(stripHexPrefix(assertion.authenticatorDataHex).length / 2).toBe(37);
	});

	it('its DER signature parses to the raw 64-byte pair', () => {
		const assertion = buildMockAssertion(CHALLENGE);
		const raw = derSignatureToRaw(fromHex(assertion.signatureHex));
		expect(raw).not.toBeNull();
		expect(raw!.length).toBe(64);
	});

	it('the signature verifies against the account key over the bytes a device would sign', () => {
		const assertion = buildMockAssertion(CHALLENGE);
		const authData = fromHex(assertion.authenticatorDataHex);
		const clientData = fromHex(assertion.clientDataJSONHex);
		const signBase = sha256(concatBytes(authData, sha256(clientData)));
		const ok = p256.verify(
			fromHex(assertion.signatureHex),
			signBase,
			fromHex(fixtureAccount().publicKeyHex)
		);
		expect(ok).toBe(true);
	});

	it('carries the challenge it was handed, base64url in the client data', () => {
		const assertion = buildMockAssertion(CHALLENGE);
		const json = new TextDecoder().decode(fromHex(assertion.clientDataJSONHex));
		expect(json.startsWith('{"type":"webauthn.get","challenge":"')).toBe(true);
		expect(json).toContain('"crossOrigin":false');
		expect(json).not.toContain('=');
	});

	it('a different rpId changes the assertion — the hash is over the LIVE one', () => {
		const here = buildMockAssertion(CHALLENGE, { rpId: 'localhost' });
		const there = buildMockAssertion(CHALLENGE, { rpId: 'getvela.app' });
		expect(here.authenticatorDataHex).not.toBe(there.authenticatorDataHex);
	});
});

describe('which key signs', () => {
	it('an allow-list picks its first fixture; a preference overrides it', () => {
		const ids = fixtureAccounts().map((a) => a.id);
		expect(buildMockAssertion(CHALLENGE, { credentialId: ids }).credentialId).toBe(ids[0]);
		setPreferredMockSigner(2);
		expect(buildMockAssertion(CHALLENGE, { credentialId: ids }).credentialId).toBe(ids[2]);
		// A preference the allow-list does not offer is ignored, not forced.
		expect(buildMockAssertion(CHALLENGE, { credentialId: [ids[1]] }).credentialId).toBe(ids[1]);
	});

	it('an unknown credential falls back to the primary account', () => {
		expect(buildMockAssertion(CHALLENGE, { credentialId: '0xdeadbeef' }).credentialId).toBe(
			fixtureAccount().id
		);
	});
});

describe('registration', () => {
	it('mints each fixture in turn so a multi-key founding gets distinct keys', () => {
		const minted = [
			nextFixtureRegistration(),
			nextFixtureRegistration(),
			nextFixtureRegistration()
		];
		expect(minted.map((m) => m.id)).toEqual(fixtureAccounts().map((a) => a.id));
		resetFixtureRegistrationCursor();
		expect(nextFixtureRegistration().id).toBe(fixtureAccounts()[0].id);
	});

	it('its attestation carries the public key the core can recover', () => {
		const registration = buildMockRegistration({ credentialId: fixtureAccounts()[1].id });
		const key = extractPublicKey(fromHex(registration.attestationObjectHex));
		expect(key).not.toBeNull();
		expect('04' + toHex(key!.x) + toHex(key!.y)).toBe(fixtureAccounts()[1].publicKeyHex);
	});
});
