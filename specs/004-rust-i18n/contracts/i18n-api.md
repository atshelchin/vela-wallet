# Contract: `vela_core::i18n` / `vela_core::l10n` exported API

**Date**: 2026-07-31 · Types: see [data-model.md](../data-model.md) · Decisions and
every measured number: [research.md](../research.md).

The resolver is **pure and deterministic**: no clock, no timezone database, no host
`Intl`, no I/O, no randomness. It is not *stateless* — an engine owns a language and a
catalog registry — but all mutation is explicit (`&mut self`) and bounded (FR-024): the
registry holds at most two catalogs, and nothing else in the engine grows.

Names are `snake_case` in Rust and generated as `camelCase` (Kotlin/TS) or Swift
conventions by the binding layers. The **i18next column** names the `i18next@26.3.1`
member each item corresponds to, which is how FR-025's "recognisably close" is checked;
line numbers are into `node_modules/i18next/dist/esm/i18next.js`.

Four surfaces consume this contract:

| Surface | Route | Engine | Catalogs |
|---|---|---|---|
| `app-desktop` (GPUI, Rust) | direct crate dependency — `use vela_core::i18n` | compiled in | per-locale cargo feature |
| `app-ios` (Swift) / `app-android` (Kotlin) | uniffi 0.32 shell | compiled in | cargo feature **or** runtime JSON |
| `app-web` (TS) + the current Expo web path | wasm-bindgen shell | compiled in | **runtime JSON only** (D3) |
| the React Native app today | **no FFI** — consumes generated `resources.ts` (FR-028) | `i18next@26.3.1` | static import, unchanged |

---

## 1. The i18n surface

### 1.1 Construction

`en` is a **field of the registry, not a slot** (D2 `api_sketch.rs:74-83`), so FR-013's
"the `en` fallback is pinned" is a type-level guarantee rather than a runtime check.
There is nowhere to put a third catalog, so a language switch cannot leak.

| Rust | Signature | Notes |
|---|---|---|
| `I18n::new` | `(en: Catalog) -> Result<I18n, CoreError>` | `Err(I18nCatalogUnavailable)` if `en.lang() != "en"`. Never allocates |
| `I18n::embedded` | `() -> Result<I18n, CoreError>` | Requires cargo feature `i18n-en`; `Err(I18nCatalogUnavailable)` otherwise |
| `I18n::with_plural_mode` | `(self, mode: PluralMode) -> I18n` | Consuming builder; default `PluralMode::Cldr` (MODE A) |

