# Quickstart: generate, test & validate the i18n / L10n core

**Date**: 2026-07-31 · Validation guide for [plan.md](./plan.md); scenario→artefact
mapping in [spec.md](./spec.md) User Stories; every number below traces to
[research.md](./research.md).

Read this top to bottom once. The one thing worth internalising first: **the corpus
under `rust/crates/vela-core/i18n/locales/` is the only file set you ever hand-edit.**
`src/i18n/resources.ts`, the generated `i18n/paths.rs`, the per-locale catalogs, the
per-locale JSON assets and the conformance vectors are all *generated*, and CI fails
on drift.

## Prerequisites

- **Rust 1.97.1**, pinned by `rust/rust-toolchain.toml` (it also pins the
  `wasm32-unknown-unknown` target plus `rustfmt` and `clippy` — no extra `rustup`
  steps)
- **Node 22** (`.github/workflows/ci.yml:31`) + `npm ci`. Required, not optional: the
  generator and the conformance dumper both read the **installed**
  `i18next@26.3.1`, exactly as `scripts/gen-identicon-features.mjs` reads the
  installed `identicons-esm`
- **A full-ICU Node.** The dumper hard-fails on a small-icu build, because
  `Intl.getCanonicalLocales` drives language-code normalisation and
  `Intl.PluralRules` drives every plural suffix (MODE A). Check before you start:

  ```bash
  node -p "process.versions.icu + ' ' + Intl.PluralRules.supportedLocalesOf(['ru']).length"
  # expect a version and a trailing 1
  ```

- **`wasm-pack` 0.15.0** — only for the web build and the size gate
  (`cargo install wasm-pack --locked --version 0.15.0`, as CI does at
  `.github/workflows/ci.yml:119`)

## The map — what generates what

```text
rust/crates/vela-core/i18n/locales/**            240 files, 990,499 bytes
        ^ THE source of truth. Hand-edited. Byte-for-byte unchanged (FR-009).
        |
        +-- node scripts/gen-i18n.mjs
        |     -> rust/crates/vela-core/src/i18n/paths.rs
        |          shared 1,205-path table (1,141 leaf + 64 branch) + 151-byte
        |          branch bitmap; 31,198 interned key bytes instead of 460,471
        |     -> rust/crates/vela-core/src/i18n_catalogs/<lng>.rs
        |          per-locale value blob + u16 offsets + presence bitmap,
        |          behind cargo feature `i18n-<lng>`
        |     -> public/i18n/<lng>.json          [research.md D9 -> served at /i18n/<lng>.json]
        |          per-locale runtime asset; what web fetches on demand (D3)
        |     -> src/i18n/resources.ts
        |          what the RN app imports today; must stay deep-equal (FR-011)
        |
        +-- node scripts/dump-vectors/i18n.dump.mjs   (drives real i18next@26.3.1)
              -> rust/crates/vela-core/tests/vectors/i18n-exhaustive.json
              -> rust/crates/vela-core/tests/vectors/i18n-behaviour.json
              -> rust/crates/vela-core/tests/vectors/i18n-plural.json
              -> rust/crates/vela-core/tests/vectors/i18n-plural-legacy.json
```

Note the direction: this **inverts** the repo's existing convention. Until now the
crate was always the *destination* of codegen (`identicon_features.rs`); here the
crate is the *source* and `src/i18n/resources.ts` is downstream. That inversion is
what "change one place, every platform updates" requires (plan.md, Structure
Decision).

## 1. Generate the artefacts (US3 — FR-010, SC-006)

```bash
npm ci
node scripts/gen-i18n.mjs

# The drift gate. This is what CI runs; a clean tree is the whole contract.
git diff --exit-code -- \
  rust/crates/vela-core/src/i18n/paths.rs \
  rust/crates/vela-core/src/i18n_catalogs \
  public/i18n \
  src/i18n/resources.ts
```

**Expected**: no output, exit 0. A diff here means either you edited the corpus (fine
— commit the generated files in the *same* commit) or someone hand-edited a generated
file (not fine — the edit is about to be silently reverted by the next contributor).

The generated `resources.ts` must keep exporting `en` by name: `src/i18n/i18next.d.ts`
does `import type { en } from './resources'` to derive the typed key union, so
dropping that export breaks `typecheck` for all 1,029 call sites.

CI block to add, mirroring the identicon one at `.github/workflows/ci.yml:66-70`:

