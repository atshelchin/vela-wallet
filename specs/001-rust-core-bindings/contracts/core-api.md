# Contract: vela-core exported API (T0)

**Date**: 2026-07-28 · Types: see [data-model.md](../data-model.md). Every function is pure and returns `Result<_, CoreError>` unless marked infallible. This is the surface both binding shells re-export; names are `snake_case` in Rust, generated as `camelCase` (Kotlin/TS) / Swift conventions by the binding layers.

Legacy column = the TS/Swift implementation each function replaces (deletion target under FR-007).

## Module `primitives`

| Function | Signature | Legacy |
|---|---|---|
| `keccak256` | `(data: Vec<u8>) -> Vec<u8>` [32] (infallible) | eth-crypto.ts keccak256/keccak256Hex, EthCrypto.swift |
| `sha256` | `(data: Vec<u8>) -> Vec<u8>` [32] (infallible) | sha256.ts |
| `checksum_address` | `(address_hex: String) -> Result<String>` | eth-crypto.ts checksumAddress |
| `function_selector` | `(signature: String) -> Result<Vec<u8>>` [4] — canonicalizes first | eth-crypto.ts functionSelector |
| `create2_address` | `(deployer_hex: String, salt: Vec<u8>[32], init_code_hash: Vec<u8>[32]) -> Result<String>` | eth-crypto.ts create2Address |
| `to_hex` | `(data: Vec<u8>, prefixed: bool) -> String` (infallible) | hex.ts toHex |
| `from_hex` | `(s: String) -> Result<Vec<u8>>` — **strict**: rejects junk (TS silently accepted; divergence #1) | hex.ts fromHex |
| `to_quantity` | `(value: String) -> Result<String>` — canonical minimal 0x quantity (geth leading-zero rule); accepts 0x-hex or decimal string | hex.ts toQuantity (+ safari-ext toHexChainId) |
| `to_base64url` | `(data: Vec<u8>) -> String` (infallible) | hex.ts toBase64Url |
| `from_base64url` | `(s: String) -> Result<Vec<u8>>` | hex.ts fromBase64Url |
| `abi_encode_address` / `abi_encode_uint256` / `abi_encode_bytes32` | `(String) -> Result<Vec<u8>>` [32] word-encoders | eth-crypto.ts abiEncode* |

## Module `abi`

| Function | Signature | Legacy |
|---|---|---|
| `canonicalize_signature` | `(sig: String) -> Result<String>` — names stripped, whitespace removed, `uint`→`uint256`; named tuple components (`(address a,uint256 b) x`) are split in-crate because alloy's grammar rejects them, then handed to alloy for the canonical form. Malformed input (unbalanced parens, empty param slots) errors instead of being silently "repaired" | abi-decode.ts parseSignature/canonicalize |
| `compute_selector` | `(sig: String) -> Result<String>` — 0x-hex 4-byte selector over the canonical signature (e.g. `"0xa9059cbb"`) | abi-decode.ts computeSelector |
| `decode_calldata` | `(sig: String, calldata: Vec<u8>) -> Result<AbiValue>` — verifies 4-byte selector matches canonical sig, strips it, decodes params into the recursive tree | abi-decode.ts decodeCalldata + machinery |
| `match_selector` | `(sig: String, calldata: Vec<u8>) -> Result<bool>` — cheap selector-only check | abi-decode.ts matchSelector |

Decode leaf rendering rules (conformance-pinned): addresses EIP-55 checksummed; uintN/intN minimal 0x-hex; bytes/bytesN 0x-hex; bool `"true"/"false"`; string utf8 (lossy replacement on invalid — matches TS).

## Module `eip712`

| Function | Signature | Legacy |
|---|---|---|
| `hash_typed_data` | `(typed_data_json: String) -> Result<Vec<u8>>` [32] — full eth_signTypedData_v4 digest incl. MetaMask stringified-payload & domain-only (`primaryType=="EIP712Domain"`) conventions. **The declared `types.EIP712Domain` defines the separator**: it must be a canonical-order subsequence of the five standard fields with exact types (else `Eip712NonCanonicalDomain`, divergence #2), every declared field must be populated (else `Eip712NonCanonicalDomain`, divergence #13), and populated-but-undeclared canonical fields are dropped before hashing so alloy cannot fold them in. Under-width `address`/`bytesN` values are padded the way the legacy hasher padded them | eip712.ts (+ clear-signing.ts buildEncodeType drift copy) |
| `encode_type` | `(typed_data_json: String) -> Result<String>` — `encodeType` of the payload's primaryType (with sorted dependencies), for clear-signing display | eip712.ts |

## Module `safe`

| Function | Signature | Legacy |
|---|---|---|
| `compute_safe_address` | `(pub_key_x: Vec<u8>[32], pub_key_y: Vec<u8>[32]) -> Result<SafeAddressInfo>` | safe-address.ts computeAddress/calculateSaltNonce/encodeSetupData/calculateProxyAddress, SafeAddressComputer.swift |
| `parse_public_key` | `(hex: String) -> Result<P256PublicKey>` — **strict**: invalid input errors (TS returned empty arrays; divergence #3) | safe-address.ts parsePublicKey |
| `compute_safe_address_multi` | `(keys: Vec<P256PublicKey>) -> Result<SafeAddressInfo>` — multi-device Safe, threshold 1: keys[0] drives the shared WebAuthn signer, later keys become per-key factory signer owners whose proxies are deployed inside the setup MultiSend (`createSigner` CALL sub-txs). Later keys are canonically sorted by x‖y (enumeration order never moves the address); duplicates rejected; at most 7 keys (`MAX_MULTI_KEYS`). With one key the output is byte-identical to `compute_safe_address` | — (new, no legacy counterpart) |
| `compute_webauthn_signer_address` | `(x: Vec<u8>[32], y: Vec<u8>[32]) -> Result<String>` — offline `SafeWebAuthnSignerFactory.getSigner`: counterfactual per-key signer-proxy address (CREATE2, salt 0, verifiers=0x100) | — (new, no legacy counterpart) |
| `compute_splitter_address` | `(treasury_hex: String) -> Result<String>` | safe-address.ts computeSplitterAddress |
| `encode_splitter_deploy_call` | `(treasury_hex: String) -> Result<Vec<u8>>` — salt(32)‖initCode calldata for the Arachnid factory | safe-address.ts encodeSplitterDeployCall |

## Module `webauthn`

| Function | Signature | Legacy |
|---|---|---|
| `extract_attestation_public_key` | `(attestation_object: Vec<u8>) -> Result<P256PublicKey>` — ciborium+coset; handles ED-flag trailing extensions via exact-length CBOR read | attestation-parser.ts extractPublicKey |
| `der_signature_to_raw_low_s` | `(der: Vec<u8>) -> Result<Vec<u8>>` [64] — strict DER, low-s normalized (RIP-7212-ready r‖s) | attestation-parser.ts DER path |
| `validate_client_data` | `(kind: ClientDataKind, client_data_json: Vec<u8>, authenticator_data: Vec<u8>) -> Result<()>` — byte-level prefix/`}`-terminator rules mirroring the Safe WebAuthn verifier; `Get` additionally checks authData ≥ 33 bytes + UV flag (0x04); `Create` ignores `authenticator_data` (pass empty) — mirrors the legacy verify/create pair exactly (challenge is NOT verified here, matching legacy) | webauthn-verify.ts + public-key-upload.ts duplicate |
| `recover_public_key_from_assertions` | `(a: WebAuthnAssertion, b: WebAuthnAssertion) -> Result<Option<P256PublicKey>>` — trial recovery ids 0–3 per assertion over the low-s-normalized signature, candidate intersection with per-candidate re-verification; `Ok(None)` = no unique key (not an error; incl. same-signature-twice) | p256-recovery.ts |
| `webauthn_signing_hash` | `(authenticator_data: Vec<u8>, client_data_json: Vec<u8>) -> Vec<u8>` [32] (infallible) — `sha256(authData ‖ sha256(clientDataJSON))` message hash used by recovery & verification | p256-recovery.ts hash assembly |

## Binding-surface notes

- **uniffi 0.32 (Kotlin/Swift)**: records derive `uniffi::Record` (recursive `AbiValue` auto-detected — Swift generates `indirect`), enums `uniffi::Enum`, `CoreError` is `#[uniffi(flat_error)]`; Kotlin surfaces `CoreException` sealed subclasses (inheriting `Throwable` per 0.32 semantics).
- **wasm (TS)**: DTOs derive `Tsify + Serialize` (`into_wasm_abi`) — tsify emits the recursive TS type; errors thrown as `{ code, message }`. TS types generated — the facade's `types.ts` re-exports them so app code has ONE import site.
- **Stability**: this table is the v1 contract; additive changes only within v1. Renames/shape changes require regenerating Kotlin+Swift+wasm bindings together (uniffi checksum coupling).

## Enumerated divergences from legacy TS (FR-004)

1. `from_hex`: TS `parseInt` accepted junk (`'zz'` → 0) — Rust errors `InvalidHex`.
2. `hash_typed_data`: non-canonical `types.EIP712Domain` (extra/reordered/wrong-typed fields) — TS hashed the domain type exactly as provided (self-consistent but nonstandard separator); Rust rejects `Eip712NonCanonicalDomain`, because alloy would silently canonicalize (drop/reorder) and produce a digest the dApp's verifier never reconstructs.
3. `parse_public_key`: invalid key — TS returned empty arrays; Rust errors `InvalidPublicKey`.
4. `to_quantity`: TS never threw (`'' → 0x0`, `-5 → 0x0`) — Rust rejects negative/garbage input `InvalidQuantity`; empty-string/`0x` handling pinned by vector (accept as `0x0` to preserve call sites, documented).
5. `from_base64url`: TS `atob` silently accepted standard-alphabet `+`/`/` — Rust requires the url-safe alphabet (`InvalidBase64Url`); trailing `=` padding still tolerated.
6. `decode_calldata` truncated calldata: TS zero-pads missing words "by design" (selector-only transfer → address(0)/0) — Rust rejects `AbiDecode`; the signing sheet falls back to raw-calldata display instead of showing fabricated zeros.
7. `decode_calldata` empty string param: TS renders `'0x'` (null-regex catch bug) — Rust renders `""`.
8. `canonicalize_signature`/`compute_selector` with `uint`/`int` aliases: TS kept the alias (wrong selector); Rust normalizes to `uint256`/`int256` per Solidity grammar.
9. `decode_calldata` arrays: TS silently truncates dynamic arrays at 200 elements — Rust decodes fully (documented-only; no practical vector).
10. `hash_typed_data` domain-only payloads (`primaryType == "EIP712Domain"`): Rust follows the MetaMask convention (`keccak256(0x1901 ‖ domainSeparator)`); TS hashed `message` (usually `{}`) as a domain struct, encoding `undefined` fields as the literal string `"undefined"` — a silently nonstandard digest (documented + Rust unit test; no oracle vector possible since the TS output is the wrong value).
11. `der_signature_to_raw_low_s`: TS accepted sloppy DER (ignored outer length, trailing garbage, non-minimal 0x00 prefixes, negative-form short integers) — Rust is strict DER (vectors: trailing-garbage, unnecessary-zero-prefix, negative-form-short-r).
12. `extract_attestation_public_key`: TS did no kty/crv/on-curve checks — Rust requires EC2/P-256 and an on-curve point (vector: off-curve-point).
13. `hash_typed_data` declared-but-unpopulated domain field: TS encoded the literal string `"undefined"` into the separator (garbage no verifier reproduces) — Rust rejects `Eip712NonCanonicalDomain`. Conversely, populated-but-undeclared canonical fields are silently dropped to match the declared type (TS behavior), NOT folded in (alloy's behavior). Rust-side unit tests pin both; no oracle vector is possible for the garbage case.
14. `hash_typed_data` bool message values that are not JSON booleans: TS used JS truthiness (`"false"` → 1); Rust follows alloy's coercion (`"false"` → 0, other strings error). Rust is EIP-712-correct; the TS value was wrong.
15. `decode_calldata` negative `intN` for N<256: TS subtracted 2^N from the full 256-bit word, rendering a ~2^256 garbage positive; Rust sign-extends correctly (`-0x1`). Rust-side unit test pins it.
16. `decode_calldata` fixed-size arrays of dynamic types (`string[2]`, `bytes[2]`, dynamic-tuple`[N]`): TS's `isDynamic` missed them and read head-offset words as element data; Rust decodes per spec. Rust-side unit test pins it.
17. `canonicalize_signature`/`compute_selector`/`match_selector` on malformed signatures: TS silently "repaired" them (dropping the final character of an unclosed signature, skipping empty parameter slots) and derived a selector for a function nobody wrote; Rust errors `AbiParse`.
18. `decode_calldata` `function` type: kind is the canonical lowercase `"function"` and the value is alloy's 24-byte address‖selector payload (TS's fallback rendered a full 32-byte word).
19. `to_quantity` lenience is PRESERVED, not tightened: surrounding whitespace, leading `+`, and case-insensitive `0x`/`0b`/`0o` prefixes all parse exactly as JS `BigInt` parsed them (vectors pin each). Only the clamp is gone (divergence #4).
20. `from_base64url` whitespace: `atob` silently ignored ASCII whitespace — Rust rejects `InvalidBase64Url`. Excess `=` padding is rejected by BOTH (pinned by vector so the Rust padding cap cannot loosen).

Each divergence has (a) a conformance vector with `divergence` marker, (b) a side-by-side harness rule, (c) call-site audit in tasks before TS deletion.
