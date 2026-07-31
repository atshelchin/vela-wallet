# Tasks: Identicons in the shared Rust core

**Input**: Design documents from `/specs/003-rust-identicon/`

**Prerequisites**: plan.md, spec.md, research.md (pin table + D1–D11), data-model.md, contracts/identicon-api.md, contracts/conformance-vectors.md, quickstart.md

**Tests**: INCLUDED — the conformance corpus IS this feature's acceptance mechanism (FR-002, FR-012, SC-001), not an optional extra. Corpus-before-implementation order is deliberate: the port is written against a committed oracle, so "it compiles" can never be mistaken for "it is exact".

**Organization**: Phases by user story; each story is an independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable relative to its phase-mates (different files)
- Version pins: NEVER improvise — copy from research.md pin table

---

## Phase 1: Setup

**Purpose**: dependency + error plumbing, so the module has somewhere to land

- [X] T001 Add `ryu-js = "1.0.3"` to `rust/Cargo.toml` `[workspace.dependencies]` (pin table, research D2) and to `rust/crates/vela-core/Cargo.toml` `[dependencies]` via `workspace = true`. Verify `cargo build -p vela-core` and `cargo build --target wasm32-unknown-unknown -p vela-core-wasm` still compile.
- [X] T002 Add `CoreError::InvalidIdenticonSeed(String)` to `rust/crates/vela-core/src/error.rs` with Display `"identicon seed is unrenderable: {0}"`, plus its arm in `code()` returning `"InvalidIdenticonSeed"` (data-model.md CoreError table).
- [X] T003 Mirror the variant in `rust/crates/vela-core-uniffi/src/lib.rs`: add to the `CoreError` enum and to the `From<vela_core::CoreError>` match. The wasm shell needs no change — it serialises `e.code()` generically.

**Checkpoint**: workspace builds; new error variant reachable from all three surfaces.

---

## Phase 2: Foundational — the oracle and the artwork

**Purpose**: get the mechanically-copied data and the committed truth in place BEFORE any logic is written

**⚠️ CRITICAL**: T004 and T005 both read the installed `identicons-esm@1.0.1`. Run `npm ci` first.

- [X] T004 Write `scripts/gen-identicon-features.mjs` (FR-009): import `identiconFeatures` from `identicons-esm/core`, assert exactly 84 entries and 21 contiguous indices per section (fail loudly otherwise — a silent partial table is the worst outcome), and emit `rust/crates/vela-core/src/identicon_features.rs` as four `pub(crate) static FACE/SIDES/TOP/BOTTOM: [&str; 22]` arrays with index 0 unused. Escape `\` and `"` for Rust string literals. Header comment must say it is generated and name the command. Run it; commit the output.
- [X] T005 Write `scripts/dump-vectors/identicon.dump.test.ts` per contracts/conformance-vectors.md: fixed xorshift PRNG with a hardcoded seed (determinism, FR-012), the 10 case groups from the suite inventory, the 5 rows of the divergence register read from a hand-maintained list (the script may read divergences, never invent them). Emit `identicon.json` (~3,300 cases) and `identicon-bulk.json` (200,000 compact `[seed, hash]` pairs). Add `"identicon"` to `REQUIRED_SUITES` in `tests/conformance.rs`.
- [X] T006 Extend `rust/crates/vela-core/tests/conformance.rs` with the identicon `fn` dispatch arms (contracts/conformance-vectors.md case schema) and a separate three-line bulk runner for `identicon-bulk.json`.

**Checkpoint**: corpus committed and loading; every identicon case currently FAILS (nothing implemented). That red is the starting line.

---

## Phase 3: User Story 1 — One exact identicon implementation (P1) 🎯 MVP

**Goal**: `vela-core` reproduces `identicons-esm@1.0.1` byte-for-byte.

**Independent test**: `cargo test -p vela-core` — the whole identicon suite green, including `known-answer/test`.

### The hash (the part that is actually hard)

