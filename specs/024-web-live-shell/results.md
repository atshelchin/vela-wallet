# Delivery Report — 024 Web Live Shell

**Branch**: `024-web-live-shell` · Started 2026-09-03 · Branch point: `main` @ e78afdfa

Filled in as phases land. Baselines first, because "did this grow?" has no
answer after the fact.

---

## Baselines (T001, T003) — recorded 2026-09-03, before any change

### Core artifact (must be byte-identical at close — SC-005)

| Artifact | Bytes |
| --- | --- |
| `public/vela_core_bg.4603c8421603.wasm` | 3,630,664 |
| `app-web/vela-wallet/static/vela_core_bg.596b9804d84e.wasm` | 3,629,267 |
| Ceiling (`rust/scripts/build-web.mjs` MAX_WASM_BYTES) | 4,000,000 |

⚠️ Pre-existing condition: the app-web `static/` copy (fingerprint
`596b9804d84e`) is STALE against `public/` (`4603c8421603`) — `pnpm
sync:wasm` will refresh it on first run. This predates the branch; the
*post-sync* fingerprint `4603c8421603` / 3,630,664 bytes is the baseline the
close-out compares against. Source digest (`rust/pkg-web/build-info.json`):
`4603c8421603ee95…` over 138 source files.

### Corpus pins (`scripts/gen-i18n.mjs:243-245`)

1620 paths = 1536 leaf + 84 branch.

### Port provenance list (T003 / research D2, D5) — source commit e78afdfa

| Source file | Lines | Destination (024) |
| --- | --- | --- |
| `app-web/…/src/lib/onboarding/core/effect-loop.ts` | 126 | moved → `src/lib/core/effect-loop.ts` (unchanged) |
| `app-web/…/src/lib/onboarding/core/json-shell.ts` | 44 | moved → `src/lib/core/json-shell.ts` (unchanged) |
| `app-web/…/src/lib/onboarding/core/wasm-client.ts` | 89 | logic → `src/lib/core/client.ts`; old path = thin re-export |
| `src/services/wallet-state-core/network-admin-types.ts` | 18 | ported |
| `src/services/wallet-state-core/network-admin-executor.ts` | 587 | ported (net ops → fail-closed, D1) |
| `src/services/wallet-state-core/contacts-types.ts` | 22 | ported |
| `src/services/wallet-state-core/contacts-executor.ts` | 308 | ported (identity/classify → fail-closed, D1) |
| `src/services/wallet-state-core/executors.ts` (currency arm) | of 188 | ported → `currency-executor.ts` |
| `src/services/wallet-state-core/display-currency-resident.ts` | 76 | pattern reference for `currency.svelte.ts` |

### Wasm classes available (build-info wasmInterface)

All 24 `*core_new/dispatch/resolve_effect/view` export quads present —
confirms zero new wasm bytes are needed for this feature.

### Codegen drift (T003) — 2026-09-03

`node rust/scripts/gen-core-types.mjs --check` → **green**:
onboarding 25 types / 2 mirrors · session 11 / 1 · wallet-state 311 / 1, all
current. (Known repo gap stands: this check runs in no CI job; T012 adds the
wallet-state check to the app's local gate.)

## Green-tree check (T002) — 2026-09-03, unmodified tree

| Gate (app-web/vela-wallet) | Result |
| --- | --- |
| `pnpm check` | 🔴 first run → **green on re-run**. First failure was the documented pre-existing stale `static/` wasm (`596b9804d84e`); the suite's own `pnpm build` step ran `sync:wasm` and refreshed it to `4603c8421603` (3,630,664 B). svelte-check: 823 files, 0 errors. |
| `pnpm lint` | ✅ prettier + eslint clean |
| `pnpm test:unit -- --run` | ✅ 13 files, 380 tests |
| `pnpm build` | ✅ prerender ×15, cloudflare adapter done |
| `pnpm test:e2e` | 🔴 **30 failed / 28 passed on unmodified main** → ✅ **58/58 after the baseline-repair commit** (details below) |

### The e2e baseline was broken on main — root causes and repair

The full log showed 30 failures, all in JS-dependent tests; SSR/no-JS tests
passed, which is why `pnpm build` (the only web gate CI runs) never noticed.

1. **Intro gate (spec 020) was never taught to the welcome e2e.** A fresh
   Playwright context is a first run, so the intro carousel covered the
   landing page: every `.headline` measurement and CTA-visibility assertion
   failed. Repair: `addInitScript` seeds `vela.intro.seen` (imported
   `STORAGE_KEY`, not a copied literal) in `welcome-layout.e2e.ts` (suite-wide)
   and the hero describe of `welcome-ssr.e2e.ts`.
2. **Real product bug unmasked: 164px horizontal overflow at 1280px (4px at
   1440px).** `Button.svelte` base carries `width: 100%` (phone pattern); the
   Welcome desktop rule (`.actions :global(.button)`, spec 019) set
   `flex: 0 0 auto; min-width` but never handed the width back, so both CTAs
   rendered 520px wide and the row overflowed. Repair: one line —
   `width: auto` — implementing exactly what the rule's own comment ("each at
   ITS LABEL'S width") already promised. Founder-visible change, flagged in
   the commit.
3. **Stale locators**: the desktop rail ships its own `header.brand` +
   `.wordmark` in the DOM at every width, so the mobile brand-row test's
   unscoped locators hit strict-mode violations. Repair: scoped to `.column`.

After repair: `pnpm test:e2e` → **58 passed**, including both budget
assertions (zero-wasm Welcome, wasm-free Worker).

Side observation (not this feature's suite): the repo-root Expo Playwright
suite (`npx playwright test` at repo root) currently lands 28 passed /
**6 flaky** (approval-guard, batch-send, clear-signing, eip681-pay,
onboarding-signin, onboarding-sync — all pass on retry) / 1 skipped.
Pre-existing; recorded for later reference since 026 will port
parallel-space from this suite.


---

## Phase 2 — the paved road (T004–T013)

**What shipped**: `wallet-state` codegen target gained the app-web mirror
(`src/lib/core/generated/`, 311 files, `--check` green in 2 mirrors);
`effect-loop.ts` + `json-shell.ts` moved to `$lib/core/` (git mv, contents
unchanged; 2 importers repointed); `$lib/core/client.ts` now owns the runtime
loader (`loadCore()`) and exports all 24 machine classes — the old
`wasm-client.ts` is a thin compatibility re-export, so its 10 importers are
untouched; `$lib/core/types.ts` carries the generic `SessionOptions` (ported
from Expo `wallet-state-core/types.ts`); `$lib/services/storage.ts` is the
IndexedDB-backed AsyncStorage-shaped KV (+7 browser-project tests — the
`.svelte.test.ts` name is the vitest browser-project selector).

**Behaviour-neutrality proof**: all five gates green with zero product
behaviour change; e2e 58/58; wasm byte-identical to baseline (3,630,664).

**Literal-audit expansion** (T010): `core`, `services`, `settings`, `session`
joined the audited set. settings/session had been an unlisted gap since
023/019 — the audit immediately caught `ChainMark.svelte`'s `color: #fff`
(now `var(--color-onAccent)`) and four px-values living in comments (reworded;
the audit's letter counts comment text, and the letter is the gate).

**New gate in `check`**: `gen-core-types.mjs wallet-state session --check` —
the first drift fence anywhere for the 311 wallet-state types (CI still runs
only `pnpm build` for this app; the local gate is the honest one).

**svelte-check surface**: 823 → 1139 files (the generated mirror joined the
program), 0 errors.
