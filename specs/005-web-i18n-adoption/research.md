# Phase 0 Research — 005 Web adoption of the Rust i18n engine

All findings below were derived by reading this repo's actual `node_modules`,
built wasm artefact and source — not from library documentation. Where a claim
was checked by executing code, it says so. Where a first-pass finding was
**wrong and later corrected**, the correction is recorded rather than quietly
replaced: the wrong version is the one a reader is likely to re-derive.

---

## D1 — The seam: override `i18n.t` and `i18n.exists` on the instance

**Decision.** On web, keep a real `i18next` instance as the React binding, and
replace its `t` and `exists` with functions backed by the Rust engine.

**Alternatives measured.**

`i18next@26.3.1` registers exactly **seven** module types (`use()`,
`i18next.js:1932-1957`): `backend`, `logger`, `languageDetector`, `i18nFormat`,
`postProcessor`, `formatter`, `3rdParty`. There is no resolver or translator
module type, so a plugin cannot be invented.

| Seam | Fidelity | Blast radius | Verdict |
|---|---|---|---|
| Override `i18n.t` + `i18n.exists` | full — Rust owns hierarchy, plurals, interpolation | two property assignments | **chosen** |
| Swap `i18n.translator` | full | must reimplement `changeLanguage`/`language`; loses the `translator.on('*')` missingKey re-emit wired at `:1834-1836` | rejected |
| `i18nFormat` module | ~70% | four hooks to implement | rejected |
| Bypass Provider | full | large duck-typed surface | rejected |
| `backend` module | **zero** — only feeds `store.addResourceBundle` (`:1508`) | small | rejected as a fidelity seam |

`i18nFormat` looks like the "official" answer and is not. Its four hooks
(`handleAsObject` `:595`, `addLookupKeys` `:824`, `getResource` `:876`, `parse`
`:734`) cover candidate keys, leaf lookup and interpolation — but the language
hierarchy loop (`:812`/`:820`), miss detection (`:872`), the missing-key path
(`:660-724`) and `defaultValue_<suffix>` selection all sit outside it. That last
one still calls the JS `pluralResolver.getSuffix` at `:598-603`, i.e. **i18next's
own `Intl.PluralRules` keeps running on every counted call**. A seam that leaves
the plural resolver in JS cannot prove a plural port.

**Why the override is sound rather than a hack.** `bindMemberFunctions`
(`:1726-1733`) does `inst[mem] = inst[mem].bind(inst)` for every prototype
member, so `t`, `exists` and `getFixedT` are plain **own, writable, configurable**
properties by construction. Verified at runtime: the descriptor for `t` is
`{writable:true, configurable:true, enumerable:true}`. `getFixedT` ends with
`return this.t(resultKey, o)` (`:2060`) — a live property lookup — so react-i18next's
`useTranslation`, which sources its `t` from `getFixedT` (`useTranslation.js:76`),
routes through the override. So does every direct `i18n.t(...)` call site.

**Consequences.** All 92 `useTranslation()` sites in 66 files and all 20 direct
singleton uses are captured with **zero edits**. `changeLanguage`, the
`languageChanged` event and the `useSyncExternalStore` re-render path are
untouched. `exists` is a *separate* own property (`:2074-2076`) and must be
overridden too, or it silently keeps answering from the JS store.

---

## D2 — Never hand the wasm instance to react-i18next

**Decision.** Expose a plain JS façade that holds the wasm `I18n` in a closure.

**First finding (partly wrong).** "`useTranslation` shallow-clones the instance on
every language change (`useTranslation.js:148-167`) and the clone aliases
`__wbg_ptr`, so the clone is a use-after-free risk."

**Correction, verified by execution.** The clone is **not** recreated per language
change: react-i18next compares `original?.language` (`:174`), and on the wasm class
`language` is a prototype *method*, so that expression is a constant function
reference and the `wrapperLangRef.current !== lang` branch never fires. Confirmed:
`inst.language === I18n.prototype.language` stays `true` across
`changeLanguage('de')`. The pointer aliasing is real but not a GC hazard —
`createI18nWrapper` holds a hard non-enumerable `__original` reference. Corruption
requires an explicit `free()`/`Symbol.dispose` on a clone, which React never calls.

