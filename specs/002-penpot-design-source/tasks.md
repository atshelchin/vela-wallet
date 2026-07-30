# Tasks: Penpot Design Source of Truth

**Input**: Design documents from `/specs/002-penpot-design-source/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md — all present

**Tests**: No unit-test tasks; verification is the audit-chunk suite (90–95) mandated by the spec's Success Criteria and the generator contract.

> **⚠️ SUPERSEDED IN PART — see [PIVOT-2026-07-29.md](PIVOT-2026-07-29.md).** Tasks below that describe
> authoring component/screen boards *from the inventory reports* are replaced by the
> render-and-screenshot pipeline: capture the running app (screenshot + DOM layout dump), then
> generate boards from that. Phases 1–3 (corrections, foundation, tokens) and Phase 5 (IA, derived
> from the router rather than from pixels) stand as completed. US2/US4 outputs built before the
> pivot are drafts to be rebuilt, not baselines to patch.

> **Restructure adopted 2026-07-30 — see [RESTRUCTURE-2026-07-30.md](RESTRUCTURE-2026-07-30.md).**
> Checkboxes below are reconciled against the 2026-07-30 full-file audit (RESTRUCTURE §2/§10);
> re-scoped tasks may only be re-checked together with a persistent audit that re-runs on every regen.

**Organization**: Grouped by user story (US1 tokens+language → US2 components → US3 IA → US4 screens/overlays/interactions → US5 gate). "Chunk" = a numbered script in `specs/002-penpot-design-source/generator/` executed via `mcp__penpot__execute_code` under the rules of [contracts/generator-contract.md](contracts/generator-contract.md) (upsert-by-name, <15s, `// inv:` traceability).

## Phase 1: Setup (inventory corrections + manifest)

**Purpose**: Make the fact base correct and machine-readable before any Penpot write.

- [x] T001 Create `specs/002-penpot-design-source/generator/` directory with `README.md` stating the chunk-execution protocol (one-paragraph pointer to contracts/generator-contract.md)
- [x] T002 [P] Apply 09-gaps §2 corrections: fix entrance-animation platform rule (iOS-only; Android AND web settled) in `inventory/05-screens-wallet.md`, `inventory/06-screens-other.md`, `inventory/08-motion-states.md`; fix text-scale range to 0.82–1.35 (6 levels, ×1.2 web boost) in `inventory/02-ui-primitives.md`, `inventory/03-domain-components.md`, `inventory/05-screens-wallet.md`; amend BundlerFundingModal standalone wrapper to "dead code — do not board" in `inventory/02-ui-primitives.md`
- [x] T003 [P] Close 09-gaps §1 coverage holes with new spec sections: dApp-browser persistent chrome + account-pill trigger (append to `inventory/05-screens-wallet.md`), LanguagePickerModal + web-request.tsx full per-phase spec (append to `inventory/06-screens-other.md`), WalletAvatar 20px size + custom-network hardcoded fallback-disc colors (append to `inventory/02-ui-primitives.md` §Z)
- [x] T004 [P] Add "i18n resilience" section to `inventory/08-motion-states.md` per 09-gaps §4 (WaveDock pills, SlideToConfirm label budget, VelaButton/AppAlert min-widths, truncation-side inventory, LanguagePickerModal as all-scripts stress board) and record scope rulings (safari-extension popup = documented exclusion + palette-drift warning; safe-recovery-extension = out of scope) in `inventory/09-gaps.md`
- [x] T005 Build `generator/manifest.json`: every route × applicable states, every overlay × states, every component × variant axes, `entry:` list (deep-link/dev entries), `drift:` flags, pinned to current git revision — derived from corrected inventory 02–08; validate JSON and cross-check route list against `src/app/` file tree

**Checkpoint**: fact base corrected; manifest is the single machine-readable work list.

## Phase 2: Foundational (helper lib + file scaffold)

**Purpose**: Shared machinery every story's chunks depend on.

- [x] T006 Write `generator/10-lib.js` installing `storage.lib`: `ensurePage`, `upsertBoard`, `upsertText`, `bindToken`, `chip` (edge:/platform:/motion: annotation chips), `applyFont` (Plus Jakarta Sans zones + IBM Plex Mono), `upsertComponent`, `grid` position helpers — per generator-contract layout conventions
- [x] T007 Write + run `generator/11-scaffold-pages.js`: ensure the 11 numbered pages (`00 Start Here` … `10 Dev & Parallel Space`) exist idempotently; verify re-run returns `created: 0`
- [x] T008 Write + run `generator/12-smoke.js`: font availability assert (Plus Jakarta Sans 400/500/600/700, IBM Plex Mono), interaction API assert (`addInteraction` round-trip on scratch shapes, then cleanup), storage.lib self-test

