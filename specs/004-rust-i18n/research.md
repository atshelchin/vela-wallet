# Phase 0 Research: i18n / L10n in the shared Rust core

**Feature**: [spec.md](./spec.md) · **Branch**: `004-rust-i18n` · **Date**: 2026-07-31

Every decision below was settled by building the thing and measuring it, not by
reasoning about it. Prototypes live in the session scratchpad and are listed per
decision; the ones that become deliverables are named in [plan.md](./plan.md).

All measurements were independently re-derived by a second pass. Where the re-run
disagreed, the corrected number is the one recorded here and the discrepancy is
noted.

---

## Pin table

Copy these verbatim. Never improvise a version.

| Thing | Pin | Why |
|---|---|---|
| Behavioural oracle | `i18next@26.3.1` | Exactly what `package-lock.json` resolves today |
| Oracle mode | **MODE A** — full `Intl.PluralRules` | CLDR-correct; what web + Jest already produce |
| React binding (untouched) | `react-i18next@17.0.8` | Not migrated this feature (FR-028) |
| Rust | 1.97.1, edition 2021, MSRV 1.85 | `rust/rust-toolchain.toml` |
| New runtime dependencies | **none** | D1 and D2 both came out against every candidate |
| wasm ceiling | `MAX_WASM_BYTES = 1_000_000` | `rust/scripts/build-web.mjs:42` |
| wasm baseline | 530,780 bytes | `node rust/scripts/build-web.mjs --check` |
| Corpus | 240 files, 1,141 leaf paths, 64 branch paths | re-derived twice |
| Corpus leaves | 16,817 as measured; **16,833** after FR-017 added 16 CLDR `many` forms | D5 |

---

## D1 — CLDR plural rules: hand-written, no dependency

**Decision**: a hand-written `match` over **5 rule bodies**. No crate.

The 15 shipped locales collapse to exactly five distinct CLDR cardinal rules:

| Rule body | Locales | Categories |
|---|---|---|
| other-only | zh, zh-TW, zh-HK, ja, ko, vi, id | `[other]` |
| germanic | en, de, tr | `[one, other]` |
| romance, `one` = *i*=1 | it, es-MX | `[one, many, other]` |
| romance, `one` = *i*∈0..1 | fr, pt-BR | `[one, many, other]` |
| slavic | ru | `[one, few, many, other]` |

Note there are only **four** distinct category *sets*; the fifth body exists because
it/es-MX and fr/pt-BR disagree at count 0 (`other` vs `one`).

**Measurements**

| What | Value |
|---|---|
| Code size | 110 non-blank, non-comment lines |
| wasm cost | **1,204 bytes** (module 530,780 → 531,984) — 0.257% of headroom |
| Native `__text` / `__const` | 952 B / 100 B |
| Cross-validation vs node full-ICU oracle | **182,790 / 182,790 agreements, 0 disagreements** |
| Coverage | all 29 reachable (locale, category) pairs |

The oracle set was 15,810 primary cases (0..1000 plus 53 fractional/negative/large
values per locale) and 166,980 fuzz cases (random 1–4 dp decimals, random integers to
1e9, negatives, million boundaries, decimal midpoints).

**Rejected**

- **`icu_plurals` (ICU4X 2.2.0)** — measured **57,960 wasm bytes**, 48× the
  hand-written table and 12.35% of the entire headroom, plus 33 new `Cargo.lock`
  entries. Decisively, it does not remove the hard part: `PluralOperands` has no
  `From<f64>` (only `i128`/`u128`/`&Decimal`; `category_for(c: f64)` fails to compile
  with E0277), so the f64→operands bridge still has to be hand-written, *and* a
  data-provider story is added on top.
- **f64 arithmetic for the rule modulos** — costs **2,935 wasm bytes** for nothing:
  wasm has no `f64.rem` instruction, so every `%` calls `compiler_builtins` `fmod`,
  dragging in `__udivti3`/`__multi3` u128 division. Carrying operands as `u64` took
  the stripped module from 4,230 → 1,295 bytes with identical results.
- **`&locale[..i]` to extract the primary subtag** — costs **28,553 wasm bytes**
  (33,646 → 5,093 unstripped). Range-slicing a `&str` emits a UTF-8 boundary check
  whose failure path links `core::fmt` and the panic formatter into the module. Use
  `locale.split(|c| c == '-' || c == '_').next()`.
