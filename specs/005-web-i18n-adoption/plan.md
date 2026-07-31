# Implementation Plan: Web adoption of the Rust i18n engine

**Branch**: `005-web-i18n-adoption` | **Date**: 2026-07-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-web-i18n-adoption/spec.md`

## Summary

Assign two properties. `i18n.t` and `i18n.exists` on the web i18next instance become
Rust-backed, and the pre-override functions are captured as a live oracle. That is the
entire seam: 92 `useTranslation()` sites in 66 files and 20 direct singleton uses are
captured with zero call-site edits, and `changeLanguage` / `languageChanged` /
`useSyncExternalStore` are untouched because a real i18next instance is still doing that
work.

Phase 0 settled the design (see [research.md](./research.md)). Phase 1 measured it, and
**four measurements changed the plan**:

**Two confirmed defects in the 004 artefact block adoption.** Both reproduced against the
shipped `rust/pkg-web` build:

1. **A failed option decode permanently poisons the engine.** `i18n_t` takes `&self`;
   `changeLanguage` / `loadCatalog` take `&mut self`. wasm-bindgen takes the borrow
   *before* argument conversion, and tsify's failure path throws out of Rust without
   unwinding, so the guard never drops. Measured: after `t('common.cancel', {ordinal: undefined})`,
   `t()` keeps returning `"キャンセル"` forever while `changeLanguage` and `loadCatalog`
   throw `recursive use of an object detected which would lead to unsafe aliasing in rust`
   — **forever**. The user-visible form is the worst available: the UI silently pins to the
   boot language while `i18n.language` moves. This must be fixed in the crate, not papered
   over in TS.
2. **Non-finite interpolation variables diverge, and are reachable today.**
   `{n: NaN}` renders `"NaN分前"` on i18next and `"分前"` on the engine (same for
   ±Infinity). 004's fuzz fix made `count` non-finite-safe via an untagged `CountValue`;
   the flattened `vars` map still routes through `serde_json::Value`, which cannot hold
   NaN or Infinity. `src/services/activity.ts:116` passes `{ n: Math.round(diff / 60) }`.

**The engine is not slower than i18next — 004's research overstated the gap.**
`research.md:438-439` of feature 004 records "0.605 µs wasm vs 0.00436 µs i18next — ~140×",
but 0.00436 µs is a raw store lookup, not `i18next.t()`. Measured against the full call the
app actually makes: Rust `t(key,{lng})` = **1.68 µs**, i18next = **1.84–2.12 µs**. The Rust
engine is marginally *faster*. This removes the main argument against running both engines
on every call in development.

**Jest can already see the web module.** D9 said `.web.ts` is invisible to every runner.
That is true for a *bare* specifier, and false for an **explicit path**: `moduleFileExtensions`
appends `.ts`, so `import '@/i18n/index.web'` resolves under jest today. Verified by probe —
`CORE_BACKEND === 'rust-wasm'`, `initSync` in 1 ms, 17,115 seam comparisons in 197 ms. FR-019
therefore needs **no jest config change and no new CI job**. Further, `renderToStaticMarkup`
drives a real `useTranslation()` in jest's node environment with zero new dependencies
(`react-dom` 19.2.0 is already installed; `React.createElement` avoids JSX, so `testMatch`
stays `*.test.ts`). So the 92 hook sites *are* reachable, and FR-020's "suspends forever"
becomes a 1 ms failing assertion.

**FR-016 as written makes the flagship test incapable of failing.** If the seam always
returns the oracle's result, then asserting `seam.t(k) === i18next.t(k)` passes no matter how
wrong Rust is. Resolved below (§Amendments); the correction is that the harness must expose
the **Rust** result for assertion, and tests must compare `rust` against `oracle`, never the
seam's return value.

---

## Technical Context

| | |
|---|---|
| **Language** | TypeScript 5 (strict), consuming the existing Rust/wasm artefact |
| **Runtime under test** | Web (Metro/Expo), Node 22 for jest and scripts |
| **Engine** | `rust/pkg-web/vela_core.js` + base64 module, `initSync` at import |
| **React binding** | `react-i18next` 17.0.8 over `i18next` 26.3.1 — unchanged |
| **Corpus** | `rust/crates/vela-core/i18n/locales` (frozen), served as `public/i18n/<lng>.json` |
| **Platform split** | `src/i18n/index.ts` (native, unchanged) vs new `src/i18n/index.web.ts` |
| **Perf budget** | seam adds < 1 µs/call vs today; harness-on ≤ ~2.2 µs/call extra (dev only) |
| **Scale** | 15 locales × 1,129 keys; ~1,007 `t()` call sites |

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled spec-kit template — this project has
no ratified constitution. Applying spec-kit defaults in its spirit, plus the conventions
features 001/003/004 established:

- **Library-first**: PASS — no new library. This spec *consumes* `vela-core`; the two crate
  fixes it forces are defect repairs to an existing module, tested in the crate.
- **Test-first**: PASS — the two defects above are reproduced by committed failing checks
  before they are fixed, and the differential test is written before the seam is installed.
- **Simplicity**: PASS — the seam is two property assignments. No new dependency, no jest
  config change, no new CI job, no render library. Every heavier alternative (i18nFormat
  module, bypass Provider, `.test.tsx` + testing-library) was measured and rejected.
- **No hand-rolled primitives**: PASS — the adapter hand-rolls nothing; it delegates to the
  engine and to i18next.
- **Reversibility**: PASS, and load-bearing here. The whole adoption is two assignments
  behind a switch; reverting is deleting them. `resources` stays bundled (FR-018), so the
  incumbent implementation is always one flag away.

---

## Amendments to spec.md forced by Phase 1

These are corrections to the spec, recorded rather than silently applied.

- **FR-016 (amended)** — unchanged in intent, sharpened in mechanism. The oracle's result
  is still what *renders*. But the harness MUST also expose the Rust result, and every
  differential assertion MUST compare `rust` vs `oracle` directly. A test that asserts on
  the seam's return value is structurally incapable of failing and MUST NOT be written.
- **FR-023 (new)** — the crate MUST NOT be left in an unusable state by a rejected option.
  A failed option decode must not prevent later `changeLanguage` / `loadCatalog`.
- **FR-024 (new)** — non-finite interpolation variables MUST render as i18next renders
  them (`NaN`, `Infinity`, `-Infinity` as text).
- **FR-021 (clarified)** — the `SUPPORTED_LANGUAGES` ↔ Rust `SUPPORTED` assertion MUST
  compare **sorted** collections. The two lists are set-equal but order-different today
  (`…tr, ru, es-MX…` vs `…tr, es-MX, …, ru, it`); asserting order fails on day one.
- **FR-022 (clarified)** — the `count: undefined` / BigInt vectors MUST NOT live in the
  committed corpus. `conformance.rs:731` decodes `{"__t":"undefined"}` to `count = None`
  on the Rust side, so a corpus vector would pass while the real JS boundary diverges.
  They belong in a jest test that crosses the actual wasm boundary.

---

## Design resolutions

The Phase 1 critique found the four design areas each assumed interfaces the others never
provided. These are the bindings that make them compose; they are contracts, not suggestions.

**R1 — One seam function.** `seamT(key: unknown, second?: unknown, third?: unknown): string`
is the only thing assigned to `i18n.t`. It owns, in order: null-key guard →
`overloadTranslationOptionHandler` (so the `t(key, 'default')` overload works) → selector-key
resolution → normalisation → `Array.isArray(key) ? tFirst : t` → catch. The harness sits
*inside* it and receives an already-normalised `(string | string[], AdapterTOptions | undefined)`.
The harness never sees a raw call site.

**R2 — Return type is `string`, never `unknown`.** React renders a non-string raw, silently.

**R3 — One state name.** `engineLanguage` — the tag last successfully handed to
`engine.changeLanguage` — lives in the catalog store, is written on all four paths (boot,
switch, failure-rollback, poison-recovery), and is the only JS mirror of engine state.

**R4 — `en` bytes are retained.** The catalog area wanted them dropped after construction;
poison recovery needs them synchronously. Retention costs ~51 KB and is the price of
recovery. `en` is never released (`releaseCatalog('en')` returns false anyway).

**R5 — Residency is `[active, 'en']`, and `['en']` only when active *is* `en`.** The
assertion must accept both, or it fails the moment the user selects English.

**R6 — One divergence record shape**, defined in [contracts/web-i18n-seam.md](./contracts/web-i18n-seam.md),
with options encoded by the same tagging `scripts/dump-vectors/i18n.dump.mjs` uses, so a
finding is replayable.

**R7 — One harness control surface**: a three-mode selector (`off` | `first-seen` | `every`),
not a boolean. Sampling is rejected: it is least likely to compare the rare dynamic-key and
error-path calls that the offline replay never saw, and under FR-016 it would make one input
flicker between two rendered values within a session. `first-seen` has neither defect — an
input enters the cache only *after* the engines agreed.

**R8 — One key list.** Nothing in `src/` enumerates the 1,129 keys. The generated
`src/i18n/resources.ts` already exports `en`; the sweep flattens it. No new generated file.

**R9 — Fetch/cache/validation lives in `src/i18n/catalog-store.ts`** — a plain `.ts`, not
`.web.ts` — so it is testable under the existing jest config with no explicit-path trick.
`index.web.ts` holds only what genuinely needs the platform split.

**R10 — The engine must be constructed before the first `i18n.t`.** `src/services/activity.ts`
calls the singleton outside React. Construction is eager at module init: `JSON.stringify` +
`TextEncoder` + `new I18n()` ≈ 0.99 ms, measured.

**R11 — Poison detection is not switch-scoped.** A poisoned engine that is never asked to
switch language is invisible. The seam records the poisoning throw when it happens, and
recovery is attempted at the next engine call rather than only inside `setLanguage`.

---

## Project Structure

### Documentation (this feature)

```
specs/005-web-i18n-adoption/
├── spec.md
├── research.md          # Phase 0 decisions D1–D10
├── plan.md              # this file
├── data-model.md
├── contracts/
│   └── web-i18n-seam.md # seam, façade, catalog and divergence contracts
├── quickstart.md
├── tasks.md
└── checklists/requirements.md
```

### Source Code (repository root)

```
src/i18n/
  index.ts            # NATIVE — unchanged. Still plain i18next.
  index.web.ts        # NEW — engine construction, oracle capture, seam install
  catalog-store.ts    # NEW — plain .ts: fetch, cache, validate, generation guard
  diff-harness.ts     # NEW — dual-run, compare, record; mirrors 001's shape
  seam.ts             # NEW — seamT / seamExists + the options normaliser
  resources.ts        # generated, unchanged; also the key source for the sweep
  language.tsx        # one deferral fix (remount after the catalog lands)

