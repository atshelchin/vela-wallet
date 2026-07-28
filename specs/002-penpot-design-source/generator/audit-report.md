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

### Deviations / platform bugs recorded

1. **Penpot themes API broken in this deployment** (mcp:2.16 plugin vs Penpot 2.16.2): `TokenTheme.addSet()` is a silent no-op, leaving themes empty; activating an empty theme deactivates all sets. **Fallback**: modes are expressed by direct set activation (Light = `core`+`color-light`; Dark = swap `color-light`→`color-dark`); no theme objects exist in the file. Recorded in consumption contract.
2. `TokenCatalog.addTheme` takes an object `{group, name}` — the MCP high-level overview's `addTheme(group, name)` signature is wrong.
3. Shadow token values accept CSS-like strings (`"0 1 3 0 rgba(26,26,24,0.04)"`); rgba() strings are valid color-token values (used for `color.fixed.backdrop`).
