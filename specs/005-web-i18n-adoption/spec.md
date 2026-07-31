# Feature Specification: Web adoption of the Rust i18n engine — the proving ground

**Feature Branch**: `005-web-i18n-adoption`

**Created**: 2026-07-31

**Status**: Draft

**Input**: User description: "把 `src/i18n/index.ts` 接到 wasm 引擎上（web 先行），那是一个独立的 spec 做吧"
— wire `src/i18n/index.ts` to the wasm engine, web first, as its own spec.
Scope decision: **"005 的作用域设定为『以 Web 端作为验证场』"** — scope 005 as
*web is the proving ground*.

---

## Why

Feature 004 delivered a byte-faithful Rust port of `i18next@26.3.1`, green on
18,975 committed conformance cases and 67,115 live comparisons across four
surfaces. **Nothing calls it.** `src/i18n/index.ts:131` still initialises plain
i18next, and the app consumes only the generated `resources.ts`. The engine is
proven in a laboratory and deployed nowhere.

The obvious next step — "ship the fix to users" — is not available, and the
reason shapes this entire spec:

- The defect 004 exists to fix is **native-only**. Hermes ships `Intl` *without*
  `PluralRules`, so `ru` at `count=21` selects the `other` form on iOS and
  Android. On web, `Intl.PluralRules` is complete and the same string already
  renders correctly.
- The engine **cannot run on native today**. Hermes has no WebAssembly. The
  native route is uniffi (Kotlin/Swift), and `app-ios` / `app-android` are still
  empty scaffolds.

So web is the only surface that can run the engine, and web is the surface that
does not need it. Adopting it on web delivers, by design, **zero user-visible
change**. That is the intended outcome, not a disappointment — and this spec says
so up front so nobody later reads a flat metric as a failure.

What web adoption *does* deliver is the one thing no offline corpus can: the
engine resolving **real keys, with real options, at real call sites, in a real
browser**, with a **live, correct oracle running beside it in the same process**.
Overriding `i18n.t` leaves the original `i18n.t` intact as a closure — genuine
i18next, still backed by the bundled `resources`, one call away. Every string the
app renders can therefore be resolved twice and compared, which is exactly the
device `src/services/vela-core/diff-harness.ts` established for the crypto
primitives in feature 001.

That is the deliverable: not a feature, but **evidence** — the evidence that
licenses the native rollout, where the bug is real and where a mistake is far
more expensive to discover.

---

## Scope

**In scope**

- Routing translation resolution on **web** through the Rust engine, with plain
  i18next retained as the React binding and as the differential oracle.
- Catalog acquisition and lifecycle on web (which locale is resident, when).
- A differential harness comparing both engines on live traffic.
- Closing the test gap that currently lets a fully green suite coexist with a
  broken web app.
- Exit criteria stating what must be true before native adoption proceeds.

**Out of scope by design**

- **Native (iOS / Android / desktop).** Untouched. `src/i18n/index.ts` keeps
  initialising i18next exactly as today, and every native surface keeps its
  current behaviour bit-for-bit.
- **Removing `i18next` or `resources.ts` from the web bundle.** The oracle *is*
  the proving ground; deleting it ends the experiment. A later spec may drop it
  once this one reports clean.
- **L10n adoption** (`l10n::number` / `datetime` / `currency` / `bidi`).
  `src/services/locale-format.ts` stays authoritative. 004 built and verified
  that layer; wiring it is separate work with a separate blast radius.
- **The user-visible plural fix.** Native-only, unreachable from here.
- Any change to the 240-file corpus or the generated artefacts.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The web app renders identically on the Rust engine (Priority: P1)

A user opens the wallet on web in any of the 15 languages and sees exactly the
strings they saw before, on every screen — including plurals, interpolated values
and English-fallback keys.

**Why this priority**: it is the whole premise. If a single string moves, the
adoption is a regression, and the engine's byte-faithfulness claim was wrong about
the configuration that actually matters.

**Independent test**: switch through all 15 languages against a build with the
engine enabled and one without, and diff the rendered output.

**Acceptance Scenarios**

1. **Given** any of the 15 supported languages, **When** every one of the 1,129
   keys is resolved with the option shapes the app actually passes, **Then** the
   Rust result equals the i18next result byte for byte.
2. **Given** a locale and a key it does not translate (10 such keys exist across
   all 14 non-English locales, 3 with live call sites), **When** it is resolved,
   **Then** the English string renders — the two-catalog fallback is exercised,
   not bypassed.
3. **Given** a key whose value declares `{{amount}} {{token}}`, **When** the call
   site supplies both, **Then** both are substituted; **When** a variable is
   absent, **Then** the placeholder survives on screen exactly as i18next leaves
   it.
4. **Given** `contacts.groupMembers` — plural-suffixed in `ru`, bare in `en` —
   **When** called with a count in either language, **Then** both engines agree.

---

### User Story 2 - Every divergence is caught against a live oracle (Priority: P1)

A developer runs the web app with the harness on. Every `t()` resolves through
both engines; any disagreement is recorded with its key, options, language and
both outputs.

