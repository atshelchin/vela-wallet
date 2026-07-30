# Feature Specification: Penpot Design Source of Truth

**Feature Branch**: `002-penpot-design-source`

**Created**: 2026-07-28

**Status**: Draft

**Input**: User description: "Penpot design source of truth for Vela Wallet: extract the app's complete design system (tokens for light+dark, typography, spacing, radius, motion), full component library with variants and states, information architecture / navigation map, and every screen, modal/sheet, and overlay in every state (default/loading/empty/error/disabled) from the existing React Native codebase, and materialize all of it as Penpot assets (token sets, library components with variant axes, per-screen boards, IA page) via the Penpot MCP plugin API. Acceptance: a fresh AI agent with only MCP access to the Penpot file (plus its documentation pages) can re-implement Vela Wallet pixel- and behavior-faithfully in a different UI stack (SvelteKit, GPUI, native iOS, native Android) without reading the RN codebase. The confirmed design language is docs/DESIGN-LANGUAGE.md ('quiet, typographic, de-containered') which overrides older card-heavy guidance in DESIGN_SYSTEM.md."

## Vision

Today, Vela Wallet's design exists only as an *implementation* (React Native code) plus two partially conflicting prose documents. There are no design files. This feature inverts that: it creates a **Penpot file that is the authoritative, machine-readable description of the product's design** — tokens, components, information architecture, every screen and overlay in every state — so that:

1. **Any future re-implementation** (SvelteKit web app, GPUI desktop app, native iOS, native Android) can be executed by an AI agent whose *only* design input is MCP access to this Penpot file.
2. **Design decisions become reviewable artifacts** instead of being buried in `createStyles()` calls across ~100 source files.
3. **The confirmed design language** ("quiet, typographic, de-containered" — `docs/DESIGN-LANGUAGE.md`) is enforced as the single normative style; where the older `DESIGN_SYSTEM.md` conflicts (card-heavy guidance), the design language wins, and the Penpot file records the resolution.

The deliverable is **Penpot assets + in-file documentation pages**, produced from a rigorous code-grounded inventory (stored in this feature directory), never from generic "wallet app" assumptions.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Design tokens & design language live in Penpot (Priority: P1)

As the founder, I open the Penpot file and see the complete Vela token system — every color (light **and** dark), type scale and font zones, spacing, radii, shadows, motion parameters — as named Penpot token sets with light/dark themes, plus a "Design Language" documentation page stating the normative rules (de-containering, hairline dividers, open heroes, subordinated currency symbols, single accent, accessibility floor).

**Why this priority**: Tokens are the foundation every other asset binds to; even alone, they let any rebuild get color/type/spacing exactly right. This is also the smallest slice that proves the Penpot pipeline works end-to-end.

**Independent Test**: Compare every token in Penpot against the app's theme source of record; a reader who has never seen the app can answer "what is the dark-mode page background?" or "what is the press-feedback scale?" from Penpot alone.

**Acceptance Scenarios**:

1. **Given** the connected Penpot file, **When** token sets are inspected, **Then** every token defined in the app's theme exists with an identical resolved value for both light and dark themes, under a stable dot-notation name (e.g. `color.bg.base`).
2. **Given** the "Design Language" page, **When** an agent reads it, **Then** it contains the ten normative principles, the accessibility floor (44×44 targets, roles/labels, focus, contrast), and an explicit statement that it overrides any conflicting legacy guidance.
3. **Given** a token that exists in code but not in Penpot (or vice versa, or with a differing value), **Then** the coverage audit lists it as a defect.

---

### User Story 2 - Component library with variants and states (Priority: P2)

As a future re-implementer (human or AI), I browse the Penpot library and find every reusable Vela component — primitives (buttons, cards, section labels, dividers, segmented toggles, amount text, avatars, chain/token logos…) and domain components (token rows, detail rows, gas/fee cards, signing sheet building blocks, QR surfaces…) — each as a library component with variant axes (e.g. variant × size × state) covering default / pressed / disabled / loading / selected / error, styled exclusively through the tokens from Story 1.

**Why this priority**: Components are the vocabulary all screens are composed from; with tokens + components, a rebuild can already produce correct UI atoms before any screen is specified.

**Independent Test**: Pick any shared component in the codebase; a matching Penpot library component exists whose variants enumerate the states the code implements, with styling bound to tokens (not raw hex/px).

**Acceptance Scenarios**:

1. **Given** the component inventory extracted from code, **When** the Penpot library is audited, **Then** every inventoried component exists with its variant axes, and each variant's geometry/colors match the code-derived spec.
2. **Given** any component variant, **When** its fills/typography/spacing are inspected, **Then** they reference Penpot tokens wherever the code uses theme tokens.
3. **Given** a component with motion behavior (press spring, entrance fade), **Then** its card in Penpot carries the motion annotation (parameter values), since static tooling cannot animate.

---

### User Story 3 - Information architecture & navigation map (Priority: P3)

As a future re-implementer, I open the "Information Architecture" page and see the complete navigation topology: tab structure, every route (including modals vs pushed screens, deep-link entry points, onboarding order, dev/parallel-space areas), and screen-to-screen flow arrows with their triggering actions.

**Why this priority**: Cheap to produce and disproportionately valuable — it tells an agent *what exists and how it connects* before any pixel detail matters.

**Independent Test**: An agent asked "list every screen a user can reach and how" answers correctly from the IA page alone, matching the app's actual route tree.

**Acceptance Scenarios**:

1. **Given** the IA page, **When** compared against the app's route tree, **Then** every route appears exactly once, annotated with its presentation mode (tab / push / sheet / full-screen modal) and entry points.
2. **Given** a deep link scheme the app registers, **Then** the IA page documents it and where it lands.
3. **Given** any journey on the IA page, **When** an agent follows its flow edges, **Then** each edge names the concrete trigger ("tap Send pill", "slide to confirm", "dismiss sheet") — never an unlabeled arrow.

---

### User Story 4 - Every screen and overlay, in every state (Priority: P4)

As a future re-implementer, for each screen (Home, Send flow including advanced modes, Receive, Activity/History, token detail, dApp browser & connections, contacts/payroll, settings tree, onboarding ceremony, signing surfaces) and each overlay (sheets, alerts, signing modal, funding/top-up, consent sheets, scanner, toasts), Penpot contains boards for its meaningful states — default, loading, empty, error, rate-limited/offline where applicable, success — composed from Story 2's library components on Story 1's tokens, with real copy structure and annotated interactions.

**Why this priority**: This is the bulk of the value ("cover every element, page, dialog, state") but it depends on tokens, components, and IA existing first.

**Independent Test**: Pick any screen state reachable in the app (e.g. "Home while one chain is rate-limited", "Send confirm while fee quote is loading"); a board exists for it or the coverage matrix explicitly records why it is out of scope.

**Acceptance Scenarios**:

1. **Given** the coverage matrix (route × state), **When** audited, **Then** every cell is either "board exists" (linked) or an explicit recorded exclusion — never blank.
2. **Given** any screen board, **When** its layers are inspected, **Then** recurring elements are instances of library components (not detached copies), and text/copy reflects the app's actual content structure.
3. **Given** an overlay, **Then** its boards document presentation per platform (sheet vs slide-up), dismissal behavior, and the single-overlay stacking rule.
4. **Given** any interactive element on a board (button, row, pill, toggle, slide control), **When** inspected, **Then** it carries a machine-readable prototype interaction (navigate-to-board / open-overlay / close-overlay / back) pointing at the exact destination board or state, so the UI is a **traversable state graph**, not a picture gallery — a rebuild agent can answer "what happens when this is tapped?" for every element without guessing.
5. **Given** a state transition within one screen (loading → loaded, default → error), **Then** the boards for those states are linked by an annotated interaction or a labeled flow edge stating the trigger condition (e.g. "fee quote resolves", "RPC 429").

---

### User Story 5 - Rebuild-readiness verification (Priority: P5)

As the founder, I run the acceptance gate: a fresh AI agent, given *only* MCP access to the Penpot file, is asked to produce an implementation-ready specification for sample journeys (e.g. Home, Send end-to-end, a signing request) for a non-RN stack. Its output is checked against the real app; factual errors (wrong colors, missing states, invented elements, wrong flow) mean the file — not the agent — is fixed.

**Why this priority**: This is the definition of done for the whole feature; it can only run once the other stories exist.

**Independent Test**: The gate itself — executed with an agent that has no repo access.

**Acceptance Scenarios**:

1. **Given** a fresh agent with Penpot-MCP access only, **When** it specifies the sample journeys, **Then** its spec contains zero factual contradictions with the running app for structure, tokens, states, and flow.
2. **Given** a gap the agent hits ("I can't tell what happens when X"), **Then** the gap is logged, the Penpot file/doc pages are amended, and the gate re-run.
3. **Given** the same file, **When** the founder runs the SC-008 human gate (RESTRUCTURE-2026-07-30 §9), **Then** it passes — a human reader is an acceptance audience of this story, not only the MCP agent.

---

### Edge Cases

