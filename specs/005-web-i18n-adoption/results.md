# Proving-ground result — 005 Web adoption of the Rust i18n engine

**Date**: 2026-07-31 · **Branch**: `005-web-i18n-adoption` · Satisfies **SC-010**

This is the document the spec exists to produce: what web adoption measured, and
whether it licenses the native rollout.

---

## The headline, stated before the numbers

**Web adoption validates the resolver, the catalog lifecycle and the React
binding. It does NOT validate the defect feature 004 was built to fix.**

That defect is Hermes shipping `Intl` without `PluralRules`, so `ru` at
`count=21` selects the `other` form on iOS and Android. Web has complete
`Intl.PluralRules`. The code path that is wrong on Hermes **never executes here**,
so no amount of green on web is evidence about it. Anyone reading a clean result
below and concluding "the plural bug is fixed" would be wrong.

What web *does* prove is everything between the corpus and the screen: that the
engine resolves the app's real keys with the app's real options identically to
the library it replaces, that catalogs can be delivered and swapped over a
network without stranding a locale, and that react-i18next keeps working when its
`t` is replaced underneath it.

---

## Verdict

**Native adoption is licensed to proceed, with two conditions.**

1. The two engine defects found here (FR-023, FR-024) must be verified fixed on
   the **uniffi** surface too. Both were wasm-binding defects, so the Kotlin and
   Swift shells need their own check — neither is covered by the committed
   corpus, for the reason given below.
2. The native rollout must carry its own differential harness. Web's evidence
   does not transfer: the native surface has a different binding layer, a
   different catalog delivery story, and — uniquely — the plural path that is
   actually broken.

---

## Measured outcomes

| Criterion | Result |
|---|---|
| **SC-001** every key × every language identical | **PASS** — 15 × 1,129 = 16,935 resolutions, rust vs oracle, zero divergences. Repeated *through the installed seam* in-app: same, zero. |
| **SC-002** zero translation call sites edited | **PASS** — 92 `useTranslation()` sites in 66 files and 20 direct singleton uses, all untouched. |
| **SC-003** exactly two catalogs resident | **PASS** — `[active, en]`, or `['en']` when active is `en`, asserted across all 15. Required an explicit `releaseCatalog`; see corrections. |
| **SC-004** one catalog request per cold load | **PASS** — asserted, including `ja → ru → ja` at one fetch each. |
| **SC-005** a deliberate break turns CI red | **PASS**, and it was worth checking — see below. |
| **SC-006** harness cost | **PASS** — Rust 1.68 µs vs i18next 1.84–2.12 µs; both + compare ≈ 3.85 µs. A 500-key remount goes 0.84 ms → 1.93 ms. |
| **SC-007** manual sweep of 15 languages | **NOT DONE** — requires a human at a browser. The automated sweep covers the strings; the *re-render on language change* remains uncovered. |
| **SC-008** existing gates stay green | **PASS** — `tsc`, jest 1,474 passed, corpus lint, `verify:i18n` 67,115 comparisons zero divergences, `cargo fmt`, clippy `-D warnings`, `cargo test`, `build-web --check`, `verify-web` 40,470 + 5. |
| **SC-009** bundle/wasm within budget | **PASS** — wasm 654,943 bytes against the 1,000,000 ceiling. `en` bytes are re-encoded from the already-bundled `resources`, so no additional payload. |
| **SC-010** this document | **PASS** |

---

## SC-005 is the finding, not a formality

With the seam deliberately not installed, **10 of 11 tests in the flagship suite
stayed green**. Only one caught it.

This is the FR-016 trap made concrete. The seam returns the *oracle's* result
whenever the engines disagree — that is what keeps the product safe while the
engine is on trial — and it also means no output comparison can distinguish "the
engine is correct" from "the engine is not being called at all". The suite would
have been fully green over a completely un-adopted app.

The probe that catches it went through two versions, and the first was wrong:

1. **Behavioural.** The engine holds `en` plus at most one locale while i18next
   has all 15 bundled, so a per-call `lng` for a non-resident locale diverges.
   This worked — until the harness was installed, at which point the seam
   returned the oracle for that case too and the probe began **passing for the
   wrong reason**. The exact failure FR-016 was amended to prevent, reappearing
   inside the test written to guard against it.
2. **Instrumented.** The harness's own comparison counter. If `t` routes through
   the seam, comparisons happen; if it does not, the count is zero. No behavioural
   coincidence to depend on.

---

## What was found that the corpus could not have found

Four defects, none reachable by adding a conformance vector. The corpus encodes
values JSON cannot carry as `{"__t":…}` tags and decodes them Rust-side, so a
vector never crosses the raw JS boundary a live caller crosses.

1. **A rejected option permanently poisoned the engine** (FR-023). wasm-bindgen
   takes the `&self` borrow before argument conversion; tsify's failure path
   throws out of Rust without unwinding, so the guard never dropped. `t()` kept
   working while `changeLanguage` and `loadCatalog` threw forever — the UI would
   pin to the boot language while `i18n.language` moved.
2. **Non-finite interpolation variables diverged** (FR-024), and were reachable:
   `src/services/activity.ts:116` passes `{ n: Math.round(diff / 60) }`, and
   `{n: NaN}` rendered `"分前"` against i18next's `"NaN分前"`. 004 had fixed this
   for `count` alone.
3. **A throwing getter still poisons**, even after (1). The JS exception escapes
   the wasm call without unwinding Rust, and it cannot be defended against inside
   Rust because the getter runs deep in serde's map walk. The seam now reads
   options in JS inside a `try`, which is where the throw is catchable.
4. **Three CI gates were red on the 004 commit** — `cargo test --workspace`
   (1,516 of 3,554 conformance cases failing on absent default features),
   `cargo fmt --all --check` (34 files), and, once the second was fixed, a
   *conflict* between `cargo fmt` and `gen:i18n` over 17 generated files.

(1), (2) and (4) all trace to the same root cause: 004 was verified with the
commands its author was running, not the commands CI runs.

---

## Corrections to this spec's own design, made under measurement

- **R5 was wrong.** `changeLanguage('en')` does not release the outgoing catalog,
  so `fr → en` left `['en','fr']`. SC-003's "exactly the active one and `en`" is
  only true with an explicit `releaseCatalog`.
- **A timeout must make the promise settle, not merely abort the request.** Only
  that protects the boot gate, which has no watchdog of its own.
- **The store captured `globalThis.fetch` at construction**, freezing whatever
  existed at module-import time — invisible to a later polyfill.
- **`@types/react-dom` was added.** The plan's "no new dependency" claim was too
  strong; it holds for runtime dependencies only.

---

## Known gaps, stated rather than buried

- **Re-render on language change is not covered by any automated test.**
  `renderToStaticMarkup` was bought instead of a render library; it reaches the
  hook path and the infinite-suspense failure, but not the re-render. This is the
  one thing SC-007's manual sweep must actually exercise.
- **SC-007 has not been performed.** No human has walked the 15 languages.
- **The proving period has not run.** The harness is installed and defaults to
  `first-seen` in development, but no divergence data from real use exists yet.
  This document reports what the automated evidence shows; it is not a report of
  production experience.
- **Jest emits a worker-teardown warning** when the six i18n suites run together.
  No individual file reproduces it, unref'ing the catalog timeout did not change
  it, and the full run exits 0.

---

## What native should inherit

- The **seam shape**: override the binding's `t`, keep the incumbent as a live
  oracle, and never let the harness's return value be the thing under test.
- The **catalog lifecycle rules**: one non-fallback slot, JS-owned cache,
  fetch → load → change → notify, and a generation guard. These are properties of
  the *engine*, not of the web platform, so they transfer directly.
- The **boundary-regression checks** (FR-023/FR-024 style), which must be written
  against the uniffi shells rather than assumed from the wasm ones.
- The **discipline that produced this list**: run the gates the CI runs, and
  attack the evidence rather than the implementation.