- **Fraction-first operand extraction** (`i = n.trunc()`, then round `(n - i) * 1000`)
  — measured **6 disagreements** out of 15,810, all at `count = 1.0005` in
  en/tr/ru/es-MX/it/de. `(1.0005 - 1.0) * 1000.0` is `0.49999999999994` and rounds
  down to *v*=0, while ICU renders `"1.001"` (*v*=3). **Scale the whole value**:
  `1.0005 * 1000.0` is exactly `1000.5`, rounds half-away-from-zero, and matches.
- **Deriving *v* by formatting through `ryu-js`** — unnecessary once measured. The
  pure-arithmetic path reproduces ICU at every midpoint tested, with zero string
  formatting.
- **Porting the CLDR ordinal tables** — measured as dead code: `ordinal` has **0
  occurrences** in `src/` and 0 repo-wide outside `node_modules`. **Overturned in D8**:
  the option is still reachable through the public surface, the corpus pins 12 ordinal
  cases, and only four of the fifteen locales have a non-trivial ordinal rule. They are
  ported.
- **Emitting a CLDR `zero` category** — none of the 15 locales has one, and there are
  0 `_zero` keys in the corpus.

**Two facts the implementation must not lose**

1. **`v` is a property of the rendered string, not the number.** `Intl` renders with
   `maximumFractionDigits: 3` and `roundingMode: halfExpand`. The scale-the-whole-value
   trick above is how that gets reproduced in integer arithmetic.
2. **i18next's `_zero` is not CLDR.** `needsZeroSuffixLookup` at
   `node_modules/i18next/dist/esm/i18next.js:602` adds `_zero` as an *extra* candidate
   when `count === 0 && !ordinal`, tried *first* because of the `pop()` order. The
   engine must return the true CLDR category (`other` for en/de/tr/it/es-MX, `one`
   for fr/pt-BR, `many` for ru) and let the candidate builder add `_zero` on top —
   never in place of it.

**Documented divergence**: exact for `|count| < 1e18`. At or above 1e18 ICU switches
to a scientific representation (*i*=1, *e*=18) and returns `other` for it / `one` for
fr, where the literal CLDR rule text computes `many`. `5e17` still agrees. No wallet
count reaches 1e18; recorded rather than fixed.

---

## D2 — Catalog representation: shared path table + per-locale value blob

**Decision**: two parts.

- **Shared, compiled in once for all locales**: `PATHS: &[&'static str]` holding the
  **1,205 sorted paths** (1,141 leaf + 64 branch, proved identical in every locale)
  plus a 151-byte branch bitmap. Key bytes are the whole problem — repeated per
  locale they cost **460,471 bytes**; interned once, **31,198** (32,173 with
  branches). A 14.8× collapse.
- **Per locale, loaded on demand**: a concatenated value blob, a dense offset array
  indexed by path id, and a 151-byte presence bitmap. Supplied either as `&'static`
  behind a per-locale cargo feature (FR-014) or built on the heap from host JSON
  (FR-015), behind one `enum Values { Static {..}, Owned(..) }` so the resolver has a
  single code path and release is a plain `Drop`.

**Measurements** (SC-005 budget for `ja` + `en` is 135,345 bytes)

| Representation | ja+en resident | Hot lookup | Allocs/lookup | Verdict |
|---|---|---|---|---|
| **Recommended hybrid, compiled in** | **129,306** (wasm, measured) | **21.1 ns** | **0** | PASSES |
| **Recommended hybrid, runtime from JSON** | **126,352** (84,388 heap + 41,964 shared) | 21.1 ns | 0 | PASSES |
| Flat sorted `&[(&str,&str)]` | 138,309 | 21.3 ns | 0 | FAILS by 2,964 |
| `phf` perfect hash | 142,860 | 14.0 ns | 0 | FAILS; +18 crates |
| Runtime flat `HashMap<Box<str>,Box<str>>` | 271,191 | 12.7 ns | 0 | FAILS (2×) |
| `serde_json` `Value` tree + faithful `deepFind` | 348,649 | 208.9 ns | **4** | FAILS (2.6×) |

Cross-validation: **0 mismatches** over 1,129 en leaf paths × 10 representations, and
0 over the 64 branch paths × 10.

On 64-bit native the recommended table totals 135,992 — 647 bytes over — so the
generator emits **u16 value offsets** (every locale's value blob is under 64 KiB;
the largest, ru, is 57,701), giving 131,168 on every pointer width.

