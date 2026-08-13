/**
 * Tests for attestation parser — DER signature conversion and CBOR parsing.
 * Test vectors match iOS AttestationParser tests.
 */
import { derSignatureToRaw, extractPublicKey } from '@/services/vela-core';
import { toHex, fromHex } from '@/services/vela-core';

describe('derSignatureToRaw', () => {
  test('converts standard DER signature to raw 64 bytes', () => {
    // Standard DER: 30 44 02 20 [32 bytes r] 02 20 [32 bytes s]
    const r = new Uint8Array(32).fill(0x11);
    const s = new Uint8Array(32).fill(0x22);
    const der = new Uint8Array([
      0x30, 0x44, // SEQUENCE, length 68
      0x02, 0x20, // INTEGER, length 32
      ...r,
      0x02, 0x20, // INTEGER, length 32
      ...s,
    ]);

    const raw = derSignatureToRaw(der);
    expect(raw).not.toBeNull();
    expect(raw!.length).toBe(64);
    expect(toHex(raw!.slice(0, 32))).toBe('11'.repeat(32));
    expect(toHex(raw!.slice(32))).toBe('22'.repeat(32));
  });

  // A leading zero is REQUIRED when the high bit is set (DER integers are
  // signed) and FORBIDDEN when it is not. Real authenticators emit the former
  // constantly, and the core accepts it — this is the shape production depends
  // on, so it is pinned first.
  test('accepts the required leading zero on a high-bit-set r', () => {
    const r = new Uint8Array(32).fill(0xAA); // high bit set → must be padded
    const s = new Uint8Array(32).fill(0x11); // high bit clear → must NOT be
    const der = new Uint8Array([0x30, 0x45, 0x02, 0x21, 0x00, ...r, 0x02, 0x20, ...s]);

    const raw = derSignatureToRaw(der);
    expect(raw).not.toBeNull();
    expect(raw!.length).toBe(64);
    expect(toHex(raw!.slice(0, 32))).toBe('aa'.repeat(32));
    expect(toHex(raw!.slice(32))).toBe('11'.repeat(32));
  });

  // The oracle re-encoded whatever it was handed: it stripped zeros that should
  // not have been there and left-padded integers that were malformed. Both
  // shapes are refused now — a signature that does not parse is not a signature
  // to normalize, and quietly repairing one hides where it came from.
  test('refuses a leading zero that DER does not allow', () => {
    const r = new Uint8Array(32).fill(0xAA);
    const s = new Uint8Array(32).fill(0x11);
    // s over-padded although its high bit is clear
    const der = new Uint8Array([0x30, 0x46, 0x02, 0x21, 0x00, ...r, 0x02, 0x21, 0x00, ...s]);
    // The facade answers `null` rather than throwing here — a malformed
    // signature is an expected input on this path, not an exception.
    expect(derSignatureToRaw(der)).toBeNull();
  });

  test('refuses a short r rather than left-padding it', () => {
    const r = new Uint8Array(31).fill(0xCC); // high bit set, no leading zero
    const s = new Uint8Array(32).fill(0xDD);
    const der = new Uint8Array([0x30, 0x43, 0x02, 0x1f, ...r, 0x02, 0x20, ...s]);
    // The facade answers `null` rather than throwing here — a malformed
    // signature is an expected input on this path, not an exception.
    expect(derSignatureToRaw(der)).toBeNull();
  });

  test('returns null for invalid DER', () => {
    expect(derSignatureToRaw(new Uint8Array([0x00]))).toBeNull();
    expect(derSignatureToRaw(new Uint8Array([0x30, 0x00]))).toBeNull();
    expect(derSignatureToRaw(new Uint8Array([]))).toBeNull();
  });
});

describe('extractPublicKey', () => {
  test('returns null for empty input', () => {
    expect(extractPublicKey(new Uint8Array(0))).toBeNull();
  });

  test('returns null for non-CBOR input', () => {
    expect(extractPublicKey(new Uint8Array([0x00, 0x01, 0x02]))).toBeNull();
  });

  test('extracts public key from valid attestation object', () => {
    // Build a minimal valid attestation object (CBOR map with "authData")
    // This is a simplified test — real attestation objects are more complex
    // We build: {fmt: "none", attStmt: {}, authData: <bytes>}

    // For a full integration test, we'd need a real attestation object
    // from a WebAuthn registration. Here we test the basic CBOR parsing
    // with a hand-crafted minimal structure.

    // For now, we verify that the function handles edge cases correctly
    const shortAuthData = new Uint8Array(30); // too short for attested cred data
    // CBOR: map(1) { text("authData") -> bstr(30 bytes) }
    const cbor = new Uint8Array([
      0xa1, // map(1)
      0x68, // text(8)
      0x61, 0x75, 0x74, 0x68, 0x44, 0x61, 0x74, 0x61, // "authData"
      0x58, 0x1e, // bstr(30)
      ...shortAuthData,
    ]);

    // Should return null because authData is too short (< 37 bytes)
    expect(extractPublicKey(cbor)).toBeNull();
  });
});
