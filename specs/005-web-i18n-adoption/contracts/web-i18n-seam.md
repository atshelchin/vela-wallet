# Contract: the web i18n seam

Every signature here is load-bearing. The Phase 1 critique found the four design areas had
each assumed a different shape for the same object; this file is the single definition.

---

## 1. The seam

Exactly two properties are assigned on the web i18next instance, after `init()` has run:

```ts
const oracleT      = i18n.t;        // captured BEFORE overwrite — the live oracle
const oracleExists = i18n.exists;

i18n.t      = seamT      as typeof i18n.t;
i18n.exists = seamExists as typeof i18n.exists;
```

`bindMemberFunctions` (`i18next.js:1726-1733`) makes both plain own/writable/configurable
properties, and `getFixedT` ends in a live `this.t(...)` lookup (`:2060`), so react-i18next
picks the override up. Capture MUST happen after `init()`, or the oracle is a pre-init
function; assert `i18n.isInitialized === true` at capture time rather than assuming it.

### `seamT`

```ts
function seamT(key: unknown, second?: unknown, third?: unknown): string
```

**Returns `string`, never `unknown`.** React renders a non-string raw, silently.

Ordered responsibilities — no other layer may perform them:

1. **Null-key guard** — a nullish key returns `''`, as i18next does.
2. **Overload** — if `second` is not an object, apply
   `i18n.options.overloadTranslationOptionHandler([key, second, third])`, so the
   `t(key, 'a default')` form works. (No current call site uses it; the 20 direct
   singleton sites make it reachable.)
3. **Selector keys** — resolve i18next 26's function-key form before dispatch.
4. **Normalise** — §2 below. Produces `AdapterTOptions | undefined`.
5. **Dispatch** — `Array.isArray(key) ? engine.tFirst(key, o) : engine.t(key, o)`.
   `engine.t(['a','b'])` throws `arg.charCodeAt is not a function` from the glue; the
   array branch is mandatory, not defensive.
6. **Catch** — any throw returns `oracleT(...)` and records a divergence with
   `reason: 'threw'`.

The harness sits **inside** step 5 and receives an already-normalised
`(string | string[], AdapterTOptions | undefined)`. It never sees a raw call site.

### `seamExists`

```ts
function seamExists(key: unknown, opts?: unknown): boolean
```

Overridden per FR-004 so the API does not answer half from Rust and half from the JS store.
Note it has **no behavioural provenance**: Rust and i18next agree on every shape probed, so
dropping the override is invisible to output comparison. Its test MUST therefore assert the
engine was *called* (a counter), not merely that the answer is right.

---

## 2. Options normalisation

```ts
interface AdapterTOptions {
  count?: number | null;
  defaultValue?: string;
  lng?: string;
  ns?: string;
  replace?: Record<string, unknown>;
  [k: string]: unknown;      // plain interpolation variables
}
```

This type exists because the generated `TOptions` is emitted as
`interface TOptions extends Map<string, Value>` and rejects every option-bearing call at
compile time (FR-005). Cast to the wasm type at **one** boundary; the double cast is
load-bearing and was verified to typecheck under the repo's `strict` config.

Rules:

- **N1 — `lng` is forwarded unchanged** (FR-006). Stripping it would mask a real divergence:
  with one non-`en` catalog resident, `t(k,{lng:'fr'})` while `de` is active renders English
  on web where native i18next (all 15 bundled) renders French.
- **N2 — `ns` array → string.** react-i18next passes `'translation'` as a string on the hook
  path, but `<Trans>` would pass an array and the wasm declares `Option<String>`.
- **N3 — own-but-undefined `count` is deleted, *and* the interpolation source is routed
  through `replace` with `count: null`.** Deleting alone matches i18next's plural decision
  but breaks `{{count}}` interpolation: i18next renders `''` for an own-undefined property,
  and the engine has no "present-undefined count" representation.
- **N4 — non-finite variable values.** Until FR-024 lands in the crate, the normaliser
  converts a non-finite `number` var to its JS string form so `{n: NaN}` renders `"NaN"`.
  After FR-024 this rule is redundant but harmless; keep it and let the test prove both
  paths agree.