**Why this priority**: this is the actual product of the spec. Without it, web
adoption is a change with no evidence attached, and the native rollout inherits
nothing.

**Independent test**: force a divergence (resolve with a deliberately unsupported
option) and confirm it is recorded rather than swallowed.

**Acceptance Scenarios**

1. **Given** the harness is enabled, **When** any `t()` resolves, **Then** both
   engines run and their results are compared.
2. **Given** the two disagree, **Then** the mismatch is recorded with enough
   context to reproduce it offline, and the **oracle's** string is what the user
   sees — a proving ground must never degrade the product.
3. **Given** the Rust engine throws, **Then** it is caught, recorded, and the
   oracle's result is returned.
4. **Given** the harness is disabled, **Then** the oracle is not invoked and no
   measurable cost remains.

---

### User Story 3 - Only the language in use is fetched (Priority: P2)

A user on a metered connection loads the wallet in Japanese. The app fetches the
Japanese catalog and the English fallback — not the other thirteen.

**Why this priority**: on-demand loading is the property 004 was explicitly asked
for and built (92.0% residency reduction). Web is where it first has to survive a
network.

**Independent test**: load in each language and observe exactly which catalog
requests are issued.

**Acceptance Scenarios**

1. **Given** a cold load in `ja`, **When** the app starts, **Then** `en` is
   available without a network request and `ja` is fetched once.
2. **Given** the user switches `ja` → `ru` → `ja`, **Then** each switch renders
   Russian and then Japanese correctly — the engine's **single non-`en` slot** must
   not silently strand a previously loaded locale in English.
3. **Given** a catalog request fails (offline, 404, HTML error page), **Then** the
   UI falls back to English and the failure is surfaced, not swallowed as a parse
   error.
4. **Given** a deploy has shipped a new corpus, **Then** a stale cached catalog is
   not paired with a new bundle.

---

### User Story 4 - CI actually exercises the web path (Priority: P2)

A change that breaks web i18n fails CI.

**Why this priority**: today it would not. Jest resolves `index.ts`, never
`index.web.ts`; `build:web` bundles without executing; Playwright is deliberately
excluded. The entire adoption would sit in a file **no runner loads**.

**Independent test**: deliberately break the web adapter and confirm CI goes red.

**Acceptance Scenarios**

1. **Given** the web i18n module, **When** CI runs, **Then** a job constructs it
   for real, resolves keys through it, and compares against i18next.
2. **Given** the adapter is handed to react-i18next, **Then** a test asserts the
   full instance surface `useTranslation` touches, so a missing member fails a test
   rather than suspending forever in a browser.
3. **Given** a corpus change, **Then** the replay over real keys × real option
   shapes runs against both engines.

---

### User Story 5 - The result licenses (or blocks) native adoption (Priority: P3)

The team can point at a measured result and decide whether the engine is ready for
iOS and Android.

**Why this priority**: it is the reason the other four exist, but it is a reporting
obligation rather than running code.

**Acceptance Scenarios**

1. **Given** the proving period, **Then** a written result records divergences
   found, resolution counts, languages covered and residency measured.
2. **Given** divergences were found and fixed, **Then** each becomes a committed
   regression vector, so native cannot reintroduce it.

---

### Edge Cases

- `i18n.language` is `en` from module load until the async `loadLanguage()`
  completes — a pre-existing first-render English window the wiring inherits and
  must not widen.
- 20 direct `i18n.t()` uses across 6 files run **outside React**, most in
  `src/services/activity.ts`. They get no re-render on language change and rely on
  the `Stack` remount in `src/i18n/language.tsx`. They need a synchronous `t()` on
  the module singleton, not a hook.
- Two sites build keys by concatenation with `as any`
  (`src/components/signing/signing-core.tsx:71,77`). Dynamic keys cannot be checked
  statically and are exactly where the harness earns its cost.
- `count: undefined` and a `BigInt` count diverge between the engines. Neither is
  reachable under `strict: true` today; both are latent traps the moment an optional
  numeric count appears.
- SSG prerender emits only a spinner, so no translated string is prerendered and
  hydration mismatch is not a hazard. A module-scope `fetch` would nonetheless break
  `expo export`, which runs in Node.

---

## Requirements *(mandatory)*

### Functional Requirements

**Seam and fidelity**

- **FR-001**: Web MUST route translation resolution through the Rust engine while
  retaining an `i18next` instance as the React binding. The re-render path
  (`changeLanguage` → `languageChanged` → `useSyncExternalStore`) MUST be untouched.
- **FR-002**: Adoption MUST NOT require edits at translation call sites. All 92
  `useTranslation()` sites across 66 files and all 20 direct singleton uses MUST be
  captured by the seam itself.
- **FR-003**: The raw wasm `I18n` instance MUST NOT be handed to react-i18next or
  placed on `I18nContext`. Only a plain JS façade holding it in a closure may be
  exposed, keeping `free()` / `Symbol.dispose` out of React's reach.
- **FR-004**: `exists()` MUST be routed alongside `t()`, or it will silently keep
  answering from the JS store.
