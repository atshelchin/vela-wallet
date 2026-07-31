# Tasks: Web adoption of the Rust i18n engine

**Branch**: `005-web-i18n-adoption` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Contracts are in [contracts/web-i18n-seam.md](./contracts/web-i18n-seam.md); every task below
references them rather than restating shapes.

`[P]` = parallelisable with its neighbours.

---

## Phase 0 — Engine defects (P0, gating) — **DONE** (`dfde5d5`)

Both were confirmed against the shipped `rust/pkg-web` artefact. They gated everything: the
seam's error path cannot be tested while a rejected option permanently poisons the engine.

- [x] **T001** Failing check reproducing the borrow poison. Landed in
  `rust/scripts/verify-web.mjs`, not in `cargo test` — the defect lives in the wasm-bindgen
  glue and is unreachable from pure Rust, and that script exists precisely to cover "the
  wasm-bindgen boundary and its JS type conversions".
- [x] **T002** FR-023 fixed: `t` / `tFirst` / `exists` take a raw `JsValue` and decode
  inside the body, so a bad option returns `Err` through the normal path and the borrow
  guard drops. TS parameter widens to `any` — no loss, the `TOptions` type was already
  unusable (D5).
- [x] **T003** Failing check for FR-024 (`{v: NaN}` / `±Infinity`), same file.
- [x] **T004** FR-024 fixed: `VarValue` (untagged, `f64` first) for `vars`, and `ReplaceArg`
  so the same holds through `replace` — which the seam's N3 rule depends on.
- [x] **T005** `rust/pkg-web` re-cut and committed with `build-info.json`. 654,943 bytes.
- [x] **T006** ~~Extend the committed corpus with non-finite var cases.~~ **Wrong as
  written** — the corpus encodes these as `{"__t":"nan"}` and decodes the tag Rust-side, so
  a vector cannot cross the raw boundary a live caller crosses. That is the same reason
  FR-022 keeps the `count: undefined` cases out. Both classes belong outside the corpus
  loop, which is where they now are.

**Also fixed here: three CI gates 004 left red**, found by running CI's exact commands
rather than the ones used locally.

- [x] `cargo test --workspace` was red — vela-core's default features are empty, so 1,516 of
  3,554 conformance cases failed with `I18nCatalogUnavailable`. `ci.yml` now passes
  `--features vela-core/i18n-all`.
