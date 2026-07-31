# Generator Contract — rules every generation chunk obeys

Audience: the implementing agent (this feature's implement phase) and anyone re-running or extending generation later. Chunks live in `specs/002-penpot-design-source/generator/` as numbered `.js` files whose bodies are passed verbatim to `mcp__penpot__execute_code`.

## Penpot platform rules (verified empirically 2026-07-29, Penpot 2.16.2 + mcp:2.16)

1. **Name normalization**: `/` in shape names is stored as ` / ` (space-padded). Every lookup must `lib.norm()` first; never compare against the compact grammar form.
2. **Mutations are current-page-only**: create/remove/reparent silently no-op on non-current pages. `await lib.open(page)` before mutating.
3. **openPage settles asynchronously**: poll `penpot.currentPage.id` until it matches (lib.open does; fixed sleeps are unreliable) — otherwise shapes land on the previously-current page.
4. **Page roots share the zero-uuid id**: a shape's owning page CANNOT be resolved by walking parents to the root. To locate/mutate across pages, iterate pages and scoped-search `penpot.currentPage.root` (see `lib.removeWhere`).
5. **execute_code reads the plugin session's MEMORY, not the backend.** A workspace session whose sync channel has wedged (symptom: "Something wrong has happened" toast in other clients) keeps accepting plugin mutations that are NEVER persisted — chunks report success while the backend stays empty. After each chunk (or at minimum each phase), verify persistence from OUTSIDE the plugin: `fetch('/api/main/methods/get-file?id=<file-id>')` (browser session) and check the page's object count grew. Recovery from a wedged session: `docker restart penpot-penpot-mcp-1`, reload the automation workspace tab so a HEALTHY session takes plugin ownership, re-run `10-lib.js`, then replay the affected chunks (idempotency makes replay safe). Never treat a chunk's return value alone as proof of durability.

## Chunk discipline

1. **Numbered + phased**: `NN-<phase>-<slug>.js` (e.g. `20-tokens-color.js`, `52-screens-send.js`). Execution order = numeric order; any suffix of the pipeline must be re-runnable alone.
2. **Bounded**: one chunk < ~15s wall time and < ~200 shape mutations. Split rather than grow.
3. **Upsert by name, never duplicate**: resolve targets with `penpotUtils.findShape(s => s.name === N)`; update in place when found, create when missing. Creation sets `name` FIRST so a crash mid-chunk still leaves addressable shapes.
4. **No IDs in source**: cross-references are by name; resolve at run time. `storage` may cache `{name → id}` maps but must tolerate cold start (plugin reload wipes storage).
5. **Progress ledger**: on success, set `storage.progress['NN-slug'] = { done: true, shapesTouched }` and RETURN a summary `{ chunk, created, updated, skipped }`. The ledger is advisory; correctness never depends on it.
6. **Idempotency proof**: every chunk's second consecutive run must return `created: 0` and produce zero geometry diffs. The audit chunk (`90-audit-idempotency.js`) enforces this globally.
7. **Fact discipline**: every value written must cite its inventory anchor in a `// inv:` comment (`// inv:01 §3.2`), keeping FR-001 traceability greppable.
8. **Failure handling**: on plugin-bridge error, re-run the same chunk after reconnection (chrome-devtools: reload workspace tab; if "duplicate connection" persists, `docker restart penpot-penpot-mcp-1` — client sessions are auto-adopted). Chunks must therefore tolerate partially-applied prior runs (upsert discipline gives this for free).

## Shared helper convention

`10-lib.js` installs `storage.lib` (pure functions only): `upsertBoard(name, geom)`, `upsertText(parent, name, spec)`, `bindToken(shape, tokenName, props)`, `chip(board, kind, text)` (for `edge:` / `platform:` / `motion:` annotation chips), `ensurePage(name)`, `applyFont(text, zone)`. Every later chunk begins with `if (!storage.lib) throw new Error('run 10-lib.js first')` — the operator then runs `10-lib.js` and retries.

## Layout conventions

- Screens: board 390×844; **(x, y) are journey-manifest-derived** (RESTRUCTURE-2026-07-30 §7): board position derives from journey membership + step order + state-stack order committed in the manifest, so regeneration preserves the walls. The old grid (x = col·450, y = row·950; column = state index, row = screen index) remains only as fallback for boards not in any journey.
- Components page: main instances on 100px grid inside per-group section boards.
- Doc boards: 800w auto-height, flex column, 24px padding.

## Capturing an overlay: scope the dump to the overlay root

An overlay is opened from some host screen, so a `document.body` dump carries that host into the
board. `extract-dom-layout.js` takes `{ root }` for exactly this reason, and every overlay capture
MUST pass it.

Finding the root: the overlay container is the **parent of the backdrop** — the only element painted
`rgba(0,0,0,0.35)` (`color.fixed.backdrop`) — and it holds exactly two children, the backdrop and
the sheet. Do NOT look for "a body child containing a 390px frame": the host screen is itself inside
the 390px phone frame, so that heuristic returns the whole app. A recapture that got this wrong
dropped all 25 signing boards from 2 regions to 1, each with ~30 loose shapes, and put the harness's
scenario list inside every sheet.

## Verifying visually (exporter caveat)

`export_shape` renders in a headless browser inside the exporter container, and the first render of
a board can fire BEFORE its webfonts resolve — the image comes back with every shape drawn and
**every text missing**, silently. Verified 2026-07-30: the same board, same id, exported twice in a
row, produced a text-free image and then a complete one.

The same race hits RASTER IMAGES: a board whose logos are all present in the file renders them as
empty rings on the first export and correctly on the second (verified 2026-07-31 on
`S/home/assets` — the single image shape exported alone was correct throughout, and no shape on the
board carried a stroke). The acceptance gate's "renders with broken assets" finding on
`erc-20-approve-unlimited` is most likely this, not board damage.

So: **export twice before believing a visual check**, and treat a text-free or image-free render as a
race, not as a defect in the board. Acting on the first image would mean "fixing" a page that was
never broken — which nearly happened twice.

(The exporter also needs `PENPOT_PUBLIC_URI` pointed at the internal frontend host — see the
deployment note; with the shared localhost value every export fails outright.)

## Mandatory regen ordering (RESTRUCTURE-2026-07-30 §7)

Any regeneration runs: `72` (component families) → `70`/`73` (boards) → swap pass → `74` (wiring from `edges.json`) → audits (T031 graph + `96-audit-semantic-floor` + `97-audit-library` + mode-toggle restyle check). This sequence overrides plain numeric chunk order.

### Applying the semantic layer WITHOUT redrawing (`73b`, `73c`)

A full `73` pass redraws every board from its DOM dump. That is the right tool when the pixels changed, and the wrong one when only the *manifest* changed — it needs the uploaded asset library in session memory (which dies with the session, silently turning every icon into a red placeholder) and it takes tens of minutes per page, blocking the plugin bridge throughout.

| Chunk | Applies | When |
|---|---|---|
| `73b-reposition` | board `x`/`y` from `journeys.json` | a wall gained or lost a step/state — every band below it shifts by one row |
| `73c-surface-region` | folds leftover `r / …` wrappers into `region / surface`, at index 0 | after any `70`/`73` build on a page |
| `73d-restack` | each region's children back into DOM (painting) order | after `73c` — grouping does not reliably preserve z-order |

All three re-derive from committed data, all are idempotent, and `73b` is verified by `96` — which recomputes expected positions from the same manifest, so a formula that drifts from `73`'s shows up as a position mismatch rather than passing quietly.

### Platform rules 11–13 (verified 2026-07-31)

⑪ **z-order is `parentIndex`, index 0 is the BACK.** `sendToBack()` / `bringToFront()` / `sendBackward()` / `bringForward()` all exist on every shape, are accepted, and do nothing. `parentIndex` is a getter — assigning to it throws. `setParentIndex(i)` is the only one that moves a shape. `penpot.ungroup()` restores children in REVERSE order, so it cannot be used to re-lay them either.

⑫ **Grouping does not reliably preserve z-order.** `penpot.group()` returned one board's region with its children exactly inverted — deepest leaves at the back, painted parents in front — so a card covered its own twelve rows and the board exported as an empty rectangle with every text shape present, correctly positioned and invisible. Shape counts and text counts pass that board with full marks; only an export or `73d` catches it.

⑬ **`fetch` a dump with a cache-buster or you will rebuild the old one.** A recapture deployed mid-session is served from the browser cache on the next build, and the run reports success for every board. Five Home boards were rebuilt from their pre-recapture dumps this way — wrong frame height, region paths that no longer matched, and 75 unmatched shapes swept into the backdrop group.

## Audits

Every row names a chunk that EXISTS and TERMINATES. Both qualifiers are load-bearing: on 2026-07-31
this table listed `91`, `94` and `95` as though they were checks, and none of the three had ever been
written, while `92` had been written and had never once finished a run. A gate that does not exist
and a gate that does not terminate look identical in a status table — neither ever reports a failure —
which is how SC-002, SC-003 and SC-006 went unmeasured for the whole project.

| Chunk | Enforces | Spec target |
|---|---|---|
| `26-tokens-dtcg-check` | Penpot token sets ≡ `docs/design-tokens.json`, both directions | SC-001 (replaces the never-written `91`) |
| `90-audit-idempotency` | name-set + shape-count + geometry hash stable across a full ordered re-run | SC-005 |
| `92-audit-coverage` | every planned cell → board / drift / recorded exclusion, with stale-plan drift separated from genuine absence | SC-003 |
| `93-audit-graph` | BFS from the declared flow entries reaches every board (minus recorded exclusions); no interactive element without an interaction, an `edge:` mark or a terminal annotation | SC-007 |
| `94-audit-lookup` | every manifest name resolves to exactly ONE asset — reports `conventionPass` (no collisions) apart from strict pass, because an unresolved name is an absent asset, i.e. `92`'s account | SC-006 |
| `95-audit-visual` | families exist (DRAFT reported apart), declared axes match the code's, sampled variants are non-empty and token-bound; states plainly that geometry-vs-code is NOT machine-checkable and belongs to the SC-004 agent gate | SC-002 (checkable half) |
| `96-audit-semantic-floor` | every canon `S/*`, `O/*` board: top-level children are `region/*` groups; Tier-1 elements are instances with overrides; positions match the journey manifest | SC-010 |
| `97-audit-library` | no two distinct variant containers or standalone components share a name; axes are semantic; broken/detached instance count = 0 | SC-009 |
| `audit-boards-distinct.mjs` | no two canon boards are the same picture — fingerprint lifted from `capture-states.js` so harness, driver and audit cannot disagree about what "the same" means | added 2026-07-31 |
| `audit-dump-distinctness.mjs` | the diagnostic behind that gate: which signals (text / geometry / colour / opacity / assets) two dumps match on | — |

**Cost is a correctness property here.** `92` and `93` both originally resolved each cell with its own
global search, and neither finished; both now walk the pages ONCE into an index and answer every
question from it. Any new audit does the same.

Audit output goes to the chunk return value AND `generator/audit-report.md` (repo, committed).