**Flattening is behaviour-preserving for this corpus, and it was proved against
i18next itself, not assumed**: 1,129/1,129 en leaves resolve to the flattened value;
**0 literal-dot keys** exist across all 240 files; **0 paths are both leaf and
branch**; the key charset's minimum byte is `0x30` (`'0'`), above the `0x2E` (`.`)
separator, so sort order is well-defined. For inputs *outside* the corpus the
flattener must still apply i18next's `deepFind` precedence (shortest defined prefix
wins — verified: a nested `zz.yy.xx` beats a flat `"yy.xx"` child).

**Branch nodes stay first-class entries** in the shared table so `t("home")` returns
`Lookup::Branch` and the caller emits the byte-exact diagnostic
`key 'home (en)' returned an object instead of string.`
(source: `node_modules/i18next/dist/esm/i18next.js:618`; the Rust helper's output was
compared against the live oracle).

**Known gap to close during implementation**: an `Owned` (runtime-parsed) catalog must
carry its **own** branch bitmap rather than reusing the compiled-in one. The prototype
does not yet do this.

**Rejected**

- **`phf`** — fastest (14.0 ns) but the *largest* artefact (787,645 wasm bytes for all
  15, 6,591 above a plain sorted array), 18 transitive crates (`syn`, `quote`, `rand`,
  `siphasher`…), and 3.04 s cold build vs 0.31 s.
- **A hash-only shared key table** (sorted u64 hashes, no key text, no verification) —
  would have been smallest and fastest, but rejected on **correctness**: the spec
  documents dApp-supplied text (`tx.intent`) reaching `t()` as a key, so an unverified
  hash hit lets attacker-chosen input resolve to an arbitrary catalog string. The
  32,173-byte key blob is the price of never returning a wrong translation.
- **Dropping the branch table** in favour of a sorted-successor prefix probe — correct
  and free for a single per-locale table (29.0 ns), but incompatible with a *shared*
  key table: a branch must be reported even when the active locale lacks the child
  key, which a per-locale probe cannot see. The 151-byte bitmap costs 0.1% of budget
  and makes it O(1).
- **Runtime-flattened blob with full dotted keys on the heap** (the naive FR-015 path)
  — 171,975 bytes for ja+en, 36,630 over budget, because the flattened paths are
  re-materialised per catalog. Interning runtime keys against the compiled-in shared
  table drops the same catalog to 84,388.

---

## D3 — Where catalogs live per platform: **web loads JSON at runtime**

This is the decision the whole architecture turns on, and the measurement inverted the
obvious answer.

**Decision**:

| Surface | Engine | Catalogs |
|---|---|---|
| **web (wasm)** | compiled in | **runtime JSON, fetched per locale on demand** |
| **iOS / Android (uniffi)** | compiled in | per-locale cargo feature, or runtime JSON |
| **desktop (direct Rust dep)** | compiled in | per-locale cargo feature |
| **default cargo feature set** | engine + shared path table | **zero locales** |

**Measurements — the engine is nearly free; catalogs are the entire cost**

| Configuration | wasm bytes | vs baseline |
|---|---|---|
| Baseline (today) | 530,780 | — |
| Engine only (scanner + plural fn + lookup) | 535,629 | **+4,849** |
| Engine + 1 locale (en) | 612,586 | +81,806 |
| Engine + 2 locales (en + ru) | 683,660 | +152,880 |
| **Engine + all 15 locales** | **1,315,023** | +784,243 — **315,023 OVER the gate** |

Marginal cost after the second locale is **48,566 bytes**, so at most **8** locales
fit under the ceiling — leaving ~25 KB, less than the engine itself. Not a budget.

The data-expansion ratio is actually *better* than the identicon precedent — 779,394
wasm bytes for 995,560 bytes of key+value UTF-8 = **0.78×**, against identicon's
115,005/82,955 = 1.39× — because LLVM dedupes the identical 30,642-byte key set across
all 15 locales. The problem is absolute volume, not efficiency. (16,817 entries × 16
bytes of fat-pointer pairs = 269,072 bytes, 34.5% of the catalog cost, is itself
irreducible below ~200 KB.)

**The decisive number is over the wire.** Cloudflare Pages serves the base64-wrapped
module, and base64 is a strict loss for text:

| Shipped as | Raw | Brotli q11 |
|---|---|---|
| 15 locales as plain JSON | 990,499 | **176,852** |
| Best in-wasm variant (lz4 blob) | — | +235,476 |
| `en` alone as JSON | 59,737 | **15,353** |
| `en` alone compiled into wasm | — | +31,862 |

Embedding is **1.33× worse over the wire for all 15**, and **2.08× worse for one**.
The base64 wrapper alone costs **+57,273 brotli'd bytes (+31.4%)** on the *currently
shipped* module — a tax every embedded byte of text pays.

**Rejected**

- **Compile all 15 in** — 315,023 over the gate; `build-web.mjs:208` hard-throws.
- **Compile 3–8 in by default** — arithmetically possible up to 8, but leaves less
  headroom than the engine occupies, and still ships the wrong 7 locales to every
  user.
- **Brotli blob inside the wasm** — the decompressor plus its 122 KB static dictionary
  measures **166,763 bytes**, 2.2× the entire cost of shipping the `en` catalog
  uncompressed. It *loses* to plain tables below ~4 locales and, at 15, produces a
  larger module (852,547) than lz4 (824,394) despite a blob half the size.
- **LZ4 blob inside the wasm** — best in-wasm option (824,394 total, 4,207-byte
  decompressor) and it fits the gate, but still costs +253,015 brotli'd bytes over the
  wire versus 176,852 for the JSON: the blob is already entropy-reduced, base64
  inflates it 4/3, and brotli recovers only part of that.

**Measured after implementation (SC-008).** The projection above said the engine
would cost ~4,849 wasm bytes and the catalogs would be the entire problem. Built:

| | bytes | delta |
|---|---|---|
| Pre-feature baseline | 530,780 | — |
| Engine present but unreachable (Phases 3–6) | 531,431 | +651 |
| **Engine EXPORTED and reachable (Phase 7)** | **651,413** | **+120,633** |
| Ceiling (`build-web.mjs:42`) | 1,000,000 | **348,587 headroom** |

**The projection was wrong, and by a lot: +4,849 against a measured +120,633.**
Worth recording plainly rather than quietly restating.

D3's figure came from a *minimal* prototype — a hand-rolled `{{…}}` scanner, the
plural function, and a binary-search lookup. The shipped engine additionally links:

- **`serde_json`**, for `Catalog::from_json` (FR-015) and the `#[serde(flatten)]`
  option DTO. This is the bulk of it. It was never in the prototype because the
  prototype had no runtime-JSON path — the very feature D3's own conclusion made
  central.
- **The shared path table** — 1,205 paths, 32,173 bytes of key text plus the
  pointer array, ~42 KB. Unconditional: it is what per-locale value blobs index into.
- The full resolver, `l10n`, and the generated 518-byte datetime table.

The conclusion survives intact, because it never rested on the engine being small —
it rested on *catalogs* being large. All 15 compiled in was 1,315,023 against a
1,000,000 ceiling, and that number is unchanged. At 651,413 the engine plus a
runtime-JSON catalog route fits with 348,587 bytes to spare, where engine-plus-two
compiled-in locales would not have.

The lesson for the next prototype-derived estimate: a prototype that omits the
dependency the design depends on measures the wrong thing.

**Why this is the right answer and not a retreat**: the requirement was *on-demand
loading* (FR-012, US4). Runtime JSON is the only option that delivers it fully — a
Japanese user fetches 15 KB of `ja`, not a 15-locale blob. Compiled-in catalogs are
kept for the platforms where there is no wire (desktop, native) and no cost to paying
up front. The single source of truth is preserved by the generator (FR-010), not by
the linker.

**Discrepancy noted**: the JSON brotli figure is concatenation-order sensitive
(176,852 / 177,546 / 177,615 / 178,878 depending on order). The re-derived 176,852 is
recorded; conclusions are unaffected. Separately, the "engine + en, hybrid" wasm figure
is **609,564** (530,780 + 78,784), not the 604,804 first reported — that was the dense
variant.

---

## D4 — Conformance corpus: four suites, columnar exhaustive encoding

**Decision**: one standalone `scripts/dump-vectors/i18n.dump.mjs` emitting four suites.
Standalone `.mjs`, **not** a `*.dump.test.ts` under the shared jest config, because
MODE B requires `delete Intl.PluralRules` — a process-global mutation that would
non-deterministically corrupt any concurrent suite touching `Intl`. (The identicon
precedent already established standalone `.mjs` for an analogous reason.)