- **N5 — values that cannot cross the boundary** (function, symbol, TypedArray, throwing
  getter) MUST be rejected *before* the call, not caught after it. Until FR-023 lands, such
  a value poisons the engine permanently; after it, this rule is defence in depth.

---

## 3. Catalog store — `src/i18n/catalog-store.ts`

A plain `.ts` (not `.web.ts`) so it is testable under the existing jest config.

```ts
export function catalogBytes(lng: string): Promise<Uint8Array>;   // fetch + validate + cache
export function setLanguage(lng: string): Promise<string>;        // returns the tag IN EFFECT
export function engineLanguage(): string;                          // the single JS mirror
export function residentLocales(): string[];                       // diagnostics
```

- **URL**: `/i18n/<lng>.json?v=<gitCommit>` — catalogs are not content-hashed while every
  other exported asset is (FR-013).
- **Validation**: check `response.ok` **before** `arrayBuffer()`. A missing catalog returns a
  ~56 KB HTML page whose parse error leaks a parser message rather than an actionable state.
- **Cache**: raw `Uint8Array`, LRU capped at **2** non-`en` entries — the minimum satisfying
  US3 scenario 2 (`ja → ru → ja`, one fetch each), bounding memory at ~157 KB rather than the
  ~888 KB an unbounded cache reaches.
- **Ordering** (FR-010, mandatory): `fetch` → `loadCatalog(lng, bytes)` → `changeLanguage(lng)`
  → notify. `changeLanguage` performs no I/O; calling it first yields a healthy-looking
  `LanguageState` and English text.
- **Generation guard**: a monotonic token. Without it a late-landing `ja` fetch calls
  `loadCatalog('ja')` and evicts the `ru` the UI is showing, and the engine reports nothing —
  it just answers in English.
- **`engineLanguage` is written on all four paths**: boot, switch, failure-rollback and
  poison-recovery. It is the only JS mirror of engine state (R3).
- **Residency** is `[active, 'en']`, or `['en']` when active *is* `en`. Assertions MUST accept
  both (R5).

---

## 4. Divergence record

One shape, used by the harness, the tests and the write-up.

```ts
interface Divergence {
  key: string | string[];
  options: string;      // tagged encoding — the inverse of decodeTag in i18n.dump.mjs
  language: string;     // engineLanguage() at the time of the call
  rust: string | null;  // null when Rust threw
  oracle: string;
  reason: 'mismatch' | 'threw' | 'poisoned';
  at: number;           // ms since harness start; NOT a wall clock
}
```

`options` uses the same tagging `scripts/dump-vectors/i18n.dump.mjs` applies, so a record is
replayable. A finding **cannot** become a hand-pasted corpus vector: CI runs
`npm run dump:vectors` then `git diff --exit-code` over the vectors directory, which deletes
any hand-added case. The harness therefore emits a paste-ready `add(...)` **source line** for
the dumper, and the expectation is re-derived from the oracle.

---

## 5. Harness control surface

```ts
type HarnessMode = 'off' | 'first-seen' | 'every';
export function setHarnessMode(m: HarnessMode): void;
export function harnessReport(): { compared: number; divergences: Divergence[] };
```

Default `__DEV__ ? 'first-seen' : 'off'`.

`first-seen` caches an input **only after the engines agreed**, so returning Rust on a cache
hit is byte-identical by construction, while a divergent input is never cached and therefore
keeps being compared and keeps rendering the oracle.

Sampling was rejected on two independent grounds: it is least likely to compare the rare
dynamic-key and error-path calls the offline replay never saw, and under FR-016 it would make
a single input flicker between two rendered values within one session.

**Tests MUST set the mode explicitly.** `jest.setup.js` sets `__DEV__`, so a test that
inherits the default is asserting under a mode it did not choose.

---

## 6. What the differential test must compare

**`rust` vs `oracle` — never the seam's return value.** Under FR-016 the seam returns the
oracle by construction, so `expect(seam.t(k)).toBe(i18next.t(k))` passes no matter how wrong
the engine is. This is the single easiest way to ship a green, vacuous test suite, and the
critique identified it as the headline risk of the whole design.

The replay must also make each locale **resident** before comparing it: the engine holds one
non-`en` slot, so a loop over 15 locales that never calls `loadCatalog` compares 14 of them
against English.
