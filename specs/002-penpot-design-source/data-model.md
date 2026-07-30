# Data Model — the Penpot file schema (Phase 1)

The "data model" of this feature is the structure of the Penpot file itself: pages, naming grammar, token/component/board/interaction shapes. Everything is addressed **by name** (IDs are file-local and not stable across regeneration).

## 1. Pages

| Page name | Contents | Acceptance-relevant |
|---|---|---|
| `00 Start Here` | Machine-reader index: file purpose, page map, naming grammar, how to resolve tokens/components/boards/interactions over the plugin API | yes (FR-006/007, SC-006) |
| `01 Design Language` | Normative principles (the 10 rules), resolved DESIGN_SYSTEM-vs-DESIGN-LANGUAGE conflicts, accessibility floor | yes (US1) |
| `02 Tokens & Type` | Swatch boards per token group (visual), typography specimens per font zone | yes (US1) |
| `03 Components` | Library component main instances, grouped: `Primitives`, `Controls`, `Rows`, `Sheets`, `Signing`, `Media` | yes (US2) |
| `04 IA & Flows` | Route-tree diagram, flow list with labeled trigger edges, deep-link table | yes (US3) |
| `05 Screens · Wallet` | Home, Send (all steps+modes), Receive, Activity, Token detail, Contacts/Payroll | yes (US4) |
| `06 Screens · Browser & Connect` | dApp browser chrome+states, connections, web-request, extension surfaces | yes (US4) |
| `07 Screens · Settings & Onboarding` | Settings tree, all pickers, onboarding ceremony incl. passkey states | yes (US4) |
| `08 Overlays` | Every AppModal/AppAlert/sheet/toast surface × state | yes (US4) |
| `09 Patterns` | Motion (exact params), haptics, a11y, platform divergence, i18n/text-scale resilience | yes (FR-006) |
| `10 Dev & Parallel Space` | Dev screens, parallel-space badge/env, fault-injection UX | documented, excluded from gate |
| `11 Changelog` | One entry per regeneration run: date, git rev, pages touched, coverage snapshot, audits passed | documented, added 2026-07-30 (RESTRUCTURE §5) |
| `12 Archive` | Non-canon: DRAFTs, superseded experiments; carries an explicit machine-ignore marker | no — machine-ignore, non-canon (RESTRUCTURE §5) |

## 2. Naming grammar (the addressing contract)

```
Tokens        <group>.<role>[.<variant>]         e.g. color.bg.base, space.xl, text.lg,
                                                      radius.xl, shadow.sm, motion.duration.fast
Token sets    core | color-light | color-dark
Themes        Light | Dark
Components    C/<Group>/<Name>                   e.g. C/Primitives/VelaButton, C/Signing/SigningSheet
  variant axes (Penpot variants)                 variant= / size= / state= / kind= as applicable
Screen boards S/<route-path>/<state>             e.g. S/home/default, S/home/rate-limited,
                                                      S/send/amount/quote-loading, S/browser/no-wallet
Overlay boards O/<overlay>/<state>               e.g. O/signing-sheet/erc20-approve,
                                                      O/funding/underfunded, O/app-alert/default
Doc boards    D/<page-slug>/<section>            e.g. D/start-here/index, D/patterns/motion
Edge chips    edge:<trigger> → <destination name> small tagged text on source board for
                                                 non-pointer transitions (loading→loaded etc.)
Drift flags   recorded in coverage matrix, not in Penpot names
```

Rules: lowercase route/state slugs, `/` separators, no spaces inside slugs; names are unique file-wide within their prefix class; renames are breaking changes to the consumption contract and require a matrix regeneration.

**Canonical stored form** (verified 2026-07-29): Penpot normalizes `/` in shape names to ` / ` (padded with spaces) — `S/home/default` is stored as `S / home / default`. Grammar strings in docs/scripts use the compact form; ALL lookups must normalize first (`lib.norm`); consumers must match on the padded form.

## 3. Token model

- **Entity**: Penpot `Token` in one of the three sets; `value` uses direct values (hex/px) or references (`{color.accent.base}`) where the app derives one token from another (e.g. `color.accent.soft`).
- **Parity invariant** (SC-001): the set of (name, resolvedValue-per-theme) pairs equals the inventory-01 tables extracted from `src/constants/theme.ts` — both directions.
- **Application invariant**: every board/component fill, radius, spacing, text size that the code drives from a theme token is **bound** to the Penpot token (`shape.applyToken`), not hardcoded — hardcoded values are allowed only where the code itself hardcodes (inventory's hardcoded-hex list), and those carry an annotation.

## 4. Component model

- **Entity**: `LibraryComponent` (+ `Variants` container where axes exist). Main instances live on `03 Components`, positioned on a 100px grid, grouped by section board.
- Variant axes per component come from inventory 02/03's proposed axes (e.g. VelaButton: `variant=primary|secondary|accent × size=default|compact × state=default|pressed|disabled|loading`).
- States that are motion-only (pressed scale) are depicted at their settled visual with a motion annotation referencing `D/patterns/motion`.
- **Composition invariant**: screen/overlay boards use **instances** of these components (never detached copies) for every recurring element (SC-002, US4-AS2).

## 5. Board model

- **Entity**: `Board` 390×844 (screens) or content-sized (overlays, docs), flex layout where the real screen is a column/stack.
- Each screen board: status-bar-free canonical layout, real copy structure (English), populated with realistic Vela data (ETH/USDC/DAI balances, 0x… addresses, real chain names from the app's network list).
- Required states per surface come from the **coverage matrix manifest** (`generator/manifest.json`, derived from inventory 04–08): every route × its applicable states; every overlay × its states.

## 6. Interaction model (traversable state graph)

- **Navigational edges**: `shape.addInteraction('click', { type:'navigate-to'|'open-overlay'|'close-overlay'|'previous-screen', destination })` on the exact interactive element (pill, row, button, icon), matching inventory-listed triggers.
- **Non-pointer edges**: `edge:` chips (small tagged text near board top-right) with text `edge:<condition> → <board name>`, e.g. `edge:fee-quote-resolves → S/send/confirm/ready`.
- **Flows**: one named Penpot flow per primary journey: `onboarding`, `send`, `receive`, `sign`, `connect`, `browse` — start boards per inventory 04.
- **Connectivity invariant** (SC-007): BFS from `S/home/default` following interactions ∪ edge chips reaches every `S/*` and `O/*` board except boards explicitly listed `entry:` (deep-link/dev entries) in the matrix.

## 7. Coverage matrix (audit artifact, in repo)

`generator/coverage.json` + rendered `coverage.md`: rows = every route/overlay/component from the inventory; columns = required states; each cell = `board:<name>` | `excluded:<reason>` | `drift:<note>` + source file reference. Pinned to the git revision of the inventory it was generated from. Zero blank cells (SC-003).

## 8. State transitions of the generation pipeline itself

`storage.progress = { [chunkId]: { done, at, shapesTouched } }` — cache only; cold re-run recomputes by name-lookup. Chunk order: corrections → tokens → typography → components → IA → screens (by page) → overlays → interactions → docs → audits. Later chunks depend only on named outputs of earlier ones, so any suffix of the pipeline can re-run alone.
