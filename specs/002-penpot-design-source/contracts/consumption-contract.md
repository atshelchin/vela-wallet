# Consumption Contract — how a rebuild agent reads this file over MCP

Audience: a future AI agent (SvelteKit / GPUI / native iOS / native Android rebuild) whose ONLY design input is Penpot MCP access to **"Vela Wallet — Design Source of Truth"**. This contract is duplicated on the `00 Start Here` page inside the file itself; the in-file copy is authoritative for consumers, this repo copy is authoritative for the generator.

## Entry protocol

1. `high_level_overview` (MCP) → learn the plugin API.
2. `execute_code`: `penpotUtils.getPages()` → expect the 11 numbered pages (data-model §1). Read `00 Start Here` first — it contains the naming grammar and this protocol.
3. Never navigate by shape ID across sessions; always resolve by name (`penpotUtils.findShape(s => s.name === '<name>')`).

## Reading the design system

- **Tokens**: `penpot.library.local.tokens` → sets `core` (mode-independent), `color-light`, `color-dark`. **There are NO theme objects** (the themes API is broken in this deployment — see generator/audit-report.md): the mode axis is expressed by set activation. Default active = `core`+`color-light` (Light). To resolve Dark values, read the `color-dark` set's tokens directly (same names), or toggle set activation. Token names are the same identifiers the original RN code used — implement them as your stack's design tokens 1:1.
- **Components**: `penpot.library.local.components` — names `C/<Group>/<Name>`; variant axes enumerate visual variants × states. Read geometry/fills/typography from the main instance; token bindings via `shape.tokens`. A variant's board name encodes its axis values.
- **Screens/Overlays**: boards `S/<route>/<state>` and `O/<overlay>/<state>` (390×844 screens). Recurring elements are component instances — resolve `instance.component()` to identify them; layout comes from board flex properties, not absolute eyeballing.
- **Motion/haptics/a11y/platform/i18n**: NOT visual — read `09 Patterns` doc boards (`D/patterns/*`). Every animated element carries an annotation naming its pattern.

## Traversing behavior (the state graph)

- Pointer behavior: every interactive element carries an `Interaction` — enumerate via the plugin API; `action.type` ∈ navigate-to / open-overlay / close-overlay / previous-screen; `action.destination` is the target board. "What happens when I tap X?" is always answerable mechanically.
- Non-pointer transitions: `edge:` chips (text shapes named `edge:*` on the source board): `edge:<condition> → <destination board name>`.
- Journeys: named flows (`penpot.currentPage.flows`): onboarding, send, receive, sign, connect, browse.
- Elements with no interaction AND no `edge:` chip are terminal/static by contract — not an omission (omissions are a generator defect; report them).
- Shapes whose name starts with `deco:` are purely decorative (title bars, backdrop panels) — machine consumers MUST ignore them.
- Icon placeholders carry their real identity in the shape name: `icon:<LucideName> <size>/<stroke>` (e.g. `icon:ArrowLeft 22/2.2`) — implement the named Lucide icon at that size/stroke, not the placeholder rectangle.

## Interpretation rules (normative)

- Boards depict light theme at 1.0× text scale in English. Dark = switch token theme; representative dark boards exist per surface family for calibration.
- Boards depict the **normative** design language ("quiet, typographic, de-containered" — see `01 Design Language`); where the legacy RN app drifts, the coverage matrix (repo) flags it — the boards win.
- Platform divergence annotations (`platform:` chips) override the generic depiction for the named platform.
- Mono text is depicted in IBM Plex Mono but MUST be implemented as the target platform's mono stack; numeric columns SHOULD use tabular figures (see `D/patterns/typography`).
- 44×44pt minimum hit targets and the a11y floor on `01 Design Language` are requirements, not suggestions.
- Text must survive 0.82×–1.35× user scaling and the 15-locale expansion rules on `D/patterns/i18n`.

## Stability guarantees

- Names (grammar in `00 Start Here`) are stable across regenerations; IDs are not.
- Additions are non-breaking; renames/removals are breaking and will be accompanied by a regenerated coverage matrix (repo: `specs/002-penpot-design-source/generator/coverage.json`).