- [X] T007 [US1] Create `rust/crates/vela-core/src/identicon.rs`; add `pub mod identicon;` to `lib.rs`. Implement `chaos_hash(n: f64) -> f64` — `k = 3.569956786876`, `a = 1.0/n`, 100 iterations of `(1.0 - a) * a * k`. Comment at the site: **multiply order is contract, never `mul_add`** (research D8).
- [X] T008 [US1] Implement the compile-time table (research D4): `const fn chaos_hash_const` (identical arithmetic, `while` loop) and `static CHAOS_TABLE: [f64; 131] = build_chaos_table();`. Lookup helper: table for code units `0..=127`, runtime loop above that.
- [X] T009 [US1] Implement `leading_code_unit(ch: char) -> u32` — code point for BMP, `0xD800 + ((cp - 0x10000) >> 10)` for astral (research D3). Comment why: this is the single most likely silent-divergence site.
- [X] T010 [US1] Implement `IdenticonHash { buf: [u8; 17], len: u8 }` + `as_str`, `is_degenerate`, `Display`, `PartialEq<str>`, and `make_hash(seed: &str) -> IdenticonHash`: accumulate `acc`, format with `ryu_js::Buffer` (research D2), reverse bytes, `pad = rev[5]` or `b'0'`, replace the FIRST `.` with `pad`, take bytes `4..21`, pad-end to 13. Zero allocations.

**Gate**: `cargo test -p vela-core identicon::known-answer` and the 200k bulk suite green. Nothing below matters until the hash is exact.

### Params and artwork

- [X] T011 [P] [US1] Palettes `COLORS` / `BACKGROUND_COLORS` (data-model.md table) and the verbatim fragment constants `DEFAULT_SHADOW`, `DEFAULT_BACKGROUND_SHAPE`, `IDENTICON_PLACEHOLDER`, `IDENTICON_PLACEHOLDER_BASE64`, plus `default_circle_shape(color)`.
- [X] T012 [P] [US1] `Section` enum, `section_svg(section, index: i64)` with `abs(n % 21) + 1` addressing into the generated table, and `sections_svg(...)`. Out-of-table index → `CoreError::InvalidIdenticonSeed`, never a panic.
- [X] T013 [US1] `colors_from_indices(main, background, accent) -> Colors` implementing the exact selection order: single `main` adjust, then the `accent` while-loop (data-model.md). Note in a comment that step 2 is once, not a loop.
- [X] T014 [US1] `identicon_params(seed) -> Result<IdenticonParams, CoreError>` (strict) and `identicon_params_js_compat(seed)` (FR-005) — reading `hash[0]`, `hash[2]`, `hash[11]` and the four 2-digit pairs, with `hash[5]` deliberately read twice. Both reject Regime B; only strict rejects Regime A.

### Assembly

- [X] T015 [US1] `assemble_svg(&IdenticonParams) -> String` — stock hexagonal with `<clipPath id="a">`, exact template from research's algorithm section. Compute exact capacity by summing part lengths, then one `String::with_capacity`.
- [X] T016 [US1] `assemble_svg_circular(&IdenticonParams) -> String` (FR-003) — byte-identical to `src/components/ui/Identicon.tsx`'s current assembly: no `clipPath`, no ids, plain background rect, `circle` + shadow + `top sides face bottom`. Same single-allocation discipline.
- [X] T017 [P] [US1] `IdenticonFormat`, `format_identicon` (base64 `STANDARD` engine — padded, matching `btoa`), and the one-shot helpers `identicon_svg`, `identicon_svg_circular`, `identicon_data_uri`.
- [X] T018 [P] [US1] `normalize_seed(seed) -> Cow<str>` (research D9): ASCII-lowercase + 128-UTF-16-unit truncation that never splits a surrogate pair; borrow when already normalised. `SEED_MAX_UTF16_LEN`.
- [X] T019 [P] [US1] Nimiq compatibility (research D11): `nimiq_is_valid_address`, `nimiq_format_address`, and `create_identicon(raw_seed, CreateOptions)` with the placeholder fallback. `CreateOptions::default()` sets `validate_address: false` — divergence #3, comment it.
- [X] T020 [US1] Re-export the public surface from `lib.rs` per contracts/identicon-api.md.

### Proof

