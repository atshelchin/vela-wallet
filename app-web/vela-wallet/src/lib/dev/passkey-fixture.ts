/**
 * Fixed passkey fixtures for the "parallel space" test environment.
 *
 * Ported from src/services/dev/passkey-fixture.ts @ f9bcb278. This is the ONE
 * thing that differs between the real app and the parallel-space app: instead
 * of a real device passkey (`navigator.credentials`), signing uses THIS fixed
 * set of P-256 keypairs. Everything downstream is real and deterministic — the
 * derived Safe addresses, and WebAuthn assertions Safe's on-chain verifier
 * accepts.
 *
 * ⚠️ These private keys are throwaway TEST keys, committed on purpose. They
 * never guard real user funds: they are only wired in when the parallel space
 * is explicitly entered, and this module is reached only through a dynamic
 * import behind the dev gate (spec 026 D18), so it is not in the startup chunk
 * of any production page. Their addresses must never receive real money.
 *
 * Boundary: real space = real device passkeys. Parallel space = these
 * fixtures. Nothing else about the two environments differs.
 */
import { p256 } from '@noble/curves/p256';
import { sha256 } from '@noble/hashes/sha256';
import {
	computeAddress,
	computeAddressMulti,
	concatBytes,
	fromHex,
	stripHexPrefix,
	toHex
} from '$lib/core/kernels';
import type { Assertion, Registration } from '$lib/onboarding/core/passkey';

export const FIXTURE_RP_ID = 'getvela.app';

/** ascii "vela-fixture-0N" → hex, the stable credential id / account id. */
function credId(n: number): string {
	return toHex(new TextEncoder().encode(`vela-fixture-0${n}`));
}

/**
 * Seed rows: fixed 32-byte P-256 private keys + display names. Each is a valid
 * scalar (< curve order). Add rows here to grow the keyset — nothing else
 * changes. The derived addresses are golden-locked in
 * `core/golden-addresses.test.ts` (the fifth surface).
 */
const SEED: { name: string; privHex: string }[] = [
	{
		name: 'Parallel One',
		privHex: 'd80133c59ce0943689a9c1ff6006242c27b19412439fbc88f94feb5ca1e802d5'
	},
	{
		name: 'Parallel Two',
		privHex: '6e1ebe95f2f14d70b193aedbfe87c3d495943c19fb04a81c163cf92ae384c59f'
	},
	{
		name: 'Parallel Three',
		privHex: 'e66f17e63e4b6e1a6c8a31086d86bcb3172816bec70a5221576c1e2a2ae1f336'
	}
];

export interface FixtureAccount {
	/** Stable local credential id — also the wallet `account.id`. */
	id: string;
	name: string;
	privHex: string;
	/** Uncompressed P-256 public key `04 ‖ x(32) ‖ y(32)`. */
	publicKeyHex: string;
	/** Deterministic Safe address derived from the public key. */
	address: string;
}

/**
 * The fixture accounts, derived ONCE on first use.
 *
 * Lazy on purpose: deriving a Safe address is a core call, and on the web the
 * core is loaded asynchronously (`loadCore()`), so a module-level derivation
 * would run before the wasm exists and throw at import time. Every accessor
 * below therefore requires the core to be aboard — callers `await loadCore()`
 * first, exactly as they do before constructing a machine.
 */
let derived: FixtureAccount[] | null = null;

export function fixtureAccounts(): FixtureAccount[] {
	if (derived) return derived;
	derived = SEED.map((row, i) => {
		const publicKeyHex = toHex(p256.getPublicKey(fromHex(row.privHex), false));
		return {
			id: credId(i + 1),
			name: row.name,
			privHex: row.privHex,
			publicKeyHex,
			address: computeAddress(publicKeyHex)
		};
	});
	return derived;
}

/** The primary fixture account (index 0) — the default signer / active account. */
export function fixtureAccount(): FixtureAccount {
	return fixtureAccounts()[0];
}

/** All fixture Safe addresses — the addresses funded for opt-in on-chain tests. */
export function fixtureAddresses(): string[] {
	return fixtureAccounts().map((a) => a.address);
}

/** Look up a fixture account by credential id (case-insensitive, 0x-tolerant). */
export function fixtureByCredentialId(id: string | null | undefined): FixtureAccount | undefined {
	if (!id) return undefined;
	const key = stripHexPrefix(id).toLowerCase();
	return fixtureAccounts().find((a) => a.id.toLowerCase() === key);
}

/**
 * The 3-key multi-passkey fixture wallet: ALL fixture keys founding one Safe,
 * fixture #1 pinned as `keys[0]`. This is the golden Safe the live sweep
 * spends from.
 */
export function fixtureMultiAddress(): string {
	return computeAddressMulti(fixtureAccounts().map((a) => a.publicKeyHex));
}

