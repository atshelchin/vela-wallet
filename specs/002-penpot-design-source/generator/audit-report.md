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

---

## 2026-07-29 · render-first rebuild (US2 complete, US4 substantially advanced)

**File state**: 151 boards across all 11 pages (none empty), 65 library components, 147 tokens.

| page | boards | source |
|---|---|---|
| 00 Start Here | 1 | consumption contract, in-file copy |
| 01 Design Language | 1 | designed specimens |
| 02 Tokens & Type | 3 | token sets |
| 03 Components | 65 | 56 rebuilt from `/design-gallery` cells + 9 quarantined drafts |
| 04 IA & Flows | 1 | route-derived diagram |
| 05 / 06 / 07 / 10 Screens | 31 | scripted state capture of the running app |
| 08 Overlays | 46 | 21 gallery overlays + 25 clear-signing scenarios |
| 09 Patterns | 3 | motion / a11y / degraded states |

**Rebuild totals** — components: 189 variants, 1659 shapes, **0 missing assets**, 1173 colours
token-bound vs 43 literal, 0 variant errors. Overlays + signing: 46 boards, 0 missing, 2 literal.
Screens: 27 boards built from 28 captured states, 0 failures.

**Graph**: 27 pointer interactions, 5 named flows (home, send, receive, onboarding, connect),
12 `vela.edge` records (6 cross-page overlay openings, 6 genuinely non-pointer).

### Defects found by looking at the output, not the logs

1. **Stale gallery dump** — captured before the extractor carried svg/image payloads. Every
   component cell would have built with red MISSING boxes. Recaptured; 103 unique assets now
   resolve.
2. **Inverted z-order after variant folding** — `createVariantFromComponents` flips each board's
   child order, so every wrapper painted over its own contents (token logos blank, button labels
   buried). Fixed by recovering the DOM path from shape names; 150 boards reordered.
3. **Single-component variant sets** — `createVariantFromComponents` returns no container for one
   component; nine one-state families died on it. They are plain components now.

### Known gaps (not fixed, not hidden)

- Screen states: 31 of the manifest's 91. Missing families: `web-request` (7 phases), `connect`
  connecting/error/reconnecting, the onboarding ceremony beyond the create form, send
  confirm/receipt/error, and `browser` (web renders "iOS and Android only" — needs a device capture).
- Three states resisted scripted capture and are absent rather than faked: send confirm and
  details-filled (the recipient field stops matching once an amount is entered), settings scrolled.
- Nine component families have no gallery cell and remain `DRAFT (inferred, …)` off-canvas.
- No dark-theme representative boards; the token binding means switching the active colour set
  repaints the canvas, which supersedes part of T029 but not all of it.
- US5 rebuild-readiness gate (T032–T034) not yet run.

### 2026-07-30 · state sweep round 2 — 163 boards

Added: 3 dark representatives (`S/home/assets-dark`, `S/send/select-token-dark`,
`S/settings/default-dark`) built against the **`color-dark`** token set — 70 now takes
`spec.colorSet`, because matching a dark capture against `color-light` binds nothing and leaves the
whole board in literal hex. Plus `S/web-request/{unavailable, error}`,
`S/connect/{connecting-verify, error}`, `S/settings/advanced-expanded`,
`S/onboarding/create-form-ready`, `S/send/{locked-network-not-supported, locked-unknown-token,
receipt-submitted, receipt-confirmed, receipt-failed}`.

Corrections to boards that were **wrong, not just missing**:
- `S/browser/default` → `S/browser/unsupported-on-web`. The web build cannot render the in-app
  browser at all (the WebView module is iOS/Android only), so that board is the refusal screen.
  Under its old name it told a rebuild agent the browser looks like a one-line apology.
- Removed `S/home/connections-empty` and `S/send/enter-details` — the same states as
  `S/home/connections` and `S/send/details`, captured twice under two naming generations.

Capture-harness defects fixed: a synthetic Enter dispatched on `document` never reaches a
react-native-web TextInput, so the pasted-pairing-URI states came back byte-identical to the
resting screen — twice. They now submit through the field's unlabelled arrow button, and the two
states are real (a 4-digit fingerprint gate; a parse-error card).

**Top of the next session's list — a board that lies.** `O/signing-sheet/{blind-transaction,
eip-712-unknown, scam-drain}` were captured before their descriptor resolved, so all three depict
the "Loading…" fallback rather than the blind-sign / unknown-typed-data / drain-warning UI their
names promise. They must be recaptured with a longer settle. Every other signing board was checked
against its scenario title and is correct.

Still absent by choice, with reasons: `connect/{connected, reconnecting}` need a live relay peer;
`web-request/{waiting, consent, onboarding, processing, done}` need a second tab that opened the
popup and completed the `VELA_WEB_INIT` handshake; `browser/*` needs a device; the onboarding
ceremony and `send/confirm/{submitting, error}` would mint a passkey, write an account, or broadcast
a real transaction.