**Measurements**

| Suite | Cases | File | Bytes |
|---|---|---|---|
| (a) exhaustive, columnar | **17,115** | `i18n-exhaustive.json` | 703,619 |
| (b) behaviour + language normalisation | 210 | `i18n-behaviour.json` | 50,770 |
| (c) plural MODE A | 825 | `i18n-plural.json` | 182,670 |
| (d) plural MODE B | 825 | `i18n-plural-legacy.json` | 193,279 |
| **Total** | **18,975** | | **1,130,338** |

For comparison, the existing 7-file corpus is 2,826,938 bytes. Generator runtime:
**1.41 s**. Re-runs are **byte-identical** (0 differing bytes), and byte-identical
under `TZ=Asia/Shanghai` and `TZ=America/New_York` because the dumper self-pins
`process.env.TZ='UTC'` and asserts the pin took.

**Use the 17,115 cross-product, not the per-locale leaf sum.** That sum (16,817 when
measured, 16,833 after FR-017) is the sum of per-locale leaf counts (en 1129 + zh 1129 + ru 1131 + twelve × 1119). Restricting to it drops exactly
the 298 (locale, key) pairs where the key is absent from that locale — which is
*precisely* the set that exercises `fallbackLng: 'en'`. Those cases cost nothing extra
in file size (the missing keys resolve to the en string, already present) and are the
only coverage the fallback branch gets.

**Columnar encoding** (`{locales, keys, values: {lng: [...]}}`) is 703,619 bytes
against 1,557,623 for flat `[lng, key, value]` triples (**2.21×**) and 3,785,013 for
full `VectorCase` objects (**5.38×** — larger than the entire existing corpus).
`JSON.stringify(doc, null, 1)` puts every array element on its own line, so each triple
costs five lines of framing and re-serialises the 1,141 key strings 15 times.

**MODE B is not redundant**: **75 of 825** plural cases differ. zh/zh-TW/zh-HK/ja/ko/
vi/id all gain a spurious `_one` category and select it at count=1; tr/es-MX/pt-BR/fr/
ru/it lose their `_few`/`_many` categories.

**Oracle anomalies found and encoded**

- **2 throws**: `t([])` → `TypeError: Cannot read properties of undefined (reading
  'includes')`; `t(key, {count: 5n})` → `TypeError: Cannot convert a BigInt value to a
  number`.
- **5 non-string returns**: `defaultValue: 42` → number; `defaultValue: true` →
  boolean; `{returnObjects: true}` on a branch node → object; `{returnDetails: true}`
  → object; `{defaultValue: ['a','b'], joinArrays: '-'}` → array.
- **0** non-string or throwing results inside the 17,115-case exhaustive suite — every
  no-option resolution of every key in every locale is a plain string.
- 10 divergence entries and 5 error expectations, all hand-written and oracle-verified.
  The dumper **hard-fails** if any anomaly lacks a divergence entry.

**Two path-sensitivity findings the suite design depends on**

1. **`changeLanguage(lng)` + `t(key)` and `t(key, {lng})` are different functions.**
   `t('language.title', {lng: 'zh_TW'})` returns English while `init({lng: 'zh_TW'})`
   returns Simplified Chinese; same for `zh-Hant`, `zh-Hant-TW`, `es-AR`. The app calls
   `changeLanguage()`, so the exhaustive suite must use that path. The per-call path is
   pinned separately as `i18n_t_lng_option` precisely *because* it is a different
   function.
2. **`Date` and function values in interpolation are unrepresentable in Rust.**
   `Date.prototype.toString()` reads the ambient timezone; `Function.prototype
   .toString()` splices callback source into the UI string. Kept in the corpus under a
   tagged encoding (`{"__t":"date"|"fn"}`) with explicit divergence entries.

**Throw encoding follows `writer.ts`**: `expect` is exactly `{error: <CoreErrorCode>}`
and the raw `TypeError` text lives in `divergence.ts_behavior`. A stray `ts_throw` key
would make the case unrunnable, because `conformance.rs`'s `check_object` iterates
every non-`error` key of the expectation and demands a matching field on the result.

---

## D5 — What the corpus already gets wrong (reproduce, lint, and fix exactly one)

