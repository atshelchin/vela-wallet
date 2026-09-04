# Feature Specification: Web Money Wiring — The Wallet Moves Money, and Says Exactly What It Signs

**Feature Branch**: `026-web-money-wiring` (from `main` @ f9bcb278, after PR #183)

**Created**: 2026-09-04

**Status**: Draft

**Input**: User description: "第三个 spec：动钱。send + 签名五件套（fee_policy → approval_guard → sign_request → clear_signing → tx_tracker → send）接 src/lib/flows/ 的 14 个推屏与 src/lib/signing/ 的 21 个组件（SlideToConfirm 从画廊毕业）；passkey 签名复用 src/lib/onboarding/core/passkey.ts；parallel space 全量移植为主验证（固定密钥集 + fixture Safe + 本地 relay），Playwright 跑真实 send 全程。移植参考 Expo：bundler-service / safe-transaction / approval-guard / clear-signing / transfer-monitor / tx-reconciler 与 wallet-state-core 六台 executor。"

## Why

After 024 and 025 a signed-in person's web wallet is honest about what it
HAS: settings, contacts, balances, activity, deposits, rates. It still cannot
do the one thing a wallet exists for — move money — and every drawn send and
signing screen is a picture. This feature lands the money path: a send that
is quoted, guarded, signed with the passkey, submitted through the relay and
tracked to its receipt; a signing sheet that says in plain words what a
request does before anything is signed, and refuses the unlimited approval
by default. Everything that decides is already Rust: `send.rs` (91 tests),
`fee_policy.rs` (69), `approval_guard.rs` (75), `sign_request.rs` (44),
`clear_signing.rs` (62 + 3), `tx_tracker.rs` (18), `batch_import.rs` (71).
The web contributes what the core cannot have — the passkey ceremony, the
fetches to the relay and the chain, the clock, the file picker, storage — and
the drawn screens.

**Standing rules this feature inherits, not re-decides**: the bundler is the
gas-price authority (the wallet never vetoes its quote); a fee is settled in
the coin the core chose (Tempo pays gas in stablecoins); an approval is never
unlimited unless the person deliberately chooses it; a dApp transaction is
estimated for real before it is shown; a submitted transaction is persisted
as pending at submit time and never lost to a closed tab; the recipient's
trust line (verified / contract / first interaction) is the core's verdict.

**Standing exclusions**: no explore tab and no in-app dApp browser on web
(spec 022); external dApp pairing (WalletPair transport) is 027 — this
feature wires the signing machines and their sheet, with a request SEAM whose
only 026 source is the parallel space's test requester. Native platforms
(desktop, Android, iOS) follow after web, per the program order.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Send a token to someone (Priority: P1)

A signed-in person picks a token, names a recipient (address, contact, scan
or pay-link), types an amount in token or fiat, sees the real fee in the fee
coin the core chose, slides to confirm, signs with their passkey, and watches
the receipt settle — the same journey the Expo app ships, on the web's drawn
screens.

**Why this priority**: it is the product. Every other money surface (batch,
signing) reuses the quote → guard → sign → submit → track spine this story
lands.

**Independent Test**: in the parallel space (fixture keyset, funded fixture
Safe), send a small amount on one chain end to end; the receipt confirms, the
activity feed shows the send, the balance drops; hermetically, the same
journey completes against stubbed chain + relay in CI.

**Acceptance Scenarios**:

1. **Given** a token with balance, **When** the person enters recipient and
   amount, **Then** the core's validation rules the form (insufficient,
   dust, self-send, poisoned look-alike, first interaction) and the CTA only
   arms when the core says so.
2. **Given** a valid draft, **When** the fee is quoted, **Then** the fee
   card shows the relay's quote in the core-chosen fee coin with its fiat
   figure, requotes on the core's TTL, and a stale quote can never be slid.
3. **Given** the relay's treasury for that chain is empty or the network is
   uncovered, **Then** the person is told what to do (fund / retry) in the
   corpus's words — never a raw relay error.
