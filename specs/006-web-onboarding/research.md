# Phase 0 Research: Web App Foundation + Onboarding Welcome Page

**Date**: 2026-08-01 · **Branch**: `codex/006-web-onboarding`

Every decision below was made against evidence read from this repository, not
assumptions. File references are to the current tree.

---

## D1 — i18n engine: real vela-core wasm at prerender time, nothing at runtime

**Decision**: Resolve all Welcome copy at **build/prerender time** in Node using
the tracked wasm artefact `rust/pkg-web` (`initSync` + `WASM_BASE64`, the exact
build spec 005 proved with 67,115 zero-divergence comparisons). Prerender one
page per locale. Ship **no translation runtime to the client** and run **no wasm
on the deployed Cloudflare Worker**.

**Rationale**:
- `rust/pkg-web` is committed and synchronous to initialize (`vela_core.js`
  exports `initSync`; the wasm is base64-embedded — no fs, no fetch). It runs
  anywhere Node runs, including SvelteKit's prerenderer.
- Cloudflare Workers **prohibits compiling WebAssembly from runtime bytes**
  (dynamic-code restriction). The base64→`WebAssembly.Module` path that works in
  Node would throw in production SSR. Prerendering sidesteps the restriction
  entirely instead of fighting it with wrangler wasm-module rules.
- The Welcome page is pure static content — the ideal prerender candidate. All
  15 locale variants are known at build time (`entries` on the `[locale]`
  route).
- Because the strings in the HTML are produced by the *actual* Rust engine
  reading the *actual* corpus aggregates
  (`rust/crates/vela-core/i18n/locales/<locale>.json`), there is no second
  resolver whose drift would need policing. The 004/005 differential spirit is
  still honored with an integration-level gate (D6).

**Alternatives considered**:
- *Paraglide (scaffolded)*: own message format (`messages/en.json`,
  `project.inlang`), own compiler, 3 seed locales — a parallel translation
  system, exactly what the mandate forbids. **Removed** from the scaffold in
  this feature.
- *Thin TS resolver over the corpus JSON*: re-implements resolution (nesting,
  `{{...}}` interpolation, plural suffix selection) — a drift surface that 004
  spent a differential harness eliminating. Rejected.
- *wasm in the Worker via wrangler module rules*: possible (wrangler can bind
  `.wasm` as a module import) but adds deploy complexity and per-request engine
  cost for a page whose content is static. Rejected for this feature; recorded
  as the escape hatch when a future page needs *runtime* SSR translation.

## D2 — Locale URLs and negotiation: prerendered `/{locale}`, runtime 307 at `/`

**Decision**: Serve each locale at `/{locale}` (all 15 prerendered, `/en`
included). The root `/` is **not** prerendered: a wasm-free
`+page.server.ts` parses `Accept-Language`, picks the best supported locale
(deterministic matcher, falls back `en`), and issues a `307` redirect with
`Vary: Accept-Language`. Every locale page emits `<link rel="alternate"
hreflang>` for all 15 siblings plus `x-default → /en`, a self-canonical, and
`<html lang="…">`.

**Rationale**:
- Search engines index per-URL; localized content on distinct URLs with
  hreflang is the crawler-friendly shape (FR-009). Serving different languages
  on one URL by header would fragment indexing.
- The redirect is the only runtime logic and needs no wasm — the Worker stays
  trivially small.
- Matcher rules mirror the RN app's `resolveLanguage` conventions
  (`src/i18n/shared.ts`): exact tag match → base-language mapping
  (`zh-CN → zh`, `zh-Hant/zh-MO → zh-TW`, `es-* → es-MX`, `pt-* → pt-BR`) →
  `en`. Unit-tested as a table (D6).
- Language switching in-product is URL navigation; no switcher UI exists in the
  reference designs, so none ships. (hreflang + browser negotiation covers
  discovery; a footer switcher is a later, page-agnostic addition.)

**SSR/SEO conclusion (the deliverable the spec demands)**: Server-rendered
multilingual content **is achievable and shipped**: initial HTML contains the
full localized first screen for all 15 locales with zero client translation
work. SEO impact: positive — per-locale URLs, hreflang matrix, `lang`
attributes, no JS-gated text (works with JS disabled). Limitations: (a) new
*runtime*-dynamic SSR pages cannot use the wasm engine on Cloudflare without
switching to wrangler wasm-module binding — that is the recorded adjustment
path; (b) adding a locale requires a rebuild (acceptable: corpus changes are
build events by design); (c) the root `/` is a redirect, so the x-default
experience is `/en` — the standard pattern.

## D3 — Token pipeline: generate CSS custom properties from the DTCG export

