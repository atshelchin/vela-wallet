# Implementation Plan: Web App Foundation + Onboarding Welcome Page

**Branch**: `codex/006-web-onboarding` | **Date**: 2026-08-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-web-onboarding/spec.md`

## Summary

Build the web rewrite's shared foundation inside the existing `app-web/vela-wallet` SvelteKit scaffold — a design-token layer generated from the Penpot DTCG export, a small set of base UI components, and SSR-capable i18n that reuses the vela-core translation corpus and engine — then ship the first consumer: the Onboarding Welcome page, faithful to the four reference designs, responsive at the 1280px boundary, light/dark, localized in all 15 locales in the initial HTML.

The load-bearing architectural facts (details in [research.md](./research.md)):

1. **The vela-core wasm engine can run at prerender time but not on the deployed Cloudflare Worker.** `rust/pkg-web` is a tracked, base64-embedded, `initSync` wasm build of the real Rust i18n engine (spec 005). Node (build/prerender) loads it synchronously; Cloudflare Workers forbids runtime wasm compilation from bytes. Therefore: **prerender all 15 locale variants of the page at build time using the real engine**, and keep only a wasm-free locale-negotiation redirect in the runtime worker. Zero client-side translation runtime; zero resolver re-implementation; drift-free by construction.
2. **Tokens are generated, never hand-written.** `docs/design-tokens.json` (Penpot DTCG export, the value authority per `design-system.md`) → committed `tokens.css` (dark = base `:root`, light under `prefers-color-scheme: light`) + `tokens.ts` constants, with a vitest drift gate that regenerates in-memory and diffs.
3. **Paraglide is removed.** The scaffold's inlang/paraglide setup defines a parallel, incompatible message system; the mandate is to reuse the corpus in `rust/crates/vela-core/i18n/locales/` (source of truth, 15 locales × 16 namespaces, `{{...}}` interpolation, `gen:i18n`/`lint:i18n`/`verify:i18n` pipeline).

## Technical Context

**Language/Version**: TypeScript 5 (strict) via `typescript` ^6.0.3 toolchain in the scaffold; Svelte 5 (runes mode forced); SvelteKit ^2.63

**Primary Dependencies**: `@sveltejs/adapter-cloudflare`, vela-core wasm artefact (`rust/pkg-web`, tracked, build-time only), corpus at `rust/crates/vela-core/i18n/locales/`, `docs/design-tokens.json`, self-hosted fonts (`@fontsource` packages: Plus Jakarta Sans, Noto Sans SC subset, IBM Plex Mono)

**Storage**: N/A (static prerendered pages + stateless negotiation redirect)

**Testing**: vitest (server project: token drift gate, negotiation matcher, contrast computation, catalog completeness), Playwright e2e against `wrangler dev` of the built worker (SSR HTML assertions with JS disabled, 15-locale fetches, breakpoint/overflow checks, light/dark screenshots vs reference designs)

**Target Platform**: Modern evergreen browsers, desktop ≥1280px and mobile <1280px viewports; deploy target Cloudflare Workers + static assets (scaffold's existing `wrangler.jsonc`)

**Project Type**: Web application (frontend-only feature inside `app-web/vela-wallet`; pnpm workspace, independent of the RN app's npm root)

**Performance Goals**: First-screen localized text in initial HTML (no client i18n round-trip); no wasm or catalog bytes in the client bundle; page JS limited to carousel/pager enhancement

**Constraints**: Cloudflare Workers cannot compile wasm from bytes at runtime (drives prerender architecture); `design-system.md` forbids literal visual values in product UI; corpus conventions (namespaces, key paths, `{{...}}`) are mandatory; branch prefix `codex/`

**Scale/Scope**: 1 page × 15 locales × 2 modes × 2 layouts; foundation modules (tokens, i18n, 3–4 base components) reused by every later page

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is the unfilled template — no ratified project constitution exists. Gate passes vacuously. In its place this feature honors the repo's operative doctrine: `design-system.md` non-negotiable rules (no literal visual values, semantic tokens, accent discipline, AA contrast) and the 004/005 i18n doctrine (corpus is single source; resolution engine is vela-core; parity is proven, not assumed).

**Post-Phase-1 re-check**: PASS — the design introduces no new visual-value sources (generator output is the only CSS token definition site), no parallel translation system (paraglide removed; new keys enter the corpus through `gen:i18n`), and no unverifiable claims (each spec SC maps to a named check in quickstart.md).

## Project Structure

### Documentation (this feature)

```text
specs/006-web-onboarding/
├── plan.md              # This file
├── research.md          # Phase 0: decisions D1–D8 with rationale
├── data-model.md        # Phase 1: token, locale, message-key, page-content entities
├── quickstart.md        # Phase 1: how to run every verification
├── contracts/
│   ├── tokens.md        # DTCG → CSS variable naming/emission contract + web additions
│   ├── i18n-ssr.md      # locale routes, negotiation, hreflang, key contract for new copy
│   └── components.md    # base component APIs (Button, FeatureCard, BrandMark, Carousel)
└── tasks.md             # Phase 2 (/speckit-tasks — not created by plan)
```

### Source Code (repository root)

```text
app-web/vela-wallet/
├── scripts/
│   └── gen-tokens.mjs           # DTCG export → tokens.css + tokens.ts (committed output)
├── src/
│   ├── lib/
│   │   ├── tokens/
│   │   │   ├── tokens.css       # GENERATED: :root dark base + light media override
│   │   │   └── tokens.ts        # GENERATED: BREAKPOINT_DESKTOP, control sizes, font stacks
│   │   ├── i18n/
│   │   │   ├── locales.ts       # 15-locale registry, negotiation matcher, lang/dir metadata
│   │   │   ├── engine.server.ts # wasm engine bootstrap + per-locale catalog loading (build/prerender only)
│   │   │   └── messages.ts      # page-scoped message-key manifests + resolve helper types
│   │   └── ui/
│   │       ├── Button.svelte    # primary/secondary, states, ≥44px target
│   │       ├── FeatureCard.svelte
│   │       ├── BrandMark.svelte # in-app mark, mode-aware hull color
│   │       └── Carousel.svelte  # scroll-snap slides + dot pager (progressive enhancement)
│   ├── routes/
│   │   ├── +layout.svelte       # tokens.css, fonts, html lang/dir plumbing
│   │   ├── +page.server.ts      # / → 307 negotiated locale (runtime worker, wasm-free)
│   │   └── [locale]/
│   │       ├── +layout.server.ts# validate locale param, prerender entries, resolve messages
│   │       ├── +layout.svelte
│   │       ├── +page.svelte     # Welcome page (mobile + desktop layouts)
│   │       └── create/ import/ settings/  # placeholder destinations (+page.svelte each)
│   ├── hooks.server.ts          # html lang/dir substitution, Vary header on /
│   └── app.html                 # %lang% placeholder, color-scheme meta
├── e2e/
│   ├── welcome-ssr.e2e.ts       # 15-locale raw-HTML assertions, JS-off content, hreflang
│   ├── welcome-layout.e2e.ts    # breakpoint switch, overflow sweep at 7 widths
│   └── welcome-visual.e2e.ts    # light/dark × mobile/desktop screenshots
├── src/lib/tokens/tokens.test.ts        # drift gate vs docs/design-tokens.json
├── src/lib/i18n/locales.test.ts         # negotiation matcher table tests
├── src/lib/i18n/messages.test.ts        # all welcome keys resolve in 15 locales, engine-differential
└── src/lib/tokens/contrast.test.ts      # WCAG AA computation over used pairs, both modes

rust/crates/vela-core/i18n/locales/<locale>/onboarding.json   # + welcomeWeb keys (15 locales)
# regenerated by scripts/gen-i18n.mjs: paths.rs, i18n_catalogs/*.rs, src/i18n/resources.ts, public/i18n/*.json
```

**Structure Decision**: Single frontend app inside the existing pnpm-workspace scaffold at `app-web/vela-wallet`. Foundation code lives under `src/lib/{tokens,i18n,ui}` — pages orchestrate, libs own the reusable logic. The only repo-level writes outside `app-web` are the corpus additions in `rust/crates/vela-core/i18n/locales/` plus their `gen:i18n` regeneration, which is the corpus's designed extension path.

## Complexity Tracking

No constitution violations to justify. One deliberate scope-shaped simplification: no client-side i18n runtime (language switch = URL navigation), which removes an entire class of hydration/drift problems for this feature and remains extensible later (research D2).
