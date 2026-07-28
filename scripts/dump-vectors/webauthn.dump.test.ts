/**
 * Dump the `webauthn` conformance suite → rust vectors/webauthn.json.
 *
 * Sources: attestation-parser.ts (DER + CBOR), webauthn-verify.ts +
 * public-key-upload.ts (client-data rules), p256-recovery.ts (two-assertion
 * recovery). The TS recovery tests are property-based, so the recovery cases
 * here are captured from two FIXED test keys rather than generated ones: a
 * fresh key per run would rewrite every fixture on each dump, and the vector
 * diff is the review signal for whether behavior actually changed.
 */

import * as fs from 'fs';
import * as path from 'path';
import { webcrypto } from 'node:crypto';
import { derSignatureToRaw, extractPublicKey } from '@/services/attestation-parser';
import { verifySafeWebAuthn } from '@/services/webauthn-verify';
import { recoverPublicKeyFromAssertions, RecoverableAssertion } from '@/services/p256-recovery';
import { sha256 } from '@/services/sha256';
import { toHex } from '@/services/hex';
import { VectorCase, hex0x, utf8, writeSuite } from './writer';

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

/** Minimal DER ECDSA-Sig-Value from raw r‖s (canonical: strip zeros, 0x00-pad high bit). */
function rawToDer(raw: Uint8Array): Uint8Array {
  const derInt = (bytes: Uint8Array): number[] => {
    let i = 0;
    while (i < bytes.length - 1 && bytes[i] === 0) i++;
    let body = Array.from(bytes.slice(i));
    if (body[0] & 0x80) body = [0, ...body];
    return [0x02, body.length, ...body];
  };
  const r = derInt(raw.slice(0, 32));
  const s = derInt(raw.slice(32));
  return new Uint8Array([0x30, r.length + s.length, ...r, ...s]);
}

/** authData: rpIdHash(32) ‖ flags ‖ counter(4). */
function makeAuthData(flags: number, counter = 1): Uint8Array {
  const out = new Uint8Array(37);
  out.set(sha256(utf8('getvela.app')), 0);
  out[32] = flags;
  out[36] = counter;
  return out;
}

/** Attestation authData with attested credential data + optional trailing extension bytes. */
function makeAttestationAuthData(coseKey: Uint8Array, trailing: Uint8Array | null): Uint8Array {
  const flags = 0x45 | (trailing ? 0x80 : 0); // UP | UV | AT (| ED)
  const credId = new Uint8Array(16).fill(0xcd);
  const head = new Uint8Array(37 + 16 + 2 + credId.length);
  head.set(sha256(utf8('getvela.app')), 0);
  head[32] = flags;
  head[36] = 1; // counter
  // aaguid = zeros at 37..53
  head[53] = 0;
  head[54] = credId.length;
  head.set(credId, 55);
  const parts = [head, coseKey];
  if (trailing) parts.push(trailing);
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** COSE_Key EC2 P-256: {1:2, 3:-7, -1:1, -2:x, -3:y} (definite lengths). */
function makeCoseKey(x: Uint8Array, y: Uint8Array): Uint8Array {
  return new Uint8Array([
    0xa5, // map(5)
    0x01, 0x02, // 1: 2 (kty EC2)
    0x03, 0x26, // 3: -7 (alg ES256)
    0x20, 0x01, // -1: 1 (crv P-256)
    0x21, 0x58, 0x20, ...x, // -2: bstr(32)
    0x22, 0x58, 0x20, ...y, // -3: bstr(32)
  ]);
}

/** attestationObject: {"fmt":"none","attStmt":{},"authData":bstr}. */
function makeAttestationObject(authData: Uint8Array): Uint8Array {
  const header = new Uint8Array([
    0xa3, // map(3)
    0x63, 0x66, 0x6d, 0x74, // "fmt"
    0x64, 0x6e, 0x6f, 0x6e, 0x65, // "none"
    0x67, 0x61, 0x74, 0x74, 0x53, 0x74, 0x6d, 0x74, // "attStmt"
    0xa0, // {}
    0x68, 0x61, 0x75, 0x74, 0x68, 0x44, 0x61, 0x74, 0x61, // "authData"
    0x59, (authData.length >> 8) & 0xff, authData.length & 0xff, // bstr(u16 len)
  ]);
  const out = new Uint8Array(header.length + authData.length);
  out.set(header);
  out.set(authData, header.length);
  return out;
}

/**
 * A WebAuthn assertion for `challenge`, signed by `key`.
 *
 * Read from a committed fixture file rather than signed live: ECDSA draws a
 * random nonce per signature, so signing here would rewrite every recovery
 * fixture on each dump and make the vector diff — the signal for whether
 * behavior actually changed — pure noise. The EXPECTATIONS are still computed
 * by the TS oracle on every run; only these inputs are pinned.
 *
 * To refresh them deliberately: `VELA_REGEN_ASSERTIONS=1 npm run dump:vectors`.
 */
const ASSERTIONS_FILE = path.join(__dirname, 'fixtures', 'webauthn-assertions.json');
const REGENERATE = process.env.VELA_REGEN_ASSERTIONS === '1';

type StoredAssertion = { signatureHex: string; authenticatorDataHex: string; clientDataJSONHex: string };
const storedAssertions: Record<string, StoredAssertion> = fs.existsSync(ASSERTIONS_FILE)
  ? JSON.parse(fs.readFileSync(ASSERTIONS_FILE, 'utf8'))
  : {};
const regenerated: Record<string, StoredAssertion> = {};

async function makeAssertion(
  key: webcrypto.CryptoKeyPair,
  challenge: string,
  keyLabel = 'primary',
): Promise<RecoverableAssertion> {
  const slot = `${keyLabel}/${challenge}`;
  if (!REGENERATE) {
    const stored = storedAssertions[slot];
    if (!stored) {
      throw new Error(
        `no stored assertion for ${slot}. Add it with: VELA_REGEN_ASSERTIONS=1 npm run dump:vectors`,
      );
    }
    return stored;
  }

  const authData = makeAuthData(0x05); // UP | UV
  const clientData = utf8(`{"type":"webauthn.get","challenge":"${challenge}","origin":"https://getvela.app"}`);
  const message = new Uint8Array(authData.length + 32);
  message.set(authData);
  message.set(sha256(clientData), authData.length);
  const rawSig = new Uint8Array(
    await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.privateKey, message),
  );
  const assertion = {
    signatureHex: toHex(rawToDer(rawSig)),
    authenticatorDataHex: toHex(authData),
    clientDataJSONHex: toHex(clientData),
  };
  regenerated[slot] = assertion;
  return assertion;
}

