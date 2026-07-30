# Restructure — make the file legible to humans AND agents

**Date**: 2026-07-30 · **Raised by**: founder · **Status**: PROPOSAL, awaiting founder approval
**Supersedes nothing**: PIVOT-2026-07-29 (render-and-screenshot) stands for *visual truth*. This note
adds the layers that pivot silently dropped: semantics, connectivity, and human legibility.

## 1 · The founder's verdict, restated precisely

> "设计稿素材都不像一个严肃的东西……逻辑不清晰……start here / IA / flows / 原则都有，但都不能给
> 人启发……没有 UI 转化流转……后续加功能 UI 上要遵循什么原则、有哪些可以复用，都没做清楚。
> Design Source of Truth 名不副实。"

Decomposed, the file must let a reader (human or agent):

| # | Need | Today |
|---|------|-------|
| N1 | grasp the visual language at a glance | prose walls; principles never *shown* |
| N2 | see every screen, organized by product logic | boards scattered; grid position ≠ journey |
| N3 | see how screens connect (flows, transitions) | **0 interactions in the whole file**; 5 flows are empty shells |
| N4 | know which components are reusable, and when to use which | 12 components all named "VelaButton"; variant values are captured copy ("Retry", "Cancel") |
| N5 | know what rules a new feature must follow | no recipe; design language is prose without examples |
| N6 | navigate by a predictable module organization | pages 00–10 exist, but intra-page organization is alphabetical dumps + parked drafts |

## 2 · Audit evidence (2026-07-30, full-file)

