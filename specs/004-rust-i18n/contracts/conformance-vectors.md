# Contract: i18n conformance corpus

**Date**: 2026-07-31 · Location: `rust/crates/vela-core/tests/vectors/i18n-*.json`
(four files, committed). Produced by `scripts/dump-vectors/i18n.dump.mjs`, which
drives the **installed `i18next@26.3.1`** over the **real 15-locale corpus** as the
behavioural oracle. Consumed by `vela-core/tests/conformance.rs` and replayed
unchanged on Kotlin, Swift and wasm — that replay is how SC-002's cross-platform
byte-identity is checked.

This file extends, and does not replace,
[001's corpus contract](../../001-rust-core-bindings/contracts/conformance-vectors.md)
and [003's](../../003-rust-identicon/contracts/conformance-vectors.md); the
`{name, fn, input, expect, divergence?}` case schema, the mandatory
`divergence.ts_behavior` field, the writer convention and the regeneration policy are
all inherited. Two things are new: a **columnar** file schema for the exhaustive
suite (§3), and a **tagged value encoding** for option values JSON cannot express
(§6).

## 1. Suite registration

`conformance.rs` asserts an exact set of suite files so a corpus lost to a bad merge
cannot make all four surfaces report green over a silently shrunken corpus. This
feature adds four entries, taking the pin from 7 to 11
(`rust/crates/vela-core/tests/conformance.rs:45-53`):

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

The same list is mirrored in `rust/scripts/verify-web.mjs:132-146`,
`rust/harness/kotlin/Harness.kt:209-210` and `rust/harness/swift/main.swift:289`.
All four must be updated together; a surface left at 7 would parse the new files, add
their suite names to `seenSuites`, and then fail the set assertion — which is the
intended, loud outcome.

## 2. Suite inventory

| # | Suite | File | Schema | Cases | Bytes |
|---|---|---|---|---|---|
| (a) | exhaustive cross-product | `i18n-exhaustive.json` | **columnar** | **17,115** | 703,619 |
| (b) | behaviour + language normalisation | `i18n-behaviour.json` | `cases` | 210 | 50,770 |
| (c) | plural, MODE A (CLDR) | `i18n-plural.json` | `cases` | 825 | 182,670 |
| (d) | plural, MODE B (legacy) | `i18n-plural-legacy.json` | `cases` | 825 | 193,279 |
| | **Total** | | | **18,975** | **1,130,338** |

For scale: the existing seven-file corpus is 2,826,938 bytes, so i18n adds 40.0% to
the committed vector volume while adding 18,975 cases. Generator runtime is
**1.41 s** (research D4).

Suite (b) decomposes as 159 behaviour cases plus 51 language-normalisation cases
(17 language codes × 3 resolution paths). Suites (c) and (d) are each
15 locales × (1 `suffixes` case + 9 counts × (1 `suffix` case + 5 plural bases)) =
15 × 55 = 825.

The five plural bases are the app's own keys, discovered by scanning the key
inventory for the six CLDR suffixes rather than hardcoded
(`i18n.dump.mjs:102-107`): `contacts.groupMembers`, `contacts.sends`,
`send.batchApply`, `send.batchRejected`, `send.recipientCount`. The nine counts are
`{0, 1, 2, 3, 5, 11, 21, 101, 1000000}` — chosen so every reachable CLDR category of
every shipped locale is selected at least once, including Russian `few` (2, 3, 21)
and `many` (0, 5, 11, 101, 1000000).

## 3. The columnar schema (suite a)

The exhaustive suite is **not** a `cases` array and **not** the `pairs` array that
`identicon-bulk.json` uses. It is three parallel structures:

```json
{
 "suite": "i18n-exhaustive",
 "source": "scripts/dump-vectors/i18n.dump.mjs (i18next@26.3.1 + src/i18n resources)",
 "locales": ["en", "zh", "zh-TW", "zh-HK", "ja", "ko", "vi", "id", "tr",
             "es-MX", "pt-BR", "fr", "de", "ru", "it"],
 "keys": ["about.footer", "about.linkGitHub", "…", "tokenDetail.viewOnExplorer"],
 "values": {
  "en": ["Built with care. Your keys, your coins.", "GitHub", "…"],
  "zh": ["…"],
  "it": ["…"]
 }
}
```

- `locales` is the 15 shipped codes **in `src/i18n/resources.ts` order**, not sorted.
- `keys` is the 1,141-path union over all 15 locales, **sorted** (`i18n.dump.mjs:100`).
- `values[lng]` is index-aligned with `keys` and is always exactly `keys.length` long.
  Verified: all 15 columns are 1,141 entries.
- Every cell is a **plain string** — there is no `expect` wrapper, no `fn`, no
  per-case `name`. The dumper proves this is safe: it counts every non-string and
  every throwing result over the whole cross-product and reports **0**
  (`i18n.dump.mjs:169-190`). Any future key that resolved to an object or threw would
  break that invariant loudly rather than being silently encoded as `null`.

A cell is the equivalent of `fn: "i18n_t"` with `{lng, key}` and **no options**, run
after `changeLanguage(lng)` — see §5 on why `changeLanguage` and not `{lng}`.

### Why not `pairs`, and why not `cases`

The generator builds all three encodings so the trade-off is measured rather than
argued (`i18n.dump.mjs:632-651`):

| Encoding | Shape | Bytes | Lines | vs columnar |
|---|---|---|---|---|
| **columnar** (chosen) | `{locales, keys, values}` | **703,619** | 18,311 | — |
| flat triples | `{pairs: [[lng, key, value], …]}` | 1,557,623 | 85,581 | **2.21×** |
| full `VectorCase` | `{cases: [{name, fn, input, expect}, …]}` | 3,785,013 | 188,271 | **5.38×** |

Both losing encodings lose for the same two reasons. First, the inherited writer
convention is `JSON.stringify(doc, null, 1)` (`scripts/dump-vectors/writer.ts:72`),
which puts **every array element on its own line** — so a triple costs five lines of
framing (`[`, three elements, `]`) and a `VectorCase` costs eleven. Second, both
re-serialise all 1,141 key strings **15 times**; the columnar form serialises each key
exactly once and each locale code exactly once. The `VectorCase` form is larger on its
own than the entire pre-existing seven-file corpus, which would make the vectors
directory unreviewable for no added information: `name`, `fn` and `input` are
mechanically derivable from the row and column indices.

The two ALT files are a **prototype measurement artefact**. The shipped
`i18n.dump.mjs` must not write them into `tests/vectors/` — an unregistered
`i18n-exhaustive-ALT-*` suite would fail the `REQUIRED_SUITES` assertion in §1.

### Runner obligations

Because the file has no `cases` array, `conformance.rs`'s `SuiteFile` parses it with
`#[serde(default)] cases` and contributes **zero** cases to the main loop while still
registering its name in `seen_suites` — the same mechanism `identicon-bulk` already
relies on (`conformance.rs:15-27`). The exhaustive suite therefore gets its own
runner, exactly as `identicon_bulk_corpus` does (`conformance.rs:548-591`), and that
runner must assert shrink guards before it starts:

```rust
assert_eq!(f.locales.len(), 15, "locale set shrank");
assert!(f.keys.len() >= 1141, "key inventory shrank to {}", f.keys.len());
assert_eq!(col.len(), f.keys.len(), "column {lng} is not key-aligned");
```

Without the alignment assertion a truncated column would silently test fewer keys and
still report green — the precise false confidence the suite pin exists to prevent.

## 4. The `cases` schema (suites b, c, d)

Suites (b), (c) and (d) use the standard shape from 001, unchanged:

```json
{
 "suite": "i18n-behaviour",
 "source": "scripts/dump-vectors/i18n.dump.mjs (i18next@26.3.1 + src/i18n resources)",
 "cases": [
  {
   "name": "count/ru/21",
   "fn": "i18n_t",
   "input": { "lng": "ru", "key": "send.recipientCount", "opts": { "count": 21 } },
   "expect": { "value": "21 получатель" }
  },
  {
   "name": "keys/empty-list",
   "fn": "i18n_t_keys",
   "input": { "lng": "en", "keys": [] },
   "expect": { "error": "I18nEmptyKeyList" },
   "divergence": {
    "ts_behavior": "i18next dereferences keys[keys.length-1] without a length check and throws a raw TypeError (\"Cannot read properties of undefined (reading 'includes')\")",
    "reason": "a typed Rust API returns a CoreError; an uncaught TypeError inside a render would blank the screen"
   }
  }
 ]
}
```

Rules, inherited and specialised:

- `expect` is either `{ "value": … }` for a bare return, an object of named fields
  for a struct return, or `{ "error": "<CoreErrorCode>" }`. Nothing else.
- `divergence` present ⇔ Rust intentionally differs from the oracle; `ts_behavior` is
  mandatory there. The dumper **hard-fails** if the oracle produces a non-string or
  throws and no divergence entry covers it (`i18n.dump.mjs:243`), so the register in
  §7 cannot silently fall out of date.
- Every expectation is **computed from the oracle**, never hand-typed. Hand-typing
  would only prove the typist agreed with the implementation. The one place a human
  writes text is the divergence prose.
- `input.lng` is the language to be active for the call. `input.opts`, when present,
  is the i18next options object in the tagged encoding of §6.

## 5. Why the cross-product is 17,115 and not 16,817

16,817 is the **sum of per-locale leaf counts**, and it is the number the spec quotes
for "translated strings". The per-locale counts are: en 1,129 · zh 1,129 ·
ru 1,131 · and 1,119 for each of the other twelve.

17,115 is `1,141 × 15` — the **union** of leaf paths across all 15 locales, resolved
in every locale. The difference is exactly **298 cases**, and every one of them is a
(locale, key) pair where the key is absent from that locale, so the lookup falls
through `fallbackLng: 'en'`. That is the only coverage the fallback branch gets
anywhere in the corpus.

Measured composition of the 298:

| Group | Keys | Locales missing them | Cases |
|---|---|---|---|
| Present only in `en` and `zh` (D5 defect A1) | 10 | 13 | 130 |
| Present only in `ru` (the `_few`/`_many` plural set + `contacts.groupMembers_one`/`_other`) | 12 | 14 | 168 |
| | | | **298** |

The 10 en/zh-only keys are `componentsTx.receipt.confirmingDelayed`,
`…confirmingPoll`, `…confirmingProgress`, `send.alertAccountUnavailableBody`,
`send.alertEstimateFailedBody`, `send.alertEstimateFailedTitle`,
`send.sameFeeTokenBody`, `send.sameFeeTokenEdit`, `send.sameFeeTokenMax`,
`send.sameFeeTokenTitle`. Resolving them under `ja` is what pins the English leak
FR-018 requires the port to reproduce.

The 12 ru-only keys are the Slavic plural forms the other locales do not need
(`contacts.groupMembers_{one,few,many,other}`, `contacts.sends_{few,many}`,
`send.batchApply_{few,many}`, `send.batchRejected_{few,many}`,
`send.recipientCount_{few,many}`). Resolving `contacts.sends_many` under `en` pins
what i18next does when a *suffixed* key is requested literally and missing.

The 298 cost essentially nothing in file size — the missing keys resolve to the `en`
string, which is already present in the `en` column — so restricting the suite to
16,817 would trade away the highest-value coverage in the corpus for no saving.

## 6. Tagged encoding for values JSON cannot express

JSON cannot hold `undefined`, `NaN`, `±Infinity`, `BigInt`, `Date` or a function, and
all six are reachable from the app's real call sites or from i18next's own edge
behaviour. The dumper encodes them as single-key objects
(`i18n.dump.mjs:136-162`), and the Rust runner decodes them back before calling the
engine:

| Tag | JSON | Decodes to (JS) | Rust runner |
|---|---|---|---|
| `undefined` | `{"__t":"undefined"}` | `undefined` as an **own property** | present-but-null option — the `''` branch of `skipOnVariables` |
| `nan` | `{"__t":"nan"}` | `NaN` | `f64::NAN` |
| `infinity` | `{"__t":"infinity","sign":1}` / `{"sign":-1}` | `±Infinity` | `f64::INFINITY` / `NEG_INFINITY` |
| `bigint` | `{"__t":"bigint","v":"5"}` | `5n` | rejected → `I18nInvalidCount` |
| `date` | `{"__t":"date","iso":"1970-01-01T00:00:00.000Z"}` | `new Date(iso)` | **no analogue** — divergence, see §7 |
| `fn` | `{"__t":"fn","src":"() => 'from-fn'"}` | `eval("(" + src + ")")` | **no analogue** — divergence, see §7 |

Two properties of this encoding matter:

1. **It nests.** `decodeTag` recurses through plain objects
   (`i18n.dump.mjs:148-152`), so `{"v":{"toString":{"__t":"fn","src":"() => 'CUSTOM'"}}}`
   round-trips into an object carrying a custom `toString`. That is how the
   dynamic-dispatch divergence is pinned.
2. **An untagged plain object stays a plain object.** `{"v":{"a":1}}` is a genuine
   object interpolation value, not a tag; the `default:` arm throws on an unknown
   `__t`, so a typo in a tag name fails the dump rather than being interpolated as
   `[object Object]`.

The `date` tag is the reason the dumper pins `TZ` (§9): `Date.prototype.toString()`
reads the ambient timezone, so without the pin the corpus would encode the dumping
machine's location into an expectation.

## 7. Divergence register

Ten entries, all in suite (b), all oracle-verified — the dumper refuses to emit a
non-string or a throw without one. Five carry `expect: {error}`; five carry
`expect: {value}` with the oracle's own stringification.

### The 2 oracle throws

| # | Case | `fn` | Oracle behaviour | Core behaviour |
|---|---|---|---|---|
| 1 | `keys/empty-list` — `t([])` | `i18n_t_keys` | `extractFromKey(keys[keys.length-1], …)` at `i18next.js:557` passes `undefined` into `key.includes(nsSeparator)` at `i18next.js:512` → `TypeError: Cannot read properties of undefined (reading 'includes')` | `Err(I18nEmptyKeyList)` |
| 2 | `count/bigint` — `t(key, {count: 5n})` | `i18n_t` | `Intl.PluralRules.select(5n)` (via `getSuffix`, `i18next.js:1087-1092`) → `TypeError: Cannot convert a BigInt value to a number` | `Err(I18nInvalidCount)` |

Case 2 is not hypothetical: token amounts are `bigint` throughout the wallet, and one
of them reaching `count` today crashes the render. FR-008 requires a typed error, and
the corpus is what proves the port does not instead "helpfully" coerce.

### The 5 non-string returns

| # | Case | `fn` | Oracle returns | Corpus `expect` | Core behaviour |
|---|---|---|---|---|---|
| 3 | `default/number` — `{defaultValue: 42}` | `i18n_t` | the raw **number** `42` | `{"value":"42"}` | `Ok("42")` |
| 4 | `default/bool` — `{defaultValue: true}` | `i18n_t` | the raw **boolean** `true` | `{"value":"true"}` | `Ok("true")` |
| 5 | `branch/object-returnObjects` — `t('common', {returnObjects:true})` | `i18n_t` | a JS **object** (the whole `common` subtree) | `{"error":"I18nUnsupportedOption"}` | `Err(I18nUnsupportedOption)` |
| 6 | `leaf/returnDetails` — `t('common.cancel', {returnDetails:true})` | `i18n_t` | a JS **object** (`{res, usedKey, exactUsedKey, usedLng, usedNS, usedParams}`) | `{"error":"I18nUnsupportedOption"}` | `Err(I18nUnsupportedOption)` |
| 7 | `default/array-joinArrays` — `{defaultValue:['a','b'], joinArrays:'-'}` | `i18n_t` | a JS **array** `["a","b"]` | `{"error":"I18nUnsupportedOption"}` | `Err(I18nUnsupportedOption)` |

Entries 3 and 4 are *representation* divergences only — `t()` is not string-typed at
runtime in JS, and `String(42) === "42"`, so a Rust `-> Result<String, _>` loses
nothing a caller can observe through a rendered label. Entries 5–7 are *surface*
divergences: the option shapes do not exist on a `String`-returning API. They are
pinned rather than omitted so that a future "just add `returnObjects`" change has to
confront the choice instead of quietly widening the return type.

### The 3 host-only interpolation values

| # | Case | Oracle behaviour | Corpus `expect` | Core behaviour |
|---|---|---|---|---|
| 8 | `interp/date` | `Date.prototype.toString()` → `Thu Jan 01 1970 00:00:00 GMT+0000 (Coordinated Universal Time)`; reads the ambient TZ | `{"value":"V=[Thu Jan 01 1970 …]"}` | no `Date` variant in the interpolation-value enum; callers pre-format through `src/services/locale-format.ts`, which is what the app already does |
| 9 | `interp/function` | `Function.prototype.toString()` splices the **callback source text** into the UI string | `{"value":"V=[() => 'from-fn']"}` | callable values rejected — this is a latent source leak in TS, not a feature |
| 10 | `interp/symbol-free-object-with-toString` | honours a user-supplied `toString()` on the replacement object | `{"value":"V=[CUSTOM]"}` | no dynamic `toString` dispatch on a JSON value |

### The `expect: {error}` + `divergence.ts_behavior` convention

Where the oracle throws, the corpus records **only** the typed code in `expect` and
puts the raw `TypeError` text in `divergence.ts_behavior`. This is 001's convention,
enforced on the writing side by `expectOracleThrow`
(`scripts/dump-vectors/writer.ts:48-55`, mirrored at `i18n.dump.mjs:121-129`), which
calls the oracle and **fails the dump** if it does *not* throw — a non-throwing oracle
means the vector definition is wrong.

The reading side is why the raw text must not become a sibling key inside `expect`.
`conformance.rs`'s `check_object` iterates **every non-`error` key of the expectation
object** and demands a matching field on the actual result
(`conformance.rs:170-177`):

```rust
for (key, want) in expect_obj {
    let got = actual_obj
        .get(key)
        .ok_or_else(|| format!("actual result missing field `{key}`"))?;
    …
}
```

A stray `expect.ts_throw` would therefore make the case unrunnable on the two
object-returning arms (`i18n_resolve_language`, `i18n_change_language`): the runner
would look for a `ts_throw` field on a `ResolvedLanguage` and fail with
"actual result missing field", which reads like a port bug and is not one. Keeping
one convention across all eleven suites — prose in `divergence`, codes in `expect` —
is what keeps the shared helpers usable unchanged.

`check_object` also rejects an expectation whose only key is `error` when the call
succeeded (`conformance.rs:167-169`), so an empty expectation cannot pass over an
arbitrary result.

## 8. The `fn` dispatch names

Eleven names across the three `cases` suites. Each is one arm of the runner's
`match`, mirroring `conformance.rs:206-434`; an unrecognised name is a hard error
("no dispatch arm for fn `…`"), never a skip.

| `fn` | Suite | Cases | `input` | `expect` |
|---|---|---|---|---|
| `i18n_t` | behaviour, plural A | 144 + 675 | `{lng, key, opts?}` | `{value}` or `{error}` |
| `i18n_t_keys` | behaviour | 5 | `{lng, keys: […]}` | `{value}` or `{error}` |
| `i18n_t_lng_option` | behaviour | 17 | `{key, opts: {lng}}` | `{value}` |
| `i18n_interpolate` | behaviour | 10 | `{lng, template, opts}` | `{value}` |
| `i18n_resolve_language` | behaviour | 17 | `{requested}` | `{language, resolved_language, languages}` |
| `i18n_change_language` | behaviour | 17 | `{requested}` | `{language, resolved_language, languages}` |
| `i18n_plural_suffix` | plural A | 135 | `{lng, count}` | `{value: "_one"}` |
| `i18n_plural_suffixes` | plural A | 15 | `{lng}` | `{value: ["_one","_other"]}` |
| `i18n_t_legacy_plural` | plural B | 675 | `{lng, key, opts}` | `{value}` |
| `i18n_plural_suffix_legacy` | plural B | 135 | `{lng, count}` | `{value}` |
| `i18n_plural_suffixes_legacy` | plural B | 15 | `{lng}` | `{value: [...]}` |

The exhaustive suite carries no `fn` at all; its runner is implicitly `i18n_t` with
default options.

Four of these names exist to make a red test *diagnosable*, not to add coverage:

- `i18n_plural_suffix` / `i18n_plural_suffixes` isolate the CLDR rule from the store.
  A failure here says "the plural rules are wrong"; a failure in `i18n_t` with these
  green says "the candidate-key order or the lookup is wrong".
- `i18n_interpolate` drives `i18n.services.interpolator.interpolate()` directly
  (`i18n.dump.mjs:519`) over the same ten templates. A failure here says
  "interpolation is wrong", not "resolution is wrong".
- `i18n_t_lng_option` exists because **`t(key, {lng})` and `changeLanguage(lng)` +
  `t(key)` are different functions in i18next**, and the corpus proves it:
  `t('language.title', {lng: 'zh_TW'})` returns `"Language"` (English) while
  `init({lng: 'zh_TW'})` resolves to `zh` and returns Simplified Chinese. Same
  divergence for `zh-Hant`, `zh-Hant-TW` and `es-AR`. The app calls
  `changeLanguage()`, so the exhaustive suite uses that path; the per-call path is
  pinned separately precisely *because* it is a different function.

`i18n_resolve_language` and `i18n_change_language` are the only object-returning
arms, so they are the only ones routed through `check_object` — see §7.

## 9. Determinism

The corpus must be byte-stable, because "regenerate and assert zero diff" is the only
check that catches the oracle drifting away from the committed vectors
(`writer.ts:59-65`). Five guarantees, in the order the dumper establishes them:

1. **Full ICU is asserted, not assumed** (`i18n.dump.mjs:26-28`). A small-icu Node
   would silently emit a *different, wrong* corpus, because `Intl.getCanonicalLocales`
   drives language-code normalisation and `Intl.PluralRules` drives every suffix. The
   dumper throws unless `Intl.PluralRules.supportedLocalesOf(['ru']).length === 1`.
2. **`TZ` is pinned to `UTC` inside the script, and the pin is verified**
   (`i18n.dump.mjs:34-37`). Pinning in the npm script would not survive Windows; and
   a Node that ignored the assignment would emit a corpus whose `Date` vectors encode
   the dumping machine's timezone. The dumper therefore asserts
   `new Date(0).toString() === 'Thu Jan 01 1970 00:00:00 GMT+0000 (Coordinated Universal Time)'`.
   Measured: the output is byte-identical under `TZ=Asia/Shanghai` and
   `TZ=America/New_York`.
3. **No timestamp and no git sha.** `source` is a fixed literal
   (`i18n.dump.mjs:115`), exactly as `writer.ts:66-70`. A wall-clock stamp would
   rewrite all four files on every run and make the zero-diff check impossible.
4. **Every ordering is fixed.** `LOCALES` is a literal array in `resources.ts` order
   (`i18n.dump.mjs:49`); `KEY_PATHS` is `[...new Set(…)].sort()`
   (`i18n.dump.mjs:100`); `PLURAL_BASES` is sorted (`:107`); `COUNTS`,
   `PLURAL_COUNTS` and `LANG_CODES` are literal arrays. No iteration order depends on
   filesystem enumeration or `Object.keys` of a merged object.
5. **One serialisation convention**: `JSON.stringify(doc, null, 1) + '\n'`
   (`i18n.dump.mjs:117`), identical to `writer.ts:72`.

Measured: re-runs produce **0 differing bytes** across all four files (research D4).

### Regeneration

```bash
npm ci                                  # i18next@26.3.1 must be installed
npm run dump:vectors                    # writes tests/vectors/*.json (all 11 suites)
git diff --stat rust/crates/vela-core/tests/vectors/   # expect: no change
```

`package.json:15` already chains the identicon dumper after the jest-driven suites;
this feature appends a third stage:

```json
"dump:vectors": "jest … && node scripts/dump-vectors/identicon.dump.mjs && node scripts/dump-vectors/i18n.dump.mjs"
```

To regenerate the i18n suites alone, and to prove timezone independence:

```bash
node scripts/dump-vectors/i18n.dump.mjs
TZ=Asia/Shanghai   node scripts/dump-vectors/i18n.dump.mjs && git diff --exit-code rust/crates/vela-core/tests/vectors/
TZ=America/New_York node scripts/dump-vectors/i18n.dump.mjs && git diff --exit-code rust/crates/vela-core/tests/vectors/
```

Two deltas from the prototype that must land before this script is committed:
`REPO_ROOT` is a hardcoded absolute path (`i18n.dump.mjs:39`) and must become
`import.meta.url`-relative like `identicon.dump.mjs:35`; and `OUT_DIR` defaults to
`.` (`i18n.dump.mjs:40`) and must default to
`rust/crates/vela-core/tests/vectors` like `writer.ts:26`.

Once the corpus moves into the crate (FR-010), the dumper reads
`rust/crates/vela-core/i18n/locales/` rather than `src/i18n/locales`
(`i18n.dump.mjs:56`). That is a source-path change only; the emitted bytes must not
move, and a diff at that commit is a bug in the relocation, not in the corpus.

A diff after an `i18next` bump means the *library* changed, which — since it decides
what a user reads before authorising a transfer — is a release-blocking finding to
investigate, not a corpus to accept.

## 10. MODE A vs MODE B

Both plural suites replay the same 825 case definitions through two different
oracles. They are not redundant: **75 of 825 differ**, measured.

**MODE A** (`i18n-plural.json`) runs the primary instance with a complete
`Intl.PluralRules`. It is the conformance target (FR-005): CLDR-correct, and what the
web build and the whole Jest suite already produce.

**MODE B** (`i18n-plural-legacy.json`) runs a **fresh instance created after
`delete Intl.PluralRules`** (`i18n.dump.mjs:662-668`). A fresh instance is mandatory
because `PluralResolver` memoises rules per instance in `pluralRulesCache`
(`i18next.js:1041`, `:1053-1054`, `:1070`) — reusing the primary instance would
replay MODE A's cached rules and produce a corpus identical to (c), which would look
like "no divergence" and be a lie.

With `Intl.PluralRules` gone, `new Intl.PluralRules(...)` throws inside `getRule`'s
`try` (`i18next.js:1056-1069`). The `catch` checks `typeof Intl === 'undefined'` —
false, because `Intl` still exists — so **no warning is logged**, then returns
`dummyRule` for any code without `-`/`_`, or recurses to the language part (which also
lands on `dummyRule`) for `zh-TW`-shaped codes. `dummyRule` is
`count === 1 ? 'one' : 'other'` with `pluralCategories: ['one','other']`
(`i18next.js:1030-1035`). This is the degraded path Hermes takes on every native build
today, and the silent-warning detail is why the defect shipped.

**What the legacy suite pins**: today's shipping native behaviour, so FR-007's parity
claim is *provable* rather than asserted, and so SC-004's before/after list is
enumerable rather than discovered by a user. It is a bug-compatibility mode behind an
explicit switch — the same strict/compatible split feature 003 used for
`identicon_params` / `identicon_params_js_compat`.

Measured divergence, by locale and by `fn`:

| Locale | Differing cases | Which, and why |
|---|---|---|
| zh, zh-TW, zh-HK, ja, ko, vi, id | 2 each (14 total) | `suffixes/<lng>` and `suffix/<lng>/1` only. They gain a spurious `_one` and select it at `count = 1`, where CLDR has only `other` — but **no `t()` case differs**, because the corpus's dead `_one` values are byte-identical to `_other` (D5 defect A3) |
| es-MX, it | 6 each (12) | `suffixes`, `suffix/…/1000000`, and 4 `t()` cases at 1,000,000: they lose `many` |
| fr, pt-BR | 11 each (22) | the same 6, plus `suffix/…/0` and 4 `t()` cases at 0 — `fr`/`pt-BR` put `count = 0` in `one`, which `dummyRule` sends to `other` |
| ru | 27 | loses both `few` and `many`; diverges at counts 0, 2, 3, 5, 11, 21, 101 and 1,000,000 — the ten Russian keys of SC-004 |
| en, de, tr | 0 | their CLDR category set is already `[one, other]`, so `dummyRule` happens to be right |
| **Total** | **75 of 825** | |

The zh-family row is the strongest argument for keeping `i18n_plural_suffix` and
`i18n_plural_suffixes` as separate dispatch names. Judged by `t()` output alone,
MODE B would look *identical* to MODE A for seven of the fifteen locales — the
spurious `_one` selection is invisible only because the translators duplicated the
`_other` text. The isolated rule cases are what make the defect observable before a
future content edit turns it into a visible one.

| `fn` | Differing |
|---|---|
| `i18n_plural_suffixes` / `…_legacy` | 12 of 15 |
| `i18n_plural_suffix` / `…_legacy` | 21 of 135 |
| `i18n_t` / `i18n_t_legacy_plural` | 42 of 675 |

MODE B is the reason the dumper is a standalone `.mjs` rather than a
`*.dump.test.ts` under the shared jest config: `delete Intl.PluralRules` is a
process-global mutation that would non-deterministically corrupt any concurrent suite
touching `Intl`. The global is restored immediately after the MODE B build
(`i18n.dump.mjs:667`). The identicon dumper already established the standalone `.mjs`
precedent for an analogous reason (`identicon.dump.mjs:5-10`).

## 11. Cross-platform replay (SC-002)

All four surfaces read **the same committed JSON** out of
`rust/crates/vela-core/tests/vectors/`, scan the directory, assert `REQUIRED_SUITES`,
and dispatch each case on its `fn`:

| Surface | Runner | Entry point |
|---|---|---|
| Rust | `vela-core/tests/conformance.rs` | `cargo test -p vela-core` |
| wasm | `rust/scripts/verify-web.mjs` | `npm run build:wasm && npm run verify:wasm` |
| Kotlin | `rust/harness/kotlin/Harness.kt` | `scripts/smoke-kotlin.sh` over the uniffi bindings |
| Swift | `rust/harness/swift/main.swift` | the Swift smoke script over the same bindings |

Each needs exactly two additions:

1. **Eleven new `fn` arms** (§8), calling the binding's own i18n exports rather than
   the core directly — that is the point of the replay. A green `cargo test` with a
   red Kotlin run means the **FFI layer**, not the core, diverged.
2. **One columnar branch**, structurally identical to the `pairs` branch each runner
   already has for `identicon-bulk` (`conformance.rs:548-591`;
   `verify-web.mjs:169-181`; `Harness.kt:269-279`; `main.swift:338-351`). Detect it
   by the presence of a `values` object, iterate `locales × keys`, compare against
   `values[lng][i]`, and cap the reported failures — 17,115 mismatched strings
   printed in full would bury the diagnosis.

   The Swift harness makes this non-optional: `main.swift:351` already reports
   `bad schema (no cases and no pairs)` as a failure, so dropping
   `i18n-exhaustive.json` into the vectors directory turns Swift red until the branch
   exists. That is the desired order of events — the corpus lands first and red
   (plan.md Phase 2), and every surface has to opt in explicitly.

Two surface-specific obligations follow from D3:

- **Rust, Kotlin, Swift and desktop** replay against **compiled-in** catalogs, so the
  test build must enable all 15 per-locale cargo features. The *default* feature set
  is deliberately **zero locales** — a test profile that silently inherited the
  default would find no catalog resident and fail all 17,115 exhaustive cases with the
  same "catalog not loaded" error, which is a configuration bug wearing a conformance
  bug's clothes.
- **wasm** compiles in the engine but **no catalogs** (all 15 are 315,023 bytes over
  the `MAX_WASM_BYTES = 1_000_000` gate at `rust/scripts/build-web.mjs:42`).
  `verify-web.mjs` must therefore load the generator's per-locale JSON assets from
  disk and hand them to the engine through the runtime-JSON path (FR-015) before
  replaying. This is the only place the four surfaces do materially different setup,
  and it is a *feature* of the corpus design: the same 18,975 cases pass through both
  the `Values::Static` and the `Values::Owned` code paths, which is the cheapest
  available proof that the two representations agree — including the branch-bitmap gap
  research D2 flags as still open for `Owned` catalogs.

Whether every `fn` is reachable from every binding is decided by
[i18n-api.md](./i18n-api.md), not here. The rule this contract imposes is the one
001 already established: a runner may **not** skip a case silently. If a binding does
not export the surface a case needs, the runner counts and prints the skip — the
mechanism `verify-web.mjs:161-187` already uses for `CORE_ONLY_FNS`, whose comment
puts it exactly right: "an unreported skip is how a corpus quietly stops covering
things". The suite-set assertion of §1 still runs regardless, so a harness that
quietly ignored all four i18n suites cannot report green while replaying nothing. The
Rust runner has no exemption at all and replays all 18,975.