/** Persist freshly signed assertions when running with VELA_REGEN_ASSERTIONS=1. */
function saveRegeneratedAssertions(): void {
  if (!REGENERATE) return;
  fs.mkdirSync(path.dirname(ASSERTIONS_FILE), { recursive: true });
  const merged = { ...storedAssertions, ...regenerated };
  const ordered = Object.fromEntries(Object.keys(merged).sort().map((k) => [k, merged[k]]));
  fs.writeFileSync(ASSERTIONS_FILE, JSON.stringify(ordered, null, 1) + '\n');
}

const assertionInput = (a: RecoverableAssertion) => ({
  authenticator_data: '0x' + a.authenticatorDataHex,
  client_data_json: '0x' + a.clientDataJSONHex,
  signature_der: '0x' + a.signatureHex,
});


/** The fixed P-256 test key the recovery fixtures are built from. */
const FIXTURE_JWK = {
  kty: 'EC',
  crv: 'P-256',
  d: '3galurkXUPnoxiCFevMMo5aElmTgYtOZueBqYXWQQBU',
  x: 'D4QOKonsMuvBBeA7EJiuguMtrOKr7X-r43so8kFs0aE',
  y: 'Kdyq8UXff3JbBDFN8WnJBLMtQ59tQCpPxC9bCltIZ1A',
} as const;

/** A SECOND fixed key, for the "assertions from different credentials" case. */
const OTHER_FIXTURE_JWK = {
  kty: 'EC',
  crv: 'P-256',
  d: '0QbMAAgYHUPBLLIUIZRFkwszs8LOWS1H3J7Bmewxv2o',
  x: 'rXqRMvsbSEe9XUuz5BjzmpCXxfdkxB8BibnGqxoUoFo',
  y: 'Vqx3hmyGOaA7PPbsFKrh392fOSZ17Oyr-xPLsAAEKcQ',
} as const;

type FixtureJwk = { kty: string; crv: string; d: string; x: string; y: string };

async function importJwkPair(jwk: FixtureJwk): Promise<webcrypto.CryptoKeyPair> {
  const alg = { name: 'ECDSA', namedCurve: 'P-256' } as const;
  const privateKey = await webcrypto.subtle.importKey('jwk', { ...jwk, key_ops: ['sign'] }, alg, true, ['sign']);
  const { d: _d, ...publicJwk } = jwk;
  const publicKey = await webcrypto.subtle.importKey('jwk', { ...publicJwk, key_ops: ['verify'] }, alg, true, ['verify']);
  return { privateKey, publicKey };
}

