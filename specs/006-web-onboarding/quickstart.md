# Quickstart: Validating Web Onboarding

All commands run from `app-web/vela-wallet/` (pnpm) unless marked **repo root** (npm).

## Prerequisites

- `pnpm install` once (adds @fontsource packages this feature introduces).
- Node ≥ 22 (scaffold's `@types/node` floor).

## Run it

```bash
pnpm dev              # vite dev server; open /zh, /en, resize across 1280px
pnpm build            # tokens + svelte-kit build, prerenders all 15 locale pages
pnpm preview          # wrangler dev of the BUILT worker on :4173 — production shape
```

Manual spot-checks: `curl -sH 'Accept-Language: ja' localhost:4173/ -i` → 307 to
`/ja` with `Vary: Accept-Language`; `curl -s localhost:4173/ru | grep '<html lang="ru"'`
and the ru tagline; OS appearance toggle flips dark/light without reload.

## Automated gates (each maps to spec success criteria)

```bash
pnpm gen:tokens             # regenerate tokens; git diff must be empty (SC-005)
pnpm test:unit              # vitest: drift gate, literal audit, negotiation table,
                            #   15-locale message completeness (wasm engine), contrast AA (SC-001/004/005)
pnpm check                  # svelte-check + wrangler types (SC-008)
pnpm lint                   # prettier + eslint (SC-008)
pnpm test:e2e               # playwright vs built worker:
                            #   welcome-ssr    → raw HTML per locale, JS-off, hreflang, 307 (SC-001)
                            #   welcome-layout → 7-width overflow sweep + breakpoint switch (SC-003)
                            #   welcome-visual → dark/light × mobile/desktop screenshots (SC-002/006)
```

**Repo root** (corpus integrity after adding `welcomeWeb` keys, SC-008):

```bash
npm run gen:i18n            # must be idempotent (no diff on second run)
npm run lint:i18n           # no NEW corpus defects
npm run verify:i18n         # rust-vs-oracle parity stays zero-divergence
cargo test -p vela-core     # engine tests still green (catalog tables changed)
```

## Visual comparison

Screenshots land in `app-web/vela-wallet/e2e/__screenshots__/`; compare against
`design/onboarding/{W1,W1L,D1,D1L}*.png`. Deliberate deviations must already be
listed in the delivery report — anything else is a defect.

## Expected outcomes

- 15/15 locale pages: localized tagline + buttons in raw HTML, correct `lang`,
  16-entry hreflang matrix (15 + x-default).
- `/`: 307 + `Vary: Accept-Language`; unsupported locale → `/en`.
- No horizontal scroll at 320–1920px; 1279 renders mobile, 1280 desktop.
- Built `_worker.js` contains no `WASM_BASE64` (engine stayed out of runtime).
- Zero hard-coded visual literals outside `src/lib/tokens/` (audit test).
