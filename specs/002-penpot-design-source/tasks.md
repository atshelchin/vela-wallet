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

**Organization**: Grouped by user story (US1 tokens+language → US2 components → US3 IA → US4 screens/overlays/interactions → US5 gate). "Chunk" = a numbered script in `specs/002-penpot-design-source/generator/` executed via `mcp__penpot__execute_code` under the rules of [contracts/generator-contract.md](contracts/generator-contract.md) (upsert-by-name, <15s, `// inv:` traceability).

## Phase 1: Setup (inventory corrections + manifest)

**Purpose**: Make the fact base correct and machine-readable before any Penpot write.

- [ ] T001 Create `specs/002-penpot-design-source/generator/` directory with `README.md` stating the chunk-execution protocol (one-paragraph pointer to contracts/generator-contract.md)
- [ ] T002 [P] Apply 09-gaps §2 corrections: fix entrance-animation platform rule (iOS-only; Android AND web settled) in `inventory/05-screens-wallet.md`, `inventory/06-screens-other.md`, `inventory/08-motion-states.md`; fix text-scale range to 0.82–1.35 (6 levels, ×1.2 web boost) in `inventory/02-ui-primitives.md`, `inventory/03-domain-components.md`, `inventory/05-screens-wallet.md`; amend BundlerFundingModal standalone wrapper to "dead code — do not board" in `inventory/02-ui-primitives.md`
- [ ] T003 [P] Close 09-gaps §1 coverage holes with new spec sections: dApp-browser persistent chrome + account-pill trigger (append to `inventory/05-screens-wallet.md`), LanguagePickerModal + web-request.tsx full per-phase spec (append to `inventory/06-screens-other.md`), WalletAvatar 20px size + custom-network hardcoded fallback-disc colors (append to `inventory/02-ui-primitives.md` §Z)
- [ ] T004 [P] Add "i18n resilience" section to `inventory/08-motion-states.md` per 09-gaps §4 (WaveDock pills, SlideToConfirm label budget, VelaButton/AppAlert min-widths, truncation-side inventory, LanguagePickerModal as all-scripts stress board) and record scope rulings (safari-extension popup = documented exclusion + palette-drift warning; safe-recovery-extension = out of scope) in `inventory/09-gaps.md`
- [ ] T005 Build `generator/manifest.json`: every route × applicable states, every overlay × states, every component × variant axes, `entry:` list (deep-link/dev entries), `drift:` flags, pinned to current git revision — derived from corrected inventory 02–08; validate JSON and cross-check route list against `src/app/` file tree

**Checkpoint**: fact base corrected; manifest is the single machine-readable work list.

## Phase 2: Foundational (helper lib + file scaffold)

**Purpose**: Shared machinery every story's chunks depend on.

- [ ] T006 Write `generator/10-lib.js` installing `storage.lib`: `ensurePage`, `upsertBoard`, `upsertText`, `bindToken`, `chip` (edge:/platform:/motion: annotation chips), `applyFont` (Plus Jakarta Sans zones + IBM Plex Mono), `upsertComponent`, `grid` position helpers — per generator-contract layout conventions
- [ ] T007 Write + run `generator/11-scaffold-pages.js`: ensure the 11 numbered pages (`00 Start Here` … `10 Dev & Parallel Space`) exist idempotently; verify re-run returns `created: 0`
- [ ] T008 Write + run `generator/12-smoke.js`: font availability assert (Plus Jakarta Sans 400/500/600/700, IBM Plex Mono), interaction API assert (`addInteraction` round-trip on scratch shapes, then cleanup), storage.lib self-test

**Checkpoint**: pages exist, lib proven; user stories can start.

## Phase 3: User Story 1 — Tokens & design language in Penpot (P1) 🎯 MVP

**Goal**: Complete token system (light+dark) + normative Design Language page.

**Independent Test**: token parity audit passes both directions; a reader answers "dark-mode page background?" / "press-feedback scale?" from Penpot alone.