const importFixtureKey = () => importJwkPair(FIXTURE_JWK);
const importSecondFixtureKey = () => importJwkPair(OTHER_FIXTURE_JWK);

// ---------------------------------------------------------------------------

test('dump webauthn vectors', async () => {
  const cases: VectorCase[] = [];

  // --- der_signature_to_raw_low_s -----------------------------------------
  const derFixtures: Array<[string, Uint8Array]> = [
    [
      'standard-32-32',
      new Uint8Array([0x30, 0x44, 0x02, 0x20, ...new Uint8Array(32).fill(0x11), 0x02, 0x20, ...new Uint8Array(32).fill(0x22)]),
    ],
    [
      // High-bit r REQUIRES the 0x00 prefix in canonical DER; s stays minimal.
      'leading-zero-stripped',
      new Uint8Array([0x30, 0x45, 0x02, 0x21, 0x00, ...new Uint8Array(32).fill(0xaa), 0x02, 0x20, ...new Uint8Array(32).fill(0x11)]),
    ],
    [
      // 31-byte r with a CLEAR high bit is canonical minimal DER; result left-pads to 32.
      'short-r-padded',
      new Uint8Array([0x30, 0x43, 0x02, 0x1f, ...new Uint8Array(31).fill(0x4c), 0x02, 0x20, ...new Uint8Array(32).fill(0x11)]),
    ],
  ];
  for (const [name, der] of derFixtures) {
    const raw = derSignatureToRaw(der);
    if (!raw) throw new Error(`oracle rejected DER fixture ${name}`);
    cases.push({
      name: `derSignatureToRaw/${name}`,
      fn: 'der_signature_to_raw_low_s',
      input: { der: hex0x(der) },
      expect: { value: hex0x(raw) },
    });
  }
  // High-s → normalized (build via a real signature's raw parts with s' = n - s).
  {
    const N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
    const r = new Uint8Array(32).fill(0x11);
    const sLow = BigInt('0x' + '22'.repeat(32));
    const sHigh = N - sLow;
    const sHighBytes = new Uint8Array(32);
    let v = sHigh;
    for (let i = 31; i >= 0; i--) { sHighBytes[i] = Number(v & 0xffn); v >>= 8n; }
    const raw = new Uint8Array(64);
    raw.set(r); raw.set(sHighBytes, 32);
    const der = rawToDer(raw);
    const normalized = derSignatureToRaw(der);
    if (!normalized) throw new Error('oracle rejected high-s DER');
    if (toHex(normalized.slice(32)) !== '22'.repeat(32)) {
      throw new Error('oracle drift: high-s did not normalize to n-s');
    }
    cases.push({
      name: 'derSignatureToRaw/high-s-normalized',
      fn: 'der_signature_to_raw_low_s',
      input: { der: hex0x(der) },
      expect: { value: hex0x(normalized) },
    });
  }
  // Agreed rejections.
  for (const [name, der] of [
    ['single-zero-byte', new Uint8Array([0x00])],
    ['empty-sequence', new Uint8Array([0x30, 0x00])],
    ['empty', new Uint8Array(0)],
  ] as Array<[string, Uint8Array]>) {
    if (derSignatureToRaw(der) !== null) throw new Error(`oracle accepted invalid DER ${name}`);
    cases.push({
      name: `derSignatureToRaw/${name}`,
      fn: 'der_signature_to_raw_low_s',
      input: { der: hex0x(der) },
      expect: { error: 'InvalidSignature' },
    });
  }
  // Divergences: the TS parser accepted three classes of non-canonical DER.
  const sloppyDer: Array<[string, Uint8Array, string, string]> = [
    [
      'trailing-garbage',
      new Uint8Array([...derFixtures[0][1], 0xde, 0xad]),
      'ignores the outer SEQUENCE length and any trailing bytes',
      'strict DER: a signature blob with trailing bytes is malformed',
    ],
    [
      'unnecessary-zero-prefix',
      // 0x00 prefix on an s whose high bit is clear — non-minimal integer.
      new Uint8Array([0x30, 0x46, 0x02, 0x21, 0x00, ...new Uint8Array(32).fill(0xaa), 0x02, 0x21, 0x00, ...new Uint8Array(32).fill(0x11)]),
      'strips any leading zero without checking minimality',
      'canonical DER forbids a 0x00 prefix unless the high bit is set; real authenticators emit minimal DER',
    ],
    [
      'negative-form-short-r',
      // 31-byte r with high bit SET — a negative integer where an unsigned scalar is required.
      new Uint8Array([0x30, 0x43, 0x02, 0x1f, ...new Uint8Array(31).fill(0xcc), 0x02, 0x20, ...new Uint8Array(32).fill(0x11)]),
      "reads the two's-complement-negative body as an unsigned scalar",
      'DER INTEGERs are signed; an unsigned scalar with a set high bit must carry the 0x00 prefix',
    ],
  ];
  for (const [name, der, tsBehavior, reason] of sloppyDer) {
    if (derSignatureToRaw(der) === null) throw new Error(`oracle now rejects sloppy DER ${name}?`);
    cases.push({
      name: `derSignatureToRaw/${name}`,
      fn: 'der_signature_to_raw_low_s',
      input: { der: hex0x(der) },
      expect: { error: 'InvalidSignature' },
      divergence: { ts_behavior: tsBehavior, reason },
    });
  }

  // --- extract_attestation_public_key --------------------------------------
  // A FIXED test key, not a generated one: a fresh key per run would rewrite
  // every recovery fixture on each `npm run dump:vectors`, so the vector diff —
  // the review signal that says whether behavior changed — would be pure noise.
  // This key exists only in this file and signs only test payloads.
  const keyPair = await importFixtureKey();
  const rawPub = new Uint8Array(await webcrypto.subtle.exportKey('raw', keyPair.publicKey)); // 04‖x‖y
  const pubX = rawPub.slice(1, 33);
  const pubY = rawPub.slice(33, 65);

  const plainAttestation = makeAttestationObject(makeAttestationAuthData(makeCoseKey(pubX, pubY), null));
  const extensionBytes = new Uint8Array([0xa1, 0x6b, 0x63, 0x72, 0x65, 0x64, 0x50, 0x72, 0x6f, 0x74, 0x65, 0x63, 0x74, 0x02]); // {"credProtect": 2}
  const edAttestation = makeAttestationObject(makeAttestationAuthData(makeCoseKey(pubX, pubY), extensionBytes));
  for (const [name, obj] of [
    ['real-key', plainAttestation],
    ['real-key-with-ed-extensions', edAttestation],
  ] as Array<[string, Uint8Array]>) {
    const extracted = extractPublicKey(obj);
    if (!extracted || toHex(extracted.x) !== toHex(pubX) || toHex(extracted.y) !== toHex(pubY)) {
      throw new Error(`oracle failed to extract from ${name}`);
    }
    cases.push({
      name: `extractPublicKey/${name}`,
      fn: 'extract_attestation_public_key',
      input: { attestation_object: hex0x(obj) },
      expect: { x: hex0x(pubX), y: hex0x(pubY) },
    });
  }
  // Agreed rejections (TS null ↔ Rust error).
  const shortAuthDataCbor = makeAttestationObject(new Uint8Array(30));
  for (const [name, obj, code] of [
    ['empty-input', new Uint8Array(0), 'InvalidCbor'],
    ['non-cbor', new Uint8Array([0x00, 0x01, 0x02]), 'InvalidCbor'],
    ['short-authdata', shortAuthDataCbor, 'InvalidCbor'],
  ] as Array<[string, Uint8Array, string]>) {
    if (extractPublicKey(obj) !== null) throw new Error(`oracle accepted ${name}`);
    cases.push({
      name: `extractPublicKey/${name}`,
      fn: 'extract_attestation_public_key',
      input: { attestation_object: hex0x(obj) },
      expect: { error: code },
    });
  }
  // Divergence: fabricated off-curve coordinates — TS extracts, Rust rejects.
  {
    const fakeX = new Uint8Array(32).fill(0x11);
    const fakeY = new Uint8Array(32).fill(0x22);
    const fake = makeAttestationObject(makeAttestationAuthData(makeCoseKey(fakeX, fakeY), null));
    const tsResult = extractPublicKey(fake);
    if (!tsResult) throw new Error('oracle now rejects off-curve keys?');
    cases.push({
      name: 'extractPublicKey/off-curve-point',
      fn: 'extract_attestation_public_key',
      input: { attestation_object: hex0x(fake) },
      expect: { error: 'InvalidPublicKey' },
      divergence: {
        ts_behavior: 'returns the fabricated (x, y) without an on-curve check',
        reason: 'an off-curve point must never become a wallet identity',
      },
    });
  }

  // --- validate_client_data ------------------------------------------------
  const goodClientData = utf8('{"type":"webauthn.get","challenge":"aGVsbG8","origin":"https://getvela.app"}');
  const goodAuthData = makeAuthData(0x05);
  const reordered = utf8('{"challenge":"aGVsbG8","type":"webauthn.get","origin":"https://getvela.app"}');
  const noUv = makeAuthData(0x01);
  const shortAuth = new Uint8Array(32);
  const checks: Array<[string, Uint8Array, Uint8Array, string | null]> = [
    ['get-ok', goodClientData, goodAuthData, null],
    ['get-reordered-fields', reordered, goodAuthData, 'InvalidClientData'],
    ['get-uv-not-set', goodClientData, noUv, 'InvalidClientData'],
    ['get-authdata-too-short', goodClientData, shortAuth, 'InvalidClientData'],
  ];
  for (const [name, cd, ad, code] of checks) {
    const ts = verifySafeWebAuthn({
      clientDataJSONHex: toHex(cd),
      authenticatorDataHex: toHex(ad),
    } as never);
    if (ts.ok !== (code === null)) throw new Error(`oracle disagrees on ${name}: ${ts.reason}`);
    cases.push({
      name: `validateClientData/${name}`,
      fn: 'validate_client_data',
      input: { kind: 'Get', client_data_json: hex0x(cd), authenticator_data: hex0x(ad) },
      expect: code ? { error: code } : { value: true },
    });
  }
  cases.push(
    {
      name: 'validateClientData/create-ok',
      fn: 'validate_client_data',
      input: {
        kind: 'Create',
        client_data_json: hex0x(utf8('{"type":"webauthn.create","challenge":"aGVsbG8","origin":"https://getvela.app"}')),
        authenticator_data: '0x',
      },
      expect: { value: true },
    },
    {
      name: 'validateClientData/create-wrong-type',
      fn: 'validate_client_data',
      input: {
        kind: 'Create',
        client_data_json: hex0x(goodClientData), // webauthn.get prefix on a create check
        authenticator_data: '0x',
      },
      expect: { error: 'InvalidClientData' },
    },
  );

  // --- webauthn_signing_hash ----------------------------------------------
  {
    const message = new Uint8Array(goodAuthData.length + 32);
    message.set(goodAuthData);
    message.set(sha256(goodClientData), goodAuthData.length);
    cases.push({
      name: 'webauthnSigningHash/standard',
      fn: 'webauthn_signing_hash',
      input: { authenticator_data: hex0x(goodAuthData), client_data_json: hex0x(goodClientData) },
      expect: { value: hex0x(sha256(message)) },
    });
  }

  // --- recover_public_key_from_assertions ----------------------------------
  // Captured fixtures: 4 positive pairs from the real generated key.
  for (let i = 0; i < 4; i++) {
    const a = await makeAssertion(keyPair, `Y2hhbGxlbmdlLW${i}A`);
    const b = await makeAssertion(keyPair, `Y2hhbGxlbmdlLW${i}B`);
    const recovered = recoverPublicKeyFromAssertions(a, b);
    if (recovered !== '04' + toHex(pubX) + toHex(pubY)) {
      throw new Error(`oracle recovery failed for pair ${i}: ${recovered}`);
    }
    cases.push({
      name: `recoverPublicKey/pair-${i}`,
      fn: 'recover_public_key_from_assertions',
      input: { a: assertionInput(a), b: assertionInput(b) },
      expect: { value: recovered },
    });
  }
  // Same signature twice → null.
  {
    const a = await makeAssertion(keyPair, 'c2FtZS1zaWc');
    if (recoverPublicKeyFromAssertions(a, a) !== null) throw new Error('oracle: same-sig not null');
    cases.push({
      name: 'recoverPublicKey/same-signature-twice',
      fn: 'recover_public_key_from_assertions',
      input: { a: assertionInput(a), b: assertionInput(a) },
      expect: { value: null },
    });
  }
  // Assertions from different credentials → null.
  {
    const otherPair = await importSecondFixtureKey();
    const a = await makeAssertion(keyPair, 'a2V5LW9uZQ');
    const b = await makeAssertion(otherPair, 'a2V5LXR3bw', 'other');
    if (recoverPublicKeyFromAssertions(a, b) !== null) throw new Error('oracle: cross-key not null');
    cases.push({
      name: 'recoverPublicKey/different-credentials',
      fn: 'recover_public_key_from_assertions',
      input: { a: assertionInput(a), b: assertionInput(b) },
      expect: { value: null },
    });
  }

  saveRegeneratedAssertions();
  writeSuite('webauthn', cases);
});