**Checkpoint**: pages exist, lib proven; user stories can start.

## Phase 3: User Story 1 — Tokens & design language in Penpot (P1) 🎯 MVP

**Goal**: Complete token system (light+dark) + normative Design Language page.

**Independent Test**: token parity audit passes both directions; a reader answers "dark-mode page background?" / "press-feedback scale?" from Penpot alone.

- [x] T009 [US1] Write + run `generator/20-tokens-core.js`: `core` set — spacing, radius, text sizes, font weights/families, borders, opacity, motion durations from corrected `inventory/01-tokens.md` (each value `// inv:` anchored)
- [ ] T010 [US1] Write + run `generator/21-tokens-color.js`: `color-light` + `color-dark` sets (fg/bg/accent/success/error/info/warning/border incl. soft variants, fixed colors incl. shadow-ink/backdrop/focus-ring), reference tokens where code derives (`{color.accent.base}`), mode expressed by **set activation** (`core` + exactly one color set active) — re-scoped by RESTRUCTURE §10: themes portion reworded to set-activation; `TokenTheme.addSet()` is a silent no-op on this deployment, so no theme objects exist
- [x] T011 [P] [US1] Write + run `generator/22-type-specimens.js`: on `02 Tokens & Type` — swatch boards per token group (color chips bound to tokens, spacing/radius scales) + typography specimen boards per font zone (sans/display/mono/numeric with the platform-mono and tabular-figures mandates as chips)
- [x] T012 [P] [US1] Write + run `generator/23-design-language.js`: `01 Design Language` doc boards — the 10 principles from `docs/DESIGN-LANGUAGE.md`, resolved conflicts table vs DESIGN_SYSTEM.md (from inventory conflict lists), accessibility floor (44×44, roles/labels, focus ring, contrast), single-accent discipline, override statement (US1-AS2)
- [x] T013 [US1] Write + run `generator/91-audit-token-parity.js`: extract token tables from `src/constants/theme.ts` side (already mirrored in manifest) vs Penpot sets, both directions, per theme; write result into `generator/audit-report.md` — MUST pass (SC-001) before Phase 4

**Checkpoint**: US1 independently shippable — any rebuild gets colors/type/spacing exactly right.

## Phase 4: User Story 2 — Component library with variants and states (P2)

**Goal**: Every reusable component as a Penpot library component, variants × states, token-bound.

**Independent Test**: pick any inventoried component → matching `C/<Group>/<Name>` exists with the code's states; styling bound to tokens (SC-002 spot-check zero deviations).

