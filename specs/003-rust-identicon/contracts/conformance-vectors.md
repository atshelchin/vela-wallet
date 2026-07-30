# Contract: Identicon conformance corpus

**Date**: 2026-07-30 · Location: `rust/crates/vela-core/tests/vectors/identicon.json`
(committed). Produced by `scripts/dump-vectors/identicon.dump.test.ts`, which imports
the **installed `identicons-esm@1.0.1`** package as the behavioural oracle. Consumed by
`vela-core/tests/conformance.rs` and replayed unchanged on Kotlin, Swift and wasm —
that replay is how SC-002's cross-platform byte-identity is checked.

This file extends, and does not replace,
[001's corpus contract](../../001-rust-core-bindings/contracts/conformance-vectors.md);
the file schema, the `divergence` rule and the regeneration policy are inherited.

## Suite registration

`conformance.rs` asserts an exact set of suite files so a corpus lost to a bad merge
cannot make all four surfaces report green over a silently shrunken corpus. This
feature adds one entry:

```rust
const REQUIRED_SUITES: [&str; 6] = ["abi", "eip712", "identicon", "primitives", "safe", "webauthn"];
```

## Case schema

Standard `{ name, fn, input, expect, divergence? }` rows. The functions exercised:

| `fn` | `input` | `expect` |
|---|---|---|
| `make_hash` | `{ "seed": "…" }` | `{ "value": "40676634160800000" }` |
| `identicon_params` | `{ "seed": "…" }` | `{ "main": "#1A5493", "background": "#0582CA", "accent": "#88B04B", "face": "<path …", "top": "…", "sides": "…", "bottom": "…" }` |
| `identicon_params_js_compat` | `{ "seed": "…" }` | same shape; `main` may be `"undefined"` |
| `identicon_svg` | `{ "seed": "…" }` | `{ "value": "<svg …</svg>" }` |
| `identicon_svg_circular` | `{ "seed": "…" }` | `{ "value": "<svg …</svg>" }` |
| `identicon_data_uri` | `{ "seed": "…" }` | `{ "value": "data:image/svg+xml;base64,…" }` |
| `create_identicon` | `{ "seed": "…", "validate_address": true, "format": "svg" }` | `{ "value": "…" }` |
| `normalize_seed` | `{ "seed": "…" }` | `{ "value": "…" }` |
| `nimiq_is_valid_address` | `{ "input": "…" }` | `{ "value": true }` |
| `section_svg` | `{ "section": "face", "index": -5 }` | `{ "value": "<path …" }` |

Section artwork is compared **by full fragment string**, not by index — an index match
with a mis-transcribed table would be a false pass, and the table is the largest
mechanically-copied artifact in the feature.

## Suite inventory

| Group | Cases | What it pins |
|---|---|---|
| `known-answer` | 3 | The library's own inline snapshots: `makeHash('test') = 39522148458090`, `'hello' = 7935187296325090`, `'NQ07 0000 …' = 113682528368518`. First thing to check when a port is wrong |
| `golden-corpus` | 14 | The library's own frozen `test/golden.ts` corpus (empty, single char, `nimiq`, numeric, special chars, whitespace, single/mixed/double emoji, `x`×500, two NQ addresses) — the exact inputs upstream uses to gate its own refactors |
| `addresses` | 600 | 0x-hex addresses: lowercase, checksummed-mixed-case, all-zeros, all-`f`, plus the app's own fixture addresses (SC-003) |
| `unicode` | 300 | BMP (CJK, PUA, combining), astral/emoji (the high-surrogate rule, research D3), lone-BMP boundary `U+FFFF`, `U+10FFFF` |
| `control-chars` | 100 | C0 controls including NUL |
| `length-sweep` | 200 | Lengths 0–200, one case each, straddling the exponential-form onset at 93 |
| `regime-a` (degenerate) | 40 | ≥1,046 characters. `identicon_params` expects `{ "error": "InvalidIdenticonSeed" }` **with a `divergence` note**; `identicon_params_js_compat` expects the `"undefined"` output |
| `nimiq` | 60 | Valid/invalid Nimiq addresses through the validate-and-normalise path, incl. placeholder returns |
| `full-svg` | 2,000 | Complete SVG documents (stock, circular and data-URI) — the end-to-end byte check |
| `hash-bulk` | 200,000 | Compact `[seed, hash]` rows only. The volume that backs SC-001 |

Roughly 203,300 cases. `full-svg` is capped at 2,000 because complete documents are
2.2–8.4 KB each (measured, research D7); 200,000 of them would be a ~700 MB file. The
2,000 full documents prove assembly; the 200,000 hashes prove the part that is
actually fragile. **This cap is a deliberate, recorded coverage limit, not an
oversight.**

## File layout

Two files, because one 200k-row array of objects is neither reviewable nor fast to
parse:

```text
rust/crates/vela-core/tests/vectors/
├── identicon.json        # ~3,300 standard cases (all fn kinds, full SVGs, divergences)
└── identicon-bulk.json   # { "suite": "identicon-bulk", "pairs": [["seed","hash"], …] }
```

`identicon-bulk.json` uses the compact pair form deliberately: at 200k rows the
standard case schema would triple the file for no added information, and the runner
for it is three lines.

## Divergence register

Every intentional difference from the JS library, per 001's rule that `divergence`
requires a mandatory `ts_behavior` field:

| # | Case | JS behaviour | Core behaviour | Reason |
|---|---|---|---|---|
| 1 | Regime A seed (≥ ~1,046 chars), strict mode | emits literal `fill="undefined"` / `color="undefined"` | `Err(InvalidIdenticonSeed)` | FR-004: a wallet must not silently render an invisible avatar. `identicon_params_js_compat` reproduces the JS bytes so parity stays provable (FR-005) |
| 2 | Regime B seed (7-char decimal form) | throws `Error: SVG file not found for face with index NaN/NaN.` | `Err(InvalidIdenticonSeed)` | Same failure, typed instead of thrown; FR-004's no-panic rule |
| 3 | `CreateOptions::default()` | `shouldValidateAddress: true` | `validate_address: false` | Nimiq validation rejects every EVM address; the JS default would placeholder every Vela account |
| 4 | *(withdrawn)* `normalize_seed` on non-ASCII | — | — | An earlier draft narrowed to ASCII-only lowercasing. Measurement retired it: Rust's `to_lowercase` matches V8 on all 1,112,064 code points and on 41,586 string-level cases including Greek final sigma. The core does full Unicode lowercasing, so there is no divergence here |
| 5 | `normalize_seed` truncation splitting a surrogate pair | keeps a lone high surrogate | drops the whole character | Rust `&str` cannot hold a lone surrogate. Needs a >128-unit seed with an astral char at exactly the boundary |

## Regeneration policy

```bash
npm ci                                  # identicons-esm@1.0.1 must be installed
npm run dump:vectors                    # writes tests/vectors/*.json
```

The dump is **fully deterministic**: seeds come from a fixed xorshift PRNG with a
hardcoded seed and a committed fixed-input list, so re-running on unchanged code
produces byte-identical files and any diff is a real behaviour change. There is no
timestamp in the output.

A diff after a dependency bump means the *library* changed, which — since users
already hold the avatars the pinned version draws — is a release-blocking finding to
investigate, not a corpus to accept with `-u`.