4. **Given** the slide completes, **When** the passkey prompt is cancelled,
   **Then** nothing is submitted and the draft is intact; **When** signed,
   **Then** the user operation is submitted once (double-slide safe), the
   record is persisted as pending immediately, and the receipt screen tracks
   it to confirmed/failed via the core's polling rules.
5. **Given** the receipt confirms, **Then** the activity feed shows the send
   (pending → confirmed), the balance refreshes, and the recipient is offered
   to the address book when unknown.
6. **Given** a `/pay` link (EIP-681) is opened, **Then** the send form is
   prefilled from the payment_request core's ruling (025's seam, now with a
   destination).
7. **Given** any of the 15 locales, **Then** every live word resolves from
   the corpus.

---

### User Story 2 - Sign only what is understood (Priority: P1)

A signing request (a transaction or typed data) arrives; the sheet shows the
clear-signing rendering when a descriptor or a known selector explains it,
degrades honestly down the ladder when not (decoded → selector-known →
simulated → blind with the risk said), asks the approval guard to cap any
allowance, estimates the real transaction, and lets the person approve or
reject. On web the request source in this feature is the parallel space's
test requester (a real transport is 027).

**Why this priority**: the signing sheet is the product's trust argument;
its 21 drawn components must run on the real machines before any dApp
transport is attached, or 027 would be wiring UI and transport at once.

**Independent Test**: the test requester posts each fixture scenario (ERC-20
transfer, unlimited approval, typed-data permit, unknown contract call); the
sheet renders the core's view for each, the guard rewrites the unlimited
approval to the exact amount by default, approving submits through the same
spine as US1 and the record lands in the feed.

**Acceptance Scenarios**:

1. **Given** an ERC-7730 descriptor for the target, **Then** the sheet shows
   the described fields with the core's formatting (dates, amounts, tokens)
   and the risk class.
2. **Given** an `approve(spender, MAX)`, **Then** the guard presents the
   exact-amount preset as the default choice; unlimited requires a
   deliberate second action and is labelled as such.
3. **Given** no descriptor and no selector match, **Then** the sheet shows
   the simulation's balance changes when available and otherwise the blind
   warning — never a fabricated description.
4. **Given** the person rejects, **Then** the requester is answered with the
   rejection and nothing was signed; **Given** approve, **Then** the fee
   pre-check (funding / sponsorship) runs first and the funding sheet is
   shown when the relay says so.
5. **Given** the tab closes after submit, **Then** the record persisted as
   pending is reconciled on the next open.

---

### User Story 3 - Pay many at once (Priority: P2)

A person pastes or drops a spreadsheet of recipients and amounts (in a fiat
currency or the token), reviews the rows the core parsed, edits the rate if
they must, and sends one batched user operation — the payroll the Expo app
ships (split mode) — and can sweep many tokens to one address (sweep mode).

**Independent Test**: paste three rows in the batch importer; the preview
shows the core's parsed rows and the fiat→token conversion at the resolved
rate (or refuses to convert when no rate); apply → one multi-send operation
→ one receipt with three transfers.

**Acceptance Scenarios**:

1. **Given** rows in a fiat unit and no rate reachable, **Then** the
   importer refuses to price them (never 1:1) and says why.
2. **Given** a valid batch, **Then** the fee is quoted once for the whole
   operation and the receipt lists every transfer.
3. **Given** a `.xlsx` drop, **Then** the sheet is parsed lazily (the
   parser never loads on the startup path) and the template can be saved
   back as a file.

---

### User Story 4 - The parallel space on web (Priority: P1, enabling)

