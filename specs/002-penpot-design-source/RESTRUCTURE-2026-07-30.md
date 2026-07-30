# Restructure — make the file legible to humans AND agents

**Date**: 2026-07-30 · **Raised by**: founder · **Status**: ADOPTED 2026-07-30 — founder approved
all four §11 recommendations (set-activation mode · Tier-1 swap depth · `S/send/sign` proxy board ·
W0-first order)
**Supersedes**: PIVOT-2026-07-29's "flat, faithful tree — components swapped in only where a region
matches cleanly" consequence clause (that optionality becomes a mandatory semantic floor, §6).
PIVOT stands for capture method and visual authority. On approval, add a one-line pointer in
PIVOT's Consequences section.
**Review**: adversarially reviewed 2026-07-30 by four independent lenses (human reader, rebuild
agent, pipeline feasibility, spec consistency) — 46 findings; all 10 blockers and 19 majors are
integrated below.

## 1 · The founder's verdict, restated precisely

> "设计稿素材都不像一个严肃的东西……逻辑不清晰……start here / IA / flows / 原则都有，但都不能给
> 人启发……没有 UI 转化流转……后续加功能 UI 上要遵循什么原则、有哪些可以复用，都没做清楚。
> Design Source of Truth 名不副实。"

Decomposed, the file must let a reader (human or agent):

| # | Need | Today | Closed by |
|---|------|-------|-----------|
| N1 | grasp the visual language at a glance | prose walls; principles never *shown* | §5·00/01 (identity board + shown principles) |
| N2 | see every screen, organized by product logic | boards scattered; grid position ≠ journey | §5·05–08 (journey walls + hub-and-spoke) |
| N3 | see how screens connect (flows, transitions) | **0 interactions**; 5 flows are empty shells | §5 edge layer + §8 W3a/W3b |
| N4 | know which components are reusable, when to use which | 12 components named "VelaButton"; variant values are captured copy | §5·03 + §8 W1 |
| N5 | know what rules a new feature must follow | no recipe; prose without examples | §5·09 recipe (three blocks, worked examples) |
| N6 | navigate by predictable module organization | alphabetical dumps + parked drafts | §5 page plan + hygiene |

## 2 · Audit evidence (2026-07-30, full-file)

- `S / home / assets`: **108 raw shapes, 0 component instances**, every layer a DOM path
  (`r / 0.0.0.0.1.0.0.0.1.0.0.2`). US4-AS2 unmet on every screen board.
- Library: **CORRECTED 2026-07-30 (audit 97, live)** — the variant model is healthier than first
  diagnosed: `VelaButton` is one proper variant container with semantic axes
  (`size × state × variant`); the "12 same-named components" are Penpot's by-design variant
  components sharing the container name, and the captured copy seen earlier lives in LAYER names
  (`r / 0.0.0.0 Retry`), not in axis values. Real library defects: one duplicate family
  (`SectionLabel` ×2, a DRAFT leftover), DOM-path layer names inside every variant (no anatomy),
  no usage docs/code refs. W1 is re-scoped accordingly (§8).
- **Interactions: 0** across all pages; the 5 named flows point at start boards with no edges.
  tasks.md marks T030 done; regeneration destroyed the wiring and the T031 audit never ran.
- **Token themes: `[]` — and this is a platform fact, not a regression**: on this deployment
  (Penpot 2.16.2 + mcp:2.16) `TokenTheme.addSet()` is a silent no-op and activating an empty theme
  deactivates all sets (generator/audit-report.md; consumption-contract.md). Mode = set
  activation, by design. Any "restore themes" plan is conditional on a deployment upgrade.
- Canvas hygiene: 10 `DRAFT (inferred, no gallery cell)` boards parked at (−6000, −4000); orphan
  `txt A` shape on `03 Components`; components in one alphabetical 19,000 px column.
- Healthy: tokens (core 93 + 27/27 light/dark, parity-audited), 51/63 components have variant
  containers, page skeleton 00–10 matches industry ordering. **Repair, not rebuild.**

