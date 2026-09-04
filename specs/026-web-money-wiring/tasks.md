# Tasks: Web Money Wiring

**Input**: specs/026-web-money-wiring/ (plan, research D15–D30, data-model,
contracts, quickstart). Branch from `main` @ f9bcb278.

**Format**: `[ID] [P?] [Story] Description` — US1 send · US2 sign · US3 batch ·
US4 parallel space. Markers: `[ ]`/`[X]`/`[~]`. Phases = plan's seven commits
(story→phase: US4→3, US1→4, US2→5, US3→6). Paths repo-root-relative; `pnpm`
runs in app-web/vela-wallet. Every port carries a provenance header
`// Ported from src/services/<file> @ f9bcb278`.

---

## Phase 1: Setup (one commit)

- [X] T201 Baselines into results.md: wasm bytes/fingerprint (must close
      unchanged), corpus pins (1536 leaf / 84 branch), port-provenance list
      with line counts @ f9bcb278, green tree (check/lint/unit/e2e counts)
- [X] T202 [P] Record the deps decision (`@noble/curves`, `xlsx` — lazy, out
      of the startup chunk) and the runtime dev-gate deviation (D18)
- [X] T203 [P] Add `src/lib/dev`, `src/lib/signing/core`, `src/lib/flows/core`
      to the literal-audit source list (tokens.test.ts)

## Phase 2: Foundation (one commit) — blocks 3–6

- [X] T210 Port `services/vela-core/*` → `$lib/core/kernels.ts` +
      `safe-constants.ts` (D15); golden-address unit (5th surface,
      `0x88cCA0…6894` + the three single-key fixtures)
- [X] T211 Port `safe-transaction.ts` verbatim (rpc-adapter → pool facade;
      fault hook → web fault module); port its Jest vectors to vitest
      (signature envelope, SafeOp hash, MultiSend, initCode)