Developers and the CI can exercise every money path against a fixed passkey
keyset and fixture Safes: the real app, with only the passkey ceremony
replaced — so a Playwright run can slide, "sign" and submit. Hermetically,
the chain and relay are stubbed at the HTTP boundary (025's harness, now
with the relay's methods); in the live variant, the funded golden Safe sends
a real dust transfer through the real relay on one chain.

**Independent Test**: `pnpm test:e2e` completes a hermetic send and a
hermetic signing approval with zero live traffic; the quickstart's live
sweep completes one real send from the golden Safe and its receipt appears
in the feed.

**Acceptance Scenarios**:

1. **Given** the parallel space is entered, **Then** the badge is visible on
   every screen and the fixed keyset signs where a passkey would.
2. **Given** a production path (no dev gate), **Then** neither the fixture
   signer, the test requester nor the fault console is ever loaded; the
   badge renders whenever the space is active, unconditionally.
3. **Given** the fault console, **Then** relay failures (treasury empty,
   quote unavailable, submit rejected, receipt never arriving) are
   injectable and each shows its designed presentation.

---

### Edge Cases

- A passkey prompt cancelled or failed mid-slide leaves the draft intact
  and the slider reset; a second slide during an in-flight submit is
  ignored (the core's `signing_started` gate).
- A quote that expires while the person reads the confirm screen requotes;
  the slider is disarmed until the fresh quote lands.
- A relay that accepts the operation but whose receipt never arrives: the
  tracker's polling budget decides when to say "still pending" versus
  "unreachable"; the record stays pending, never silently dropped.
- The recipient is the person's own account, a contract, or a first
  interaction: the trust line says so in the core's words; sending is not
  blocked, only informed (poisoned look-alikes are blocked by the core).
- A chain whose native coin is not the gas coin (Tempo): the fee card shows
  the stablecoin fee; the Max button reserves it.
- The web has no haptics and no OS share sheet: acknowledgements are visual;
  "share receipt" is copy/download.
- Prerender safety unchanged: all touched routes stay prerendered ×15 with
  neutral waiting states; the deployed worker stays wasm-free; wasm bytes
  unchanged (every machine is already aboard).

## Requirements *(mandatory)*

- **FR-201 (One spine)**: every money movement — single send, batch, signing
  approval — flows quote (fee_policy) → guard (approval_guard) → sign →
  submit (relay) → persist pending → track (tx_tracker), driven by the
  core's events; the web never composes a user operation or a fee itself.
- **FR-202 (Passkey is the signer)**: the WebAuthn assertion is obtained by
  the web shell exactly as login does (024/019 passkey module), the
  challenge and the Safe WebAuthn signature encoding are the core's kernels;
  the parallel space substitutes the fixed keyset behind the same seam.
- **FR-203 (Drawn screens graduate)**: the 021 send flow screens
  (send-pick, send-form, send-confirm, send-receipt, fee-token,
  contact-pick, batch-import, scan) and the 022 signing components (sheet,
  clear-signing fields, degrade ladder, approval editor, funding sheet,
  SlideToConfirm) gain callback props and live builders as SIBLINGS of the
  fixture builders; fixtures stay gallery canon; the gallery is pixel-
  unchanged.
- **FR-204 (Records)**: a submitted operation is written to the local
  transaction store as pending before the submit answer returns, patched by
  the tracker, and reconciled on next open; 025's readers need no change.
- **FR-205 (Core decides, shell performs)**: executors stay switch-only with
  failure twins; ports carry provenance headers; stored bytes stay
  Expo-compatible.
- **FR-206 (Relay contract)**: the relay (bundler) is reached through the
  025 pool's bundler facade; underfunded/uncovered/quote-failure wording is
  the core's ruling on the relay's structured error, kept in lockstep with
  the relay's handlers (the coupling is recorded, with its test).
- **FR-207 (Parallel space)**: entry, badge, fixed keyset, fixture Safes,
  fault console arms for the relay, and a test requester for signing; none
  of it reaches the production bundle (asserted).
- **FR-208 (Hermetic e2e first)**: CI drives a full send and a signing
  approval against stubbed chain + relay; the live send is a quickstart
  sweep, never a CI dependency.
- **FR-209 (Budgets hold)**: Welcome zero-wasm, worker purity, artifact
  byte-count unchanged, corpus process for any new key, literal audit
  covers every new dir, xlsx parser lazy.
- **FR-210 (Quality gates)**: the 025 gate suite + new money-path unit and
  e2e coverage; existing tests unweakened.

### Key Entities

- **Send draft / stage**: the core's SendView — token, recipient draft with
  identity + risk, amount (token/fiat), fee quote, stage, receipt.
- **Fee quote**: the relay's quote in a fee asset with TTL; the core's
  FeeView with options and tiers.
- **Guard decision**: a detected approval and the chosen cap (exact /
  preset / deliberate unlimited / revoke).
- **Signing request / record**: the arrived request (tx or typed data), its
  clear-signing view (surface, fields, risk, ladder level), the persisted
  SignRecord (pending → settled).
- **Tracked entry**: a pending operation with its receipt polling state and
  final status; patches to the local tx store.
- **Batch**: parsed rows (recipient, amount, unit), rate status, preview,
  the multi-send operation.
- **Parallel space**: fixture account(s), fixture Safe addresses, the
  requester's scenarios, the fault arms.

## Success Criteria *(mandatory)*

- **SC-201**: a hermetic single send completes on the web — form → quote →
  slide → (fixture) sign → submit → pending record → confirmed receipt →
  feed row → balance refresh — with zero live traffic in CI, on chromium;
  the persistence steps on all three engines.
- **SC-202**: a live send from the golden fixture Safe on one chain lands
  and its receipt is shown; the amount and fee agree with the explorer to
  the unit (quickstart sweep, recorded).
- **SC-203**: every fixture signing scenario renders the core's view; the
  unlimited-approval scenario defaults to the exact amount and requires a
  deliberate choice for unlimited (asserted).
- **SC-204**: a tab closed after submit shows the operation as pending on
  reopen and settles it (reconciliation asserted hermetically).
- **SC-205**: relay faults (treasury empty, uncovered network, quote
  failure, submit rejection, receipt silence) each show their designed
  presentation from the fault console; no raw relay text reaches a screen.
- **SC-206**: zero business rules added to web code; executors switch-only
  under unit pin; the gallery pixel-unchanged.
- **SC-207**: budgets identical (artifact bytes, zero-wasm Welcome, worker
  purity); the parallel space and the xlsx parser are never loaded on a
  production path (asserted: no fixture/xlsx chunk requested without the dev
  gate); corpus gates green; e2e suite ≥ 025's coverage, all green.

## Assumptions

- The Expo money path is the porting truth: `bundler-service.ts`,
  `safe-transaction.ts`, `approval-guard.ts`, `clear-signing*.ts`,
  `tx-simulation`, `transfer-monitor`, `tx-reconciler`, `deployer-api.ts`,
  the passkey signing module, and the six `wallet-state-core` executors
  (send, fee-policy, approval-guard, sign-request, clear-signing,
  tx-tracker) + batch-import — ported with provenance headers, RN seams
  removed (file picker, haptics, share, clipboard, alerts become web
  equivalents or acknowledged no-ops).
- The drawn screens keep their models; interaction arrives as optional
  callback props injected by the route (024 contacts / 025 receive pattern).
- The signing request source on web is a seam; 026 ships only the parallel
  space's requester behind it. 027 (WalletPair) plugs a real transport.
- The relay is the existing vela-bundler deployment; there is no local
  bundler anywhere in the program (the plan's "local relay" is the test-dApp
  bridge, whose web twin is the in-page requester). Its wire contract is
  what Expo's `bundler-service.ts` / `safe-transaction.ts` speak today.
- The live sweep spends dust from the fixture Safe's existing funds
  (Gnosis xDAI); no new funding is assumed.
- This feature completes the web tier; desktop → Android → iOS follow the
  same machine order in later specs.