Enumerated here so FR-018's "reproduce exactly" has a definition, and so a reviewer can
tell an intentional port artefact from a regression.

**A2 is the exception, and it is a blocker rather than a nice-to-have.** Because MODE A
selects `many` where the shipped native build selects `other`, adopting this engine
*without* filling the 16 gaps would replace 16 correct localised strings with English.
Measured over the 5 plural base keys × 15 locales × 9 counts (675 resolutions), MODE A
and MODE B differ in **42** cases — ru 18, pt-BR 8, fr 8, es-MX 4, it 4 — and 16 of the
non-Russian 24 are precisely this regression, e.g. es-MX `contacts.sends` at
count = 1,000,000 going from `1000000 envíos` to `1000000 sends`. FR-017 therefore pulls
A2 **into** scope; the correct `many` wording for all 16 is identical to the existing
`_other` value, so the change is mechanical.

| # | Defect | Scale | Rendered effect today | Scope |
|---|---|---|---|---|
| A1 | 10 keys exist only in en (+zh) | 13 locales | Silent English leak | out (FR-018) |
| A2 | Missing CLDR `many` | 4 bases × 4 locales = 16 | `1000000 sends` in fr/it/es-MX/pt-BR | **in (FR-017)** |
| A3 | Dead `_one` where CLDR emits only `other` | 7 locales × 4 = 28 | None — values are byte-identical to `_other` | out (FR-018) |
| A4 | `contacts.groupMembers` shape differs | ru has both plural set and plain key | ru correct, other 14 ungrammatical at count=1 | out (FR-018) |
| A5 | `{{count}}` with no plural siblings | 11 keys × 15 = 165 | Relies on the bare-key last-resort candidate | out (FR-018) |
| A6 | Load-bearing leading/trailing whitespace | 39 values | Correct — but any trimming breaks it | n/a — correct today |

A2 was reproduced live: `t('contacts.sends', {count: 1000000})` returns
`"1000000 sends"` in fr, es-MX, pt-BR and it. A5 matters to the resolver design: the
bare key is a **last-resort** candidate reached only after the plural-suffixed lookup
misses, so a port that omits it breaks all 11 keys in all 15 locales.

---

## D6 — Corpus hygiene: provably clean, so ingest it verbatim

Checked with a raw JSON tokenizer (not `JSON.parse`, which hides duplicate keys), with
positive controls on every detector.

**Provably clean**: 0 duplicate JSON keys at any depth in any of the 240 files; 0
top-level spread collisions (16,817 pre-merge == 16,817 post-merge, so no subtree is
dropped); 0 interpolation variable-set differences between en and any locale; 0 stray,
unbalanced, empty or tripled brace pairs; 0 `$t(` in any value; 0 non-string leaves; 0
BOM / CRLF / bare CR / tabs; 0 lone surrogates; **all 240 files are already NFC**; 0
files lacking exactly one trailing newline; 0 empty-string values; 0 case-only key
collisions; 0 HTML markup or entities. Only two JSON escapes appear: `\n` (255) and
`\"` (28). Longest value 439 chars.

This is why FR-009's "byte-for-byte unchanged" is achievable rather than aspirational.
The two live constraints for the loader are: **never trim** (39 values depend on
whitespace, and zh/zh-TW/zh-HK deliberately *omit* it, so no uniform rule applies), and
**never normalise** (already NFC; re-normalising is a no-op that risks becoming a
diff).

---

## D7 — RN integration: not this feature

Recorded because it was researched and the answer shapes what *not* to build.

`react-i18next`'s value is the **subscription**, not the lookup. `useTranslation()`
subscribes 89 components to the `languageChanged` emitter. A Rust `t()` is a plain
function call with no emitter, so replacing the resolver without replacing the
subscription would leave components rendering stale strings — and the only remaining
refresh path would be the `Stack` key remount at `src/app/_layout.tsx:107`, which
`src/i18n/language.tsx:5-8` documents as redundant belt-and-suspenders. Making it
load-bearing turns every language switch into a full-tree unmount, destroying in-flight
send-flow state.

Measured FFI cost, for the record: the shipped wasm does 0.605 µs per string-returning
round trip against 0.00436 µs for i18next's JS object lookup — **~140×**. At ~500
mounted `t()` calls that is ~0.25 ms, not a frame drop, so cost is not the blocker.
The blocker is the subscription and the `i18next.d.ts` key typing.