## 3 · Root cause

Two eras, never merged. Era 1 (pre-pivot) authored *semantics* from code inference — right
structure, wrong pixels. Era 2 (post-pivot) transcribed *pixels* from the DOM — right pixels, no
structure. The pivot installed a pipeline that only transcribes; every regeneration re-flattens.
And the spec's acceptance had a blind spot: **all five user stories are accepted by "an AI agent
with MCP access"; a human reader was never an acceptance audience** — the file converged on
machine-checkable metrics while legibility silently died (ledger 2026-07-30: 验收者名单缺漏、勾不回滚).

## 4 · What flagship files do (community research, 2026-07-30)

Canonical page order across Untitled UI / Material 3 / Polaris / Carbon / Penpot's own guidance:
**Cover → Getting started → Foundations → Components → Patterns → Screens by domain → Flows →
Changelog → Archive**. What makes them instantly graspable:

1. Cover answers *what / which version / can I trust it* in one glance.
2. Component pages are **sticker sheets**: per component, one labeled matrix of variants × states
   in one viewport; docs adjacent to the master in a fixed template
   (intro → examples → usage do/don't → code ref).
3. Screens laid **left-to-right in journey order**; the canvas *is* the flow diagram — via visible
   connectors, not just ordering.
4. Hard canon/exploration separation (archive page); zero anonymous layers; screens built from
   library instances so the component page predicts every screen.
5. AI-readability = the same discipline, plus DTCG token JSON exported to the repo, semantic
   naming, and a machine-readable code-component mapping. (Penpot's Inspect-tab component
   annotation is **UI-only — not writable via the plugin API**; our machine channel is component
   plugin data, our human channel is a visible code-ref line in each docs block.)

Sources: figma.com/best-practices (team-file-organization; components-styles-and-shared-libraries),
penpot.app/blog/design-systems-best-practices-with-penpot, help.penpot.app (design-tokens;
prototyping), Nathan Curtis (Documenting Components; On Classification), polaris-react.shopify.com
(figma-ui-kit), untitledui.com/figma.

## 5 · Target organization

Existing page names/numbers are untouched; pages `11 Changelog` and `12 Archive` are added under
the contract's *additions-are-non-breaking* clause (the entry-protocol "expect 11 pages" line,
data-model §1, and `11-scaffold-pages.js` are amended accordingly — see §10). Every page gets a
`D / <page> / header` board top-left: what this page is, how to read it, ≤6 lines, humans first.

**The edge layer (one source, two projections).** All screen-to-screen/overlay transitions live in
one committed data file, `generator/edges.json` (extracted from the tables currently hard-coded in
`74-interactions.js`; manifest.json today carries **no** trigger data). From it the pipeline emits
BOTH: (a) machine wiring — prototype interactions where the platform allows, `vela.edge` plugin
data where it does not; (b) **human wiring — a visible connector arrow with a short trigger label
("tap Send pill", "slide to confirm", "fee quote resolves") between adjacent wall steps**, named
`e / <from> / <to>` so machine consumers skip them. Without (b), journey walls are a picture
gallery with hidden wiring — this was the founder's N3.

