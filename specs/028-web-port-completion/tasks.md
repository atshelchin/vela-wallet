# Tasks: Web Port Completion

**Input**: specs/028-web-port-completion/ (plan, research D44–D52, data-model,
contracts, quickstart). Branch from `main` @ 28d25ae9.

**Format**: `[ID] [P?] [Story] Description` — US1 receive code · US2 preferences
· US3 sweep · US4 custom tokens · US5 contacts I/O · US6 desktop send. Markers:
`[ ]`/`[X]`/`[~]`. Phases = plan's seven commits. Paths repo-root-relative;
`pnpm` runs in app-web/vela-wallet. Every port carries a provenance header
`// Ported from src/services/<file> @ 28d25ae9`.

**Precondition, not a task**: 027's SC-304 (an approve that never completes) is
fixed before this feature ships. It is tracked in 027's ledger.

---

## Phase 1: Setup (one commit)

- [X] T401 Baselines into results.md: artifact bytes/fingerprint, corpus pins,
      green tree (check/lint/unit/e2e counts) @ 28d25ae9
- [X] T402 [P] Port-provenance list with line counts: `qrcode 554`,
      `share-card 330`, `locale-format 331`, `contact-io 341`, `erase-device 160`,
      `image-decode 74`, `avatar-style 54`, `saved-contact 22`, plus
      `QRScanner.tsx`'s web decode engine (693) and, as consumers need them,
      `readonly-rpc-gate 109`, `fiat-convert 231`, `currency-catalog 158`,
      `token-list-filter 98`
- [X] T403 [P] Declare the two decoder deps (`@undecaf/zbar-wasm`, `jsqr`) in
      **app-web's own** package.json — the 026/027 rule — and record that both
      are lazy and bundled from our origin, never a CDN (D45)

## Phase 2: The code is data (one commit) 🎯 the trap

- [X] T410 [US1] Port `qrcode.ts` verbatim with a provenance header; unit
      vectors (byte mode, versions 1–10, EC level M) including the longest
      payment link the card must carry
- [X] T411 [US1] `wallet/qr.ts`: the live code for an address and for a payment
      request. `qr-pattern.ts` stays and keeps its comment — the galleries are
      canon and must not start showing real addresses (D44)
- [X] T412 [US1] `QRCard` takes the modules it draws instead of generating
      them; fixtures pass the placeholder, live passes the real code. Gallery
      pixel-unchanged
- [X] T413 [US1] Port `share-card.ts`: address text + code + the account's
      identicon, composed under the founder's existing rules (D46)
- [X] T414 [US1] e2e `receive-code.e2e.ts` (SC-401): render → **decode** →
      the address comes back; with a payment request, amount/asset/chain survive
- [X] T415 Full gate; results.md Phase 2 entry

## Phase 3: Reading a code (one commit)

- [X] T420 [US1] Port the decode engine from `QRScanner.tsx`: zbar primary at
      [1200, 1000, 800, 600, 400], jsQR fallback with binInvert/invert/binarize,
      the downscale-first preprocessing, all lazy (D45)
- [X] T421 [US1] ~~Port `image-decode.ts`~~ **NOT NEEDED**: it is a pure-JS JPEG
      decoder for native, which has no canvas. A browser decodes images itself —
      the picked-image path is `createImageBitmap`
- [X] T422 [US1] `ScanSurface` gains its live half: camera frames through the
      ladder, the gallery/torch/flip tools, and every refusal SAID — no camera,
      permission denied, insecure origin, nothing found (carried gotchas: the
      file input must be mounted, `<video>` swallows touches). Three corpus
      words added for the refusals native never had (`noCamera`,
      `insecureOrigin`, `cameraUnavailable`)
- [X] T423 [US1] The scan result reaches the send form and the sweep picker —
      through the CORE's own `open_scanner` / `scan_resolved`, so the sweep
      picker's scan button needs nothing of its own
- [X] T424 [P] [US1] Units: the ladder's order, each refusal's reason
- [X] T425 [US1] e2e `scan.e2e.ts` (SC-402): a generated code is picked from the
      file input and read; a refused camera states its reason
- [X] T426 Full gate; results.md Phase 3 entry

## Phase 4: Preferences and erase (one commit)

- [X] T430 [US2] Port `locale-format.ts` — explicit presets, never `Intl` (D47);
      units pinning each preset, including money
- [X] T431 [US2] Port `avatar-style.ts` (folded into `preferences.svelte.ts`);
      theme + language + the three formats + avatar style, persisted under
      `vela.` in the Expo record shapes (D48)
- [X] T432 [US2] Every figure, timestamp and avatar in the app reads the chosen
      preset; theme choosing writes what `isDarkTheme()` already reads — and is
      applied BEFORE first paint, in `app.html`'s inline script
- [X] T433 [US2] `SettingsHome` **and `SettingsDesktop`** gain the callbacks
      these rows have never had; the route wires them through one
      `SettingsPrefEvent` table. **Corrected the route's stale header** (FR-411)