- [x] `cargo fmt --all --check` was red across 34 files; the 004 code had never been through
  rustfmt (local toolchain matches CI's pinned 1.97.1, so not a version artefact).
- [x] Fixing that exposed a gate **conflict**: `cargo fmt` and `gen:i18n` fought over 17
  generated files, so whichever ran second was red. `gen-i18n.mjs` now runs rustfmt on the
  Rust it emits — the only arrangement where both gates pass. Verified idempotent.

## Phase 1 — Catalog store — **DONE** (`02cc14c`)

- [x] **T010** (FR-009, FR-010, FR-011, FR-012, FR-013) Create `src/i18n/catalog-store.ts` (plain `.ts`) per contract §3: URL with the
  `gitCommit` buster, `response.ok` before `arrayBuffer()`, LRU capped at 2 non-`en`
  entries, the four-step ordering, the generation guard, `engineLanguage` written on all
  four paths.
- [x] **T011** [P] `src/__tests__/i18n/web-catalog-store.test.ts` — cold load fetches once;
  `ja→ru→ja` is correct with one fetch each; a 404 HTML body throws an actionable error, not
  a parser message; a late fetch cannot evict the visible locale; residency is `[active,'en']`
  or `['en']`.
- [x] **T012** [P] Mock `@/constants/build-info` per file — `expo-constants` throws under jest.

## Phase 2 — Seam — **DONE** (`e165214`)

- [x] **T020** (FR-001, FR-002, FR-004) Create `src/i18n/seam.ts`: `seamT` with the six ordered steps and `seamExists`,
  per contract §1. Returns `string`.
- [x] **T021** (FR-005, FR-006, FR-007) The options normaliser, rules N1–N5 per contract §2, including the `count`
  strip-plus-`replace` pairing and the pre-call rejection of values that cannot cross the
  boundary.
- [x] **T022** (FR-003, FR-008, FR-014, FR-018) Create `src/i18n/index.web.ts`: `initSync`, build `en` bytes from the bundled
  `en` export via `TextEncoder` (~0.99 ms, eager — `src/services/activity.ts` calls the
  singleton outside React), construct the engine, assert `i18n.isInitialized`, capture the
  oracle, install the seam. **Retain the `en` bytes** (R4) for poison recovery.
- [x] **T023** Re-export everything `src/i18n/index.ts` exports, so the platform split is a
  drop-in. Assert export parity in a test.

## Phase 3 — Differential harness

- **T030** (FR-015, FR-016) Create `src/i18n/diff-harness.ts` mirroring the *shape* of
  `src/services/vela-core/diff-harness.ts` but **inverting its return contract**: 001 returns
  the core's result because the core was adopted; here the engine is on trial, so the oracle
  renders (FR-016).
- **T031** (FR-017) The three-mode control surface and `harnessReport()` per contract §5.
- **T032** (FR-015) The `Divergence` record and its tagged option encoding (contract §4), plus the
  paste-ready dumper source line — a finding cannot be hand-added to the corpus, because CI
  regenerates and diffs it.
- **T033** Poison detection that is **not** switch-scoped (R11): record the throw where it
  happens; attempt recovery at the next engine call.

## Phase 4 — Verification — **DONE** (`e165214`), except T045 CI wiring

- [x] **T040** (FR-019, FR-016) `src/__tests__/i18n/web-adapter.test.ts` — the differential replay. Imports the
  web module **by explicit path** (a bare `@/i18n` resolves the native file). Compares
  **`rust` vs `oracle`**, never the seam's return value (contract §6). Makes each locale
  resident before comparing it. 15 × 1,129; measured ~197 ms.
- [ ] **T041** [P] (FR-020) The contract test (deferred to Phase 3 with the harness): drive a real `useTranslation()` through
  `renderToStaticMarkup` (no new dependency; `React.createElement` keeps `testMatch` at
  `*.test.ts`). Assert the instance surface, and assert that forcing `ready = false` throws
  fast instead of suspending. Note a `delete inst.getFixedT` negative test proves nothing —
  own properties shadow the prototype.
- [x] **T042** [P] (FR-021) Assert `SUPPORTED_LANGUAGES` equals Rust's `SUPPORTED` **sorted**.
- [x] **T043** [P] (FR-022) `count: undefined` and BigInt count across the real wasm boundary, in
  jest — not in the corpus.
- [x] **T044** [P] (FR-004) Assert `seamExists` actually calls the engine (a counter). It has no
  behavioural provenance, so an output assertion cannot detect its absence.
- [ ] **T045** Wire the CI step. No new job and no jest config change is needed — the tests run
  in the existing `jest --ci`.
- [x] **T046** SC-005: verify a deliberate break turns CI red, and record which step catches it.

## Phase 5 — Integration

- **T050** Hook `setLanguage` into `setLanguagePreference`. On web the promise resolves to
  the language **in effect**, which is the previous one if the catalog could not be fetched.
- **T051** Defer the `Stack` remount in `src/i18n/language.tsx` until after the catalog
  lands; today `setPreferenceState` fires synchronously, so the tree remounts in the old
  language for one RTT. Native-invisible.
- **T052** (FR-014) Give the boot gate a catalog timeout. `loadLanguage()` puts the first network I/O
  the gate has ever had inside `Promise.all` at `src/app/_layout.tsx:175-210`, which has **no
  watchdog** — the fonts path has one for exactly this reason. A hung request is a permanent
  spinner.
- **T053** Dev-only diagnostics over `residentBytes()` / `residentLocales()`.

## Phase 6 — Proving

- **T060** Exhaustive sweep mode: every key × every language through both engines in one
  pass. State explicitly what this adds over `scripts/verify-i18n-parity.mjs` rather than
  duplicating it — the new part is *through the seam, with the options the app really passes*.
- **T061** Manual sweep of all 15 languages across every screen (SC-007), which is also the
  only cover for the named re-render gap.
- **T062** Write up the result (SC-010): divergences, resolution counts, languages, residency.
  It MUST state that web does not exercise the legacy `dummyRule` plural path, so this
  validates the resolver, catalog lifecycle and binding — **not** the native plural
  divergence 004 exists to fix. Without that sentence the result overclaims.

---

## Dependencies

```
T001→T002→T005 ;  T003→T004→T005 ;  T006 after T005
T010→T011 ;  T012 ∥
T020,T021→T022→T023           (T022 needs T005's artefact)
T030→T031,T032,T033           (T033 needs T002)
T040 needs T022+T030 ;  T041–T044 ∥ after T022 ;  T045→T046
T050–T053 after T040 green
T060–T062 last
```

## Parallel opportunities

- T003 with T001/T002 — independent defects.
- T011 and T012 with Phase 2.
- T041–T044 are four independent tests.

## Definition of done

Every FR-001…FR-024 is satisfied, SC-001…SC-010 measured, the two engine defects fixed with
committed regression coverage, and T062 written. Native behaviour bit-identical: `tsc`, the
1,437 jest tests, corpus lint and both parity scripts green.