There is no `init()`, no async gate, no plugin/backend/detector registration and no
event emitter — see [Deliberately not ported](#9-deliberately-not-ported).

### 1.2 The seven i18next members

| Rust | Signature | i18next | Notes |
|---|---|---|---|
| `t` | `(&self, key: &str, opts: &Options<'_>) -> Result<String, CoreError>` | `t` (:2071) | Exactly one allocation for the returned `String`; a second only when interpolation must expand. Returns the key itself when nothing resolves and no `default_value` applies |
| `t_into` | `(&self, out: &mut String, key: &str, opts: &Options<'_>) -> Result<(), CoreError>` | *(none)* | Zero-allocation entry point for a caller with a reusable buffer — the 500-key screen path (SC-007) |
| `t_first` | `(&self, keys: &[&str], opts: &Options<'_>) -> Result<String, CoreError>` | `t([...])` | First key that resolves wins; **all-missing returns the *last* key**, because i18next indexes `keys[keys.length-1]`. Empty slice is `Err(I18nEmptyKeyList)` where i18next throws a raw `TypeError` |
| `exists` | `(&self, key: &str, opts: &Options<'_>) -> bool` | `exists` (:2074, :492) | Infallible. A branch node is `true` unless `return_objects: Some(false)` (:502 tests the *per-call* option only, never the instance default) |
| `change_language` | `(&mut self, lng: &str) -> LanguageState` | `changeLanguage` (:1974) | Infallible, **synchronous** and **allocation-free**: it sets the language and recomputes the hierarchy. It does **not** load a catalog — the core has no I/O. See FR-016 below |
| `language` | `(&self) -> &'static str` | `language` | The normalised requested tag |
| `resolved_language` | `(&self) -> Option<&'static str>` | `resolvedLanguage` (:1965) | `None` when the requested tag matched nothing in `supportedLngs` |
| `languages` | `(&self) -> &'static [&'static str]` | `languages` (:1980) | The resolve hierarchy. Under `load: 'currentOnly'` this is always `[active, "en"]`, or `["en"]` when active is `en` |
| `dir` | `(&self) -> Dir` | `dir` (:2138) | Direction of the active language |
| `dir_of` | `(lng: &str) -> Dir` *(free fn, `l10n::text_direction` alias)* | `dir(lng)` (:2138) | See §4.4 for the deliberate divergence from i18next's host-`Intl` path |
| `get_fixed_t` | `(&self, lng: Option<&str>, ns: Option<&str>, key_prefix: Option<&str>) -> FixedT<'_>` | `getFixedT` (:2027) | Borrows the engine; `FixedT::t(&self, key, &Options) -> Result<String, CoreError>` merges the pinned fields into the per-call options |

**`change_language` and `Options::lng` are different functions, and the contract keeps
them different.** Proved by the corpus (D4, path-sensitivity finding 1): under
`change_language("zh_TW")` the engine degrades to `zh` and `language.title` renders
`语言`, while `t("language.title", lng: Some("zh_TW"))` falls through to `en` and renders
`Language`. Same for `zh-Hant`, `zh-Hant-TW` and `es-AR`. The vectors pin the two paths
separately (`i18n_change_language` / `i18n_t_lng_option`, 17 cases each). Because
`get_fixed_t` sets `o.lng` (:2038), **`FixedT` inherits the per-call semantics** — a
`FixedT` pinned to `zh_TW` resolves English. That is i18next's behaviour, not a bug in
the port.

**Language-code normalisation is asymmetric, and pinned:** `ZH-tw` → `zh-TW`, but bare
`ZH`, `DE`, `De` → `en`; `zh_TW` (underscore) silently degrades to `zh`, turning
Traditional into Simplified.

**FR-016 — a key requested for a non-resident locale**: resolution falls through to the
pinned `en` catalog, which is exactly what `load: 'currentOnly'` already does for a key
the active locale lacks. It is never a panic, never an error and never a partial read
(`api_sketch.rs:102-114`). `is_resident` lets a host detect the mid-flight case without
inspecting the returned string.

### 1.3 Projections

| Rust | uniffi (Kotlin / Swift) | wasm (TS) |
|---|---|---|
| `I18n::new(Catalog)` | `constructor(fallbackJson: ByteArray)` on the `I18n` object, throwing `CoreException` | `new I18n(fallbackJson: Uint8Array)` |
| `t` | `fun t(key: String, opts: TOptions): String` (throws) | `t(key: string, opts?: TOptions): string` (throws `{code, message}`) |
| `t_into` | *(not exposed — no borrowed buffer over FFI)* | *(not exposed)* |
| `t_first` | `fun tFirst(keys: List<String>, opts: TOptions): String` | `tFirst(keys: string[], opts?: TOptions): string` |
| `exists` | `fun exists(key: String, opts: TOptions): Boolean` | `exists(key: string, opts?: TOptions): boolean` |
| `change_language` | `fun changeLanguage(lng: String): LanguageState` | `changeLanguage(lng: string): LanguageState` |
| `language` / `resolved_language` | `fun language(): String` / `fun resolvedLanguage(): String?` | getters `language` / `resolvedLanguage` |
| `languages` | `fun languages(): List<String>` | `languages: string[]` |
| `dir` / `dir_of` | `fun dir(): Dir` / `fun dirOf(lng: String): Dir` | `dir(): Dir` / `dirOf(lng: string): Dir` |
| `get_fixed_t` | `fun getFixedT(lng: String?, ns: String?, keyPrefix: String?): FixedT` — a second uniffi object | `getFixedT(...): FixedT` — a JS class with one `t` method |

The uniffi object wraps `RwLock<vela_core::i18n::I18n>` because `#[uniffi::export]`
methods take `&self` while `change_language` / `load_catalog` need `&mut`. Lock
poisoning maps to `CoreError::Internal` — the shell must not `unwrap()` a `LockResult`,
which the crate lint would reject anyway. The wasm shell needs no lock: `wasm_bindgen`
exports `&mut self` methods directly and the module is single-threaded.

`LanguageState` is the shape the conformance dispatch already expects
(`conformance_i18n.rs`, `i18n_change_language`). Every field is `&'static`, because
`supportedLngs` maps anything unrecognised onto the fallback — the corpus shows `DE`,
`De` and `ZH` all reporting `language: "en"` — so a reported tag is always one of the 15
compiled-in tags, and each of the 15 hierarchies is a compiled-in slice:

```rust
pub struct LanguageState {
    pub language: &'static str,                    // "zh-TW"
    pub resolved_language: Option<&'static str>,   // Some("zh-TW") | None
    pub languages: &'static [&'static str],        // ["zh-TW", "en"]
}
```

The FFI mirrors convert to `String` / `List<String>` / `string[]` at the boundary; the
Rust side never allocates for a language switch.

---

## 2. The options type

### 2.1 Why it is one struct and not 42 setters

i18next takes a single JS object per call that **mixes** reserved option names with
interpolation variables; the reserved list is the 15 names at :880 plus `count`.
Everything else is a variable. The port keeps that one-object shape, because the FFI
arithmetic leaves no alternative.

D7 measured the shipped wasm at **0.605 µs** per string-returning round trip against
**0.00436 µs** for i18next's JS object lookup — **~140×**. One crossing per `t()` call
costs ~0.25 ms for a 500-call screen, which is inside a frame. A *chatty* API that
crossed once per option name would cost `42 × 0.605 µs ≈ 25 µs` per call and **≈ 12.7 ms
per screen** — arithmetic on the measured figure, and two orders of magnitude past
SC-007's 0.5 ms budget. So:

> **Every `t()` call crosses the FFI boundary exactly once, carrying the whole options
> payload by value. There are no per-option setters, no builder that lives across a
> crossing, and no getter on a returned handle.**

Inside Rust the same struct costs nothing: `Options` is `Copy`, holds only borrowed
slices, and a call site that builds its variables in a stack array allocates zero times
(the SC-007 `t_into` path).

### 2.2 The type

```rust
#[derive(Clone, Copy, Debug, Default)]
pub struct Options<'a> {
    // --- reserved names (i18next.js:880 + `count`) --------------------------
    pub count: Option<Count<'a>>,
    pub context: Option<Value<'a>>,
    pub default_value: Option<Value<'a>>,
    /// `defaultValue_<category>` — indexed by CLDR category, not by suffix text.
    pub default_value_by_category: &'a [(Category, Value<'a>)],
    pub replace: Option<&'a [Var<'a>]>,
    pub lng: Option<&'a str>,
    pub ns: Option<&'a str>,
    pub key_prefix: Option<&'a str>,
    pub key_separator: Sep<'a>,
    pub ns_separator: Sep<'a>,
    pub join_arrays: Option<&'a str>,
    pub return_objects: Option<bool>,
    pub ordinal: bool,
    // --- interpolation variables (the other 40 names) -----------------------
    pub vars: &'a [Var<'a>],
    // --- Vela extension (FR-022), defaults to false so FR-005 parity holds ---
    pub isolate: bool,
}

#[derive(Clone, Copy, Debug)]
pub struct Var<'a> { pub name: &'a str, pub value: Value<'a> }

/// Reproduces JS string coercion for every value the corpus reaches.
#[derive(Clone, Copy, Debug)]
pub enum Value<'a> {
    Str(&'a str),
    Num(f64),                 // stringified through `ryu-js` (already a crate dep)
    BigInt(&'a str),          // digits verbatim
    Bool(bool),
    Null,                     // renders ""
    Undefined,                // own property, undefined — renders ""
    Array(&'a [Value<'a>]),   // JS join(","), nested arrays flatten
    Object(&'a [Var<'a>]),    // renders "[object Object]"; traversable by dotted path
}

/// `count` is not a number in i18next — it is "a number, or something else".
#[derive(Clone, Copy, Debug)]
pub enum Count<'a> {
    Num(f64),
    Null,          // needsPluralHandling is TRUE; Intl selects on 0
    Str(&'a str),  // disables plural resolution entirely (:596 `!isString(opt.count)`)
    BigInt(&'a str),
}

/// `false` in JS ("no separator") is not the same as "not supplied".
#[derive(Clone, Copy, Debug, Default)]
pub enum Sep<'a> { #[default] Inherit, Off, Text(&'a str) }
```

Behaviours the enum shapes exist to reproduce, each pinned by a vector in
`i18n-behaviour.json`:

| Case | Result | Why the type needs the variant |
|---|---|---|
| variable absent from `vars` | `V=[{{v}}]` — the literal placeholder survives | `skipOnVariables: true` (:1711) |
| `Value::Undefined` present in `vars` | `V=[]` | different code path from "absent"; same visual difference the app ships today |
| `Value::Null` | `V=[]` | — |
| `Value::Num(1e21)` | `V=[1e+21]` | JS `Number::toString`, i.e. `ryu-js` |
| `Value::Num(-0.0)` | `V=[0]` | — |
| `Value::BigInt` in `vars` | digits render fine | but `Count::BigInt` is `Err(I18nInvalidCount)`: `Intl.PluralRules.select(5n)` throws |
| `Count::Str("3")` | returns the raw key `send.recipientCount` | plural resolution never runs, so no candidate hits |
| `Count::Null` | `" recipients"` | plural runs (category `other`), `{{count}}` renders `""` |
| `Value::Object` interpolated directly | `[object Object]` | — |
| `Value::Object` reached by `{{a.b.c}}` | the leaf | dotted paths need a traversable variant |
| `default_value: Some(Value::Null)` | ignored — key returned | `defaultValue: null` / `''` asymmetry (FR-004) |
| `default_value: Some(Value::Str(""))` | `""` — honoured | — |
| `default_value: Some(Value::Object(..))` | `key 'zz.missing (en)' returned an object instead of string.` | byte-exact diagnostic (:618) |

**Where `t()` returns a typed error rather than a string** (i18next returns a non-string
or throws; FR-008):

| Input | i18next | Rust |
|---|---|---|
| `t([])` | throws `TypeError` | `Err(I18nEmptyKeyList)` |
| `count: 5n` | throws `TypeError` | `Err(I18nInvalidCount)` |
| `return_objects: Some(true)` | returns a JS object | `Err(I18nUnsupportedOption)` |
| `return_details` | returns a JS object | not in `Options` at all — see §9 |
| `join_arrays` + array `default_value` | returns a JS array | `Err(I18nUnsupportedOption)` |
| `default_value: Some(Value::Num(42))` | returns the **number** `42` | `Ok("42")` — documented divergence; `t` is `String`-typed |

**`ordinal`** selects the CLDR *ordinal* category and then pushes **two** candidates —
`key_ordinal_<cat>` and the de-prefixed `key_<cat>` (:832-833). The corpus pins 12
ordinal cases with plain-string expectations (e.g. `en`, count 2 → the raw key; count 21
→ `21 recipient`), so the option cannot simply be rejected. **Reconciled in research.md
D8: the ordinal rules are ported.** Only `en` (one/two/few/other), `it`
(two/many/other), `fr` and `vi` (one/other) are non-trivial; the other eleven locales
are `other`-only. Their wasm cost is unmeasured and must be measured together with the
day-period and weekday tables before SC-008 is asserted.

### 2.3 Projections

uniffi and wasm both take **one record per call**. The reserved/variable split is kept
on the Rust side; the wire shape stays i18next's single object so the 1,029 JS call
sites map across without redesign (FR-025):

```rust
// uniffi: a Record, so Kotlin gets a data class and Swift a struct.
#[derive(uniffi::Record, Default)]
pub struct TOptions {
    pub count: Option<TCount>,
    pub context: Option<String>,
    pub default_value: Option<TValue>,
    pub default_value_by_category: HashMap<String, TValue>,
    pub lng: Option<String>,
    pub ns: Option<String>,
    pub key_prefix: Option<String>,
    pub join_arrays: Option<String>,
    pub ordinal: bool,
    pub isolate: bool,
    pub vars: HashMap<String, TValue>,
}
```

```ts
// wasm: the DTO is `#[serde(flatten)]`-ed, so a TS caller writes the i18next
// object literal verbatim and unknown keys land in `vars`.
i18n.t('send.recipientCount', { count: 3, name: alias });
```

Map ordering is irrelevant: interpolation looks variables up by name, and the only
place i18next iterates option keys in order is `getUsedParamsDetails`, which belongs to
`returnDetails` and is not ported.

---

## 3. Catalog lifecycle

A `Catalog` is one locale's value blob plus its plural rule and direction. Key text is
**not** in it: the 1,205 sorted paths (1,141 leaf + 64 branch) and the 151-byte branch
bitmap are compiled in **once for all locales** (31,198 bytes interned, against 460,471
repeated per locale — a 14.8× collapse). Values are per locale and index the shared
table by path id.

| Rust | Signature | Notes |
|---|---|---|
| `Catalog::embedded` | `(lang: &str) -> Result<Catalog, CoreError>` | `Values::Static`. `Err(I18nCatalogUnavailable)` when the locale's cargo feature is off |
| `Catalog::from_json` | `(lang: &str, bytes: &[u8]) -> Result<Catalog, CoreError>` | FR-015. `Values::Owned`; interns against the shared table (84,388 heap bytes for `ja`, against 171,975 for the naive re-materialised-keys variant). `Err(I18nCatalogParse)` on bad JSON |
| `Catalog::lang` | `(&self) -> &str` | — |
| `Catalog::resident_bytes` | `(&self) -> usize` | The SC-005 instrument |
| `Catalog::plural_categories` | `(&self) -> &'static [Category]` | e.g. `[One, Few, Many, Other]` for `ru` |
| `I18n::load_catalog` | `(&mut self, catalog: Catalog) -> Option<Catalog>` | FR-012. **Replaces** the active catalog and hands the old one back; residency cannot grow past `active + en` |
| `I18n::release_catalog` | `(&mut self, lang: &str) -> Option<Catalog>` | FR-013. `None` if that locale is not the active one. `en` is unreachable by construction |
| `I18n::is_resident` | `(&self, lang: &str) -> bool` | No allocation |
| `I18n::resident_locales` | `(&self) -> Vec<&str>` | At most two entries, `en` first. One allocation; diagnostics only, never on the hot path |
| `I18n::resident_bytes` | `(&self) -> usize` | Sum over resident catalogs — what SC-005 asserts (`ja` + `en` ≤ 135,345) |

**Two routes, one resolver.** `enum Values { Static { .. }, Owned(..) }` is the entire
cost of supporting both; the lookup is one binary search over the shared table then an
O(1) index, measured at **21.1 ns with zero allocations** either way, and `release` is a
plain `Drop`.

| Route | Who uses it | How the catalog arrives |
|---|---|---|
| **compiled in** | desktop, native | `Catalog::embedded("ja")` behind feature `i18n-ja` |
| **runtime JSON** | web, and any native build that would rather fetch | `Catalog::from_json("ja", bytes)` where `bytes` are the generator's per-locale asset |

Web takes the runtime route because compiling all 15 locales in measures **1,315,023
wasm bytes — 315,023 over** the `MAX_WASM_BYTES = 1_000_000` gate at
`rust/scripts/build-web.mjs:42`, and because embedding *loses over the wire*: `en` as
plain JSON is **15,353** brotli'd bytes against **+31,862** compiled in (2.08× worse),
and all 15 are 176,852 against +235,476.

**Lookup outcomes** are three-valued, so the branch diagnostic is produced by the caller
rather than guessed:

```rust
pub enum Lookup<'a> { Value(&'a str), Branch, Missing }
```

`Branch` becomes the byte-exact `key 'home (en)' returned an object instead of string.`
(:618). An `Owned` catalog must carry **its own** branch bitmap rather than borrowing
the compiled-in one — a known gap in the D2 prototype, closed in Phase 3 with a vector
that exercises a branch node on a runtime-loaded catalog.

### 3.1 What the generator emits for JS

`scripts/gen-i18n.mjs` reads `rust/crates/vela-core/i18n/locales/` — the single source
of truth (FR-010) — and emits four kinds of artefact. Only the first two are contract:

| Artefact | Consumer | Contract? |
|---|---|---|
| `src/i18n/resources.ts` | the React Native app, unchanged (FR-011, FR-028) | **Yes** — must be deep-equal to the hand-maintained file it replaces (SC-006) |
| one merged JSON document per locale | `Catalog::from_json` / `new I18n(bytes)` on web and native | **Yes** — the bytes are the input format; content is byte-for-byte the corpus (FR-009) |
| `src/i18n/paths.rs` (`PATHS`, `IS_BRANCH`) | the crate | No — an implementation detail, regenerable |
| `src/i18n_catalogs/<lng>.rs` | the crate, behind a feature | No — same |

The per-locale JSON asset is the *only* form of the corpus a JS host ever loads at
runtime; `resources.ts` exists solely so FR-028 can hold ("zero source changes"). Where
the assets are served from is a platform decision, not part of this contract.

---

## 4. The l10n surface

Split in two: **pure functions** in `vela_core::l10n`, which need no catalog, and
**engine methods**, which need `t()` for their labels.

The core takes a **resolved** preset. The `auto` variant stays a host concern: detection
reads `Intl.NumberFormat/DateTimeFormat.formatToParts` (`locale-format.ts:48`, `:68`,
`:84`), which the core is forbidden to consult (FR-006), and "language detection stays
outside the core" (spec Assumptions). So the Rust enums have four/five/two variants and
no `Auto`.

```rust
pub enum NumberPreset { CommaDot, DotComma, SpaceComma, Indian }
pub enum DatePreset { YmdSlash, MdySlash, DmySlash, DmyDot, Iso }
pub enum TimePreset { H24, H12 }
pub struct Separators { pub group: &'static str, pub decimal: &'static str }
```

Dates cross the boundary as a **civil** value, because the core has no timezone
database: `Civil::from_unix_millis(ms, utc_offset_minutes)` is pure arithmetic, and the
host supplies the offset it would have got from `Date.prototype.getHours()`. The
conformance dumper pins `TZ=UTC` for exactly this reason (D4).

### 4.1 Pure functions — `vela_core::l10n`

| Rust | Signature | Replaces | Status |
|---|---|---|---|
| `number_separators` | `(p: NumberPreset) -> Separators` | `locale-format.ts:121` | port |
| `input_separators` | `(p: NumberPreset) -> Separators` | `locale-format.ts:132` | port |
| `group_digits` | `(digits: &str, p: NumberPreset) -> String` | `locale-format.ts:162` | port — stays **string-in, string-out** so a uint256 base-unit value never routes through an `f64` |
| `format_number` | `(value: f64, opts: NumberOptions) -> String` | `locale-format.ts:170` | port — includes `!isFinite → "0"`, the trailing-zero trim down to `min_fraction_digits`, and Indian 2-3 grouping |
| `format_compact` | `(value: f64, p: NumberPreset) -> String` | `locale-format.ts:204` | port — K/M/B/T tiers, 2/1/0 fraction digits by magnitude |
| `format_token_amount` | `(value: f64, p: NumberPreset, compact: bool) -> String` | `locale-format.ts:228` | port — the 2/4/6-digit precision ladder **and** the dust rule (a compact value that would round to `"0"` falls back to 6 digits) |
| `parse_locale_number` | `(text: &str, p: NumberPreset) -> String` | `locale-format.ts:144` | port — including Arabic-Indic `U+0660–0669` and extended `U+06F0–06F9` digit mapping, and "strip every whitespace kind" under `SpaceComma` |
| `format_date` | `(t: Civil, p: DatePreset) -> String` | `locale-format.ts:247` | port |
| `format_time` | `(t: Civil, p: TimePreset, locale: &str) -> String` | `locale-format.ts:263` | port **+ fix**: the day-period marker comes from compiled-in locale data, closing the hardcoded English `AM`/`PM` (FR-021) |
| `format_date_time` | `(t: Civil, d: DatePreset, tm: TimePreset, locale: &str) -> String` | `locale-format.ts:275` | port — `"{date}, {time}"` |
| `format_fiat` | `(value: f64, code: &str, symbol: &str, locale: &str, opts: FiatOptions) -> String` | `currency.ts:108` | **port + correction** (FR-020) |
| `currency_fraction_digits` | `(code: &str) -> u8` | `currency.ts:91` (`ZERO_DECIMAL_CODES`) | **NEW** — 3 for KWD/BHD/OMR/JOD/TND/LYD, 0 for the 15 zero-decimal codes, 2 otherwise |
| `weekday_name` | `(t: Civil, locale: &str, w: NameWidth) -> &'static str` | `activity.ts:121` (`toLocaleDateString`) | **NEW** — closes the last host-`Intl` call (FR-021) |
| `text_direction` | `(locale: &str) -> Dir` | *(nothing)* | **NEW** (FR-023) |
| `isolate` / `isolate_into` | `(s: &str) -> String` / `(out: &mut String, s: &str)` | *(nothing)* | **NEW** (FR-022) — wraps in `U+2068` / `U+2069` |

```rust
pub struct NumberOptions {
    pub preset: NumberPreset,
    pub min_fraction_digits: u8,   // clamped to <= max, as locale-format.ts:174 does
    pub max_fraction_digits: u8,   // default 2
}

pub struct FiatOptions {
    pub preset: NumberPreset,
    /// currency.ts:96 — cents are visual noise on a large balance. `None` keeps
    /// minor units at every magnitude. Product policy, not CLDR; see §10.
    pub drop_minor_units_above: Option<f64>,   // the app ships 100_000.0
}
```

`format_fiat` is the one function whose *output changes*: today it is unconditionally
`symbol + number` with a binary 2-or-0 decimal rule, which is wrong for **21 of the
137** catalog currencies and structurally wrong for **6 of the 15** shipped UI locales. The
Rust version takes the locale so it can place the symbol after the amount with the
correct space class for `vi`, `ru`, `fr`, `it`, `de`, `es-MX`. Number **grouping** stays
under the user's preset — that is a deliberate product decision, not an accident
(FR-020).

`shouldShowDecimals` (`currency.ts:99`) has no direct counterpart: it is subsumed by
`currency_fraction_digits` plus `FiatOptions::drop_minor_units_above`.

### 4.2 Engine methods (need the catalog)

| Rust | Signature | Replaces | Status |
|---|---|---|---|
| `I18n::format_relative_time` | `(&self, ts_seconds: i64, now_seconds: i64, utc_offset_minutes: i32, p: DatePreset) -> Result<String, CoreError>` | `activity.ts:111` | **NEW in core** — the `time.now` / `time.minutesShort` / `time.hoursShort` keys, then a short weekday, then the date preset |
| `I18n::day_label` | `(&self, ts_seconds: i64, now_seconds: i64, utc_offset_minutes: i32, p: DatePreset) -> Result<String, CoreError>` | `activity.ts:134` | **NEW in core** — `time.today` / `time.yesterday`, else the date preset |

Both are `Result` only because they call `t()`; they cannot fail on a resident catalog.

### 4.3 Bidi isolation (FR-022)

`Options::isolate` defaults to **false**, so FR-005 byte-parity holds by default and
`isolate: true` is an explicit per-call-site decision. When set, every *substituted*
value — never the surrounding template — is wrapped in `U+2068 U+2069`. That is what
stops a right-to-left contact alias, ENS name or dApp origin from reordering the
sentence it sits in. `l10n::isolate` exposes the same wrapping for text the caller
composes outside `t()`.

### 4.4 Direction, and a divergence from i18next

i18next's `dir()` asks the host first (`new Intl.Locale(lng).getTextInfo()`, :2142) and
only then consults its compiled RTL list (:2148). The port **always** uses the compiled
list, because a host-dependent answer is exactly what this feature exists to remove. For
the 15 shipped locales the two agree (all `ltr`), so nothing observable changes; the
divergence is recorded rather than hidden. Two further i18next quirks are reproduced:
`-Latn` beyond position 1 forces `ltr` (:2150), and `-Arab` forces `rtl` (:2151). The
`dir()`-with-no-language case that returns `'rtl'` (:2140) is unreachable here — an
engine always has a language.

---

## 5. The plural mode selector

```rust
pub enum PluralMode {
    /// MODE A — compiled-in CLDR cardinal rules. The FR-005 conformance target.
    Cldr,
    /// MODE B — i18next's `dummyRule`: `count == 1 ? one : other`. What every
    /// native build renders today, because Hermes ships no `Intl.PluralRules`.
    Legacy,
}
```

MODE A is the default, everywhere, on every surface. MODE B exists so FR-007's parity
claim is *provable* rather than asserted: **75 of 825** plural cases differ between the
modes, and the suite runs both (`i18n-plural.json` / `i18n-plural-legacy.json`). Under
MODE B, zh/zh-TW/zh-HK/ja/ko/vi/id all gain a spurious `_one` category and select it at
count 1, while tr/es-MX/pt-BR/fr/ru/it lose `_few`/`_many`.

The rules themselves are 110 lines over **5 rule bodies** for the 15 locales, cost
**1,204 wasm bytes**, and agree with the node full-ICU oracle at **182,790/182,790, zero
disagreements**, across all 29 reachable `(locale, category)` pairs.

| Rust | Signature | i18next | Notes |
|---|---|---|---|
| `plural_category` | `(locale: &str, count: f64) -> Category` | `PluralResolver.getRule().select` (:1090) | The true CLDR category |
| `plural_suffix` | `(locale: &str, count: f64) -> &'static str` | `getSuffix` (:1087) | `"_one"`, `"_few"`, … |
| `plural_suffixes` | `(locale: &str) -> &'static [&'static str]` | `getSuffixes` (:1081) | In i18next's `suffixesOrder`, not alphabetical |
| `plural_suffix_legacy` | `(count: f64) -> &'static str` | `dummyRule` | Locale-independent by construction |
| `plural_suffixes_legacy` | `() -> &'static [&'static str]` | `dummyRule` | Always `["_one", "_other"]` |

**`_zero` is i18next's, not CLDR's.** `needsZeroSuffixLookup` (:602) adds `_zero` as an
*extra* candidate when `count == 0 && !ordinal`, tried **first** because the candidate
list is built with `push` and consumed with `pop`. `plural_category` must return the
true CLDR category (`other` for en/de/tr/it/es-MX, `one` for fr/pt-BR, `many` for ru) and let
the candidate builder add `_zero` on top — never in place of it.

**Documented divergence**: exact for `|count| < 1e18`. At or above 1e18 ICU switches
to a scientific representation and returns `other` for `it` / `one` for `fr` where
the literal CLDR rule text computes `many`. `5e17` still agrees. No wallet count
reaches 1e18.

Exposure: `PluralMode` is an **engine-construction** property
(`I18n::with_plural_mode`), never a per-call option — a mid-session switch would make
the parity claim meaningless. uniffi and wasm surface it as a constructor argument
(`legacyPlurals: boolean` on the TS side). The five free functions are exported on all
three surfaces because the corpus dispatches to them directly.

---

## 6. Cargo features

```toml
[features]
default = []                       # engine + shared path table, ZERO locales
i18n-en    = []
i18n-zh    = []
i18n-zh-tw = []
i18n-zh-hk = []
i18n-ja    = []
i18n-ko    = []
i18n-vi    = []
i18n-id    = []
i18n-tr    = []
i18n-es-mx = []
i18n-pt-br = []
i18n-fr    = []
i18n-de    = []
i18n-ru    = []
i18n-it    = []
i18n-all   = ["i18n-en", "i18n-zh", "…"]   # convenience; NOT buildable for wasm32
```

Feature names are the lower-cased BCP-47 tag with `-` preserved, so `es-MX` →
`i18n-es-mx`. Each gates exactly one generated `src/i18n_catalogs/<lng>.rs`.

**The default set is zero locales**, and that is the load-bearing choice:

| Configuration | wasm bytes | vs baseline (530,780) |
|---|---|---|
| Baseline today | 530,780 | — |
| **Engine only — the default set** | 535,629 | **+4,849** |
| Engine + `i18n-en` | 612,586 | +81,806 |
| Engine + `i18n-en` + `i18n-ru` | 683,660 | +152,880 |
| Engine + all 15 | 1,315,023 | +784,243 — **315,023 over the gate** |

(The recommended hybrid representation measures 609,564 for engine + `i18n-en`, i.e.
+78,784; the 612,586 row is the variant the D3 sweep tabulated. Both are far above the
+4,849 the default set costs, which is the point.)

Marginal cost after the second locale is **48,566 bytes**, so at most **8** locales fit
under `MAX_WASM_BYTES = 1_000_000` — leaving less headroom than the engine itself
occupies. Not a budget.

| Surface | Features enabled | Why |
|---|---|---|
| `vela-core-wasm` | **none** | Catalogs arrive as runtime JSON. Keeps the module at +4,849 and the wire cost at 15,353 brotli'd bytes per locale |
| `vela-core-uniffi` | the shell's own choice, default none | A native app may compile in its 2–3 most likely locales and fetch the rest |
| `app-desktop` | whichever it ships | No wire, no gate |
| `cargo test -p vela-core` | `i18n-all` | The 17,115-case exhaustive suite needs every locale resident |

`i18n-all` must never be enabled for a `wasm32-unknown-unknown` build;
`rust/scripts/build-web.mjs:42` hard-throws, which is the intended guard.

---

## 7. Error mapping

Five variants are added to the existing flat `CoreError`, defined in
`rust/crates/vela-core/src/error.rs`. Classification is carried by the variant and
detail by the message — unchanged from feature 001's convention — and every shell maps
them 1:1.

| `CoreError` variant | `code()` | Raised by | uniffi (Kotlin `CoreException.*` / Swift `CoreError.*`) | wasm `{code, message}` | i18next |
|---|---|---|---|---|---|
| `I18nEmptyKeyList(String)` | `"I18nEmptyKeyList"` | `t_first(&[])` | `I18nEmptyKeyList` | `code: "I18nEmptyKeyList"` | throws `TypeError: Cannot read properties of undefined (reading 'includes')` |
| `I18nInvalidCount(String)` | `"I18nInvalidCount"` | `Count::BigInt` | `I18nInvalidCount` | `code: "I18nInvalidCount"` | throws `TypeError: Cannot convert a BigInt value to a number` |
| `I18nUnsupportedOption(String)` | `"I18nUnsupportedOption"` | `return_objects: Some(true)`, array-valued `join_arrays`, callable or `Date` values | `I18nUnsupportedOption` | `code: "I18nUnsupportedOption"` | returns a JS object / array |
| `I18nCatalogUnavailable(String)` | `"I18nCatalogUnavailable"` | `Catalog::embedded` without the feature; `I18n::new` with a non-`en` fallback | `I18nCatalogUnavailable` | `code: "I18nCatalogUnavailable"` | *(no analogue — i18next loads via a backend plugin)* |
| `I18nCatalogParse(String)` | `"I18nCatalogParse"` | `Catalog::from_json` on bad JSON | `I18nCatalogParse` | `code: "I18nCatalogParse"` | *(no analogue)* |

The three codes with an i18next analogue are exactly the ones the corpus already
encodes as `expect: {error: …}` (`i18n-behaviour.json`, cases `keys/empty-list`,
`count/bigint`, `branch/object-returnObjects`, `leaf/returnDetails`,
`default/array-joinArrays`), with the raw `TypeError` text recorded in
`divergence.ts_behavior`. A stray `ts_throw` key would make the case unrunnable, because
`conformance.rs`'s `check_object` demands a matching field on the result for every
non-`error` key of the expectation.

**Not errors.** A missing key, a missing catalog, a non-resident locale, a branch node,
a `Count::Str`, an absent interpolation variable and a `default_value: null` all return
a **string** — the same string i18next returns. Turning any of them into an error would
break FR-005.

**No panics, ever.** `#![forbid(unsafe_code)]` plus the crate-level
`deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)` apply unchanged. Two
wasm traps are worth restating here because they read as ordinary Rust: range-slicing a
`&str` to take a primary subtag (`&locale[..i]`) costs **+28,553 bytes** by linking the
panic formatter, and `f64 %` costs **+2,935** by calling a software `fmod`. Use
`split(|c| c == '-' || c == '_').next()` and `u64` operands; both sites carry a comment.

---

## 8. Stability

**Contract — changing any of these requires regenerating the Kotlin, Swift and wasm
bindings together (uniffi checksum coupling) and re-running the corpus:**

- the seven i18next members of §1.2, their argument order and their `Result` shape;
- `Options`, `Var`, `Value`, `Count`, `Sep` field and variant names, and the rule that
  one call crosses the boundary once;
- `Catalog`'s constructors and the `load` / `release` / residency methods;
- the per-locale JSON asset format, and `src/i18n/resources.ts`'s exported shape;
- the `l10n` function names of §4.1 and the preset enum variants;
- `PluralMode`, `Category`, `Dir` and the five plural free functions;
- every `CoreError::I18n*` variant name and its `code()` string — the corpus keys on
  them;
- the cargo feature **names** (`i18n-<tag>`) and the fact that `default = []`.

**Free to change without notice** — measured, not promised:

- `paths.rs`, `i18n_catalogs/*.rs` and anything else the generator overwrites whole;
- the `Values::{Static, Owned}` split, the offset width (u16 today), the bitmap layout
  and the binary-search lookup — all of it is behind `Lookup`;
- resident-byte figures, the 21.1 ns lookup, allocation counts and every wasm number in
  §6, which are budgets asserted by CI (SC-005, SC-007, SC-008), not API;
- the number of internal modules, and whether `t` allocates once or twice;
- which locales any given shell compiles in.

**Additive only within v1**: new `l10n` functions, new locales (a new feature name and a
new generated file) and new `Value` variants that no existing corpus case reaches are
additive. A new `Options` field is additive **only** because the struct is constructed
with `..Options::default()` in Rust and from a partial object over FFI.

---

## 9. Deliberately not ported

None of these is computation; each belongs to a framework or host layer, and each would
be dead weight in a shared core (spec Assumptions, "API parity is by shape, not by
signature"):

| i18next member | Why omitted |
|---|---|
| `init` / `use` / plugins, backends, language detectors | require I/O and a plugin host; the core is given catalogs, it never fetches them |
| the event emitter (`on('languageChanged')`), `store` events | `react-i18next`'s subscription is the app's, and it is explicitly kept (D7, FR-028) |
| `loadNamespaces` / `loadLanguages` / `hasLoadedNamespace` | async loading; the host owns it |
| `returnObjects` / `returnDetails` returning objects | `t` is `String`-typed; both are `Err(I18nUnsupportedOption)` and pinned as divergences |
| `postProcess`, the formatting plugin (`{{v, uppercase}}`) | the format layer is `l10n`, which is typed; a string-keyed formatter registry is not |
| `parseMissingKeyHandler`, `saveMissing`, `missingKeyHandler` | dev-time tooling with a network side |
| the logger and `debug` | a host concern; the core returns values, not console output |
| `cloneInstance` / `createInstance` | `I18n` is a plain value; clone it if you want one |
| the `Trans` component surface and `keysFromSelector` | React-specific |
| CLDR **ordinal** rule tables | `ordinal` has 0 occurrences in `src/` — but see §10 |
| `Date` / function interpolation values | `Date.prototype.toString()` reads the ambient timezone and `Function.prototype.toString()` splices callback source into the UI string; both are pinned as divergences, not reproduced |

---

## 10. Open items this contract cannot settle

Three, each with the evidence a reviewer needs:

1. **Ordinals.** Research D1 rejects porting the CLDR ordinal tables as dead code
   (`ordinal`: 0 occurrences in `src/`, 0 repo-wide outside `node_modules`), while the
   spec's Assumptions list ordinals among the behaviours included "because the
   conformance corpus can prove them" — and suite (b) already contains **12 ordinal
   cases with plain-string expectations** (`ordinal/en/2` → the raw key,
   `ordinal/en/21` → `21 recipient`, all six `ordinal/ru/*` → the `_other` value). The
   engine therefore needs ordinal *category* rules for at least `en` (one/two/few/other)
   and `other`-only elsewhere, or those 12 cases must be re-encoded as divergences. This
   contract keeps `Options::ordinal` and the extra de-prefixed candidate (:832-833) on
   the assumption the rules land; the size cost is not yet measured.
2. **`FiatOptions::drop_minor_units_above`.** `currency.ts:96` drops minor units above
   100,000 as a product decision. FR-020 specifies CLDR fraction digits and placement
   and says nothing about the threshold. It is modelled as an explicit option with the
   app's current value so nothing changes silently, but whether the policy belongs in
   the core or in each caller is a product call.
3. **Compiled-in day-period and weekday names.** FR-021 requires them from compiled-in
   locale data for 15 locales. Unlike the plural rules (1,204 bytes, measured) this
   table has **not** been measured against the wasm gate, and it is unconditional — it
   cannot hide behind a per-locale feature, because `weekday_name` takes a locale
   string. Phase 6 must measure it before SC-008 can be asserted.
