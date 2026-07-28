# Generator Contract — rules every generation chunk obeys

Audience: the implementing agent (this feature's implement phase) and anyone re-running or extending generation later. Chunks live in `specs/002-penpot-design-source/generator/` as numbered `.js` files whose bodies are passed verbatim to `mcp__penpot__execute_code`.

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

- Screens: board 390×844 at grid positions x = col·450, y = row·950 within their page; column = state index, row = screen index (deterministic → idempotent geometry).
- Components page: main instances on 100px grid inside per-group section boards.
- Doc boards: 800w auto-height, flex column, 24px padding.

## Audits (chunks 90–95)

| Chunk | Enforces | Spec target |
|---|---|---|
| `90-audit-idempotency` | name-set + shape-count + geometry hash stable across re-run | SC-005 |
| `91-audit-token-parity` | Penpot tokens ≡ `theme.ts` (both directions, per theme) | SC-001 |
| `92-audit-coverage` | every manifest cell → board exists / recorded exclusion | SC-003 |
| `93-audit-graph` | BFS from `S/home/default` reaches all boards (minus `entry:` list); zero interactive elements without interaction/`edge:`/terminal mark | SC-007 |
| `94-audit-lookup` | random sample of matrix names resolvable first-try | SC-006 |
| `95-audit-visual` | export_shape PNG of sampled boards for human/agent comparison against live web app screenshots | SC-002 spot-check |

Audit output goes to the chunk return value AND `generator/audit-report.md` (repo, committed).