- [ ] T009 [US1] Write + run `generator/20-tokens-core.js`: `core` set — spacing, radius, text sizes, font weights/families, borders, opacity, motion durations from corrected `inventory/01-tokens.md` (each value `// inv:` anchored)
- [ ] T010 [US1] Write + run `generator/21-tokens-color.js`: `color-light` + `color-dark` sets (fg/bg/accent/success/error/info/warning/border incl. soft variants, fixed colors incl. shadow-ink/backdrop/focus-ring), reference tokens where code derives (`{color.accent.base}`), then themes `Light`/`Dark` activating core+respective color set
- [ ] T011 [P] [US1] Write + run `generator/22-type-specimens.js`: on `02 Tokens & Type` — swatch boards per token group (color chips bound to tokens, spacing/radius scales) + typography specimen boards per font zone (sans/display/mono/numeric with the platform-mono and tabular-figures mandates as chips)
- [ ] T012 [P] [US1] Write + run `generator/23-design-language.js`: `01 Design Language` doc boards — the 10 principles from `docs/DESIGN-LANGUAGE.md`, resolved conflicts table vs DESIGN_SYSTEM.md (from inventory conflict lists), accessibility floor (44×44, roles/labels, focus ring, contrast), single-accent discipline, override statement (US1-AS2)
- [ ] T013 [US1] Write + run `generator/91-audit-token-parity.js`: extract token tables from `src/constants/theme.ts` side (already mirrored in manifest) vs Penpot sets, both directions, per theme; write result into `generator/audit-report.md` — MUST pass (SC-001) before Phase 4

**Checkpoint**: US1 independently shippable — any rebuild gets colors/type/spacing exactly right.

## Phase 4: User Story 2 — Component library with variants and states (P2)

**Goal**: Every reusable component as a Penpot library component, variants × states, token-bound.

**Independent Test**: pick any inventoried component → matching `C/<Group>/<Name>` exists with the code's states; styling bound to tokens (SC-002 spot-check zero deviations).

- [ ] T014 [US2] Write + run `generator/30-components-primitives.js`: `C/Primitives/*` — VelaButton (variant×size×state), VelaCard, SectionLabel, Divider (incl. inset values 36/48/60), AmountText (symbolScale/tailScale), ThemedText zones, ContactAvatar/WalletAvatar (sizes incl. 20px), ChainLogo/TokenLogo (fallback disc), badges — from `inventory/02-ui-primitives.md`
- [ ] T015 [US2] Write + run `generator/31-components-controls.js`: `C/Controls/*` — SegmentedToggle (raised chip WCAG spec), SlideToConfirmButton (60px track/52px knob × nudge/flick/success states), VelaRefresh (72px trigger, 30px arc), FeeTokenSelector rows, GasFeeCard, form fields, chips/pills, WaveDock (86px bar + 56px FAB)
- [ ] T016 [US2] Write + run `generator/32-components-rows.js`: `C/Rows/*` — TokenRow (incl. checkbox mode), ActivityRow, DetailRow, SettingsRow, contact rows; both selected-row conventions depicted with a normative note (accent-border cards vs check-only de-boxed, per inventory 02 open question resolved toward design language: check-only is canonical, accent-border marked legacy)
- [ ] T017 [US2] Write + run `generator/33-components-sheets-signing.js`: `C/Sheets/*` (AppModal pageSheet/fit/android/web variants, AppAlert, sheet header pattern with canonical 20px close icon + AddTokenSheet 18px exception note) and `C/Signing/*` (SigningSheet frame + 9 body views as variants, BalanceChangePreview, WarningBanner, TransactionReceipt 3-status×3-kind, RecipientTypeBadge, signing color grammar chips) — from `inventory/03-domain-components.md` + `07-overlays-modals.md`
- [ ] T018 [P] [US2] Write + run `generator/34-components-media.js`: `C/Media/*` — QRCode white plate, QRScanner overlay frame, ReceiveShareCard, ParallelSpaceBadge (`#7c3aed` + rationale chip), ConnectionFlowStates, ExtensionSignController states
- [ ] T019 [US2] Write + run `generator/35-components-annotate.js`: motion/a11y annotation chips on all components (press scales 0.97/0.98/0.92, entrance rules iOS-only, haptic points, ≥44 targets, hitSlop 8) referencing `D/patterns/*`; migration-debt table board on `03 Components` listing the 5+ bespoke CTA/segmented violations from DESIGN-REVIEW backlog
- [ ] T020 [US2] Spot-verify 10 random variants via `export_shape` PNG against inventory specs; record in `generator/audit-report.md` (SC-002)

**Checkpoint**: US2 shippable — rebuild can produce correct UI atoms.

## Phase 5: User Story 3 — IA & navigation map (P3)

**Goal**: Complete navigation topology on `04 IA & Flows`.

**Independent Test**: "list every reachable screen and how" answerable from the IA page alone, matching `src/app/` route tree.

- [ ] T021 [US3] Write + run `generator/40-ia-route-tree.js`: route-tree diagram boards from corrected `inventory/04-ia-navigation.md` — every route (incl. `/parallel/*`, dev), presentation mode per route (tab/push/sheet/full-screen), tab structure, `/history` dead-registration note
- [ ] T022 [P] [US3] Write + run `generator/41-ia-flows-deeplinks.js`: labeled trigger-edge flow list for primary journeys (US3-AS3: every edge names its trigger), deep-link table (`velawallet://` schemes incl. expo-dev-client + sign mailbox), onboarding order, entry-point annotations matching manifest `entry:` list

