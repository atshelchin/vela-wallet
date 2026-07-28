# Audit report — Penpot design source of truth

## 2026-07-29 — Foundation + US1 tokens

| Audit | Result | Detail |
|---|---|---|
| 12-smoke (fonts) | PASS | Plus Jakarta Sans 400/500/600/700 + IBM Plex Mono present |
| 12-smoke (idempotency) | PASS | second upsert pass created 0 shapes |
| 12-smoke (interactions) | PASS | addInteraction('click', navigate-to) round-trip verified |
| 12-smoke (page-aware cleanup) | PASS | removeWhere iterates pages; zero leftovers |
| 11-scaffold re-run | PASS | created: 0, 11 pages stable |
| 91-token-parity (SC-001) | **PASS** | 20+20 semantic colors both directions zero mismatches vs theme.ts; TEXT_BASE/space/radius scales exact; run `python3 generator/91-audit-token-parity.py` from repo root |

Token state: 147 tokens — `core` 93, `color-light` 27, `color-dark` 27; active combination = core + color-light (Light).

### US1 boards (T011/T012) — verified persisted + rendering

- `01 Design Language`: 3 doc boards, 48 objects (principles ×10, a11y floor, 12 resolved conflicts) — backend-verified.
- `02 Tokens & Type`: 3 boards, 163 objects (27 token-bound color chips w/ L+D hex labels, type specimens for all 9 sizes + 4 weights + mono, spacing/radius/shadow/icon scales) — backend-verified, renders clean.

### Persistence incident (2026-07-29, resolved)

Chunks 22/24 first ran against a workspace session whose sync channel had wedged: the plugin
accepted all mutations and reported success, but the backend kept 1 object on the page
(verified via REST get-file) and other clients showed "Something wrong has happened".
Recovery: restart penpot-penpot-mcp-1 → healthy session took plugin ownership → re-ran
10-lib + 22 + 24 → backend now 163 objects. Codified as generator-contract platform rule 5
(always verify persistence from outside the plugin; chunk return values prove nothing about
durability).

### Duplicate-flush incident (2026-07-29, resolved)

After the wedged-session recovery, the ORIGINAL session's websocket recovered later and
flushed its stale in-memory copies of chunks 22/24 → exact same-name duplicate boards on
`02 Tokens & Type` (163→325 objects, id prefixes revealing both sessions). Deduped by id
(kept newest copy; page back to 3 unique boards). Operational rule: while generation runs,
keep exactly ONE workspace session open on the agent account (spectator tabs on the same
account can wake up and flush stale changes at any time). The 90 audit must assert
board-name uniqueness per page to catch this class automatically.

### Deviations / platform bugs recorded

1. **Penpot themes API broken in this deployment** (mcp:2.16 plugin vs Penpot 2.16.2): `TokenTheme.addSet()` is a silent no-op, leaving themes empty; activating an empty theme deactivates all sets. **Fallback**: modes are expressed by direct set activation (Light = `core`+`color-light`; Dark = swap `color-light`→`color-dark`); no theme objects exist in the file. Recorded in consumption contract.
2. `TokenCatalog.addTheme` takes an object `{group, name}` — the MCP high-level overview's `addTheme(group, name)` signature is wrong.
3. Shadow token values accept CSS-like strings (`"0 1 3 0 rgba(26,26,24,0.04)"`); rgba() strings are valid color-token values (used for `color.fixed.backdrop`).
