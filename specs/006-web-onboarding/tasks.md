# Tasks: Web App Foundation + Onboarding Welcome Page

**Input**: Design documents from `/specs/006-web-onboarding/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included — the spec mandates them (FR-012, SC-001…SC-008).

**Organization**: US1 = Welcome page (P1), US2 = design language light/dark (P2), US3 = localized indexable first screen (P3). The token layer and i18n engine are foundational (both US1 inputs); US2/US3 phases carry their completion + proof.

## Format: `[ID] [P?] [Story] Description`

All app paths relative to `app-web/vela-wallet/` unless prefixed `repo:`.

## Phase 1: Setup

- [X] T001 Remove paraglide/inlang from the scaffold: delete `project.inlang/`, `messages/`, `src/lib/paraglide` output references, drop `paraglideVitePlugin` from `vite.config.ts`, remove `@inlang/paraglide-js` from `package.json`, delete the scaffold `src/routes/demo/` routes that depend on it
- [X] T002 Add dependencies via pnpm: `@fontsource/plus-jakarta-sans` (400/500/600/700), `@fontsource/noto-sans-sc` (400/500/700), `@fontsource/ibm-plex-mono` (400/500); record exact versions in `package.json` (fallback plan: research.md D8 system stack)
- [X] T003 [P] Add `gen:tokens` script entry to `package.json` (`node scripts/gen-tokens.mjs`) and wire it into `build`/`check` prep so a stale token layer cannot build silently — plus confirm the scaffold builds without `svelte.config.js` (config lives inline in `vite.config.ts`) or add the config file if `svelte-kit sync` requires it

## Phase 2: Foundational (blocking)

- [X] T004 Write `scripts/gen-tokens.mjs` implementing [contracts/tokens.md](./contracts/tokens.md): read `repo:docs/design-tokens.json`, emit `src/lib/tokens/tokens.css` (dark base `:root`, light under `prefers-color-scheme: light` + `[data-theme]` hooks) and `src/lib/tokens/tokens.ts` (BREAKPOINT_DESKTOP, CONTROL, FONT_UI/FONT_MONO, MOTION, per-mode color tables); include web-additions table with `/* web addition */` markers; run it and commit generated output
- [X] T005 [P] Write `src/lib/i18n/locales.ts`: 15-locale registry (tags, urlPath, hreflang), `negotiate(acceptLanguage: string): Locale` per [contracts/i18n-ssr.md](./contracts/i18n-ssr.md) — first verify the base-language map against `repo:src/i18n/shared.ts` `resolveLanguage` and copy its table verbatim
- [X] T006 [P] Add `onboarding.welcomeWeb.*` keys (meta.title, meta.description, tagline, passkeyIndexLink, features.{noSeedPhrase,oneAddress,openSource,keysInPasswordManager,safeContracts,stablecoinGas}.{title,description}) to `repo:rust/crates/vela-core/i18n/locales/<locale>/onboarding.json` for ALL 15 locales — zh authored from the design mocks (design is zh-source), en authored, 13 best-effort; zh-HK spoken-Cantonese register; no translator notes in values
- [X] T007 Run `repo:npm run gen:i18n` (regenerates paths.rs, i18n_catalogs/*.rs, resources.ts, public/i18n/*.json + locale aggregates) and verify idempotency (second run → no diff); commit regenerated artefacts
- [X] T008 Write `src/lib/i18n/engine.server.ts`: `initSync` bootstrap from `repo:rust/pkg-web` (pattern: `repo:src/i18n/index.web.ts`), en-fallback construction from the en aggregate, `loadCatalog` per locale from `repo:rust/crates/vela-core/i18n/locales/{locale}.json`, `resolveWelcomeMessages(locale): PageMessages` per data-model.md
- [X] T009 Root shell: update `src/app.html` (`%lang%` placeholder + `color-scheme` meta), `src/hooks.server.ts` (html lang/dir substitution), `src/routes/+layout.svelte` (import `tokens.css` + fontsource CSS, base body styles from tokens), delete scaffold `src/routes/+page.svelte` welcome-boilerplate

**Checkpoint**: tokens + engine + corpus keys exist — story phases can proceed.

## Phase 3: US1 — Welcome page (P1, MVP)

- [X] T010 [P] [US1] `src/lib/ui/Button.svelte` per [contracts/components.md](./contracts/components.md) (variant primary/secondary, href/onclick, disabled, focus ring tokens, pill radius, `--size-control-lg`)
- [X] T011 [P] [US1] `src/lib/ui/FeatureCard.svelte` (number/title/description, raised surface, radius.xl, spacing tokens)
- [X] T012 [P] [US1] `src/lib/ui/BrandMark.svelte` — inline in-app mark SVG from `repo:design/onboarding/logo-light.svg`/`logo-dark.svg`, hull color mode-switched, sails preserved
- [X] T013 [P] [US1] `src/lib/ui/Carousel.svelte` — scroll-snap track + IntersectionObserver dot pager, no autoplay, overscroll contained, ARIA slide semantics, JS-off degradation keeps content in flow
- [X] T014 [US1] Locale routes: `src/routes/[locale]/+layout.server.ts` (validate param against registry, 404 unknown, `entries()` = 15 locales, `prerender = true`, return `resolveWelcomeMessages(locale)`), `src/routes/[locale]/+layout.svelte`
- [X] T015 [US1] `src/routes/[locale]/+page.svelte` — Welcome composition per contracts/components.md: mobile `<1280px` (centered brand, tagline, carousel + pager, bottom CTA stack, passkey link) and desktop `≥1280px` (left brand + tagline + 3×2 grid; right sunken action pane with hairline divider, CTA stack, quiet passkey link); breakpoint literal must equal `BREAKPOINT_DESKTOP`
- [X] T016 [P] [US1] Placeholder destinations: `src/routes/[locale]/create/+page.svelte`, `src/routes/[locale]/import/+page.svelte`, `src/routes/[locale]/settings/passkey-index/+page.svelte` — minimal tokenized pages with localized `meta.title`-style headings (keys may reuse `onboarding.welcomeWeb.meta.*`? No — use `onboarding.welcome.createWallet`/`alreadyHaveWallet`/`welcomeWeb.passkeyIndexLink` as headings; no new keys)
- [X] T017 [US1] e2e `e2e/welcome-layout.e2e.ts`: widths 320/375/768/1279/1280/1440/1920 — no horizontal overflow (`scrollWidth <= innerWidth`), controls visible/clickable, 1279 shows carousel pager + no grid, 1280 shows grid + action pane; CTA navigation reaches placeholders

**Checkpoint**: `/en` and `/zh` render both layouts faithfully — independently demoable.

## Phase 4: US2 — Design language light/dark (P2)

- [X] T018 [P] [US2] Drift gate `src/lib/tokens/tokens.test.ts`: regenerate via the generator's exported pure function and byte-compare committed `tokens.css`/`tokens.ts`; assert light/dark color-path symmetry
- [X] T019 [P] [US2] Literal audit in same test file: scan `src/lib/ui/**` + `src/routes/**` sources for hex colors, px spacing/radius/shadow/font literals outside `var(--…)`; whitelist: generated files, breakpoint literal (must equal BREAKPOINT_DESKTOP), BrandMark SVG asset colors
- [X] T020 [P] [US2] Contrast test `src/lib/tokens/contrast.test.ts`: WCAG ratios from tokens.ts color tables for every pair used (fg.base/bg.base, fg.base/bg.raised, fg.muted/bg.base, fg.muted/bg.raised, fg.subtle/bg.base, CTA label/accent.base, fg.muted/bg.sunken, border pairs at 3:1 UI threshold) in BOTH modes; thresholds per pair documented in-file (CTA label rationale from research.md D7 → delivery report)
- [X] T021 [US2] e2e `e2e/welcome-visual.e2e.ts`: Playwright `colorScheme` emulation — dark and light × mobile (390×844) and desktop (1440×900) screenshots to `e2e/__screenshots__/`; assert page background/foreground computed styles flip between modes (SC-006) — device-pixel screenshot comparison vs `repo:design/onboarding/*.png` stays human-reviewed

**Checkpoint**: both modes proven AA + token-pure — design language deliverable done.

## Phase 5: US3 — Localized indexable first screen (P3)

- [X] T022 [P] [US3] `src/routes/+page.server.ts`: root 307 via `negotiate()` with `Vary: Accept-Language` + `Cache-Control: private, no-store`; NOT prerendered (runtime worker, wasm-free)
- [X] T023 [P] [US3] Head matrix in `src/routes/[locale]/+page.svelte` (or layout): hreflang × 15 + x-default → `/en`, self-canonical, localized `<title>`/`<meta name="description">` from `welcomeWeb.meta.*`
- [X] T024 [P] [US3] Unit tests `src/lib/i18n/locales.test.ts`: negotiation table (exact, base-map zh-CN→zh / zh-Hant→zh-TW / zh-MO→zh-TW / es-AR→es-MX / pt-PT→pt-BR / fr-CA→fr, q-ordering, unsupported→en, empty header→en, case-insensitivity)
- [X] T025 [P] [US3] Unit tests `src/lib/i18n/messages.test.ts`: via engine.server — every welcome key resolves in all 15 locales (no key-echo), resolved strings differ across at least en/zh/ja (catalog actually loaded), meta strings non-empty; differential: `resolveWelcomeMessages` output equals direct `engine.t()` for sampled keys
- [X] T026 [US3] e2e `e2e/welcome-ssr.e2e.ts`: raw-fetch each of 15 `/{locale}` (JS never runs) asserting localized tagline + button labels + `<html lang>` + 16-entry hreflang; `/` with `Accept-Language: ja` → 307 `/ja` + Vary header; unsupported (`th`) → `/en`; JS-disabled browser context still shows all six feature texts; built `_worker.js` contains no `WASM_BASE64`
- [X] T027 [US3] Corpus integrity at repo root: `npm run lint:i18n` (no NEW defects), `npm run verify:i18n` (zero divergence), `cargo test -p vela-core` (catalog tables changed) — fix regressions if any

**Checkpoint**: SSR/SEO story proven end-to-end.

## Phase 6: Polish & Delivery

- [X] T028 [P] Update `README.md` + `CLAUDE.md` in app-web/vela-wallet: architecture (tokens pipeline, i18n prerender model, corpus workflow), commands, how to add a page/locale/token
- [X] T029 Full gate sweep per quickstart.md: `pnpm gen:tokens` (no diff) → `pnpm check` → `pnpm lint` → `pnpm test:unit` → `pnpm build` → `pnpm test:e2e`; repo `npm run gen:i18n` idempotent; `npm run typecheck` (RN app unaffected by resources.ts regen)
- [X] T030 Write delivery report `specs/006-web-onboarding/results.md`: implementation summary + file map, SSR/SEO conclusion (research.md D2), token map per design-system.md handoff format, verified-items list, deviations & open product decisions (button shape, passkey link in light, IBM Plex Mono, CTA contrast rationale, 13 locales pending human review)

## Dependencies

- Phase 1 → Phase 2 → US1 → {US2, US3 in either order or parallel} → Polish
- US2/US3 depend on US1 only for the page the tests exercise; their unit-test tasks (T018–T020, T024–T025) depend solely on Phase 2 and can start alongside US1.
- T007 depends on T006; T008 depends on T007 (aggregates must contain new keys); T014 depends on T008; T015 depends on T010–T014.

## Parallel opportunities

- T005/T006 alongside T004; T010–T013 all parallel; T016 parallel with T017; T018–T020 parallel; T022–T025 parallel.

## MVP scope

Phases 1–3 (through T017): a faithful, responsive, en+zh-demoable Welcome page. US2/US3 turn it into the proven foundation the rewrite needs.