- [X] T212 [P] Port `bundler-service.ts` (+`parseBundlerUnderfunded` pinned
      against the relay's strings — FR-206), `tx-reconciler.ts`,
      `token-reads.ts`, `recipient-risk.ts`, `eip681.ts`, `batch-send.ts`,
      `dapp-history.ts`, `approval-guard.ts`, `selector-registry.ts`
- [X] T213 [P] Port the simulation family → `$lib/services/sim/` (tx-simulation,
      sim-assets, sim-engine-rpc, sim-engine-tevm seam, sim-trust,
      sim-corroboration)
- [X] T214 Port `use-dapp-signing.ts::handleDAppRequest` → `dapp-submit.ts`
      (plain module; `'core'` submit-guard owner)
- [X] T215 `records.ts` writer: `saveTransaction(s)` / `updateTransaction(s)`
      under `withTxLock`, atomic; unit (batch siblings never drop)
- [X] T216 [P] `$lib/services/accounts.ts`: `findAccountByAddress` /
      `ByCredentialId` / `keySetOf` over `vela.accounts`
- [X] T217 `passkey.ts`: `signWithAny(challengeHex, credentials[])` +
      `setPasskeyOverride()` seam (runtime dev gate); unit for the
      allowCredentials list and the abort controller
- [X] T218 [P] Amount codec (`toShellCall`/`decimalToHex`) + vectors (D25)
- [X] T219 Full gate; results.md Phase 2 entry

## Phase 3: Parallel space (one commit) 🎯 enabling

- [X] T220 [US4] Port `passkey-fixture.ts` → `$lib/dev/passkey-fixture.ts`
      (noble p256, DER out, live rpId, frozen 0x45 attestation, registration
      cursor, preferred signer); unit: every assertion passes
      `verifySafeWebAuthn` + `derSignatureToRaw`
- [X] T221 [US4] `$lib/dev/parallel-space.ts`: enter/exit/backup (idempotent),
      fixture accounts (3 single + multi), fixture contact seed/remove,
      `vela.parallelSpace` flag, module `$state` + boot re-arm; sponsorship
      short-circuit in bundler-service while active
- [X] T222 [US4] `ParallelSpaceBadge.svelte` (unconditional, self-gating;
      taps → `/parallel`); `/[locale]/parallel/+page.svelte` (EntryGenerator
      ×15; enters + redirects to wallet); console `vela.parallel.*`
- [X] T223 [P] [US4] Fault console relay arms (`failRelay`, `emptyTreasury`,
      `rejectSubmit`, `silentReceipt`, `zeroGasQuote`, `forceFunding`) +
      `__VELA_FAULT_INIT__` module-load seam; `vela.rpcState` kept
- [X] T224 [P] [US4] `e2e/stub-chain.ts`: `stubRelay(page, handlers)` (JSON-RPC
      methods + `/v1/account`, `/v1/sponsor`, `/v1/treasury`)
- [X] T225 [US4] `$lib/dev/test-requester.ts` scaffold (transport interface,
      `vela.requester.fire`) — wired to sign_request in Phase 5
- [X] T226 [US4] e2e `parallel-entry.e2e.ts`: enter → badge → fixture account
      visible → exit restores the seeded real wallet; production path never
      requests the fixture chunk (asserted)
- [X] T227 Full gate; results.md Phase 3 entry

## Phase 4: Send spine (one commit) 🎯 MVP

- [X] T230 [US1] Port fee-{types,executor,session}.ts + `use-fee-quote.ts` →
      `flows/core/fee-*.ts` + `fee-quote.ts` (one live session per surface)
- [X] T231 [US1] Port send-{types,executor,session}.ts → `flows/core/send-*.ts`
      (ports: tokensFetched/Partial, credentialId/Loaded, signingStarted,
      receiptUpdate, alert, close, feeQuote); `classifySubmit` pinned
- [X] T232 [US1] Port tx-tracker-{types,executor,session,resident}.ts →
      `wallet/core/tracker-*.ts`; sinks: send handoff, feed.liveTick,
      token_trust receipt logs; visibility → app_resumed; wallet page →
      home_focused
- [X] T233 [US1] `flows/live.ts` send overlays: send-pick, send-form (recipient
      draft + identity/risk line, amount/fiat, split rows), send-confirm
      (facts + sim), send-receipt (incl. `failed` — corpus check D29),
      fee-token, contact-pick (024 session), tx-detail
- [X] T234 [US1] Screen props: `SendForm.oncontinue`, `AmountInput` editable
      when `oninput`, clipboard on copy handlers, `SendReceipt.onexplorer`;
      gallery pixel-unchanged (fixtures untouched)
- [X] T235 [US1] Route translation: `nav.enter('send')` creates the send + fee
      sessions; screen callbacks → core events (D28); ports → notice/nav;
      `/pay` query → payment_request → `open` params; dispose on close
- [X] T236 [P] [US1] Units: send executor arms (mocked services), fee arms,
      tracker arms + `outcomeOf` exhaustiveness, live builders
- [X] T237 [US1] e2e `send-lands.e2e.ts` (SC-201: parallel + stub chain + stub
      relay → confirmed receipt → feed row → balance refresh),
      `reopen-pending.e2e.ts` (SC-204), `relay-faults.e2e.ts` (SC-205)
- [X] T238 Full gate; results.md Phase 4 entry

## Phase 5: Signing (one commit)

- [X] T240 [US2] Port guard-{types,executor,session}.ts →
      `signing/core/guard-*.ts`; clear-{types,executor,session}.ts +
      `clear-batch.ts` → `signing/core/clear-*.ts` (coalescing map)
- [X] T241 [US2] Port sign-{types,executor,session,resident}.ts →
      `signing/core/sign-*.ts` (transport registry; requester = 026's
      transport; parallel sponsorship denied)
- [X] T242 [US2] `signing/live.ts`: `buildSigningModel(sign, clear, guard, fee)`
      → the 13 block kinds, allowance editor from GuardView, fee from
      FeeView, `confirm.enabled` = gate ∧ guard ∧ fee-ready; SlideToConfirm
      graduates (onconfirm → `approve_tapped`; dismiss → `reject_tapped`)
- [X] T243 [US2] Mount `SigningSheet` (mobile) / `SigningPanel` (desktop) in
      the wallet route driven by the resident; funding sheet when
      `funding` is set; record persisted pending → tracker
- [X] T244 [P] [US2] Units: guard/clear/sign arms; block mapping per ladder
      rung (descriptor, selector, simulation, blind); never-unlimited
      default (exact preset) pinned
- [X] T245 [US2] e2e `signing-scenarios.e2e.ts` (SC-203: transfer, unlimited
      approval → exact default + deliberate unlimited, permit, unknown call;
      reject answers the requester; approve submits through the spine)
- [X] T246 Full gate; results.md Phase 5 entry

## Phase 6: Batch (one commit)

- [X] T250 [US3] Port batch-import-{types,executor,session}.ts →
      `flows/core/batch-*.ts`; `recipient-table.ts` with lazy `import('xlsx')`;
      file input + Blob download seams
- [X] T251 [US3] BatchImport wiring: paste `oninput`, unit toggle, file,
      template, apply → send split mode (`seed_split_recipients`); live
      overlay from BatchView (rows, rate status, refusal when no rate)
- [X] T252 [P] [US3] Units: batch arms (rate null refusal), table parsing
      (paste/xlsx matrix); startup-chunk assertion (no xlsx in first paint)
- [X] T253 [US3] e2e `batch.e2e.ts`: paste three rows → preview → one
      operation → receipt with three transfers (stub relay)
- [X] T254 Full gate; results.md Phase 6 entry

## Phase 7: Live sweep + matrix + closeout (one commit)

- [X] T260 Opt-in live sweep (SC-202): fixture Safe dust send on Gnosis
      through the real relay (in-band fee or gas deposit); hashes, amount,
      fee vs explorer → results.md
- [X] T261 [P] Extend the 3-engine matrix to the storage-asserting money e2e
      (reopen-pending, parallel-entry)
- [X] T262 [P] Budget re-assertions: zero-wasm Welcome, worker purity, one
      artifact, byte-count unchanged, fixture/xlsx chunks absent from the
      startup path and from Welcome
- [X] T263 Close results.md: SC-201…207 verdicts, deviations, 027 handoff
      (real transport onto the requester seam, WalletPair, remote-inject
      relay), native-tier handoff (the machine order to repeat)
- [X] T264 Final sanity: all gates + `gen-core-types --check`

## Dependencies

Phase 2 blocks 3–6; Phase 3 blocks every e2e that signs; Phase 4 blocks 5's
submit path (shared spine) and 6 (split send); Phase 7 last.

## MVP strategy

Phases 1–4 = a wallet that sends (US1) under the parallel space (US4). 5 and
6 add the signing sheet and the payroll batch on the same spine.