**Checkpoint**: US3 shippable — an agent knows what exists and how it connects.

## Phase 6: User Story 4 — Every screen & overlay, every state, wired (P4)

**Goal**: ~190 state boards composed from library instances, connected into the traversable graph.

**Independent Test**: coverage matrix zero blank cells (SC-003); BFS from `S/home/default` reaches all boards (SC-007); layers are component instances (US4-AS2).

- [ ] T023 [US4] Write + run `generator/50-screens-home.js`: `S/home/*` — default, rate-limited (cached-balance banner rules), hidden-balance, empty-wallet, refresh states on `05 Screens · Wallet` (HomeScreen = reference screen, most precise; from corrected `inventory/05-screens-wallet.md`)
- [ ] T024 [US4] Write + run `generator/51-screens-send.js`: `S/send/*` — recipient/amount/confirm steps × states (quote-loading, error, underfunded/treasury bootstrap, success receipt), split/sweep advanced modes, payroll batch
- [ ] T025 [P] [US4] Write + run `generator/52-screens-wallet-rest.js`: `S/receive/*`, `S/activity/*`, `S/token/[id]/*`, `S/contacts/*` × their manifest states
- [ ] T026 [P] [US4] Write + run `generator/53-screens-browser-connect.js`: `S/browser/*` (full chrome incl. account pill, loading strip, no-wallet, preparing, load-error), `S/connections/*`, `S/web-request/*` (all 7 phases with per-phase layout), extension surfaces — on `06 Screens · Browser & Connect`
- [ ] T027 [P] [US4] Write + run `generator/54-screens-settings-onboarding.js`: settings tree (root + every sub-screen incl. Language/Format pickers, network add/edit, feedback row), onboarding ceremony (splash→create/import→passkey states→success) — on `07 Screens · Settings & Onboarding`
- [ ] T028 [US4] Write + run `generator/55-overlays.js`: every `O/*` × states on `08 Overlays` from `inventory/07-overlays-modals.md` (signing-sheet per request-kind incl. 27 clear-signing scenario representatives, funding content-swap, consent fit-sheet, QR scanner, alerts, toasts) with per-platform presentation + single-overlay stacking-rule chips
- [ ] T029 [US4] Write + run `generator/56-dark-representatives.js`: dark-theme boards for home, signing sheet, send confirm, settings root (research R9)
- [ ] T030 [US4] Write + run `generator/60-interactions.js`: wire ALL pointer interactions (navigate-to/open-overlay/close-overlay/previous-screen) per manifest trigger list + `edge:` chips for every non-pointer transition + named flows (onboarding, send, receive, sign, connect, browse) (FR-005a)
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

- [ ] T035 [P] Write + run `generator/70-start-here.js`: `00 Start Here` boards — in-file copy of [contracts/consumption-contract.md](contracts/consumption-contract.md) (entry protocol, naming grammar, interpretation rules, stability guarantees)
- [ ] T036 [P] Write + run `generator/71-patterns.js`: `09 Patterns` boards — motion params (springs 15/150/0.8 & 20/120/1, durations 150/250/400, press scales, sheet timings 220/180/200), haptics, a11y floor, platform divergence, i18n resilience + text-scale rules, rate-limit/offline UX patterns
- [ ] T037 [P] Write + run `generator/72-dev-space.js`: `10 Dev & Parallel Space` boards (dev screens, parallel badge env, fault-injection UX) marked excluded-from-gate
- [ ] T038 Update `specs/002-penpot-design-source/quickstart.md` §5 re-sync procedure with any operational learnings; final commit of generator/, audits, coverage, gate log on branch `002-penpot-design-source`

## Dependencies & execution order

- Phase 1 → Phase 2 → US1 (T009–T013) → US2 (needs tokens) → US3 (independent of US2 but after Phase 2; may run parallel to US2) → US4 (needs US2 components + US3 flow definitions + manifest) → US5 (needs everything) → Phase 8 (T035–T037 may start once their source content is stable; T035 after naming grammar frozen = after T030)
- Within phases, [P] tasks touch different files/pages and may run in the same session interleaved.

## Parallel example (US4)

T025/T026/T027 build boards on three different Penpot pages from three different inventory files — run as parallel chunks between the serial anchors T024 → T028 → T030.

## Implementation strategy

MVP = Phase 1–3 (US1): corrected facts + tokens + design language — already lets any rebuild get the visual foundation exactly right. Then US2 → US3 → US4 in order, gate last. Each checkpoint is a commit; audits are re-run at every checkpoint, not just at the end.