```yaml
- name: i18n artefacts match the corpus
  run: |
    node scripts/gen-i18n.mjs
    git diff --exit-code -- rust/crates/vela-core/src/i18n/paths.rs \
      rust/crates/vela-core/src/i18n_catalogs public/i18n src/i18n/resources.ts \
      || { echo "::error::A generated i18n artefact is stale or was hand-edited. Re-run 'npm run gen:i18n' and commit the result together with the corpus change."; exit 1; }
```

## 2. Regenerate the conformance corpus (FR-027, SC-012)

```bash
node scripts/dump-vectors/i18n.dump.mjs
git diff --stat -- rust/crates/vela-core/tests/vectors/i18n-*.json   # expect: no change
```

Standalone `.mjs`, not a `*.dump.test.ts` under the shared jest config, because MODE B
requires `delete Intl.PluralRules` — a process-global mutation that would
non-deterministically corrupt any concurrent suite touching `Intl` (D4). The identicon
dumper is standalone for the analogous reason.

| Suite | `fn`s exercised | Cases | Bytes |
|---|---|---|---|
| `i18n-exhaustive` | `i18n_t` (columnar) | 17,115 | 703,619 |
| `i18n-behaviour` | `i18n_t`, `i18n_t_lng_option` | 210 | 50,770 |
| `i18n-plural` (MODE A) | `i18n_t`, `i18n_plural_suffix`, `i18n_plural_suffixes` | 825 | 182,670 |
| `i18n-plural-legacy` (MODE B) | same | 825 | 193,279 |
| **Total** | | **18,975** | **1,130,338** |

Generator runtime **1.41 s**. Re-runs are byte-identical (0 differing bytes), including
under `TZ=Asia/Shanghai` and `TZ=America/New_York`, because the dumper pins
`process.env.TZ='UTC'` *and asserts the pin took* — a Node that ignored the assignment
would otherwise emit a corpus encoding the dumping machine's timezone.

### Reading a vector diff

`i18n-exhaustive.json` is **columnar** — `{locales, keys, values: {lng: [...]}}` — which
is 703,619 bytes against 1,557,623 for flat triples and 3,785,013 for full `VectorCase`
objects (D4). `JSON.stringify(doc, null, 1)` puts one array element per line, so:

| What the diff looks like | What it means |
|---|---|
| One changed line inside `values.<lng>` | one translated string changed. Expected after a corpus edit |
| The `keys` array changed length, and **every** `values.*` array diffs from that index down | a key was added or removed. Expected only if you added or removed a key |
| An `expect` changed in `i18n-behaviour`/`i18n-plural` with **no** corpus edit | the *oracle* moved — an `i18next` bump. Stop and review; this is the case the check exists for |
| `i18n-plural-legacy` diffs but `i18n-plural` does not | MODE B only. 75 of the 825 cases legitimately differ between modes; a diff in only one of them still needs explaining |

To map a changed line in the columnar file back to a key:

```bash
node -e '
const d = require("./rust/crates/vela-core/tests/vectors/i18n-exhaustive.json");
const [lng, i] = [process.argv[1], Number(process.argv[2])];
console.log(d.keys[i], "->", JSON.stringify(d.values[lng][i]));
' ru 812
```

**Use the 17,115 cross-product, never the 16,817 leaf sum.** 16,817 is the sum of
per-locale leaf counts (en 1,129 + zh 1,129 + ru 1,131 + twelve × 1,119). The 298-case
difference is *exactly* the set of (locale, key) pairs where the key is absent from that
locale — which is precisely the coverage `fallbackLng: 'en'` gets, and it costs nothing
in file size because those cases resolve to an English string already in the file.

## 3. Test (FR-005, FR-008, FR-026)

```bash
cd rust
cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings
cargo test -p vela-core
```

`REQUIRED_SUITES` in `rust/crates/vela-core/tests/conformance.rs:45` goes from 7 to 11.
The array is compared as an exact set, so a vector file lost to a bad merge cannot make
all four surfaces report green over a silently shrunken corpus:

```rust
const REQUIRED_SUITES: [&str; 11] = [
    "abi",
    "eip712",
    "i18n-behaviour",
    "i18n-exhaustive",
    "i18n-plural",
    "i18n-plural-legacy",
    "identicon",
    "identicon-bulk",
    "primitives",
    "safe",
    "webauthn",
];
```

(`i18n-*` sorts before `identicon` — `'1'` is `0x31`, `'d'` is `0x64`.)

The exhaustive suite is 17,115 cases on top of an existing corpus of 7 files. If the
debug run drags, run it in release:

```bash
cargo test -p vela-core --release conformance
```

Properties the corpus cannot express:

```bash
cargo test -p vela-core --release proptest_i18n
```

Asserts: no input panics — malformed keys, empty key arrays, cyclic `$t()` nesting,
non-UTF-8-representable option values (FR-008); output is stable across repeated calls;
every corpus key in every locale resolves to a non-empty string or a documented
fallback (FR-026); and resolution against a **non-resident** locale returns the pinned
`en` value rather than a panic or a partial read (FR-016).

The L10n layer (US5) is unit-tested rather than corpus-driven: `cargo test -p vela-core
l10n` replays every documented `src/services/locale-format.ts` output (4 number, 5 date
and 2 time presets, Indian 2-3 grouping, the trailing-zero rule, the compact K/M/B/T
tiers, `parseLocaleNumber`'s Arabic-Indic digit mapping) plus a CLDR currency matrix
covering the 21 wrong-decimal and 6 wrong-placement cases (SC-010).

## 4. Bench — the SC-007 budgets

```bash
cargo test -p vela-core --release i18n_bench -- --nocapture
```

**Expected output shape**:

```text
catalog lookup (shared path table, binary search):  ~0.021 us/call  [D2 measured 21.1 ns]
t() = lookup + plural + 2 interpolations:           ~0.XX us/call   [budget: < 1.0 us]
allocations per t():                                2               [budget: <= 2]
500-key screen (one language switch):               ~0.XX ms        [budget: < 0.5 ms]
catalog load, ja from JSON bytes:                   ~X.XX ms        [budget: < 5.0 ms]
```

| Budget | Source | Headroom note |
|---|---|---|
| < 1 µs per resolution | SC-007 | lookup itself is 21.1 ns / **0 allocations**, so ~98% of the budget is available to plural selection and interpolation |
| ≤ 2 heap allocations | SC-007 | one for the suffixed candidate key, one for the output string |
| < 0.5 ms per 500-key screen | SC-007 / US6 | one frame at 60 Hz is 16.7 ms; this is the language-switch re-render |
| < 5 ms per catalog load | SC-007 | the on-demand path (FR-015), parsing JSON bytes into an `Owned` catalog |

The allocation count is **asserted**, not printed for eyeballing: the test installs a
counting global allocator, exactly as `rust/crates/vela-core/tests/identicon_bench.rs:23-48`
does. That is the only way "at most two heap allocations" survives refactoring.

Latency budgets are asserted in release only — a debug build carries bounds checks and
no inlining (same guard as `identicon_bench.rs:125`).

Flat memory (SC-009) is structural, not measured: the engine holds no per-key state
(FR-024), so resolving unboundedly many distinct keys cannot grow memory. A test asserts
the module declares no `static mut`, no `OnceLock` and no interior mutability, mirroring
the identicon guard.

Residency (SC-005) is measured directly:

```bash
cargo test -p vela-core --release i18n_residency -- --nocapture
```

| Step | Resident bytes | Budget |
|---|---|---|
| Cold start, `ja` active + `en` pinned | 126,352 (84,388 heap + 41,964 shared) | ≤ 135,345 |
| Same, compiled-in catalogs | 129,306 | ≤ 135,345 |
| Today, `src/i18n/resources.ts` | 990,499 | — |

A `load('de')` **replaces** the active catalog, so residency cannot climb past
`active + en`: `Registry` has one `Option<Catalog>` slot and `en` is a field rather than
a slot, which makes FR-012 and FR-013 type-level guarantees instead of runtime checks.

## 5. Size — the wasm gate (SC-008)

```bash
npm run build:wasm                          # rebuild + commit rust/pkg-web
node rust/scripts/build-web.mjs --check     # what CI runs; compares source hash + ABI
npm run verify:wasm                         # replays the corpus through the artefact
```

`--check` prints `build-web --check: rust/pkg-web is current (wasm N bytes)`. `N` is the
number that matters.

| Configuration | wasm bytes | vs baseline | Verdict |
|---|---|---|---|
| Baseline today | 530,780 | — | shipped |
| **Engine only — default features, zero catalogs** | **535,629** | **+4,849** | **what this feature ships** |
| Engine + `en` | 612,586 | +81,806 | no |
| Engine + `en` + `ru` | 683,660 | +152,880 | no |
| Engine + all 15 locales | 1,315,023 | +784,243 | **315,023 over the gate** |

`MAX_WASM_BYTES = 1_000_000` at `rust/scripts/build-web.mjs:42`; the hard throw is at
`build-web.mjs:208`. The marginal cost per locale after the second is 48,566 bytes, so
at most **8** would fit — leaving less headroom than the engine occupies, and still
shipping the wrong 7 locales to every user. Hence: **the default cargo feature set
compiles in zero locales**, and web fetches `public/i18n/<lng>.json` on demand.

That is also the better answer over the wire, which is the decisive measurement (D3):
15 locales as plain JSON are **176,852** brotli'd bytes against **+235,476** for the best
in-wasm variant, and the base64 wrapper Cloudflare Pages serves costs **+31.4%** on the
currently shipped module all by itself.

## 6. Lint the corpus (FR-018)

```bash
node scripts/lint-i18n-corpus.mjs
```

This does **not** fix anything. It enumerates the D5 defect register so a reviewer can
tell an intentional port artefact from a regression, and it fails CI only on **new**
occurrences — the existing counts are baselined.

| # | Defect class | Scale today | What it renders today |
|---|---|---|---|
| A1 | Keys that exist only in `en` (+`zh`) | 10 keys × 13 locales | silent English leak |
| A2 | Missing CLDR `many` entry | 4 bases × 4 locales = 16 | `"1000000 sends"` in fr/it/es-MX/pt-BR — reproduced live |
| A3 | Dead `_one` where CLDR emits only `other` | 7 locales × 4 = 28 | nothing; the values are byte-identical to `_other` |
| A4 | `contacts.groupMembers` shape differs | `ru` has both a plural set and a plain key | ru correct, the other 14 ungrammatical at count=1 |
| A5 | `{{count}}` with no plural siblings | 11 keys × 15 = 165 | correct, but only via the **bare-key last-resort** candidate |
| A6 | Load-bearing leading/trailing whitespace | 39 values | correct — and any trimming breaks it |

A5 is the one that constrains the resolver: the bare key is reached only *after* the
plural-suffixed lookup misses, because the candidate list is built with `push` and
consumed with `pop`. A port that drops it breaks all 11 keys in all 15 locales.

A6 has no uniform rule to apply — zh/zh-TW/zh-HK deliberately *omit* the spaces that
en/fr/de depend on. **Never trim.** D6 also proved all 240 files are already NFC, so
never normalise either: it is a no-op that can only ever become a diff.

## 7. Add a string / add a language

This loop is the whole point of the feature. Both flows have the same shape: **edit the
corpus, run two generators, run the tests, commit everything together.**

### Add or change a string

```bash
# 1. Edit the corpus — one file per locale, 15 files.
cd rust/crates/vela-core/i18n/locales
$EDITOR en/send.json
$EDITOR {zh,zh-TW,zh-HK,ja,ko,vi,id,tr,es-MX,pt-BR,fr,de,ru,it}/send.json
cd -

# 2. Regenerate every downstream artefact.
node scripts/gen-i18n.mjs
node scripts/dump-vectors/i18n.dump.mjs

# 3. Prove nothing else moved.
node scripts/lint-i18n-corpus.mjs
cd rust && cargo test -p vela-core

# 4. Commit the corpus edit AND the generated files in one commit.
```

If the new key takes a `{{count}}`, add the `_one`/`_few`/`_many`/`_other` siblings the
locale's CLDR category set requires — `[other]` for zh/zh-TW/zh-HK/ja/ko/vi/id,
`[one, other]` for en/de/tr, `[one, many, other]` for fr/it/es-MX/pt-BR,
`[one, few, many, other]` for ru. Omitting one is defect class A2, and the lint will say
so.

### Add a language

```bash
# 1. Create 16 files: <lng>.json plus <lng>/{home,send,receive,assets,addToken,
#    tokenDetail,history,onboarding,connect,about,clearSigning,componentsTx,
#    componentsUi,settingsModals,contacts}.json
mkdir rust/crates/vela-core/i18n/locales/<lng>

# 2. If its CLDR cardinal rule is not one of the five already in
#    rust/crates/vela-core/src/i18n/plural.rs, add the sixth rule body there —
#    the 15 shipped locales collapse to five bodies, 110 lines total.

# 3. Regenerate. This emits src/i18n/paths.rs inside the crate (unchanged unless
#    keys changed), a new i18n_catalogs/<lng>.rs, a new `i18n-<lng>` cargo feature,
#    public/i18n/<lng>.json and the resources.ts entry.
node scripts/gen-i18n.mjs
node scripts/dump-vectors/i18n.dump.mjs
cd rust && cargo test -p vela-core
```

**Zero hand edits to `src/i18n/resources.ts`.** Contrast with today, where adding a
language means writing the same 16 JSON files *and then* hand-editing `resources.ts`
three times over — 16 `import` lines, an 18-line merge block spreading them, and one
entry in the exported `resources` object (`src/i18n/resources.ts:1-8` even documents the
chore: "To add a language: create its files and add it to ALL below"). Every one of
those 35 lines is mechanical, and every one is a place to typo a namespace and silently
drop a screen's worth of strings, because a missing spread is not a type error. After
this feature they are generated and diffed.

The two edits that stay manual are outside the corpus and outside this feature: the
`AppLanguage` union and `SUPPORTED_LANGUAGES` in `src/i18n/index.ts:26-53`.

## 8. Verify parity end to end (SC-003)

The check that matters is not "does it render" but "is it the same bytes as before".

```bash
npm run build:wasm                            # the script drives the SHIPPED artefact
node scripts/verify-i18n-parity.mjs           # cross-product + 200,000 fuzzed calls
node scripts/verify-i18n-parity.mjs 1000000   # a bigger sweep
```

Mirrors `scripts/verify-identicon-parity.mjs` exactly, including the xorshift PRNG so a
run is reproducible:

- **Pass 1** — the full 17,115 (locale, key) cross-product with no options.
- **Pass 2** — fuzzed option bundles: counts from `{-1, 0, 1, 1.5, 2, 5, 21, 101, 1e6,
  1e21, -0, NaN, Infinity}`, contexts, `defaultValue` shapes (including `''`, a
  `$t(...)` nesting and an unbalanced `{{`), and interpolation values spanning string /
  number / boolean / `null` / `NaN` / object / array.

Inputs come from the shared `scripts/dump-vectors/i18n-resources.mjs` helper that the
dumper also imports, so this script and the committed corpus cannot drift apart on
what they feed the oracle. A JS throw counts as a pass only where the corpus records a
divergence entry; anything else is a real parity break.

**Expected: zero divergences.** One difference means a screen renders differently than
it does today — a release blocker, per the spec's Edge Cases, exactly like a changed
avatar in feature 003.

This script cannot run until `vela-core-wasm` exports the i18n surface (plan.md phase
7). Add it to CI next to the identicon parity step at `.github/workflows/ci.yml:73-74`.

The one *intended* difference is SC-004: ten Russian keys change on native builds,
where `Intl.PluralRules` does not exist and i18next silently substitutes an
English-shaped stub. `send.recipientCount` at `count=21` becomes `21 получатель`
instead of `21 получателей`. Enumerate all ten in the PR description with before/after
strings — this must be reviewed, not discovered.

## 9. `package.json` scripts to add

Matching the existing naming (`verify:identicon`, `verify:wasm`,
`gen:identicon-features`):

```json
"gen:i18n": "node scripts/gen-i18n.mjs",
"lint:i18n": "node scripts/lint-i18n-corpus.mjs",
"verify:i18n": "node scripts/verify-i18n-parity.mjs",
```

and extend the existing `dump:vectors` so one command still regenerates the whole
corpus — the CI drift gate at `.github/workflows/ci.yml:57-60` runs `npm run
dump:vectors` and then diffs the entire `tests/vectors` directory, so an i18n dumper
left outside it would let the four new files rot without CI noticing:

```json
"dump:vectors": "jest --ci --config scripts/dump-vectors/jest.config.js --testPathIgnorePatterns '\\.bench\\.test\\.ts$' && node scripts/dump-vectors/identicon.dump.mjs && node scripts/dump-vectors/i18n.dump.mjs",
```

Add the corresponding rows to `rust/README.md`'s command table:

| What | Command |
|---|---|
| Regenerate the i18n artefacts from the corpus | `npm run gen:i18n` |
| Lint the translation corpus (D5 register) | `npm run lint:i18n` |
| i18n parity vs the shipped JS library | `npm run verify:i18n` |

## 10. When something goes red — reading the failure

| Symptom | Almost certainly |
|---|---|
| The wasm module jumps by ~28.5 KB | `&locale[..i]` was reintroduced to take the primary subtag. Range-slicing a `&str` emits a UTF-8 boundary check whose panic path links `core::fmt` — **+28,553 bytes** (D1). Use `locale.split(\|c\| c == '-' \|\| c == '_').next()` |
| The wasm module grows ~2.9 KB after a plural change | an `f64 %` crept back into a rule body. wasm has no `f64.rem`, so every `%` calls `compiler_builtins` `fmod` and drags in `__udivti3`/`__multi3` — **+2,935 bytes**. Carry the operands as `u64` |
| `build-web` throws over the 1,000,000 ceiling | a per-locale `i18n-<lng>` cargo feature leaked into `vela-core-wasm`'s default set. Default is **zero** locales; web loads JSON |
| Only `i18n-plural-legacy` is red | the MODE B `dummyRule` path (`count === 1 ? 'one' : 'other'`). **75 of 825** cases differ from MODE A by design; a green MODE A does not imply a green MODE B |
| Only `count = 1.0005` cases fail, in en/tr/ru/es-MX/it/de | fraction-first operand extraction. `(1.0005 - 1.0) * 1000.0` is `0.49999999999994` → *v*=0, but ICU renders `"1.001"` → *v*=3. **Scale the whole value**: `1.0005 * 1000.0` is exactly `1000.5` (D1) |
| `_zero` cases regress | `needsZeroSuffixLookup` (`node_modules/i18next/dist/esm/i18next.js:602`) adds `_zero` as an **extra** candidate at `count === 0`, tried first because of the `pop()` order. Return the true CLDR category and let the candidate builder add `_zero` **on top**, never in place of it |
| `t('home')` returns `""` or an error instead of the diagnostic | the branch bitmap. A branch node is not an error: emit `key 'home (en)' returned an object instead of string.` byte for byte (`i18next.js:618`) |
| Branch diagnostics work for compiled-in locales but not runtime-loaded ones | the known D2 gap: an `Owned` catalog must carry its **own** branch bitmap rather than reusing the compiled-in one. Must be closed in phase 3 with a vector that exercises a branch node on a runtime-loaded catalog |
| A key resolves to English when the locale is resident | check the resolve hierarchy. Under `load: 'currentOnly'` it is always `[active, "en"]` — `zh-TW` never reads `zh`, so a key present in `zh` but missing from `zh-TW` **is** supposed to come back English |
| A key resolves to English when the locale is *not* resident | working as designed (FR-016): resolution falls through to the pinned `en` catalog. Never a panic, never a partial read. If you expected the locale to be there, the host forgot to `await` its catalog load — a mid-flight language switch is reachable by construction with on-demand loading |
| Eleven `{{count}}` keys per locale return the raw key | the bare-key **last-resort** candidate was dropped. It is reached only after the plural-suffixed lookup misses (D5/A5) |
| A rendered string lost a leading or trailing space | something trimmed. 39 corpus values are sentence fragments whose whitespace is concatenated at render time, and zh/zh-TW/zh-HK deliberately omit it — there is no uniform rule to apply (D6) |
| Every `Date`-interpolation vector diffs | the dumper ran without its `TZ='UTC'` pin, or on a small-icu Node. Both are asserted at the top of `i18n.dump.mjs`; if the assertion did not fire, the assertion is what broke |
| The whole `i18n-exhaustive.json` diffs from one line down | the `keys` array changed length. Fine if you added or removed a key; **stop** if you did not |

**A red conformance case is a release blocker, not a flaky test.** These vectors were
computed from the real `i18next@26.3.1` over the real corpus — the same rule the
identicon and Safe-address suites already carry. A byte divergence is a screen that
renders differently from what users read today before they authorise an irreversible
transaction. Do not proceed, do not `--ignored` it, and do not regenerate the vectors to
make the diff go away: regenerating is only correct when the *oracle* or the *corpus*
changed, and both of those are commits you can point at.

## Open questions for `/speckit.tasks`

1. ~~**The per-locale JSON asset path is not fixed.**~~ **Settled in Phase 5
   (research.md D9).** `public/i18n/<lng>.json`, served at `/i18n/<lng>.json`. The
   first answer — `assets/i18n/` — was wrong: that is Metro's bundler-resolved tree
   under content-hashed filenames, so nothing can fetch it at a stable URL.
   `public/zbar.wasm` is the working precedent. `fix-cf-pages-assets.js` rewrites only
   `assets/node_modules/`, so `dist/i18n/` passes through untouched — verified, not
   assumed.
2. **No l10n vector suite is registered.** plan.md lists four i18n vector files and
   `REQUIRED_SUITES` grows 7→11, so the SC-010 `locale-format.ts` parity matrix and the
   CLDR currency matrix are unit tests rather than corpus rows. If they should be
   replayed on Kotlin/Swift/wasm like everything else, a fifth file and a 12th suite
   entry are needed.