**Decision**: A build script `app-web/vela-wallet/scripts/gen-tokens.mjs` reads
`docs/design-tokens.json` (Penpot DTCG export: sets `core`, `color-light`,
`color-dark`) and emits two **committed** files:
- `src/lib/tokens/tokens.css` — `:root { … }` with **dark values as base**
  (the "default" reference design W1 is dark, and this is the correct fallback
  for browsers without `prefers-color-scheme`), overridden inside
  `@media (prefers-color-scheme: light)`. Naming: `--color-bg-base`,
  `--space-xl`, `--radius-full`, `--text-2xl`, `--shadow-md`, … (dots → dashes,
  set prefixes dropped).
- `src/lib/tokens/tokens.ts` — the non-CSS constants tests and components need:
  `BREAKPOINT_DESKTOP = 1280`, control sizes, font stacks, motion durations.

A vitest drift gate regenerates both in-memory and diffs against the committed
files (the same discipline as `gen-i18n.mjs`'s "expected: no change").

**Rationale**: `design-system.md` rule 1 forbids literal visual values in
product UI; a generated single-source CSS layer is the only way every future
page inherits the same values. The export is the value authority (the doc says
"Penpot remains the authority for current values").

**Web additions (tokens the export lacks, declared per the design brief's
"propose a semantic token name" rule — flagged in the delivery report)**:
- `size.control.sm/md/lg` = 36/44/52 — named in `design-system.md` §Layout but
  absent from the export; emitted as `--size-control-*`.
- `breakpoint.desktop` = 1280 — mandated by this feature's requirements.
- `font.ui` CJK fallback **Noto Sans SC** — mandated by
  `design-system.md` §Typography; the export's `font.sans` lists only Plus
  Jakarta Sans.

**Conflict resolved**: `design-system.md` prose names JetBrains Mono; the
export says `font.mono = IBM Plex Mono`. Per the doc's own authority rule the
**export wins → IBM Plex Mono**; noted for the founder.

## D4 — Theming: media-query only, no attribute toggle (this feature)

**Decision**: Mode = `prefers-color-scheme`, dark base + light override, plus
`color-scheme: dark light` metadata. No `data-theme` attribute machinery ships
now, but the generator emits light values under a `.theme-light`-compatible
selector list (`@media` + `[data-theme='light']`) so a future in-app theme
setting (the RN app has Light/Dark/Auto) can flip an attribute without
regenerating tokens.

**Rationale**: The Welcome page precedes any settings UI; the OS preference is
the only signal a first-run visitor has expressed. Emitting the attribute
selectors now costs nothing and prevents a token-layer rework later.

## D5 — New copy enters the corpus, not the app

**Decision**: The Welcome page's design copy that already exists is reused
as-is: `onboarding.welcome.createWallet` (创建钱包),
`onboarding.welcome.alreadyHaveWallet` (我已有钱包). New copy — the web
tagline, the six feature cards (title + description), the passkey-index link
label — is added to `rust/crates/vela-core/i18n/locales/<locale>/onboarding.json`
in **all 15 locales** under `onboarding.welcomeWeb.*` (≤3-segment file-level
namespacing consistent with corpus shape; keys follow existing camelCase and
`{{...}}` conventions), then `pnpm gen:i18n` regenerates the four downstream
artefacts (paths.rs, i18n_catalogs/*.rs, resources.ts, public/i18n/*.json) and
`lint:i18n` + `verify:i18n` must stay green.

**Rationale**: `scripts/gen-i18n.mjs` declares `i18n/locales/` "THE source of
truth"; adding keys anywhere else forks the corpus. The existing zh tagline
(`您的密钥，您的资产。\n轻触即可完成。`) differs from the design's
single-line `您的密钥，您的资产` — the design copy becomes a new key rather
than mutating the RN app's string (mutating would trip the conformance-corpus
discipline lint-i18n exists to protect). en/zh authored carefully; the other 13
locales get best-effort translations flagged for the standing human-review
sweep (project i18n convention).

**Note**: `zh-HK` follows the corpus's spoken-Cantonese register; translator
notes must not leak into values (both are known corpus traps).

## D6 — Verification strategy (maps 1:1 to spec Success Criteria)

| Gate | Tool | Covers |
|---|---|---|
| Token drift (SC-005) | vitest: regenerate vs committed + grep-style literal audit of `src/lib/ui` + `src/routes` for hex/px offenders outside the token layer | FR-004 |
| Contrast (SC-004) | vitest: WCAG ratio computation directly over the token JSON for every fg/bg pair the page uses, both modes | FR-005 |
| Negotiation (part of SC-001) | vitest: table tests for the matcher (exact, base-map, quality ordering, unsupported → en) | FR-008/009 |
| Message completeness (SC-001) | vitest: every `welcomeWeb` + reused key resolves in all 15 locales via the wasm engine (no key-echo), differential against the corpus aggregates | FR-007 |
| SSR HTML (SC-001, FR-013) | Playwright e2e against built worker (`wrangler dev`): fetch each `/{locale}` raw (JS off), assert localized tagline/buttons present, `lang`, hreflang matrix, `/` 307 behavior with `Vary` | FR-008/009/013 |
| Layout (SC-003) | Playwright: widths 320/375/768/1279/1280/1440/1920 — no horizontal overflow, controls visible; 1279 mobile vs 1280 desktop structure assertions | FR-001/003 |
| Visual (SC-002, SC-006) | Playwright: `colorScheme` emulation dark+light × mobile/desktop screenshots for human comparison against `design/onboarding/` PNGs | FR-002/005/006 |
| Existing gates (SC-008) | `pnpm check`, `pnpm lint`, `pnpm test:unit`, repo `lint:i18n`/`verify:i18n`/`gen:i18n` idempotency | — |

The engine-differential message test is the 004/005 spirit at the right
altitude for this architecture: since page HTML is produced by the same engine
the test drives, the thing to protect is the *integration* (keys wired to the
right slots, per-locale catalogs actually loaded), not resolver parity, which
005 already proved upstream.

## D7 — Base components and page structure

**Decision**: Four foundation pieces in `src/lib/ui/` consumed by the page:
- `Button.svelte` — `variant: 'primary' | 'secondary'`, `href`/`onclick`,
  disabled/hover/focus/active states from tokens, min target
  `--size-control-md` (44px), height `--size-control-lg` (52px), pill radius
  (`--radius-full`) in both modes (resolving the mock inconsistency: D1 dark
  shows a pill, D1L light a rounded-rect; one shape, listed as a deviation).
- `FeatureCard.svelte` — number, title, description on `--color-bg-raised`,
  `--radius-xl`, `--space-xl` padding.
- `BrandMark.svelte` — inline SVG of the in-app mark; hull uses the
  mode-appropriate color per `design-system.md` §Brand (light `#554B46`, dark
  `#DED5CE` — these live in the SVG asset, not product CSS); never the
  app-icon background.
- `Carousel.svelte` — CSS `scroll-snap` horizontal track (works with JS
  disabled: content remains in-flow and crawlable), dot pager driven by a
  scroll observer as progressive enhancement; no autoplay (calm-UX stance).

Desktop layout: two-pane grid (content pane on `--color-bg-base` with brand +
tagline + 2×3 card grid; action pane on `--color-bg-sunken` with hairline
divider, CTA stack + quiet passkey-index link). Mobile: single column, brand
centered, carousel + pager, bottom-anchored CTA stack. Switch at
`@media (min-width: 1280px)`.

**Alternatives considered**: a component library (skeleton/shadcn-svelte) —
rejected; the design system is bespoke and the token layer is the API.

## D8 — Fonts: self-hosted via @fontsource, subset CJK

**Decision**: `@fontsource-variable/plus-jakarta-sans` (or static weights
400/500/600/700 if variable unavailable), `@fontsource/noto-sans-sc` (needed
weights only), `@fontsource/ibm-plex-mono` (400/500) as pnpm dev-deps, imported
in the root layout; `font-display: swap`. No external font CDN (wallet privacy
stance — no third-party requests).

**Fallback if the registry is unreachable at install time**: system stack
(`-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif`) behind the same
`--font-ui` variable, recorded as a deviation. The repo's only bundled fonts
are Inter (RN legacy) — not the design system's family, so not a substitute.

## Evidence index

- `rust/pkg-web/vela_core.js` — `initSync`, `I18n` class (`t`, `changeLanguage`,
  `loadCatalog`, `exists`, `dir`); `vela_core_bg.base64.js` — embedded wasm; tracked.
- `src/i18n/index.web.ts` — 005's synchronous bootstrap pattern this plan reuses.
- `scripts/gen-i18n.mjs` — corpus source-of-truth declaration + regeneration stages.
- `scripts/lint-i18n-corpus.mjs` — 15-locale × 16-namespace registry, defect baseline.
- `docs/design-tokens.json` — DTCG sets `core` / `color-light` / `color-dark`; full
  value dump verified (space, radius, text, weight, font, leading, motion, shadow,
  opacity, icon, size, color roles incl. `fixed.*`).
- `design-system.md` — non-negotiable rules; token intent; brand-mark rules; the
  known deltas (JetBrains vs IBM Plex Mono; `sizing.control.*` absent from export).
- `design/onboarding/` — W1/W1L/D1/D1L PNGs + logo SVGs; mock inconsistencies noted
  (button radius; passkey link absent from D1L).
- `app-web/vela-wallet/` — scaffold: pnpm, Cloudflare adapter, vitest projects,
  Playwright `webServer: build && preview` (wrangler dev :4173), paraglide (to remove).
- `rust/crates/vela-core/i18n/locales/en|zh/onboarding.json` — existing welcome keys
  and tagline values.