| Page | Target state |
|------|--------------|
| `00 Start Here` | Three boards: **Cover** (product name, hero screen visual, version = git rev + date, status, page directory); **Identity** — the three-trait language ("quiet · typographic · de-containered") with one exemplar crop each, so N1 has a stated ground truth; the machine **contract** (kept, updated per §10). |
| `01 Design Language` | Each of the 10 principles **shown**: title + 1-sentence norm + real cropped example + Do/Don't pair where violable. Conflict table stays. |
| `02 Tokens & Type` | Specimens stay. Mode = **set activation** (`color-light` ⇄ `color-dark`), demo board pair restyled by the toggle (side-by-side both-modes rendering is impossible with file-global sets). Theme objects only if the deployment is upgraded and a smoke chunk proves `addSet` works. DTCG JSON exported to `docs/design-tokens.json` every regen. |
| `03 Components` | Category sections (Primitives · Controls · Rows · Media · Sheets · Signing) with canvas headers. Per component one **block**: sticker-sheet grid (axes labeled) + anatomy (named parts) + usage (use-when, do/don't, motion ref) + visible code-ref line; machine twin in plugin data (`vela.codeRef`, `vela.usage`). Duplicate-named families merged **plan-driven** (fix `_plan.json` so all cells map to one family with semantic axes, then re-run 72) — never by hand on canvas, since 72 rebuilds families wholesale on every run. Captured per-context copy is preserved (context → label map in the block + `vela.note`). Uncaptured matrix cells = recorded exclusions or `/design-gallery` extension + recapture — **never inferred pixels** (PIVOT rule). Variant naming grammar fixed (axis order + value vocabulary) so SC-006 name construction works. `txt A` deleted; DRAFTs to `12 Archive`. |
| `04 IA & Flows` | Route map stays; every node gets a navigate interaction to its board — the clickable table of contents. Presentation-mode legend, deep-link table stay. |
| `05 Screens · Wallet` | Journey walls: **onboarding** (splash → create/import → passkey → success), **home hub** (hub left, spokes right: activity/assets/connections/hidden/dark stacked below hub), **send** (select-token → details → confirm → `S/send/sign` → receipt), **receive** (safety-gate → address/request/copied), plus hub-and-spoke walls for token-detail, add-token, pay. State variants stack *below* their step; dark twins below light. |
| `06 Screens · Browser & Connect` | Walls: **browse** (browser chrome states), **connect** (web-request 7 phases), connections hub. |
| `07 Screens · Settings & Onboarding` | Hub-and-spoke: settings root left, spokes grouped by nav section; contacts/payroll wall; format/language pickers. |
| `08 Overlays` | Family walls: signing-sheet matrix (rows = request kind, benign → dangerous), modals/alerts/pickers grouped. |
| `09 Patterns` | Motion/a11y/resilience stay. **"Adding a feature" recipe**, three mandatory blocks: (1) decision tree whose leaves collectively reach every Tier-1 component (auditable); (2) constraint checklist crosslinking the shown rules on `01` — accent = money-movement/submission only, SegmentedToggle is the only segmented control, VelaButton is the only CTA, hairline dividers not cards, 44×44 floor, sheet-vs-push rules (designer-facing rules from DESIGN-LANGUAGE.md + design-review backlog — **not** the generator's plugin-API survival rules); (3) numbered "extending this file" procedure (choose wall → compose from library → semantic floor → wire edges.json → changelog entry). ≥2 worked examples, one = SC-008's token-list question. Plus generated **reuse index** (component → boards that instance it). |
| `10 Dev & Parallel Space` | Unchanged, excluded from gate. |
| `11 Changelog` *(new)* | One entry per regen run: date, git rev, pages touched, coverage snapshot, audits passed. |
| `12 Archive` *(new)* | Non-canon: DRAFTs, superseded experiments. Explicit machine-ignore marker. |

### Wall composition rules

- **Mid-journey overlays**: journey-critical overlay steps get a **journey-step board on the
  screens page** (e.g. `S/send/sign` = SigningSheet composited over the confirm capture) so the
  click chain stays same-page — Penpot's open-overlay only accepts same-page destinations
  (74-interactions.js platform note). The full scenario matrix stays on `08`; the step board
  carries a visible "→ 27 scenarios, see 08 Overlays" stub. Non-critical overlay hops get a
  labeled stub `e / <step> / <overlay>` instead of a proxy board. Stubs/proxies have a fixed
  grammar and are excluded from coverage counting.
- **Shared screens** (Home starts send/receive/browse…): appear once canonically; other walls open
  with a small entry stub referencing the canonical board.

## 6 · Semantic floor for canon screen/overlay boards

1. Top-level children are **named regions** (`region / header`, `region / hero`, `region /
   tab-row`, `region / list`, `region / dock`) — grouped, not flat siblings.
2. Elements matching Tier-1 components are **replaced by instances** — valid only if the instance
   reproduces the captured text/content via **overrides** (US4-AS2: real copy, not master copy).
   Conditional on the W0 override smoke test (§7); if overrides are not API-writable, text-bearing
   elements downgrade to `vela.componentOf` plugin data + name tag, and only geometry-stable
   chrome (WaveDock, sheet headers, avatars, QR plates) is swapped.
3. Remaining leaves may keep generated names but must live inside a named region.
4. Regeneration **preserves**: region grouping, instance swaps + their overrides, interactions,
   annotations, **board positions and wall/section headers**.

## 7 · Two-layer persistence & pipeline changes (W0 in full)

The fix for "regeneration destroys semantics" is architectural: **the file becomes two layers.**
The *fidelity layer* (shapes from DOM dumps) is regenerated at will; the *semantic layer* is
**committed repo data, re-applied deterministically after every regen** — never canvas-only state,
so FR-008/SC-005 idempotency stays checkable from a clean clone.

Committed semantic-layer artifacts:

- `generator/edges.json` — the edge/flow/trigger tables (extracted from 74-interactions.js).
- `generator/region-maps/<screen>.json` — per-screen region spec (region name + DOM-path prefix
  or bbox).
- Journey manifest (extend manifest.json): journey membership, step order, state-stack order —
  **board (x, y) is derived from it** in 73, replacing today's `i%5` grid (otherwise the first
  regen erases the walls; generator-contract layout convention amended, §10).
- `_plan.json` gains per-family semantic axes, cell ↔ prop-combination mapping, code-ref, usage
  text (72 writes annotations from the plan on every rebuild).

Pipeline changes:

- **70-board-from-dom.js**: region containers are pipeline-created *before* the walk and exempt
  from the wipe (today's per-shape wipe would empty and prune the groups); `build()` takes a
  parent-resolver (path-prefix → region container) instead of appending flat to the board;
  subtrees matched to a swapped instance are **skipped**, not redrawn over the instance.
- **Swap matching is re-detection, not replay**: DOM-path names are positionally unstable across
  captures, so persisted overlays are matched by content signature (rendered text + role +
  geometry tolerance) or a semantic id stamped into leaf plugin data at capture time; the guard
  audit **fails on unmatched/ambiguous entries** instead of skipping (silent mis-attachment is
  worse than loss).
- **extract-dom-layout.js**: record interactivity signals (role ∈ {button, link}, tabindex,
  cursor:pointer, pressable testid) → `vela.role` on leaves, so "interactive element" is
  enumerable and the graph audit is not vacuous; add the missing repeated-element edges (row →
  detail, back, dismiss) to edges.json, with a "any instance of C on board B → D" convention so
  per-row wiring scales.
- **Mandatory regen ordering**: 72 (families) → 70/73 (boards) → swap pass → 74 (wiring from
  edges.json) → audits. Any run ends with the guard suite:
  - T031 graph audit (BFS/SC-007),
  - **96-audit-semantic-floor** (new: every canon board → top-level are `region/*`; Tier-1
    elements are instances; positions match journey manifest),
  - **97-audit-library** (new: no two distinct containers/standalone components share a name;
    axes are semantic — note per-variant components *within* one container legitimately share
    the container name, and `lib.instance()` depends on that),
  - broken/detached-instance count = 0 per page,
  - mode-toggle restyle check.
- **W0 smoke asserts** (extend 12-smoke.js) before W1/W2 commit: (a) instance a text-bearing
  component, override its label via API, read back, update the main, confirm the override
  survives; (b) `addInteraction` on an instance-internal shape (SigningSheet's Reject vs slide
  need different destinations — if this fails, sheets can't swap as one instance); (c) if
  deployment upgraded: `TokenTheme.addSet()` round-trip.
  **RESULT 2026-07-30 (live session)**: (a) PASS — override write/read-back ok AND survives a
  main-component text change; (b) PASS — interaction on instance-internal shape round-trips.
  §6 rule 2 takes the main path (full Tier-1 swaps with overrides); the downgrade fallback is
  not needed. (c) not run — set-activation chosen (§11 decision 1).

## 8 · Workstreams & order

**W0 — Two-layer pipeline** (§7). *First; everything else is wasted without it.*
**W3a — Cheap connectivity**: mode-toggle demo, IA-map navigate links, flow definitions, DTCG
export. (Targets stable nodes; safe before restructuring.)
**W1 — Semantic component library** *(re-scoped 2026-07-30: audit 97 proved the variant axes are
already semantic — no mass merge needed)*: dedupe `SectionLabel` (retire the DRAFT twin to
`12 Archive`); anatomy layer renames inside variants; sticker-sheet blocks with usage + code-ref;
category sections replacing the alphabetical strip; `_plan.json` gains codeRef/usage fields
(72 stamps them as plugin data on every rebuild).
Tier 1 (full template, ~20): VelaButton, TokenRow, ActivityRow, DetailRow, SettingsRow,
SegmentedToggle, SlideToConfirm, AmountText, GasFeeCard, FeeTokenSelector, SigningSheet frame +
body views, AppModal, AppAlert, SheetHeader, avatars/logos, WaveDock, QRCode, WarningBanner,
TransactionReceipt. Tier 2: sticker sheet + code ref only.
**W2 — Journey walls**: journey manifest authored; boards repositioned by pipeline; region-group +
instance-swap every canon board to the floor; proxy boards + stubs per §5 rules.
**W3b — Full wiring**: per-element interactions from edges.json onto the *post-swap* shapes;
`e/` visible edge layer; T031 until SC-007 passes. (After W2 — wiring before the swap would be
destroyed by it.)
**W4 — Human layer**: cover + identity board; page headers; illustrated design language; recipe +
reuse index; changelog + archive; hygiene.
**W5 — Contract & gate**: §10 deltas; re-run all audits; run US5 gate + human gate.

Order: **W0 → W3a → W1 → W2 → W3b → W4 → W5**. W1+W2 are the bulk (~60 % of effort).

## 9 · Acceptance additions (spec delta)

- **SC-008 (human gate)**: the founder, opening only the Penpot file, can within 10 minutes:
  name the three identity traits (stated on `00`); list the app's main journeys from the canvas;
  trace send end-to-end by following same-page clicks + visible edge labels (cross-page hops are
  labeled stubs by platform constraint); answer the token-list-feature reuse question from `09`.
- **SC-009**: no two distinct variant containers or standalone components share a name; all
  variant axes semantic (no captured-copy values).
- **SC-010**: every canon board meets the semantic floor — enforced by audit 96, not sampling.
- **SC-011**: the mode toggle (set activation; themes only post-upgrade) restyles the demo pair.
- **FR-008/SC-005 amendment**: idempotency = **both layers stable** — fidelity layer reproducible
  from dumps, semantic layer re-applied from committed data; zero diffs on double-run of the full
  ordered pipeline.
- **Process rule (勾不回滚 guard)**: a checkbox is only checked together with a persistent audit
  that re-runs on every regen.

## 10 · Enumerated contract/spec/tasks edits

- consumption-contract.md: entry protocol 11 → 13 pages; components section (merged families,
  variant grammar); plugin-data table += `vela.codeRef`, `vela.usage`, `vela.componentOf`,
  `vela.role`; edge visibility regime (plugin data + visible `e/` layer); Archive machine-ignore.
- data-model.md §1: rows for `11 Changelog`, `12 Archive`.
- generator-contract.md: layout convention (journey-manifest-derived positions replace the
  `col·450/row·950` grid); audit table += 96, 97; regen ordering rule.
- `11-scaffold-pages.js`: 13 pages, re-verify `created: 0`.
- PIVOT-2026-07-29.md: pointer line in Consequences → this doc's §6.
- tasks.md — un-check/re-scope now (bookkeeping truth is part of W0), re-check only via audits:
  T010 (themes portion → set-activation wording), T014–T018 (duplicate families, captured-copy
  axes), T023–T028 (0 instances on screen boards), T030 (interactions = 0). Fix stale chunk refs
  (T030 cites 60-interactions.js → actual 74-interactions.js; T035 cites 70-start-here.js →
  actual 46-start-here.js; T014 cites 30-components-primitives.js → actual 30-components-velabutton.js
  et al.) or add a mapping table.
- spec.md: SC-008–011, FR-008/SC-005 amendment, human audience added to US5's gate.

## 11 · Open decisions for the founder

1. **Mode mechanism**: stay on set-activation (recommended — zero risk, works today) vs upgrade
   the Penpot deployment to get real theme objects (then smoke-test `addSet` before any promise).
2. **Instance-swap depth**: Tier-1 only (recommended) vs exhaustive — and note the depth is
   conditional on the W0 override smoke result (§6 rule 2 fallback if negative).
3. **Signing journey step**: add `S/send/sign` proxy board on `05` for a clickable send chain
   (recommended) vs keep clicks same-page-only and accept a labeled stub at the signing hop.
4. **Rebuild order**: W0 → W3a first as proposed (recommended) vs human layer (W4) first for a
   visible quick win (costs double-handling of `03/05–08` pages).

## 12 · Verified platform facts (W3a probes, 2026-07-30 live session)

Each of these was probed in the connected file, not inferred. Two overturned earlier assumptions —
including one of this document's own.

| Probe | Result |
|---|---|
| instance text override | write + read-back OK, and it **survives a main-component text change** → §6 rule 2 takes the main path (Tier-1 swaps with overrides), no downgrade needed |
| `addInteraction` on an instance-internal shape | works → a sheet can be swapped as ONE instance and still have distinct Reject / slide destinations |
| cross-page `open-overlay` | **throws** → 74's fallback to `vela.edge` is correct |
| cross-page `navigate-to` | **silently accepted, destination stored EMPTY** → a dead click that still counted as wired. 74 now verifies the read-back and falls back to `vela.edge`; `addInteraction` not throwing is not evidence of success |
| mode switch by set activation | **DOES repaint bound shapes** — verified by export: the same board renders fully dark after activating `color-dark`. SC-011 stands as written, and the Start Here dark-mode instruction is correct |
| token application timing | **async, and racy**: binding then toggling activation in the same call leaves the board looking unbound and still light. This is what first made activation look broken (a chunk built on that false premise was written and deleted). Settle — separate call or sleep — before toggling |
| token `resolvedValue` on an INACTIVE set | resolves against the ACTIVE sets, so `color-dark` reports the LIGHT palette. Exports must read `value` |
| `export_shape` (PNG/SVG) | was failing for every shape — **environment defect, not MCP**: the exporter container renders in a headless browser inside itself, and the shared `PENPOT_PUBLIC_URI=http://localhost:9001` pointed it at itself (`ERR_CONNECTION_REFUSED …/render.html`). Fixed by overriding that service's URI to `http://penpot-frontend:8080` in the running stack's compose file and recreating only the exporter. Visual self-verification is available again — this is what the remaining visual workstreams depend on |

## 13 · Review record

2026-07-30 adversarial review: 4 lenses × independent agents; 46 findings (10 blocker / 19 major /
17 minor); full list in the session workflow log. Notable self-corrections it forced: themes are a
platform no-op (not "built then lost"); manifest.json carries no trigger data (edges live in
74-interactions.js and must be extracted); journey walls needed a visible edge layer to answer N3
at all; W3 had to split around W2 or its wiring would be destroyed; board positions had to become
manifest-derived or the first regen would erase the reorg.