**The real reason the decision stands** is simpler and stricter: the wasm instance
fails immediately on API surface. `<I18nextProvider i18n={wasmI18n}>` throws
`TypeError: i18n.getFixedT is not a function` before any cloning is reached.
Missing entirely: `getFixedT`, `on`, `off`, `options`, `store`, `isInitialized`,
`initializedStoreOnce`, `languages`, `resolvedLanguage`, `services`,
`hasLoadedNamespace`, `loadNamespaces`, `loadLanguages`, `getResourceBundle`.
`changeLanguage` exists with the wrong contract (sync `LanguageState` vs
`Promise<TFunction>`), and `language` is a method where react-i18next reads a
property.

Keeping the wasm object out of React's reach also prevents react-i18next from
assigning `reportNamespaces` onto it (`useTranslation.js:36`).

---

## D3 — `en` must be synchronous; get it from the bundle, not a cargo feature

**Decision.** Ship `en` bytes synchronously by bundling the JSON through metro.

**Measured.** Enabling cargo feature `i18n-en` **with no caller changes the wasm by
18 bytes** — the catalog is dead-stripped. `Catalog::embedded` exists
(`catalog.rs:126-145`) but the wasm shell never references it, and the only
constructors are `new(fallback_json:&[u8])` and `new_with_legacy_plurals(...)`
(`vela-core-wasm/src/lib.rs:694-699`). So "just turn on the feature" is not an
option: it needs a new `#[wasm_bindgen]` constructor, a wasm rebuild, and a
`build-info.json` `wasmInterface` change that CI's `build-web.mjs --check` will
demand be committed.

**Size context** (not the binding constraint): artefact is 652,393 of 1,000,000
bytes. Embedded `en` adds ~33–82 KB (fits); all 15 adds ~576–784 KB (does not).
Over the wire `en` is 15,221 brotli'd bytes.

**Why synchronous at all.** The constructor cannot be called without `en` bytes,
and `src/services/vela-core/index.web.ts` establishes that the core is available
at import time. `src/services/activity.ts` calls `i18n.t()` outside React with no
async gate. A fetched `en` would leave a window with no engine at all — and a
module-scope `fetch` additionally breaks `expo export`, which runs in Node.

Rejected: `expo-asset`/`fetch` for `en` (async), and option (c) gating the whole
boot on it (the existing `Promise.all` at `src/app/_layout.tsx:175-210` is the
right home for the *active* locale, not for `en`).

---

## D4 — Catalog lifecycle belongs to JS, because the engine has one non-`en` slot

**Measured behaviour.** `load_catalog` is `self.active.replace(catalog)`
(`mod.rs:280`). Loading `ru` then `ja` gives `residentLocales` `['ja','en']`;
calling `changeLanguage('ru')` afterwards **succeeds**, returns a healthy-looking
`LanguageState`, and renders English. There is no error.

Separately, `changeLanguage` does no I/O at all (`mod.rs:339-343`): calling it
before `loadCatalog` yields `{language:'ru',...}` while `residentLocales` is still
`['en']` and `t()` returns `"Cancel"`.

**Decision.** JS owns the cache and re-`loadCatalog`s on every switch; the ordering
fetch → `loadCatalog` → `changeLanguage` → notify is a requirement (FR-010), not a
convention.

**Delivery, verified end to end.** Expo's dev server serves `public/` through
ServeStaticMiddleware (measured 200 `application/json` with exact byte sizes), and
`expo export --platform web` copies `public/` verbatim to the export root
(measured: a real export produced `dist/i18n/` with all 15 files). No `baseUrl` is
configured, so `/i18n/<lng>.json` is correct on both.

