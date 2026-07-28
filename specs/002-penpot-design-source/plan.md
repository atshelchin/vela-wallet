# Implementation Plan: Penpot Design Source of Truth

**Branch**: `002-penpot-design-source` | **Date**: 2026-07-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-penpot-design-source/spec.md`

## Summary

Materialize Vela Wallet's complete design system — tokens (light+dark), component library with variants/states, IA & navigation, every screen/overlay in every meaningful state, wired into a traversable prototype-interaction graph — as a single Penpot file (**"Vela Wallet — Design Source of Truth"**), generated programmatically over the Penpot MCP plugin API from the code-grounded inventory in [inventory/](inventory/). Generator scripts live in this repo (reviewable, idempotent, resumable); the Penpot file is the build artifact and the authority future re-implementation agents consume via MCP.

## Technical Context

**Language/Version**: JavaScript (Penpot plugin-context scripts executed via `mcp__penpot__execute_code`; ES2020, no Node APIs) + Bash/Python for repo-side audit tooling

**Primary Dependencies**: Penpot 2.16 (local docker, `localhost:9001`), Penpot MCP server (`penpotapp/mcp:2.16`, integrated remote mode), `penpotUtils` + persistent `storage` object in the plugin context; chrome-devtools MCP (drives the logged-in workspace session `claude-agent@vela.local`, keeps the plugin bridge alive)

**Storage**: The Penpot file itself (authority artifact); generator scripts + inventory + coverage matrix in `specs/002-penpot-design-source/` (git)

**Testing**: Idempotency re-run diff (SC-005), coverage-matrix audit (SC-003), token parity audit vs `src/constants/theme.ts` (SC-001), interaction-graph connectivity traversal (SC-007), visual spot-checks via `export_shape` PNG vs live web app screenshots (chrome-devtools), final fresh-agent rebuild-readiness gate (SC-004)

**Target Platform**: Penpot file consumed over MCP by future AI agents; depicts iOS/Android/web behavior of the RN app with platform-divergence annotations

**Project Type**: Design-artifact generation pipeline (scripts → design file), not app code

**Performance Goals**: Each `execute_code` chunk < ~15s and < ~200 shapes touched, so plugin-bridge timeouts/disconnects can't corrupt a phase; full regeneration from empty file achievable in one session

**Constraints**: Plugin bridge allows ONE connection per token (browser tab must stay open; chrome-devtools re-opens/reloads on drop); writes must be idempotent by stable name (update-in-place, never duplicate); all values must trace to the inventory (no invented values); `DESIGN-LANGUAGE.md` overrides `DESIGN_SYSTEM.md` on conflict; boards depict normative style at 1.0× text scale, light theme (dark via token themes + representative dark boards)

**Scale/Scope**: ~120 tokens × 2 themes; ~55 library components (~200 variants); ~45 screens + ~30 overlays → ~190 state boards; ~10 documentation pages; ~400 prototype interactions

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is the unfilled speckit template — no project constitution has been ratified. No gates to evaluate; general speckit discipline applies (spec-grounded, testable acceptance, artifacts in feature dir). PASS (vacuous).

## Project Structure

### Documentation (this feature)

```text
specs/002-penpot-design-source/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0: decisions (naming, idempotency, interactions, fonts, verification)
├── data-model.md        # Phase 1: Penpot file schema (pages, naming grammar, token/component/board/interaction models)
├── contracts/
│   ├── consumption-contract.md   # How a future agent reads the file over MCP (FR-006/FR-007)
│   └── generator-contract.md     # Conventions all generator scripts obey (idempotency, chunking, storage keys)
├── quickstart.md        # Validation runbook (connection, audits, re-run checks, gate)
├── checklists/requirements.md
├── inventory/           # 01–08 fact reports + 09-gaps (corrections applied per tasks)
└── generator/           # execute_code script chunks, numbered, idempotent (created in implement phase)
```

### Source Code (repository root)

```text
specs/002-penpot-design-source/generator/   # all new executable artifacts live here
src/constants/theme.ts                      # read-only ground truth for token parity audit
src/**                                      # read-only ground truth for inventory corrections
```

No app source is modified by this feature; the deliverable is the Penpot file plus the generator/audit scripts and docs above.

**Structure Decision**: single-feature docs + `generator/` script directory; Penpot file is the runtime artifact addressed by name, never by hardcoded IDs (IDs differ per regeneration into a fresh file).

## Complexity Tracking

No constitution violations to justify (no constitution). One deliberate complexity: generator scripts are kept as **repo files pasted into `execute_code`** rather than an npm tool with the Penpot API mocked — rejected alternative (standalone penpot-export tooling) because the plugin API is the only supported write path and scripts-in-repo keep the pipeline reviewable and re-runnable with zero build infrastructure.
