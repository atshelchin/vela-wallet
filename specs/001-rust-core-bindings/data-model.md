# Data Model: Shared Rust Core (vela-core)

**Date**: 2026-07-28 (amended same day: uniffi 0.32 → natural recursive `AbiValue`; RN dropped) · **Phase**: 1 · Types below are the FFI-crossing entities from [spec.md Key Entities](./spec.md#key-entities), refined by research decisions D5/D8–D10 and the Amendment. Rust is the source of truth; Kotlin/Swift/TS shapes are generated (uniffi) or derived (tsify).

## Conventions (apply to every entity)

- **Bytes** cross the boundary as `Vec<u8>` (uniffi: Kotlin `ByteArray` / Swift `Data`; wasm: `Uint8Array`).
- **Big numbers** (uint256, wei amounts, chainId) cross as **0x-hex strings** (minimal, lowercase, per Ethereum Quantity) — never u64+, never float, never BigInt-through-serde.
- **Addresses** cross as EIP-55 checksummed strings on output; inputs accept any-case hex and are validated.
- **Every fallible function** returns `Result<T, CoreError>`; no function returns a default value on bad input (FR-004).

## CoreError (flat error enum)

Single crate-wide error, `#[uniffi(flat_error)]` on the uniffi shell, tsify string-tagged enum on wasm. Variants (each carries only a Display message):

| Variant | Raised by |
|---|---|
| `InvalidHex` | non-hex chars, odd length, missing/garbled 0x handling |
| `InvalidBase64Url` | bad alphabet/padding in credential IDs, challenges |
| `InvalidQuantity` | unparseable quantity input |
| `InvalidAddress` | not 20 bytes / bad checksum where checksum is asserted |
| `InvalidSignature` | non-DER assertion signature, r/s out of range |
| `InvalidCbor` | truncated/malformed attestationObject, indefinite-length rejection |
| `InvalidCoseKey` | wrong kty/crv/alg, coordinate length ≠ 32 |
| `InvalidClientData` | prefix/field-order/UV-flag rules violated (mirrors Safe contract acceptance) |
| `InvalidPublicKey` | point not on curve, bad SEC1 encoding |
| `AbiParse` | signature string fails `Function::parse` |
| `AbiDecode` | calldata doesn't match signature (incl. selector mismatch) |
| `Eip712Parse` | typed-data JSON malformed |
| `Eip712NonCanonicalDomain` | `types.EIP712Domain` has extra/reordered fields (reject-guard, research D9) |
| `Internal` | invariant violation (bug) — never expected in normal operation |

**Foreign mapping**: Kotlin sealed `CoreException` subclasses (note uniffi's `Error`→`Exception` rename); Swift `CoreError` enum conforming to `Error`; TS a discriminated union `{ code: CoreErrorCode, message: string }`.

## AbiValue (recursive decoded-calldata tree — amended, uniffi 0.32)

The FFI type for decoded calldata — the SAME natural recursive record inside `vela-core` and across every boundary (uniffi 0.32 auto-detects recursion through `Vec`: Swift generates `indirect`, Kotlin needs nothing special; tsify emits the equivalent recursive TS type):

```rust
struct AbiValue {
    kind: String,             // canonical solidity type: "address" | "uint256" | "bytes" | "tuple" | "uint256[]" | …
    name: String,             // param/component name from the signature ("" when unnamed or array element)
    value: String,            // leaf payload: checksummed address, 0x-hex quantity/bytes, bool "true"/"false", utf8 string; "" for non-leaf
    children: Vec<AbiValue>,  // empty for leaves
}
```

Signed integers render as sign-prefixed minimal hex (`-0x1`); the decode root is a `tuple` node whose children are the function's parameters.

**Validation rules** (constructed only by the decoder — consumers receive it well-formed):
- leaf/kind consistency: tuple/array kinds carry children (possibly empty for empty arrays); `value` must be `""` on non-leaves
- nesting depth bounded by the decoder (adversarial-input guard; proptest-covered)

**Same shape on both routes** (uniffi record and tsify type), so one conformance vector format covers every platform.

## P256PublicKey

```rust
struct P256PublicKey { x: Vec<u8>, y: Vec<u8> }   // each exactly 32 bytes
```
- Produced by attestation extraction and assertion recovery.
- Validation: 32-byte lengths AND point-on-curve check (via `VerifyingKey::from_sec1_bytes` round-trip) — a coordinate pair that isn't on P-256 is `InvalidPublicKey`, never silently accepted.
- Feeds `compute_safe_address` — the identity-critical path (spec edge case: existing addresses must never change).

## WebAuthnAssertion

```rust
struct WebAuthnAssertion {
    authenticator_data: Vec<u8>,  // ≥ 37 bytes (rpIdHash 32 ‖ flags 1 ‖ counter 4)
    client_data_json: Vec<u8>,    // raw bytes as signed, NOT re-serialized
    signature_der: Vec<u8>,       // ASN.1 DER ECDSA-Sig-Value, strict
}
```
- Validation is performed by the functions consuming it (`validate_client_data`, `der_signature_to_raw_low_s`, `recover_public_key_from_assertions`), not on construction — the record is a plain carrier.
- `client_data_json` must remain byte-exact (the Safe contract validates prefix bytes; re-serialization would break signatures) — mirrored by `InvalidClientData` rules: exact prefix `{"type":"webauthn.get","challenge":"`, field order, UV flag 0x04 at `authenticator_data[32]`.

## SafeAddressInfo

```rust
struct SafeAddressInfo {
    address: String,        // EIP-55 checksummed counterfactual Safe address
    salt_nonce: Vec<u8>,    // 32 bytes = keccak256(x32 ‖ y32)
    setup_data: Vec<u8>,    // full Safe.setup calldata (MultiSend enableModules + signer configure)
    init_code_hash: Vec<u8>,// 32 bytes = keccak256(PROXY_CREATION_CODE ‖ abi.encode(SAFE_SINGLETON))
}
```
- All deployment constants embedded per research D11 (chain-independent; derivations preserved — runtime code sliced after `6000396000f3fe`, verifiers magic `0x100`).
- Invariant (conformance-pinned): `compute_safe_address(TEST_PUBLIC_KEY).address == 0x762EdA60D3B68755c271D608644650278f88329F` — the vector cross-referenced today by TS + iOS + Android test suites.

## ClientDataKind

```rust
enum ClientDataKind { Create, Get }   // selects prefix/acceptance rules in validate_client_data
```

## ConformanceVector (test corpus schema — not an FFI type)

Committed JSON files under `rust/crates/vela-core/tests/vectors/`, produced by the jest dump script from the **running TS implementation** (the behavioral source of truth). Schema in [contracts/conformance-vectors.md](./contracts/conformance-vectors.md). One file per suite; each case: `{ name, fn, input: {...}, expect: {...} | { error: CoreErrorCode } }`. `AbiValue` expectations use the recursive JSON form (`{ kind, value, children: […] }`). Intentional strictness divergences (e.g. TS `fromHex('zz') → 0` vs Rust `InvalidHex`) are encoded as `divergence` entries with the TS behavior documented inline (FR-004 enumeration lives IN the corpus, greppable).

## State transitions

None — every API is a pure function; no entity has lifecycle state. The only stateful element in the feature is the app-side diff-harness flag (dev-only, boolean, session-scoped).