- [X] T434 [US2] Port `erase-device.ts` as a NAMESPACE sweep over THREE stores,
      with the exception list filled in `contracts/erase-scope.md` (D49); the
      copy says local data, never the wallet
- [X] T435 [P] [US2] Units: format presets, the erase enumeration, the exception
      list as a test
- [X] T436 [US2] e2e `preferences.e2e.ts` (SC-406/407) ×3 engines: each row
      survives a reload; erase leaves nothing under `vela.`; cancel changes nothing
- [X] T437 Full gate; results.md Phase 4 entry

## Phase 5: Sweep and custom tokens (one commit)

- [X] T440 [US3] `live-send.ts` uses the core's `multi_select_mode` /
      `multi_selected_ids` / `multi_chain_id` / `multi_specs`: the picker's
      master tick, the per-asset amounts, the total, the CTA gate — all the
      core's ruling (D51). One shell flag (`sweepPicking`), by the phone's
      precedent, for whether the checkboxes are showing before confirm
- [X] T441 [US3] Sweep confirms into ONE operation through the existing spine
      (`multi_token_specs` in Rust → the 026 MultiSend path; nothing new)
- [X] T442 [US4] `manage_tokens` gets its screen: `go('add-token')` constructs
      the session, the chain answers with the token's identity, the core rules.
      The probe is implicit (the drawn sheet has one CTA); `onsheetclose` added
      to `FlowsMobile` so a dismissed sheet pops its step
- [X] T443 [US4] An added token appears wherever assets are listed and survives
      a reload (`invalidate_token_cache` → `balance.refresh(true)`;
      `vela.customTokens` in the KV)
- [X] T444 [P] Units: sweep builder arms (19), add-token arms (9)
- [X] T445 e2e `sweep.e2e.ts` (SC-404) + `add-token.e2e.ts` (SC-405) — the
      multicall stub now answers PER CALL (`e2e/stub-multicall.ts`), which is
      what two balances and a string-returning probe need
- [X] T446 Full gate; results.md Phase 5 entry

## Phase 6: The book travels, and the desktop sends (one commit)

**Reassigned 2026-09-05**: the founder handed the app-web contacts feature —
import/export included, and every other drawn-but-dead affordance — to a
separate session (`vela-wallet-63`). Done there, on this branch, with the
rules in the core (results.md Phase 6b):

- [X] T450 [US5] ~~Port `contact-io.ts` + `saved-contact.ts`~~ → the file
      FORMAT went into the core instead (`app/contacts_io.rs`, lifted from the
      desktop shell's copy) behind `import_file` / `export_requested`; existing
      entry wins, groups preserved, a malformed file refused before any write
      (D50) — and "导入到本组" seats every valid row. `saved-contact.ts` needs
      no port: the core's `recipient.saved` already answers it
- [X] T451 [US5] The contacts route gains export/import through 026's file
      seams (`pickTextFile` / `saveTextFile`) — plus the rest of the book:
      members, 移入分组, the QR, 最近往来 from the feed, the menus, and the
      hand-off to /wallet (`?to=`, `?group=`, `?flow=receive`)
- [X] T452 [P] [US5] Units: the collision matrix, a malformed file, a round
      trip — in Rust (`app_contacts` 44 → 54) and vitest (live builders,
      pickers, report, hand-off, history mapping)
- [X] T453 [US6] The wallet route hands `FlowsPanel` the same send actions
      `FlowsMobile` has — and reads the core's stage for the third column
      (`desktopSendState`), as the phone host has since 026
- [X] T454 e2e `contacts-io.e2e.ts` (SC-408, `vela-wallet-63`) +
      `desktop-send.e2e.ts` (SC-409)
- [X] T455 Full gate; results.md Phase 6 entry (isolated worktree, port 4174)

## Phase 7: Budgets and closeout (one commit)

- [X] T460 [P] Budget re-assertions: the decoder's wasm absent from Welcome and
      from every startup chunk (the 026 SheetJS treatment); the core artifact
      ~~byte-identical~~ (+129 B for three corpus words, Phase 3) and still the
      only one a wallet route loads. **Finding**: every `chunksCarrying` budget
      had passed vacuously since 027 (`output/client` is the extension build's
      `app/` dir); `chunkSource` now reads what the preview serves
- [ ] T461 [~] The device pass: scan a real code with a real camera, and a photo
      of one — the ladder was measured on hardware and the port must keep it
- [X] T462 Close results.md: SC-401…410 verdicts, deviations, 029 handoff
- [X] T463 Final sanity: all gates + `gen-core-types --check` (isolated worktree: 181/1/0)

## Dependencies

Phase 2 blocks 3 (the decode round trip needs something real to decode) and is
what the feature exists for. Phases 4, 5 and 6 are independent of each other and
of 2–3; they are ordered by how much a person notices their absence. Phase 7
last.

## MVP strategy

Phases 1–3 close the only item on this list that is a trap rather than a gap: a
receive code that scans, and a scanner that reads. Everything after is a
capability the wallet claims and does not yet perform.
