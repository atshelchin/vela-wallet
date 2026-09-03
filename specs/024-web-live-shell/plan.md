# Implementation Plan: Web Live Shell — Settings & Contacts on the Core

**Branch**: `024-web-live-shell` | **Date**: 2026-09-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/024-web-live-shell/spec.md`

## Summary

Wire three storage-only Crux machines — `network_admin`, `display_currency`,
`contacts` — into the SvelteKit web client, replacing fixture data on the
Settings screen and giving Contacts a real route and a real interaction
surface. Pay, once, for the generic pipeline every later machine reuses: an
app-web mirror of the generated wallet-state types, a generalised core loader,
the effect-loop/json-shell plumbing promoted out of the onboarding directory,
and an IndexedDB-backed async KV with the AsyncStorage shape so Expo executor
ports keep a zero-diff storage seam. Zero network: every network-flavoured
operation is answered with the failure variant the core already models
(research D1). The wiring pattern is the session pattern
(`src/lib/session/core/`), ported per machine from the Expo reference
(`src/services/wallet-state-core/`).

## Technical Context

**Language/Version**: TypeScript 5 (strict) + Svelte 5 (runes) on SvelteKit 2;
Rust 1.97.1 for the (unchanged) machines and the ts-rs generator bins; Node
scripts for codegen.

**Primary Dependencies**: existing only — `rust/pkg-web` wasm artifact (all 24
machines already aboard; 3,630,664 / 4,000,000 bytes), `effect-loop.ts` +
`json-shell.ts` (ported unchanged from Expo in 019), ts-rs via
`rust/scripts/gen-core-types.mjs`. No new npm dependencies.

**Storage**: IndexedDB (one DB `vela`, one object store, hand-rolled promise
wrapper ~80 lines) behind an AsyncStorage-shaped async KV; the existing 4
onboarding localStorage keys untouched. Same `vela.*` key names and JSON value
formats as the Expo client (the stored format is the compatibility contract —
contacts executor's shape-translation comment).

**Testing**: vitest (server project) for builders/executors/storage; Playwright
across chromium/firefox/webkit for persistence e2e; existing welcome-ssr
budget assertions unchanged.

**Target Platform**: browsers via Cloudflare Pages/Worker (prerendered ×15
locales; worker stays wasm-free).

**Project Type**: web app (`app-web/vela-wallet`, own pnpm workspace) + one
repo-root codegen script edit.

**Performance Goals**: no regression of existing budgets; settings/contacts
interactions render from committed core views within one frame of the view
callback (no spinners for local storage ops).

**Constraints**: zero new wasm bytes; Welcome fetches zero wasm; corpus
changes only via the 5-step repo-root process; prerender preserved for every
touched route; no business `if` in executors.

**Scale/Scope**: 3 machines, 2 screens, 1 new route; ~10 new/moved plumbing
files + ~4 files per machine; e2e suite grows by ~3 specs.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled Spec Kit template. Per
the precedent of specs 018/019, the de-facto rules plus
`agent-rules/AI-CODING-RULES.md` are the gate.

| Rule | This feature |
| --- | --- |
| **One authoritative implementation per capability per platform** | ✅ The point of the program: rules stay in `vela-core` only; the web gains executors and builders, never rules. 017 FR-202's TypeScript-owns-logic arrangement is explicitly retired (spec, Why). |
| **Tokens only — no literal colours, spacing, radii, type** | ✅ No new visual surface is drawn; every new `src/lib/` dir is added to the literal-audit source list (`tokens.test.ts`), closing the silent-exemption gap. |
| **i18n through vela-core; no hard-coded strings** | ✅ contacts (018) and settings (023) corpora already cover the screens; gaps go through the 5-step corpus process ([contracts/i18n-keys.md](./contracts/i18n-keys.md)). |
| **Generated files are regenerated, not hand-edited** | ✅ `gen-core-types.mjs` gains an app-web mirror for the existing `wallet-state` target; outputs committed; `--check` added to the app's `check` script. |
| **Fixtures are the single canon for UI state** | ✅ fixture builders stay canon for galleries; live wiring adds *sibling* `buildXFromCore` builders feeding the same display models (research D7). |
| **Components are pure: strings and models in, elements out** | ✅ contacts components gain callback *props* only; decisions stay in the core, handlers are injected by the route (research D6). |
| **Core decides, shell performs** | ✅ [contracts/shell-operations.md](./contracts/shell-operations.md): every operation answered, expected failures as the core's variants, exhaustive switches with `never` fallthrough. |
| **One PR solves one problem; split what exceeds review scope** (§2) | ✅ Six phases, each one commit with its own gate; the service port is bounded to storage + three executors (no RPC layer in this feature). |
| **High-risk changes carry risk description, test evidence, rollback** (§3) | ✅ **Medium** risk (founder-classified): no funds path, no auth change; the risky pieces are the shared-plumbing move (mitigated: pure path change, all gates green per phase) and a new persistence layer (mitigated: three-engine e2e + fail-closed answers). Rollback is per-phase since each phase is its own commit. |

No violations to justify — Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/024-web-live-shell/
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0 — decisions D1–D8
├── data-model.md        # Phase 1 — entities, keys, stored shapes
├── quickstart.md        # Phase 1 — run + verify guide
├── contracts/
│   ├── shell-operations.md   # what the web answers for every operation
│   └── i18n-keys.md          # corpus deltas (expected: near-zero)
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks output
```