**Two sharp edges.** A missing catalog returns a **56,429-byte HTML page**
(expo-router's `+not-found` shell), and feeding it to `loadCatalog` throws
`I18nCatalogParse: expected value at line 1 column 1` — so `response.ok` must be
checked rather than relying on the parse error. And catalog URLs are **not
content-hashed** while every other exported asset is, so a stale CDN copy can pair
an old catalog with a new bundle; `extra.gitCommit` (`app.config.js:19-21`) is
already wired and is a zero-new-machinery cache-buster.

---

## D5 — The generated `TOptions` type is unusable; the adapter defines its own

**Measured.** `rust/pkg-web/vela_core.d.ts:37` emits
`export interface TOptions extends Map<string, Value>`, because `#[serde(flatten)]`
on `vars` (`lib.rs:449-451`) forces tsify to widen the struct to a map type. Under
`strict`, `e.t('send.sendTitle', { symbol: 'ETH' })` fails with TS2353. At runtime a
plain object literal is exactly what works.

It is a pure type-level lie, but a total one: it rejects all option-bearing calls
while `e.t('key')` with no options typechecks fine — which is why a spot check
looks healthy. The adapter defines its own options interface and casts at the single
boundary.

---

## D6 — Forward `opts.lng` unchanged

**First finding (overstated).** "`getFixedT` stamps `o.lng` onto **every** call
(`i18next.js:2038`), so 100% of production traffic runs the Rust per-call `lng`
branch — the branch with 17 corpus cases, not the branch with 18,975. Strip `lng`
when it equals the active language."

**Correction, verified by execution.** `opts.lng` is read in exactly one place
(`mod.rs:507`); it selects the code list and nothing else — `interpolate.rs` and
`plural.rs` contain no `lng` references. For the only value react-i18next ever
supplies (`opts.lng == i18n.language`), both arms emit an identical code list:
`[L,"en"]` for L≠en, `["en"]` for L=en. A replay across all 15 locales × 1,141 keys
plus a count/ordinal sweep found **0 divergences over 27,345** `t(key,{})` vs
`t(key,{lng:active})` pairs. i18next has the same two-function asymmetry upstream
(`:812` vs `:1980`+`:2002`), so the port is faithful, not divergent.

"100%" was also wrong: ~1,007 of ~1,025 call sites carry `lng`; the 20 direct
singleton uses carry none.

**Why stripping is actively wrong.** It would *mask* a real divergence. Only two
catalogs are resident, so `t(k, {lng:'fr'})` while `de` is active renders English on
web where native i18next (all 15 bundled) renders French. That is a genuine
behavioural difference between the platforms and the harness should surface it, not
hide it.

**What to assert instead** (FR-007): `i18n.language ∈ resolve::SUPPORTED` at the
seam. The Rust per-call path genuinely has no recovery ladder
(`resolve.rs:236-251`) — but neither does i18next's `toResolveHierarchy`
(`:999-1019`), and under this repo's config both give identical answers for
degenerate tags (`zh_TW`→en, `zh-Hant`→en, `es-AR`→en, `zh-tw`→zh-TW). Canonicalising
is `changeLanguage`'s job (`:2003`), and it is only ever called with a
`SUPPORTED_LANGUAGES` member.

---

## D7 — `<Trans>` is a non-issue, and the reason matters

**Contested finding.** One agent asserted "this repo uses `<Trans>` at 19 sites",
which would have forced an `i18n.services.interpolator` shim into scope.

**Settled directly.** `grep -rE '<Trans[ />]' src` returns exactly **one** hit and it
is a code comment (`src/components/signing/SummaryLine.tsx:22`) explaining why Trans
is *not* used. `Trans` is never imported anywhere; the only react-i18next imports are
`useTranslation` (66 files) and `initReactI18next` (1). Zero `withTranslation`,
`<Translation>`, `getFixedT`, `useSSR`, `I18nextProvider`.

Also corrected: Trans's `{prefix:'#$?',suffix:'?$#'}` escape hatch being ignored by
the Rust interpolator is **harmless** — the hatch fires only when `values` is falsy,
so no interpolation variables are in play. The genuine Trans blocker, were it ever
used, is `ns`: react-i18next passes an **array** while wasm declares
`ns: Option<String>`, which throws `invalid type: JsValue(["translation"])`.

**Decision.** Scope Trans out. If it is ever introduced on web, it must be a
deliberate decision, so a lint rule is cheap insurance.

---

## D8 — The option vocabulary is tiny, and parity over it is measured

**Measured.** The app's entire `t()` option surface is three things:
`defaultValue`, `count`, and plain interpolation variables (39 distinct names).
Nothing else — no `context`, `returnObjects`, `returnDetails`, `joinArrays`, `lng`,
`ns`, `replace`, `ordinal`, `keySeparator`, `nsSeparator`, or
`defaultValue_<category>` at any call site. `n` (the most common variable) is an
ordinary interpolation name, **not** a plural trigger; only `count` selects a suffix.
No `t()` result is ever consumed as a non-string.

A replay of all 1,129 keys × 15 languages × 21 option shapes through the built wasm
and `i18next@26.3.1` side by side gave **355,635 resolutions, zero divergences**.
This is stronger evidence than the 18,975 committed cases for this specific question,
because it uses the app's real keys and real option shapes.

**Two latent traps** the committed corpus structurally cannot see, because it encodes
values with `{"__t":...}` tags rather than passing them raw across the boundary:

- `count: undefined` — i18next treats it as no count and echoes the key; Rust decodes
  it to `Count::Null` and pluralises. `deserialize_present` (`lib.rs:410-411,620-625`)
  maps any *present* field to `Some(_)`.
- `BigInt` count — i18next throws `TypeError`; Rust returns a rendered string.

Neither is reachable today under `strict: true` (all 17 count sites are `.length` or a
`number`-typed field). Both become reachable the first time an optional numeric count
appears. Same defect class as the Infinity/NaN bug the 004 fuzz caught.

---

## D9 — The test gap is the biggest risk in this spec

**Measured.** `jest.config.js:23` lists `moduleFileExtensions: ['ts','tsx','js','jsx','mjs','json','node']`
— no `.web.ts`. There is no haste config, no `defaultPlatform`, no `jest` key in
`package.json`. Confirmed with a throwaway probe: jest resolves
`@/services/vela-core` to `index.ts` with `CORE_BACKEND === 'legacy-ts'`.

So a new `src/i18n/index.web.ts` would be **invisible to every runner in CI**. Of
1,437 tests, 28 touch i18n at all; none would break and none would cover the new code.
`build:web` is a bundle, not an execution — it catches a metro resolution failure but
not a wasm init throw, a missing catalog fetch, or a react-i18next contract break.
Playwright is explicitly excluded (`ci.yml:11-13`). There are no `.tsx` tests
(`testMatch` is `*.test.ts`) and no testing-library installed, so the 92 hook sites
cannot be covered at all.

**A green suite over a broken web app is therefore the default outcome**, which is why
FR-019/FR-020 exist.

**The good news, proved by probe.** Jest *can* run both engines in one file today with
no config change: the wasm `I18n` built from `public/i18n/en.json` rendered `'キャンセル'`
for `ja`, and a real i18next through `@/i18n` rendered the same, needing only
`expo-localization` and async-storage mocked. Node 22 supplies the global `atob` that
`index.web.ts:107-112` needs. An in-jest differential test is the single highest-value
test available, and it does not require adopting a render library.

---

## D10 — Empty resource store is possible, but not yet

Under an `i18nFormat` seam i18next resolves correctly with a completely empty store,
which is what would eventually let `resources.ts` leave the web bundle. Two
qualifications found by probe: dropping `resources` flips init from synchronous to
`setTimeout(load, 0)` (`:1875-1878`, `initAsync` defaults true), so `isInitialized` is
`undefined` in the tick `.init()` returns and react-i18next's `ready` is **false** —
with `useSuspense` defaulting to true, that throws a promise. `initAsync:false` restores
synchronous init. And a parse-only seam leaves `exists()` returning false for every key.

**Decision.** Out of scope for 005 (FR-018): the bundled `resources` is what makes the
oracle real. Recorded here because it is the payoff a later spec collects, and because
the `initAsync` interaction is not obvious.

---

## Corrections made to 004 during this research

`rust/crates/vela-core/src/i18n/interpolate.rs` carried a comment asserting that an
absent `{{var}}` surviving on screen is "a rendering bug at **eleven** live call
sites". Re-derived: of the **107** literal-key call sites whose key declares a
placeholder, **zero** fail to supply every variable the English string requires. The
number was not reproducible and has been removed (commit `1f7e53b`); the pinned
behaviour is unchanged and still correct.