- [ ] T014 [US2] Write + run `generator/30-components-velabutton.js` (stale ref was 30-components-primitives.js; VelaButton only — the other primitives landed in `31-b-components-controls.js` [Input], `32-components-rows-c.js` [Divider], `32-components-rows-d.js` [VelaCard/SectionLabel/AmountText], `33-c-components-sheets-signing.js` [RecipientTypeBadge], `34a/34b-components-media.js` [ChainLogo/TokenLogo, avatars]): `C/Primitives/*` — VelaButton (variant×size×state), VelaCard, SectionLabel, Divider (incl. inset values 36/48/60), AmountText (symbolScale/tailScale), ThemedText zones, ContactAvatar/WalletAvatar (sizes incl. 20px), ChainLogo/TokenLogo (fallback disc), badges — from `inventory/02-ui-primitives.md` — re-scoped by RESTRUCTURE §10: duplicate same-named families + captured-copy variant axes → plan-driven merge with semantic axes (W1)
- [ ] T015 [US2] Write + run `generator/31-a-components-controls.js` + `generator/31-b-components-controls.js` (stale ref was 31-components-controls.js): `C/Controls/*` — SegmentedToggle (raised chip WCAG spec), SlideToConfirmButton (60px track/52px knob × nudge/flick/success states), VelaRefresh (72px trigger, 30px arc), FeeTokenSelector rows, GasFeeCard, form fields, chips/pills, WaveDock (86px bar + 56px FAB) — re-scoped by RESTRUCTURE §10: duplicate same-named families + captured-copy variant axes → plan-driven merge with semantic axes (W1)
- [ ] T016 [US2] Write + run `generator/32-components-rows-a.js` … `generator/32-components-rows-d.js` (stale ref was 32-components-rows.js): `C/Rows/*` — TokenRow (incl. checkbox mode), ActivityRow, DetailRow, SettingsRow, contact rows; both selected-row conventions depicted with a normative note (accent-border cards vs check-only de-boxed, per inventory 02 open question resolved toward design language: check-only is canonical, accent-border marked legacy) — re-scoped by RESTRUCTURE §10: duplicate same-named families + captured-copy variant axes → plan-driven merge with semantic axes (W1)
- [ ] T017 [US2] Write + run `generator/33-a-components-sheets-signing.js` + `generator/33-b-components-sheets-signing.js` + `generator/33-c-components-sheets-signing.js` (stale ref was 33-components-sheets-signing.js): `C/Sheets/*` (AppModal pageSheet/fit/android/web variants, AppAlert, sheet header pattern with canonical 20px close icon + AddTokenSheet 18px exception note) and `C/Signing/*` (SigningSheet frame + 9 body views as variants, BalanceChangePreview, WarningBanner, TransactionReceipt 3-status×3-kind, RecipientTypeBadge, signing color grammar chips) — from `inventory/03-domain-components.md` + `07-overlays-modals.md` — re-scoped by RESTRUCTURE §10: duplicate same-named families + captured-copy variant axes → plan-driven merge with semantic axes (W1)
- [ ] T018 [P] [US2] Write + run `generator/34a-components-media.js` … `generator/34d-components-media.js` (stale ref was 34-components-media.js): `C/Media/*` — QRCode white plate, QRScanner overlay frame, ReceiveShareCard, ParallelSpaceBadge (`#7c3aed` + rationale chip), ConnectionFlowStates, ExtensionSignController states — re-scoped by RESTRUCTURE §10: duplicate same-named families + captured-copy variant axes → plan-driven merge with semantic axes (W1)
- [ ] T019 [US2] Write + run `generator/35-components-annotate.js`: motion/a11y annotation chips on all components (press scales 0.97/0.98/0.92, entrance rules iOS-only, haptic points, ≥44 targets, hitSlop 8) referencing `D/patterns/*`; migration-debt table board on `03 Components` listing the 5+ bespoke CTA/segmented violations from DESIGN-REVIEW backlog
- [ ] T020 [US2] Spot-verify 10 random variants via `export_shape` PNG against inventory specs; record in `generator/audit-report.md` (SC-002)

**Checkpoint**: US2 shippable — rebuild can produce correct UI atoms.

## Phase 5: User Story 3 — IA & navigation map (P3)

**Goal**: Complete navigation topology on `04 IA & Flows`.

**Independent Test**: "list every reachable screen and how" answerable from the IA page alone, matching `src/app/` route tree.

- [x] T021 [US3] Write + run `generator/40-ia-route-tree.js`: route-tree diagram boards from corrected `inventory/04-ia-navigation.md` — every route (incl. `/parallel/*`, dev), presentation mode per route (tab/push/sheet/full-screen), tab structure, `/history` dead-registration note
- [x] T022 [P] [US3] Write + run `generator/41-ia-flows-deeplinks.js`: labeled trigger-edge flow list for primary journeys (US3-AS3: every edge names its trigger), deep-link table (`velawallet://` schemes incl. expo-dev-client + sign mailbox), onboarding order, entry-point annotations matching manifest `entry:` list

**Checkpoint**: US3 shippable — an agent knows what exists and how it connects.

## Phase 6: User Story 4 — Every screen & overlay, every state, wired (P4)

**Goal**: ~190 state boards composed from library instances, connected into the traversable graph.

**Independent Test**: coverage matrix zero blank cells (SC-003); BFS from `S/home/default` reaches all boards (SC-007); layers are component instances (US4-AS2).