### Source Code (repository root)

```text
rust/scripts/gen-core-types.mjs        # + app-web outDir on the wallet-state target

app-web/vela-wallet/src/lib/
├── core/                              # NEW home of the shared plumbing
│   ├── effect-loop.ts                 # moved from onboarding/core (unchanged)
│   ├── json-shell.ts                  # moved from onboarding/core (unchanged)
│   ├── client.ts                      # generalised loader: loadCore() + Core re-exports
│   ├── types.ts                       # SessionOptions<View> hoisted
│   └── generated/                     # ts-rs mirror of the wallet-state target (committed)
├── services/
│   └── storage.ts                     # NEW async KV: AsyncStorage shape over IndexedDB
├── settings/
│   ├── core/                          # network-admin executor + store; currency store
│   └── live.ts                        # buildSettingsFromCore (sibling of fixtures.ts)
├── contacts/
│   ├── core/                          # contacts executor + session store
│   └── live.ts                        # buildContactsFromCore
└── session/core/                      # imports repointed to $lib/core (behaviour unchanged)

app-web/vela-wallet/src/routes/[locale]/
├── settings/+page.svelte              # fixture body → live views (RPC tiles stay fixture)
└── contacts/+page.{svelte,server.ts}  # NEW route + EntryGenerator

app-web/vela-wallet/e2e/
├── settings-persistence.e2e.ts        # NEW
└── contacts-persistence.e2e.ts        # NEW
```

**Structure Decision**: single web app; the only file outside it is the codegen
registry (`gen-core-types.mjs`), which already supports N output mirrors. The
old `onboarding/core/{effect-loop,json-shell}.ts` paths are deleted, their
importers repointed (small, mechanical; research D5).

## Phases

Each phase is one commit with its own gate. Phase 2 blocks everything later.

| # | Phase | Blocks | Gate |
| --- | --- | --- | --- |
| 1 | Setup — baselines (wasm bytes/fingerprint, corpus counts), port-provenance list, green-tree check | all | full app-web gate suite on unmodified tree |
| 2 | Shared pipeline — codegen mirror, `$lib/core/` move + `loadCore()`, storage KV, literal-audit list | 3–6 | `pnpm check && pnpm lint && pnpm test:unit && pnpm build` (behaviour-neutral; e2e too) |
| 3 | Settings live — `network_admin` executor/store/builder, route wiring, fail-closed net ops | 5 | gates + new vitest for executor/builder |
| 4 | Contacts live — route, executor/store, callback surface, builder, corpus gaps | 5 | gates + vitest; corpus 5-step if keys needed |
| 5 | `display_currency` — the SC-008 probe: wire it touching zero shared files; currency row live | 6 | gates + the SC-008 diff measurement recorded |
| 6 | e2e + closeout — persistence specs ×3 engines, budget re-assertions, results.md | — | `pnpm test:e2e` full matrix; results.md in 019 format |

MVP is Phases 1–3: one fixture screen gone live proves the whole shape.