- **Design-language conflict**: where `DESIGN_SYSTEM.md` (card/shadow-heavy) and `DESIGN-LANGUAGE.md` (de-containered) disagree, the design language wins; the Penpot design-language page records each resolved conflict so no future reader resurrects the stale rule.
- **Code vs. confirmed language drift**: some shipped screens still use the older card-heavy style. Boards depict the *normative* target (design language), and the coverage matrix flags screens whose current implementation lags it — the Penpot file must not fossilize known-stale styling.
- **Motion and haptics**: Penpot boards are static. Every animated/haptic behavior (spring press, entrance fades with has-entered gating, pull-to-refresh choreography, pulsing indicators) is captured as a written pattern on an "Interaction Patterns" page with exact parameters, and referenced from affected components/boards.
- **Text scaling & localization**: the app scales text 0.85×–1.28× and ships 14 locales. Boards are drawn at 1.0× in English; the documentation pages state the scaling rule and the layout behaviors that must survive scale extremes and longer locales (wrapping, truncation, min tap targets).
- **Platform divergence**: where iOS / Android / web presentation differs (sheet style, tab-bar height, keyboard avoidance, safe areas), the divergence is annotated on the affected boards/pages rather than duplicating every board per platform.
- **Connection loss / partial generation**: Penpot generation may be interrupted (plugin disconnect). Generation must be resumable and idempotent — re-running updates existing named assets instead of duplicating them.
- **App evolution during and after this feature**: the code keeps changing. The feature ships a re-sync procedure (re-run inventory → diff against Penpot → apply updates) so the file can be kept authoritative; the coverage matrix records the source-code revision it reflects.
- **Dev-only surfaces**: dev screens and the parallel-space test environment are documented on a clearly-marked low-priority page and excluded from the acceptance gate.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST produce a code-grounded design inventory (tokens, components with states, screens with states, overlays, navigation topology, interaction patterns) stored as documents in this feature directory; every Penpot asset MUST be traceable to this inventory, and the inventory to source files. No asset may encode values not grounded in the codebase or the confirmed design language.
- **FR-002**: The Penpot file MUST contain token sets mirroring the app's complete theme — colors (light + dark via token themes), typography (sizes, weights, font zones), spacing, radii, borders, shadows, opacity, motion parameters — under stable dot-notation names matching the code's token names.
- **FR-003**: The Penpot file MUST contain a library component for every reusable UI component in the app, with variant axes covering the component's visual variants and interactive states (default / pressed / disabled / loading / selected / error as applicable), styled via the tokens of FR-002.
- **FR-004**: The Penpot file MUST contain an Information Architecture page: full route tree, presentation mode per route, tab structure, deep links, onboarding order, and screen-to-screen flows with triggering actions.
- **FR-005**: The Penpot file MUST contain boards for every user-reachable screen and overlay in each meaningful state (default, loading, empty, error, degraded/rate-limited, success, as applicable per surface), composed from library component instances with realistic content structure.
- **FR-005a**: Boards MUST be wired together with native prototype interactions: every interactive element carries its action (navigate to board / open overlay / close overlay / back) with the concrete destination, and named flows exist for the primary journeys (onboarding, send, receive, sign, connect, browse). Non-navigational state transitions (loading→loaded, default→error) MUST be expressed as labeled edges or board annotations naming the trigger condition. The resulting interaction graph MUST be readable programmatically, making the file a traversable UI state machine.
- **FR-006**: The Penpot file MUST contain documentation pages sufficient for stack-agnostic reimplementation: Design Language (normative principles + resolved conflicts with legacy guidance), Interaction Patterns (motion/haptic parameters), Accessibility rules, Platform divergence notes, Localization & text-scaling rules, and a "Start Here" index explaining the file's organization and naming conventions to a machine reader.
- **FR-007**: All Penpot assets MUST follow a stable, predictable, machine-discoverable naming and page-organization convention, defined once on the "Start Here" page and applied uniformly.
- **FR-008**: Generation MUST be idempotent and resumable under the **two-layer model** (RESTRUCTURE-2026-07-30 §7): the fidelity layer is regenerated from committed DOM dumps, and the semantic layer (region grouping, instance swaps + overrides, interactions, journey-wall positions, annotations) is re-applied from committed repo data (`edges.json`, `journeys.json`, `region-maps/`, `_plan.json`). Re-running updates assets in place (matched by stable names), never creates duplicates, and never silently destroys either layer; the mandatory regen ordering (72 → 70/73 → swap pass → 74 → audits) is part of this requirement.
- **FR-009**: The feature MUST produce a coverage matrix (every route, component, overlay × required states → Penpot asset or recorded exclusion) with no blank cells, recording the source revision it reflects.
- **FR-010**: The feature MUST define and execute the rebuild-readiness gate (Story 5) and incorporate its findings until the gate passes.
- **FR-011**: The feature MUST provide a documented re-sync procedure for keeping the Penpot file authoritative as the app evolves.