- **FR-005**: The adapter MUST define its own options type at the boundary. The
  generated `TOptions` is emitted as `interface TOptions extends Map<string, Value>`
  and rejects every option-bearing call at compile time, though a plain object is
  what works at runtime.
- **FR-006**: The adapter MUST forward a per-call `lng` unchanged. It MUST NOT strip
  it: stripping would mask a genuine divergence — with one non-`en` catalog resident,
  `t(k, {lng:'fr'})` while `de` is active renders English on web where native i18next
  (all 15 bundled) renders French.
- **FR-007**: The engine's active language MUST always be one of the 15 canonical
  tags. A non-canonical tag silently degrades the whole UI to English, so this MUST
  be asserted at the seam in development.

**Catalogs**

- **FR-008**: The `en` catalog MUST be available **synchronously** at module
  initialisation, without a network request. Losing `en` means no engine at all.
- **FR-009**: The active locale's catalog MUST be fetched on demand; the other
  thirteen MUST NOT be.
- **FR-010**: Ordering MUST be fetch → `loadCatalog(lng, bytes)` →
  `changeLanguage(lng)` → notify. `changeLanguage` performs no I/O; calling it first
  yields a correct-looking language state and English text.
- **FR-011**: Because the engine holds exactly **one** non-`en` slot, catalog
  lifecycle MUST be owned on the JS side — a locale visited a second time MUST be
  made resident again rather than assumed present.
- **FR-012**: A catalog response MUST be validated on `response.ok` before being
  parsed. A missing catalog returns a ~56 KB HTML page, whose parse error leaks a
  parser message instead of an actionable state.
- **FR-013**: Catalog URLs MUST be cache-busted by build identity; unlike every other
  exported asset they are not content-hashed, so a stale CDN copy can pair an old
  catalog with a new bundle.
- **FR-014**: No network I/O at module scope — it must sit inside the existing boot
  gate, or `expo export` (which runs in Node) breaks.

**Proving ground**

- **FR-015**: A differential harness MUST resolve through both engines and record
  every divergence with key, options, language and both outputs.
- **FR-016**: When the engines disagree, or the Rust engine throws, the **oracle's**
  result MUST be what renders.
- **FR-017**: The harness MUST be switchable, default-off in production builds, and
  MUST cost nothing measurable when off.
- **FR-018**: While proving, `resources` MUST remain in the web bundle. It is what
  makes the oracle real.

**Verification**

- **FR-019**: CI MUST execute the web i18n module — construct it, resolve through it,
  compare against i18next. A green `jest` MUST NOT be treated as evidence the web path
  works, because no jest runner resolves `.web.ts`.
- **FR-020**: The full instance surface `useTranslation` touches MUST have a contract
  test. A missing member does not error; it suspends forever.
- **FR-021**: `SUPPORTED_LANGUAGES` in TypeScript and `SUPPORTED` in Rust MUST be
  asserted equal. They are a coupled pair with no compile-time link.
- **FR-022**: `count: undefined` and `BigInt` count MUST be added as regression
  vectors, and the adapter MUST normalise the former.

---

### Key Entities

- **Web i18n adapter** — the web-only module owning the engine, the façade, the
  catalog lifecycle and the seam.
- **Oracle** — the captured pre-override `i18n.t`, genuine i18next over the bundled
  `resources`.
- **Catalog cache** — the JS-side record of fetched catalog bytes, existing because
  the engine holds one non-`en` slot.
- **Divergence record** — key, options, language, both outputs; the spec's output.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every one of the 1,129 keys × 15 languages resolves identically through
  both engines under the option shapes the app passes — zero divergences.
- **SC-002**: Zero translation call sites edited.
- **SC-003**: All 15 languages render with exactly two catalogs resident: the active
  one and `en`.
- **SC-004**: A cold load in a non-English language issues exactly **one** catalog
  request.
- **SC-005**: Deliberately breaking the web adapter turns CI red.
- **SC-006**: With the harness off, per-`t()` cost is indistinguishable from today's;
  with it on, the app remains usable for manual sweeps.
- **SC-007**: A full manual sweep of all 15 languages across every screen produces
  zero recorded divergences.
- **SC-008**: `tsc --noEmit`, the 1,437 jest tests, corpus lint and both parity scripts
  stay green; native behaviour is bit-identical.
- **SC-009**: The web bundle grows by no more than the embedded `en` catalog plus the
  adapter; the wasm artefact stays under its 1,000,000-byte ceiling.
- **SC-010**: A written result records divergences, resolution counts, languages and
  residency, and states plainly whether native adoption is licensed.

---

## Assumptions

- The user-visible plural fix is **not** a deliverable here and cannot be. It arrives
  with native adoption.
- `i18next` and `resources.ts` stay in the web bundle for the duration. Bundle
  reduction is a later spec's payoff.
- The corpus and every generated artefact are frozen; this spec changes only how
  strings are resolved, never what they are.
- Web is the only surface that can host the engine until the uniffi bindings are
  wired, so "proving ground" means web by necessity, not preference.
- The 15-language, single-`translation`-namespace, `escapeValue: false` configuration
  in `src/i18n/index.ts` is a structural assumption baked into the Rust port. Changing
  it desynchronises the engines with no compile-time signal.
