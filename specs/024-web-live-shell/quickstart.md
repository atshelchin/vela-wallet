# Quickstart — 024 Web Live Shell

## Prerequisites

```sh
cd app-web/vela-wallet && pnpm install
# wasm artifact in sync (after any repo-root build:wasm):
pnpm sync:wasm
```

## Gates (run in this order; all must pass — AI-CODING-RULES §4)

```sh
pnpm check        # tokens drift + gen-core-types --check + wrangler types + svelte-check
pnpm lint         # prettier + eslint (+ literal audit incl. new dirs via test:unit)
pnpm test:unit -- --run
pnpm build        # prerender ×15 locales; worker stays wasm-free
pnpm test:e2e     # builds + serves the real worker; 3 engines
```

Codegen drift (repo root): `node rust/scripts/gen-core-types.mjs wallet-state --check`

## Scenarios (each maps to a Success Criterion)

1. **Settings currency persists (SC-001)** — `pnpm dev`; create/sign into a
   wallet; Settings → change display currency; hard-reload: the choice holds.
   With no rate source in 024, amounts show the USD figure (core rule:
   `rate: null` degrades formatting, refuses conversion).
2. **Custom network lifecycle (SC-001)** — Settings → networks → add a custom
   network (probe fields render their unreachable/unknown states — expected in
   024); edit it; reload: intact; remove it; reload: gone.
3. **Duplicate chain id refused (SC-004)** — try adding a network with a
   built-in chain id: the core refuses; the message comes from the corpus.
4. **Contacts CRUD + groups (SC-002/003)** — wallet tab bar → Contacts (the
   tab now navigates); add ≥3 contacts, one invalid address (refused by the
   core), create a group, assign members, delete one contact; reload between
   steps: book intact, deletion durable, both layouts show the same book.
5. **Guard (FR-008)** — open `/{locale}/contacts` in a fresh profile: routed
   to Welcome, like /wallet and /settings.
6. **Budgets (SC-005)** — `pnpm test:e2e`: welcome-ssr's zero-wasm-fetch and
   worker-purity assertions still green; `ls -l static/vela_core_bg.*.wasm`
   byte-identical to the Phase-1 baseline.
7. **Paved road (SC-008)** — the Phase-5 display_currency commit's diff
   touches no file under `src/lib/core/` or `src/lib/services/` — recorded in
   results.md.

## Galleries unchanged

`/{locale}/gallery/[state]` settings + contacts states render pixel-identical
(fixtures are canon; live builders are siblings).