### Key Entities

- **Design Token**: a named design value (color/size/space/motion…) with light and dark resolutions; the atomic unit everything else binds to.
- **Library Component**: a reusable UI element with named variant axes and states; instances compose screens.
- **Screen Board / Overlay Board**: a named visual of one surface in one state, composed of component instances.
- **IA Map**: the navigation topology artifact (routes, presentation modes, flows, deep links).
- **Documentation Page**: normative prose living inside the Penpot file (design language, interactions, accessibility, platform, localization, index).
- **Coverage Matrix**: the audit artifact proving completeness (surface × state → asset/exclusion), pinned to a source revision.
- **Source Inventory**: the code-derived fact base in this feature directory from which all assets are generated.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of theme tokens exist in Penpot with values identical to the app's theme, for both light and dark; zero orphans in either direction.
- **SC-002**: 100% of inventoried reusable components exist as library components; a spot check of any 10 variants finds zero geometry/color deviations from the code-derived spec.
- **SC-003**: The coverage matrix has zero blank cells across all user-reachable routes and overlays; ≥95% of cells are boards (≤5% recorded exclusions with reasons).
- **SC-004**: A fresh AI agent with only Penpot-MCP access produces implementation specs for three sample journeys with zero factual contradictions against the running app (structure, tokens, states, flow).
- **SC-005**: Running the full ordered generation twice in a row yields zero duplicate assets and zero unintended diffs **in both layers** — fidelity shapes AND the re-applied semantic layer (regions, swaps, interactions, wall positions) are stable (idempotency check).
- **SC-006**: A named-asset lookup convention works end-to-end: for any screen/state or component/variant named in the coverage matrix, an agent can locate the asset in Penpot by name alone on the first try.
- **SC-007**: 100% of interactive elements on screen/overlay boards carry a prototype interaction or an explicit "terminal" annotation; an agent starting from the Home board can reach every user-reachable board by following interaction edges alone (graph connectivity check).
- **SC-008** *(human gate — RESTRUCTURE-2026-07-30 §9)*: the founder, opening only the Penpot file, can within 10 minutes: name the three identity traits (stated on `00 Start Here`); list the app's main journeys from the canvas alone; trace send end-to-end by following same-page clicks plus visible `e/` edge labels (cross-page overlay hops are labeled stubs, a platform constraint); and answer a "which components do I reuse for a new token-list feature?" question from `09 Patterns`.
- **SC-009**: no two distinct variant containers or standalone library components share a name; all variant axes are semantic (`variant × size × state`-style) with no captured-copy values (audit 97).
- **SC-010**: every canon screen/overlay board meets the semantic floor (named `region/*` top-level groups; Tier-1 elements as instances with overrides; positions derived from the journey manifest) — enforced by audit 96 on every regen, not by sampling.
- **SC-011**: the mode toggle (activating `color-dark` in place of `color-light`; theme objects only after a verified deployment upgrade — `TokenTheme.addSet()` is a no-op on the current deployment) restyles the demo board pair on `02 Tokens & Type`.

## Assumptions

- A Penpot instance is available and the user will connect the target Penpot file to the MCP server via the Penpot MCP plugin before generation begins (connection is currently not established; analysis and inventory work proceed regardless).
- A **single Penpot file** is the authority (multiple pages inside it), keeping MCP navigation trivial; splitting into multiple files is out of scope unless scale forces it.
- Asset language is **English** (matching the app's source-locale copy); localization is handled by rules on the documentation pages, not per-locale boards.
- Boards are drawn at 1.0× text scale, light theme as the primary depiction; dark theme is expressed through token themes plus a small set of representative dark boards rather than duplicating every board.
- The normative style is `docs/DESIGN-LANGUAGE.md`; `DESIGN_SYSTEM.md` remains valid only where it does not conflict. Screens whose shipped implementation predates the design language are depicted in the normative style and flagged in the coverage matrix.
- Dev-only screens and the parallel-space test environment are documented but excluded from acceptance coverage.
- The RN app remains the behavioral ground truth during this feature; where code and this spec's inventory disagree, code wins and the inventory is corrected.
- Fidelity bar: token- and structure-exact (colors, type, spacing, radii, layout order, states, copy structure); pixel-identical rendering across stacks is not required where platform conventions differ (fonts, shadows, physics).