rust/crates/vela-core-wasm/src/lib.rs   # FR-023 defect fix
rust/crates/vela-core/src/i18n/         # FR-024 defect fix (non-finite vars)

src/__tests__/i18n/
  web-adapter.test.ts        # NEW — differential replay (rust vs oracle), contract test
  web-catalog-store.test.ts  # NEW — fetch/cache/race/validation
```

---

## Phasing

1. **Crate fixes first (P0).** FR-023 and FR-024 are defects in a shipped artefact and
   gate everything: the seam's error path is untestable while a rejected option can poison
   the engine.
2. **Catalog store**, in plain `.ts`, tested standalone.
3. **Seam + normaliser**, with the differential test written first.
4. **Harness**, then the exhaustive sweep.
5. **CI wiring** and the deliberate-break check (SC-005).
6. **Proving period**, then the written result (SC-010).

---

## Risks

- **The two crate fixes require re-cutting `rust/pkg-web`**, which changes committed
  artefacts and `build-info.json`'s `wasmInterface`. CI's `build-web.mjs --check` will
  demand they be committed together. Not hard, but it is not a TS-only change.
- **The proving ground can only prove what web exercises.** Web never runs the legacy
  `dummyRule` plural path, so the native-only defect 004 exists to fix is *not* what web
  validates. Web validates the resolver, the catalog lifecycle and the binding — not the
  plural divergence itself. SC-010 must say so plainly or it overclaims.
- **FR-016 makes the product safe and the evidence subtle.** Rendering the oracle means a
  Rust regression is invisible to the user *and* to any naive test. The differential
  assertions are the only thing standing between "adopted" and "adopted and unverified".
- **`expo-constants` throws under jest**, so the `gitCommit` cache-buster needs a per-file
  mock in tests that touch it.

---

## Complexity Tracking

No constitutional deviations. One deliberate simplification worth recording: the plan
**declines** `.test.tsx` + a render library (`@testing-library/react`), buying
`renderToStaticMarkup` instead. That covers the hook path — including the infinite-suspense
failure — with zero new dependencies, at the cost of not covering *re-render on language
change*. That gap is named here rather than hidden, and is the one thing the proving period
must cover by hand.