// ---------------------------------------------------------------------------
// Registration cursor (multi-key onboarding in the parallel space)
// ---------------------------------------------------------------------------

let registrationCursor = 0;

/**
 * The fixture the NEXT mock `register()` mints. Advances through
 * {@link fixtureAccounts} so a multi-key onboarding gets three distinct
 * credentials instead of the same fixture three times (which the core rejects
 * as a duplicate founding key).
 */
export function nextFixtureRegistration(): FixtureAccount {
	const accounts = fixtureAccounts();
	const account = accounts[registrationCursor % accounts.length];
	registrationCursor += 1;
	return account;
}

/** Restart the cursor at fixture #1 — called when (re)installing the signer. */
export function resetFixtureRegistrationCursor(): void {
	registrationCursor = 0;
}

// ---------------------------------------------------------------------------
// Assertion builder (a real WebAuthn signature over a fixture key)
// ---------------------------------------------------------------------------

/** base64url, no padding — what browsers put in `clientDataJSON.challenge`. */
function base64url(bytes: Uint8Array): string {
	const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
	let out = '';
	let i = 0;
	for (; i + 2 < bytes.length; i += 3) {
		const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
		out += CHARS[(n >> 18) & 63] + CHARS[(n >> 12) & 63] + CHARS[(n >> 6) & 63] + CHARS[n & 63];
	}
	const rem = bytes.length - i;
	if (rem === 1) {
		const n = bytes[i] << 16;
		out += CHARS[(n >> 18) & 63] + CHARS[(n >> 12) & 63];
	} else if (rem === 2) {
		const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
		out += CHARS[(n >> 18) & 63] + CHARS[(n >> 12) & 63] + CHARS[(n >> 6) & 63];
	}
	return out;
}

export interface MockAssertionOptions {
	/** Sign with a specific credential id, or the first fixture in an allow-list. */
	credentialId?: string | string[] | null;
	/** Relying-party id whose hash goes into `authenticatorData`. */
	rpId?: string;
	/** Origin embedded in `clientDataJSON`. */
	origin?: string;
}

/**
 * Which fixture a multi-credential allow-list picks. A real provider shows a
 * picker; the mock defaults to the FIRST allowed fixture. A test that needs a
 * NON-first founding key to sign (the per-key signer-proxy path) sets a
 * preference through {@link setPreferredMockSigner} / `vela.parallel.signWith(n)`.
 */
let preferredSigner: number | null = null;

export function setPreferredMockSigner(index: number | null): void {
	preferredSigner = index;
}

function resolveFixture(credentialId: string | string[] | null | undefined): FixtureAccount {
	if (Array.isArray(credentialId)) {
		if (preferredSigner != null) {
			const preferred = fixtureAccounts()[preferredSigner];
			if (preferred && credentialId.some((id) => fixtureByCredentialId(id)?.id === preferred.id)) {
				return preferred;
			}
		}
		for (const id of credentialId) {
			const found = fixtureByCredentialId(id);
			if (found) return found;
		}
		return fixtureAccount();
	}
	return fixtureByCredentialId(credentialId ?? undefined) ?? fixtureAccount();
}

/**
 * A genuine WebAuthn assertion over `challengeHex`, signed with the fixture key
 * the allow-list selects. The output is byte-for-byte what a real
 * authenticator would emit for this key and challenge, so:
 *   - `verifySafeWebAuthn()` accepts it (field order, UV flag, authData length),
 *   - `derSignatureToRaw()` parses the DER signature, and
 *   - Safe's on-chain P-256 verifier validates it against that public key.
 *
 * signature = ECDSA_P256( sha256( authenticatorData ‖ sha256(clientDataJSON) ) )
 */
export function buildMockAssertion(
	challengeHex: string,
	opts: MockAssertionOptions = {}
): Assertion {
	const account = resolveFixture(opts.credentialId);
	const rpId = opts.rpId ?? FIXTURE_RP_ID;
	const origin = opts.origin ?? `https://${rpId}`;

	const challenge = fromHex(stripHexPrefix(challengeHex));

	// Field ORDER is load-bearing: `validateClientData` checks it.
	const clientDataJSON =
		`{"type":"webauthn.get","challenge":"${base64url(challenge)}",` +
		`"origin":"${origin}","crossOrigin":false}`;
	const clientDataBytes = new TextEncoder().encode(clientDataJSON);

	// authenticatorData = rpIdHash(32) ‖ flags(1: UP|UV) ‖ signCount(4)
	const rpIdHash = sha256(new TextEncoder().encode(rpId));
	const authenticatorData = concatBytes(
		rpIdHash,
		new Uint8Array([0x05]), // 0x01 user-present | 0x04 user-verified
		new Uint8Array([0, 0, 0, 0])
	);

	const clientDataHash = sha256(clientDataBytes);
	const signBase = sha256(concatBytes(authenticatorData, clientDataHash));

	// noble returns a low-s canonical signature by default — what the verifier wants.
	const sig = p256.sign(signBase, fromHex(account.privHex));

	return {
		credentialId: account.id,
		signatureHex: toHex(sig.toDERRawBytes()),
		authenticatorDataHex: toHex(authenticatorData),
		clientDataJSONHex: toHex(clientDataBytes),
		authenticatorAttachment: 'platform'
	};
}