- [ ] T023 [US4] Write + run `generator/50-screens-home.js`: `S/home/*` — default, rate-limited (cached-balance banner rules), hidden-balance, empty-wallet, refresh states on `05 Screens · Wallet` (HomeScreen = reference screen, most precise; from corrected `inventory/05-screens-wallet.md`) — re-scoped by RESTRUCTURE §10: boards are flat DOM transcriptions with 0 component instances → semantic floor (W2)
- [ ] T024 [US4] Write + run `generator/51-screens-send.js`: `S/send/*` — recipient/amount/confirm steps × states (quote-loading, error, underfunded/treasury bootstrap, success receipt), split/sweep advanced modes, payroll batch — re-scoped by RESTRUCTURE §10: boards are flat DOM transcriptions with 0 component instances → semantic floor (W2)
- [ ] T025 [P] [US4] Write + run `generator/52-screens-wallet-rest.js`: `S/receive/*`, `S/activity/*`, `S/token/[id]/*`, `S/contacts/*` × their manifest states — re-scoped by RESTRUCTURE §10: boards are flat DOM transcriptions with 0 component instances → semantic floor (W2)
- [ ] T026 [P] [US4] Write + run `generator/53-screens-browser-connect.js`: `S/browser/*` (full chrome incl. account pill, loading strip, no-wallet, preparing, load-error), `S/connections/*`, `S/web-request/*` (all 7 phases with per-phase layout), extension surfaces — on `06 Screens · Browser & Connect` — re-scoped by RESTRUCTURE §10: boards are flat DOM transcriptions with 0 component instances → semantic floor (W2)
- [ ] T027 [P] [US4] Write + run `generator/54-screens-settings-onboarding.js`: settings tree (root + every sub-screen incl. Language/Format pickers, network add/edit, feedback row), onboarding ceremony (splash→create/import→passkey states→success) — on `07 Screens · Settings & Onboarding` — re-scoped by RESTRUCTURE §10: boards are flat DOM transcriptions with 0 component instances → semantic floor (W2)
- [ ] T028 [US4] Write + run `generator/55-overlays.js`: every `O/*` × states on `08 Overlays` from `inventory/07-overlays-modals.md` (signing-sheet per request-kind incl. 27 clear-signing scenario representatives, funding content-swap, consent fit-sheet, QR scanner, alerts, toasts) with per-platform presentation + single-overlay stacking-rule chips — re-scoped by RESTRUCTURE §10: boards are flat DOM transcriptions with 0 component instances → semantic floor (W2)
- [ ] T029 [US4] Write + run `generator/56-dark-representatives.js`: dark-theme boards for home, signing sheet, send confirm, settings root (research R9)
- [ ] T030 [US4] Write + run `generator/74-interactions.js` (stale ref was 60-interactions.js): wire ALL pointer interactions (navigate-to/open-overlay/close-overlay/previous-screen) per manifest trigger list + `edge:` chips for every non-pointer transition + named flows (onboarding, send, receive, sign, connect, browse) (FR-005a) — re-scoped by RESTRUCTURE §10: interactions = 0 in file; wiring re-scoped to `edges.json` + W3b
- [ ] T031 [US4] Write + run `generator/92-audit-coverage.js` (matrix vs boards, zero blanks → `generator/coverage.json` + `coverage.md`) and `generator/93-audit-graph.js` (BFS connectivity + no-unwired-element check); iterate until both pass (SC-003, SC-007)

**Checkpoint**: US4 shippable — the file is a traversable UI state machine.

## Phase 7: User Story 5 — Rebuild-readiness gate (P5)

**Goal**: Prove a fresh agent can rebuild from the file alone; fix the file until true.

**Independent Test**: the gate itself (SC-004).

- [ ] T032 [US5] Write + run `generator/90-audit-idempotency.js`: full pipeline re-run → `created: 0` everywhere, stable name-set/geometry hash (SC-005); then `generator/94-audit-lookup.js` name-resolution sample (SC-006); commit `generator/audit-report.md`
- [ ] T033 [US5] Run the gate: fresh agent (Penpot MCP only, no repo) produces implementation specs for Home+rate-limited, Send end-to-end, ERC-20 approve signing; diff vs running app; log gaps in `generator/gate-log.md`
- [ ] T034 [US5] Fix file/doc pages for every gate finding and re-run gate until zero factual contradictions; record final pass in `generator/gate-log.md`

**Checkpoint**: definition of done met.

## Phase 8: Polish & cross-cutting

- [x] T035 [P] Write + run `generator/46-start-here.js` (stale ref was 70-start-here.js): `00 Start Here` boards — in-file copy of [contracts/consumption-contract.md](contracts/consumption-contract.md) (entry protocol, naming grammar, interpretation rules, stability guarantees)
- [x] T036 [P] Write + run `generator/71-patterns.js`: `09 Patterns` boards — motion params (springs 15/150/0.8 & 20/120/1, durations 150/250/400, press scales, sheet timings 220/180/200), haptics, a11y floor, platform divergence, i18n resilience + text-scale rules, rate-limit/offline UX patterns
- [x] T037 [P] Write + run `generator/72-dev-space.js`: `10 Dev & Parallel Space` boards (dev screens, parallel badge env, fault-injection UX) marked excluded-from-gate
- [ ] T038 Update `specs/002-penpot-design-source/quickstart.md` §5 re-sync procedure with any operational learnings; final commit of generator/, audits, coverage, gate log on branch `002-penpot-design-source`

## Phase 9: Restructure (RESTRUCTURE-2026-07-30)