- `S / home / assets`: **108 raw shapes, 0 component instances**, every layer named a DOM path
  (`r / 0.0.0.0.1.0.0.0.1.0.0.2`). US4-AS2 ("recurring elements are instances of library
  components") is unmet on every screen board.
- Library: 63 components, but **duplicate names** — e.g. 12 distinct components all named
  `VelaButton`, one per captured gallery cell; variant axes carry captured copy, not
  `variant × size × state`.
- **Interactions: 0** across all pages. The 5 named flows (send/receive/home/connect/onboarding)
  point at start boards but no edge exists. tasks.md marks T030 done; the DOM-rebuild pipeline's
  wholesale child replacement destroyed them and nothing re-audited (T031 never ran).
- **Token themes: `[]`.** `00 Start Here` documents "NO theme objects in this deployment" —
  T010's themes were built, then lost. Light/dark switching is a manual set toggle.
- Canvas hygiene: 10 boards labeled `DRAFT (inferred, no gallery cell)` parked at (−6000, −4000);
  an orphan `txt A` text shape at origin of `03 Components`; components sorted alphabetically in
  a single 19,000 px column, categories interleaved.
- Tokens themselves are healthy (core 93 + 27 light + 27 dark, parity-audited), and 51/63
  components do have variant containers. The skeleton (11 numbered pages) matches industry
  ordering. **This is a repair, not a rebuild.**

## 3 · Root cause

Two eras, never merged. Era 1 (pre-pivot) authored *semantics* from code inference — right
structure, wrong pixels. Era 2 (post-pivot) transcribed *pixels* from the DOM — right pixels, no
structure. The pivot fixed "wrong" but installed a pipeline that only knows how to transcribe;
every regeneration re-flattens. And the spec's acceptance list has a blind spot: **all five user
stories are accepted by "an AI agent with MCP access"; a human reader was never an acceptance
audience** — so the file converged on machine-checkable metrics while legibility silently died
(ledger 2026-07-30: 验收者名单缺漏, 勾不回滚).

## 4 · What flagship files do (community research, 2026-07-30)

Canonical page order across Untitled UI / Material 3 / Polaris / Carbon / Penpot's own guidance:
**Cover → Getting started → Foundations → Components → Patterns → Screens by domain → Flows →
Changelog → Archive**. The properties that make them instantly graspable:

1. Cover answers *what / which version / can I trust it* in one glance.
2. Component pages are **sticker sheets**: one labeled matrix of variants × states per component,
   in one viewport; docs sit adjacent to the master, in a fixed template
   (intro → examples → usage do/don't → code ref).
3. Screens are laid **left-to-right in journey order**; the canvas *is* the flow diagram; named
   flow entry points per journey.
4. Hard separation of canon vs exploration (archive page); zero anonymous layers; screens built
   100 % from library instances so the component page predicts every screen.
5. AI-readability = the same discipline, plus: DTCG token JSON exported to the repo, semantic
   PascalCase/kebab-case names, annotations on masters carrying the code-component path
   (Penpot's Inspect-visible annotation ≈ Code Connect).

Sources: figma.com/best-practices (team-file-organization; components-styles-and-shared-libraries),
penpot.app/blog/design-systems-best-practices-with-penpot, help.penpot.app (design-tokens;
prototyping), Nathan Curtis (Documenting Components; On Classification), polaris-react.shopify.com
(figma-ui-kit), untitledui.com/figma.

## 5 · Target organization

Page names/numbers stay stable (consumption-contract promise). Reorganization is **intra-page**,
plus two new pages at the tail. Every page gets a `D / <page> / header` board top-left: what this
page is, how to read it, in ≤6 lines — written for humans first.

| Page | Target state |
|------|--------------|
| `00 Start Here` | Two boards side by side: **Cover** (product name, one hero screen visual, version = git rev + date, status, page directory with 1-line purpose each) and the existing machine **contract** (kept, updated). Human path reads left, agent path reads right. |
| `01 Design Language` | Each of the 10 principles becomes a **shown** rule: principle title + 1-sentence norm + a real cropped example from a captured screen + a Do/Don't pair where the rule is violable. Conflict-resolution table stays. |
| `02 Tokens & Type` | Keep specimens; **restore `Light`/`Dark` themes**; add a "same board, both themes" demo pair proving the switch; export DTCG JSON to `docs/design-tokens.json` on every regen. |
| `03 Components` | Reorganize the strip into **category sections** (Primitives · Controls · Rows · Media · Sheets · Signing) with canvas section headers. Each component becomes one **block** in a fixed template: sticker-sheet grid (variants × states, labeled axes) + anatomy (named parts) + usage notes (use-when, do/don't, motion ref) + code ref (`src/components/...`). Merge duplicate-named components into single variant groups with **semantic axes** (`variant × size × state`), values from the RN component's actual props. Delete `txt A`; move DRAFT boards to `12 Archive`. |
| `04 IA & Flows` | Route-tree map stays, but every node gets a **navigate interaction to its board** — the map becomes the file's clickable table of contents. Legend for presentation modes; deep-link table stays. |
| `05–07 Screens` | **Journey walls**: one horizontal row per journey, boards in flow order (e.g. send: select-token → details → confirm → receipt), state variants (loading/error/dark/…) stacked *below* their parent step, section header per journey. Dark boards sit under their light twin, never in the main row. |
| `08 Overlays` | Grouped walls: signing-sheet scenarios as one matrix (rows = request kind, ordered benign → dangerous), app modals/alerts/pickers as families. Same header discipline. |
| `09 Patterns` | Keep motion/a11y/resilience; add **"Adding a feature" recipe**: decision tree (need a list? → `C/Rows/…`; need confirmation? → SigningSheet pattern; need a CTA? → VelaButton, never bespoke), the 5 platform rules, and a **reuse index** table (component → screens that instance it, generated). |
| `10 Dev & Parallel Space` | Unchanged, excluded from gate. |
| `11 Changelog` *(new)* | One entry per regeneration run: date, git rev, pages touched, coverage matrix snapshot, audits passed. |
| `12 Archive` *(new)* | Non-canon: DRAFT boards, superseded experiments. Explicit "machine consumers: ignore this page" marker. |

### Semantic floor for screen boards (the era-merge rule)

DOM-derived boards stay the fidelity source, but every canon screen board must satisfy:

1. Top-level children are **named regions** (`region / header`, `region / hero`, `region / tab-row`,
   `region / list`, `region / dock`) — grouped, not 108 flat siblings.
2. Any element matching a library component is **replaced by an instance** of it (priority:
   VelaButton, rows, SegmentedToggle, WaveDock, sheet headers, AmountText, avatars/logos).
3. Remaining leaves may keep generated names but must live inside a named region.
4. Regenerating a board **preserves**: region grouping, instance swaps, interactions, annotations.
   (Pipeline change: the generator diffs into regions instead of wholesale child replacement, or
   re-applies a persisted semantic overlay + interaction table after rebuild.)

## 6 · Workstreams

**W0 — Stop the bleeding (pipeline)**: fix `70-board-from-dom.js` so regeneration cannot destroy
semantics again (persist + re-apply: interactions, region map, instance swaps, annotations). Add
guard audit: any regen run ends by re-running T031 graph audit + theme/duplicate-name checks.
*Do this first; all other work is wasted without it.*

**W1 — Semantic component library**: merge duplicates into variant groups with semantic axes from
RN props; rename internal layers to anatomy names; attach code-ref + usage annotations; rebuild
`03 Components` as category sticker-sheet blocks. Tier 1 (full template): the ~20 high-reuse
components (VelaButton, TokenRow, ActivityRow, DetailRow, SettingsRow, SegmentedToggle,
SlideToConfirm, AmountText, GasFeeCard, FeeTokenSelector, SigningSheet frame + body views,
AppModal, AppAlert, SheetHeader, avatars/logos, WaveDock, QRCode, WarningBanner,
TransactionReceipt). Tier 2: sticker sheet + code ref only.

**W2 — Journey walls**: rearrange screens/overlays pages per §5; region-group + instance-swap each
canon board to the semantic floor.

**W3 — Rewire the graph**: restore Light/Dark themes; re-do T030 interactions from the manifest
trigger list; `vela.edge` chips for non-pointer transitions; IA map nodes → navigate interactions;
run T031 BFS audit until SC-007 passes.

**W4 — Human layer**: cover; page headers; illustrated design language; "Adding a feature" recipe;
reuse index; changelog + archive pages; canvas hygiene.

**W5 — Contract & gate**: update Start Here contract (regions, annotations, themes, new pages);
un-check T030 in tasks.md and reconcile checkboxes against reality; add spec acceptance for the
human audience (see §7); re-run all audits; run the US5 gate **plus** the human gate.

Suggested order: W0 → W3 (cheap, high-leverage) → W1 → W2 → W4 → W5.
W1/W2 are the bulk (est. 60–70 % of effort).

## 7 · Acceptance additions (spec delta)

- **SC-008 (human gate)**: the founder, opening only the Penpot file, can within 10 minutes:
  name the visual language's 3 defining traits; list the app's main journeys from the canvas
  alone; trace send end-to-end by clicking flow edges; answer "I'm adding a token-list feature —
  which components do I reuse and which rules apply?" from `09 Patterns`.
- **SC-009**: zero duplicate component names; every library component's variant axes are semantic
  (no captured-copy values).
- **SC-010**: every canon screen board meets the semantic floor (§5); audited, not sampled.
- **SC-011**: token themes `Light`/`Dark` exist and switching them restyles a demo board pair.
- **Process rule**: a task checkbox is only ever checked together with a passing *persistent*
  audit that re-runs on every regen (勾不回滚 guard).

## 8 · Open decisions for the founder

1. **Scope of instance-swapping** (W2 rule 2): Tier-1 components only (recommended, ~80 % of
   visible UI) vs. exhaustive (slower, marginal gain).
2. **Signing wall placement**: keep 27 scenarios on `08 Overlays` as a matrix (recommended) vs.
   promote to their own page.
3. **Rebuild order**: W0→W3 first as proposed (recommended), or human layer (W4) first for a
   quick visible win.