**Decision**: FR-028 — the app keeps `react-i18next` and consumes only the *generated*
resources. This mirrors how feature 003 landed (`specs/003-rust-identicon/spec.md:8-14`
records shell adoption as follow-up), and it is what makes US3 shippable independently
of any runtime migration.

---

## D8 — Ordinal rules: port them

Recorded because D1 and the Phase 1 contracts reached opposite conclusions and the
disagreement must not survive into implementation.

D1 measured that `ordinal` has **0 occurrences** in `src/` and recommended treating the
CLDR ordinal tables as dead code. The behaviour-suite dumper, meanwhile, probed
ordinals anyway and pinned **12 cases** with plain-string expectations, because
`Options::ordinal` is reachable through the public surface even though no app call site
uses it today.

**Decision: port the ordinal rules.** The spec's Assumptions already commit to
including "behaviours the app does not use but that are cheap and observable … because
the conformance corpus can prove them", and ordinals are exactly that class. Concretely:
of the 15 shipped locales only `en` has a non-trivial ordinal rule (one/two/few/other);
`it` has two/many/other, `fr` and `vi` have one/other, and the remaining eleven are
`other`-only — a handful of lines beside the 110 the cardinal table already costs.
Re-encoding the 12 vectors as divergences would cost roughly the same effort and would
leave the "100% faithful" claim carrying a caveat for no gain.

Two constraints carry forward:

- The ordinal path pushes **two** candidates, `key_ordinal_<cat>` **and** the
  de-prefixed `key_<cat>` (`i18next.js:832-833`). Both must be emitted, in that order.
- The size cost is **unmeasured**. It must be measured against the wasm gate in the
  same run that measures the day-period and weekday tables, before SC-008 is asserted.
  If ordinals plus the datetime tables materially eat the 464,371-byte headroom, that
  is a design escalation, not something a later phase absorbs quietly.

## D9 — Where per-locale JSON assets are served from

**Decision**: `public/i18n/<lng>.json`, which the Expo web export copies to
`dist/i18n/<lng>.json` and serves at `/i18n/<lng>.json`.

**This overturns the first version of D9**, which named `assets/i18n/<lng>.json`.
That was wrong, and the error is worth recording because it looks right: `assets/`
*is* the export's asset root, but it is **Metro's bundler-resolved tree** — entries
land there only by being `require()`d, under content-hashed filenames. Nothing can
`fetch('/assets/i18n/ja.json')` at a stable URL, which is the one thing the runtime
loading path needs.

Verified empirically rather than reasoned about: every one of the five files in
`public/` appears at `dist/` root after an export, and `public/zbar.wasm` is the
exact precedent — a runtime-fetched binary, served by URL, living in `public/`.

The earlier objection to `public/` — that it holds hand-authored files and nothing
generated — is real but minor, and is answered by the CI drift gate: the generated
locale JSON is regenerated and diffed on every run, so it cannot rot the way an
unwatched committed artefact could.

**`scripts/fix-cf-pages-assets.js` needs no change, and this was checked rather than
assumed.** It rewrites exactly one prefix, `assets/node_modules/` → `assets/vendor/`
(`:19-22`), because Cloudflare Pages drops any directory named `node_modules`.
`dist/i18n/` matches nothing it touches and passes through untouched. That mattered
enough to verify: a silent fallback to `index.html` would serve HTML where the loader
expects JSON — the precise failure that script exists to fix.

The CI drift gate covers `public/i18n/` alongside `paths.rs`, the catalogs and
`resources.ts`. A stale asset is a wrong translation shipped to production.

## Open questions

1. **Which platform adopts the engine first?** `app-desktop` is a direct Rust
   dependency and has no FFI or bundle constraints, so it is the cheapest proving
   ground. Not scheduled here.
2. **The `$t()` nesting sink.** `tx.intent` — dApp-supplied text — reaches `t()` as a
   *key* at `TransactionDetailSheet.tsx:320`. No corpus value uses `$t(`, so nesting's
   only live consumer is untrusted input. FR-003 ports it faithfully for parity; the
   call-site fix (never pass untrusted text as a key) is a separate change and should
   be filed as a security finding independent of this feature.
3. **Whether `home.rescan*` and `.verify-rescan*.mjs` are dead.** The rescan keys have
   zero call sites in `src/` and neither script is wired to a package.json script.
   Confirm and delete, or restore — but not in this feature.
