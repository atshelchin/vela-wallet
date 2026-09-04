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

- [ ] T410 [US1] Port `qrcode.ts` verbatim with a provenance header; unit
      vectors (byte mode, versions 1–10, EC level M) including the longest
      payment link the card must carry
- [ ] T411 [US1] `wallet/qr.ts`: the live code for an address and for a payment
      request. `qr-pattern.ts` stays and keeps its comment — the galleries are
      canon and must not start showing real addresses (D44)
- [ ] T412 [US1] `QRCard` takes the modules it draws instead of generating
      them; fixtures pass the placeholder, live passes the real code. Gallery
      pixel-unchanged
- [ ] T413 [US1] Port `share-card.ts`: address text + code + the account's
      identicon, composed under the founder's existing rules (D46)
- [ ] T414 [US1] e2e `receive-code.e2e.ts` (SC-401): render → **decode** →
      the address comes back; with a payment request, amount/asset/chain survive
- [ ] T415 Full gate; results.md Phase 2 entry

## Phase 3: Reading a code (one commit)

- [ ] T420 [US1] Port the decode engine from `QRScanner.tsx`: zbar primary at
      [1200, 1000, 800, 600, 400], jsQR fallback with binInvert/invert/binarize,
      the downscale-first preprocessing, all lazy (D45)
- [ ] T421 [US1] Port `image-decode.ts` for the picked-image path
- [ ] T422 [US1] `ScanSurface` gains its live half: camera frames through the
      ladder, the gallery/torch/flip tools, and every refusal SAID — no camera,
      permission denied, insecure origin, nothing found (carried gotchas: the
      file input must be mounted, `<video>` swallows touches)
- [ ] T423 [US1] The scan result reaches the send form and the sweep picker
- [ ] T424 [P] [US1] Units: the ladder's order, each refusal's reason
- [ ] T425 [US1] e2e `scan.e2e.ts` (SC-402): a generated code is picked from the
      file input and read; a refused camera states its reason
- [ ] T426 Full gate; results.md Phase 3 entry

## Phase 4: Preferences and erase (one commit)

- [ ] T430 [US2] Port `locale-format.ts` — explicit presets, never `Intl` (D47);
      units pinning each preset, including money
- [ ] T431 [US2] Port `avatar-style.ts`; `preferences.ts` for theme + language +
      the three formats + avatar style, persisted under `vela.` (D48)
- [ ] T432 [US2] Every figure, timestamp and avatar in the app reads the chosen
      preset; theme choosing writes what `isDarkTheme()` already reads
- [ ] T433 [US2] `SettingsHome` gains the callbacks these rows have never had;
      the route wires them. **Correct the route's own stale header comment** (FR-411)
- [ ] T434 [US2] Port `erase-device.ts` as a NAMESPACE sweep with the exception
      list filled in `contracts/erase-scope.md` (D49); the copy says local data,
      never the wallet
- [ ] T435 [P] [US2] Units: format presets, the erase enumeration, the exception
      list as a test
- [ ] T436 [US2] e2e `preferences.e2e.ts` (SC-406/407) ×3 engines: each row
      survives a reload; erase leaves nothing under `vela.`; cancel changes nothing
- [ ] T437 Full gate; results.md Phase 4 entry

## Phase 5: Sweep and custom tokens (one commit)

- [ ] T440 [US3] `live-send.ts` uses the core's `multi_select_mode` /
      `multi_selected_ids`: the picker's master tick, the per-asset amounts, the
      total, the CTA gate — all the core's ruling (D51)
- [ ] T441 [US3] Sweep confirms into ONE operation through the existing spine
- [ ] T442 [US4] `manage_tokens` gets its screen: `go('add-token')` constructs
      the session, the chain answers with the token's identity, the core rules
- [ ] T443 [US4] An added token appears wherever assets are listed and survives
      a reload
- [ ] T444 [P] Units: sweep builder arms, add-token arms (not-a-token, already
      known, slow chain)
- [ ] T445 e2e `sweep.e2e.ts` (SC-404) + `add-token.e2e.ts` (SC-405)
- [ ] T446 Full gate; results.md Phase 5 entry

## Phase 6: The book travels, and the desktop sends (one commit)

- [ ] T450 [US5] Port `contact-io.ts` + `saved-contact.ts`: export to a file,
      import with **existing entry wins**, groups preserved, malformed refused
      before any write (D50)
- [ ] T451 [US5] The contacts route gains export/import through 026's file seams
- [ ] T452 [P] [US5] Units: the collision matrix, a malformed file, a round trip
- [ ] T453 [US6] The wallet route hands `FlowsPanel` the same send actions
      `FlowsMobile` has
- [ ] T454 e2e `contacts-io.e2e.ts` (SC-408) + `desktop-send.e2e.ts` (SC-409)
- [ ] T455 Full gate; results.md Phase 6 entry

## Phase 7: Budgets and closeout (one commit)

- [ ] T460 [P] Budget re-assertions: the decoder's wasm absent from Welcome and
      from every startup chunk (the 026 SheetJS treatment); the core artifact
      byte-identical and still the only one a wallet route loads
- [ ] T461 [~] The device pass: scan a real code with a real camera, and a photo
      of one — the ladder was measured on hardware and the port must keep it
- [ ] T462 Close results.md: SC-401…410 verdicts, deviations, 029 handoff
- [ ] T463 Final sanity: all gates + `gen-core-types --check`

## Dependencies

Phase 2 blocks 3 (the decode round trip needs something real to decode) and is
what the feature exists for. Phases 4, 5 and 6 are independent of each other and
of 2–3; they are ordered by how much a person notices their absence. Phase 7
last.

## MVP strategy

Phases 1–3 close the only item on this list that is a trap rather than a gap: a
receive code that scans, and a scanner that reads. Everything after is a
capability the wallet claims and does not yet perform.
