# Contract: Conformance vector corpus

**Date**: 2026-07-28 · Location: `rust/crates/vela-core/tests/vectors/*.json` (committed). Produced by `scripts/dump-vectors/` (jest-invoked, runs the **current TS implementations** as the behavioral oracle — recon: all existing vectors are inline in test files, jest/ts-jest is the only installed TS runner). Consumed by `vela-core/tests/conformance.rs` and by per-language smoke harnesses (same JSON replayed on Kotlin, Swift, and web — that's how SC-001's cross-platform byte-identity is checked).

## File schema

One JSON file per suite (`primitives.json`, `abi.json`, `eip712.json`, `safe.json`, `webauthn.json`):

```json
{
  "suite": "safe",
  "source": "scripts/dump-vectors (TS oracle @ <git sha>)",
  "cases": [
    {
      "name": "computeAddress/fixture-key",
      "fn": "compute_safe_address",
      "input": { "pub_key_x": "0x…32B…", "pub_key_y": "0x…32B…" },
      "expect": {
        "address": "0x762EdA60D3B68755c271D608644650278f88329F",
        "salt_nonce": "0xff558186…",
        "init_code_hash": "0x…"
      }
    },
    {
      "name": "fromHex/junk-input",
      "fn": "from_hex",
      "input": { "s": "zz" },
      "expect": { "error": "InvalidHex" },
      "divergence": { "ts_behavior": "parseInt coerces to 0x00 bytes", "reason": "silent junk acceptance; FR-004" }
    }
  ]
}
```

Rules:
- All byte fields are 0x-hex strings; all big numbers are 0x-quantity strings (matches the FFI convention, so vectors exercise the exact wire format).
- `expect` is either an output object (field names = the Rust return type's fields; bare returns use `{ "value": … }`) or `{ "error": "<CoreErrorCode>" }`.
- `divergence` present ⇔ Rust intentionally differs from TS; `ts_behavior` is mandatory there. The dump script emits these from a hand-maintained divergence list — it cannot invent them.
- `AbiValue` expectations use the recursive form (`{ "kind": "tuple", "value": "", "children": […] }`) — the same shape every binding returns.

## Suite inventory (initial corpus, from recon of existing tests)

| Suite | Sourced from (TS tests) | Cases (min) | Notes |
|---|---|---|---|
| primitives | eth-crypto (28), hex (22), sha256-in-p256-recovery (2+10 sizes) | ~60 | includes keccak256('')/('hello'), selector `setup(...)=b63e800d`, checksum vectors, toQuantity canon rules |
| abi | abi-decode (30) | ~30 | includes the nested-tuple relative-offset regression vector (past bug class) |
| eip712 | eip712 (17) | ~17 | spec Mail hash `be609aee…` asserted with AND without explicit EIP712Domain in types; + new domain-guard reject cases |
| safe | safe-address (18) | ~18 | address/saltNonce/setupData-hash vectors cross-referenced with iOS/Android native test suites |
| webauthn | attestation-parser (7), webauthn-verify (10), p256-recovery (captured) | ~20 | p256-recovery TS tests are property-based (runtime WebCrypto keys) — dump captures N=8 concrete assertion fixtures; Rust adds its own proptest with RFC-6979 deterministic signing |

Shape-only TS asserts (`length == 32`) are NOT ported as vectors — dump replaces them with captured concrete outputs (stronger than the originals).

## Invariants (property tests, not vectors — live in proptests.rs)

- hex/base64url encode∘decode = identity; decode rejects non-canonical input
- `checksum_address` idempotent; `to_quantity` idempotent; `normalize_s` idempotent
- `decode_calldata` never panics on arbitrary bytes (returns Ok or CoreError); nesting depth bounded
- recovery: for any deterministic-signed assertion pair over a random key, `recover_public_key_from_assertions` yields exactly that key

## Regeneration policy

The corpus carries no timestamp and pins its WebAuthn assertion inputs to a committed fixture file (ECDSA signs with a random nonce), so re-running the dump on unchanged code produces byte-identical files — any diff is a real behavior change. Refresh the assertion inputs deliberately with `VELA_REGEN_ASSERTIONS=1 npm run dump:vectors`. The corpus is regenerated ONLY by re-running dump-vectors against TS at a recorded git sha, and diffs are reviewed like code — a changed expected value means either a TS bug was fixed (document) or the oracle drifted (investigate). After FR-007 deletes the TS paths, the corpus freezes and becomes the sole cross-platform truth.