- [X] T021 [US1] Property tests in `tests/proptests.rs`: no input panics (arbitrary strings incl. unicode); repeated calls stable; `acc ∈ (0, 0.5]`; every section index in `1..=21`; and the load-bearing one — `CHAOS_TABLE[n] == chaos_hash(n)` bit-for-bit for all 131 entries (research D4's risk retirement).
- [X] T022 [US1] `tests/identicon_bench.rs` (SC-004/SC-005): a counting global allocator asserting `identicon_svg_circular` allocates exactly once; timing assertion under 2 µs for a 42-char address; a guard test that the module declares no `static mut` / `OnceLock` / interior mutability (FR-008).

**Checkpoint**: US1 complete and independently shippable — the core is proven exact with no app change.

---

## Phase 4: User Story 2 — Every platform draws the same avatar (P2)

**Goal**: all four platforms reach the same computation.

**Independent test**: corpus replayed through Kotlin, Swift and wasm; `app-web` renders unchanged avatars.

- [X] T023 [P] [US2] uniffi exports in `vela-core-uniffi/src/lib.rs`: `identicon_svg_circular`, `identicon_svg`, `identicon_data_uri`, `identicon_params` (→ `IdenticonParamsDto`), `make_hash`, `normalize_seed` (contracts/identicon-api.md binding table).
- [X] T024 [P] [US2] The same six exports in `vela-core-wasm/src/lib.rs` with a tsify `IdenticonParamsDto`.
- [X] T025 [US2] Rebuild the web artifact: `npm run build:wasm && npm run verify:wasm`; confirm `rust/pkg-web/` regenerates and the new exports appear in `vela_core.d.ts`.
- [X] T026 [US2] Write `scripts/verify-identicon-parity.mjs` (SC-003): for every account address in the app's fixtures, diff `identicons-esm`-via-current-`Identicon.tsx` assembly against the core's `identicon_svg_circular`. Zero differences required.
- [X] T027 [US2] Migrate `src/components/ui/Identicon.tsx` to the core on the web path, keeping the existing bounded LRU (research D10 — caching stays at the caller) and routing seed normalisation through `normalize_seed`. Preserve the file's existing comments explaining the circular clip and the `id="a"` collision; they document why `assemble_svg_circular` exists.
- [X] T028 [P] [US2] Extend the Kotlin/Swift smoke harnesses (`rust/harness/`) to replay the identicon suite.
- [X] T029 [P] [US2] Add the identicon suite to the CI `rust` job; ensure `gen-identicon-features.mjs` and `dump:vectors` are re-run in CI with a `git diff --exit-code` check, so a drifted table or corpus fails the build (FR-009, FR-012).

**Checkpoint**: one implementation, four platforms, byte-identical.

---

## Phase 5: Polish

- [X] T030 [P] Module rustdoc on `identicon.rs`: what it ports, the pinned version, why the float pipeline is fragile, and links to research D2/D3/D4/D8. This module will be read by someone who does not know that `Number::toString` is load-bearing.
- [X] T031 [P] Update `rust/README.md` with the identicon entry point and the "avatars must never change" rule. *(`DESIGN_SYSTEM.md` left alone: it documents tokens and component styling, and the identicon is generated art with no token surface — the one avatar reference there is a background colour.)*
- [X] T032 Record the measured benchmark numbers in research.md (replacing the target with the actual), and mark spec.md Status as implemented.

---

## Dependencies

- **T001–T003** (setup) block everything.
- **T004–T006** (oracle + artwork) block all of Phase 3 — the corpus must exist before the port, by design.
- **T007 → T008 → T010** is a strict chain (table depends on the function; hash depends on the table). **T009** can be written any time before T010.
- **T010 gates T011–T022**: an inexact hash makes every downstream test meaningless.
- **T012** depends on T004's generated table.
- **T014** depends on T010, T012, T013.
- **T015/T016** depend on T014; **T017** depends on T015/T016.
- **Phase 4** depends on all of Phase 3. **T027** depends on T024, T025, T026.
- **T032** depends on T022.

## Parallel opportunities

- T004 ∥ T005 (both read the package, different outputs)
- T011 ∥ T012 ∥ T018 ∥ T019 (independent files/regions, all post-T010)
- T023 ∥ T024 (different shells); T028 ∥ T029
- T030 ∥ T031

## Implementation notes

- **Do not "simplify" the arithmetic.** `hash[5]` read twice, the single `main` adjust
  versus the `accent` loop, and the multiply order in the chaos function are all
  upstream behaviour. Every one of them changes user avatars if tidied.
- **Do not add a cache to the core** (FR-008, research D10), however tempting T022's
  benchmark makes it look.
- **Do not regenerate the corpus with `-u`-style acceptance** when it goes red. A red
  corpus after a dependency bump is a finding, not a chore.