**Purpose**: Execute the adopted restructure workstreams per [RESTRUCTURE-2026-07-30.md](RESTRUCTURE-2026-07-30.md) §7–§8; order W0 → W3a → W1 → W2 → W3b → W4 → W5.

- [ ] T039 [W0] Two-layer pipeline changes per RESTRUCTURE §7 (`edges.json`, region-maps, journey manifest with derived board positions, 70/72/73 changes, swap re-detection, `vela.role` capture) + extended 12-smoke asserts — note: override + instance-internal-interaction smoke already PASSED 2026-07-30 (live session)
- [ ] T040 [W3a] Cheap connectivity: mode-toggle demo, IA-map navigate links, flow definitions, DTCG export to `docs/design-tokens.json`
- [ ] T041 [W1] Semantic component library: plan-driven family merges with semantic axes, sticker-sheet blocks + usage + code-ref, coverage regenerated against new names + old→new rename ledger
- [ ] T042 [W2] Journey walls: journey manifest authored, boards repositioned by pipeline, region-group + Tier-1 instance-swap every canon board to the semantic floor, proxy boards + stubs per §5 rules
- [ ] T043 [W3b] Full wiring: per-element interactions from `edges.json` onto post-swap shapes, visible `e/` edge layer, T031 iterated until SC-007 passes
- [ ] T044 [W4] Human layer: cover + identity board, page headers, illustrated design language, recipe + reuse index, changelog + archive pages, hygiene
- [ ] T045 [W5] Contract & gate: §10 doc deltas, re-run all audits (incl. 96/97), US5 gate + SC-008 human gate

## Dependencies & execution order

- Phase 1 → Phase 2 → US1 (T009–T013) → US2 (needs tokens) → US3 (independent of US2 but after Phase 2; may run parallel to US2) → US4 (needs US2 components + US3 flow definitions + manifest) → US5 (needs everything) → Phase 8 (T035–T037 may start once their source content is stable; T035 after naming grammar frozen = after T030)
- Within phases, [P] tasks touch different files/pages and may run in the same session interleaved.

## Parallel example (US4)

T025/T026/T027 build boards on three different Penpot pages from three different inventory files — run as parallel chunks between the serial anchors T024 → T028 → T030.

## Implementation strategy

MVP = Phase 1–3 (US1): corrected facts + tokens + design language — already lets any rebuild get the visual foundation exactly right. Then US2 → US3 → US4 in order, gate last. Each checkpoint is a commit; audits are re-run at every checkpoint, not just at the end.

## Phase 9 status (2026-07-30, same-day execution)

- [x] T039 W0 — two-layer pipeline (`fe76f42`): semantic layer committed (edges.json, journeys.json, region-maps/, _plan.json fields), guard audits 96/97 wired as the regen tail, pages 11/12, spec deltas SC-008..011. Smoke asserts PASSED (instance text override survives a main-component change; addInteraction works on instance-internal shapes).
- [x] T040 W3a (`1760f34`): docs/design-tokens.json + chunk 26 bidirectional check (147/147, zero drift); 27-mode-demo with SC-011 verified by exporting both modes; 48-ia-targets (13/13 targets resolve, two dangling board names fixed); 44 rerouted through corridors with arrowheads; 74 verifies interaction read-back.
- [x] T041 W1 (`6752858`): 75-components-shelf (6 category sections, 53 docs blocks), component-code-refs.json (53/53 path-validated), merge-component-docs.mjs (20 Tier-1 use-when/don't), 76-drafts-quarantine, audit 97 PASSES.
- [x] T042 W2 (`af54c2f`, `a7105f0`): gen-region-maps.mjs → 90 committed maps; 73 derives wall positions; 77-walls draws the visible labelled edge layer; 79-send-tail completes the send journey; audit 96 PASSES (89 canon boards, 0 unexplained flat, 0 position mismatch; 3 boards in the recorded recapture-debt bucket).
- [ ] T043 W3b: 93-audit-graph corrected to read `vela.edge` plugin data (it was still scanning for the on-canvas `edge:` chips deleted earlier, so it would have reported wired journeys as broken); SC-007 pass still to be demonstrated.
- [ ] T044 W4: cover, identity board, feature recipe and changelog page shipped (`da6b097`); the ten principles on `01 Design Language` are still prose, and the reuse-index board is not built.
- [ ] T045 W5: idempotency re-run, US5 agent gate, SC-008 human gate.

> Process rule in force: a box is ticked only alongside a passing audit that re-runs on every regeneration (勾不回滚 guard). T042's tick rests on audit 96; T041's on audit 97.