/**
 * A fixture registration whose attestation object embeds the account's P-256
 * public key in COSE form, so `extractPublicKey()` recovers it — for when the
 * parallel space runs the real onboarding flow instead of seeding a wallet.
 */
export function buildMockRegistration(
	opts: { credentialId?: string; rpId?: string; origin?: string } = {}
): Registration {
	const account = fixtureByCredentialId(opts.credentialId) ?? fixtureAccount();
	const rpId = opts.rpId ?? FIXTURE_RP_ID;
	const origin = opts.origin ?? `https://${rpId}`;

	const clientDataJSON =
		`{"type":"webauthn.create","challenge":"${base64url(new Uint8Array(32))}",` +
		`"origin":"${origin}","crossOrigin":false}`;

	const attestationObject = buildFixtureAttestationObject(
		rpId,
		fromHex(account.id),
		account.publicKeyHex
	);

	return {
		credentialId: account.id,
		attestationObjectHex: toHex(attestationObject),
		clientDataJSONHex: toHex(new TextEncoder().encode(clientDataJSON)),
		authenticatorAttachment: 'platform',
		transports: 'internal'
	};
}

/**
 * Minimal CBOR attestation object, `fmt="none"`, carrying authData whose
 * attested credential data holds the account's P-256 public key as a COSE_Key.
 */
function buildFixtureAttestationObject(
	rpId: string,
	credIdBytes: Uint8Array,
	pubHex: string
): Uint8Array {
	const { x, y } = splitPubKey(pubHex);

	// COSE_Key: {1:2, 3:-7, -1:1, -2:x, -3:y}
	const cose = concatBytes(
		new Uint8Array([0xa5]), // map(5)
		new Uint8Array([0x01, 0x02]), // 1: 2 (kty EC2)
		new Uint8Array([0x03, 0x26]), // 3: -7 (alg ES256)
		new Uint8Array([0x20, 0x01]), // -1: 1 (crv P-256)
		new Uint8Array([0x21, 0x58, 0x20]),
		x, // -2: bytes(32) x
		new Uint8Array([0x22, 0x58, 0x20]),
		y // -3: bytes(32) y
	);

	const rpIdHash = sha256(new TextEncoder().encode(rpId));
	// UP|UV|AT (0x45) — FROZEN: the fixture public keys' registry entries
	// already live on Gnosis with exactly this attestation, and entries are
	// immutable (AttestationMismatch on any other bytes). A side effect worth
	// knowing: no BE/BS ⇒ the fixtures read as DEVICE-BOUND, so a single-key
	// parallel-space creation trips the second-key gate — which doubles as the
	// live demo of that gate. Add a second key to proceed.
	const flags = new Uint8Array([0x45]);
	const signCount = new Uint8Array([0, 0, 0, 0]);
	const aaguid = new Uint8Array(16);
	const credLen = new Uint8Array([(credIdBytes.length >> 8) & 0xff, credIdBytes.length & 0xff]);
	const authData = concatBytes(rpIdHash, flags, signCount, aaguid, credLen, credIdBytes, cose);

	// CBOR: {"fmt":"none","attStmt":{},"authData":<bstr>}
	const fmt = concatBytes(textStr('fmt'), textStr('none'));
	const attStmt = concatBytes(textStr('attStmt'), new Uint8Array([0xa0])); // map(0)
	const authKey = concatBytes(textStr('authData'), bstr(authData));
	return concatBytes(new Uint8Array([0xa3]), fmt, attStmt, authKey);
}

// tiny CBOR helpers (definite-length; our fixtures stay small)
function textStr(s: string): Uint8Array {
	const b = new TextEncoder().encode(s);
	return concatBytes(new Uint8Array([0x60 | b.length]), b);
}

function bstr(bytes: Uint8Array): Uint8Array {
	if (bytes.length < 24) return concatBytes(new Uint8Array([0x40 | bytes.length]), bytes);
	if (bytes.length < 256) return concatBytes(new Uint8Array([0x58, bytes.length]), bytes);
	return concatBytes(
		new Uint8Array([0x59, (bytes.length >> 8) & 0xff, bytes.length & 0xff]),
		bytes
	);
}

function splitPubKey(pubHex: string): { x: Uint8Array; y: Uint8Array } {
	const clean = stripHexPrefix(pubHex).replace(/^04/, '');
	return { x: fromHex(clean.slice(0, 64)), y: fromHex(clean.slice(64, 128)) };
}
