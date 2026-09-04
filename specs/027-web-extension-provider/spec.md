# Feature Specification: Web Extension Provider — Vela Shows Up Inside Every dApp

**Feature Branch**: `027-web-extension-provider` (from `main` @ 52ad8fa9, after PR #184)

**Created**: 2026-09-04

**Status**: Draft

**Input**: User description: "web 版本不需要链接 dapp，但是如果 app-web/vela-wallet 通过 chrome 扩展部署，希望能注入到 chrome tab 标签页，并支持 eip6963 和 eip1193 以及兼容 metamask 方式注入。现在不用支持 walletpair 以及 remote inject 因为它们不成熟。" — 027 只做 dApp，025/026 的欠账不收。

## Why

After 026 the web wallet can move money and can say, in plain words, exactly
what it is about to sign. But nothing can ASK it to. The signing sheet runs on
four real machines behind a transport registry whose only occupant is a test
requester on the wallet's own page — a seam with nothing plugged into it.

Meanwhile every dApp in a browser looks for a wallet in exactly one place: a
provider object injected into its page. A hosted site cannot put anything into
another origin's tab; that is the browser's whole security model. A browser
extension can. So the hosted wallet at getvela.app stays what it is — a wallet
a person visits — and this feature ships the SAME application a second way, as
a browser extension, whose one new job is to be present in the tab where the
dApp is and to carry its requests to the sheet that already knows how to answer
them.

The decisions are, as always, already Rust: `dapp_permissions.rs` (1,341 lines)
rules what an origin is granted and how a torn-down window settles, and
`ext_cache.rs` (692) keeps the cheap answers the page needs instantly. The extension contributes only what a machine cannot have: presence
in the page, a message channel, and the browser's own APIs.

**Standing rules this feature inherits, not re-decides**: the core decides and
the shell performs; an approval is never unlimited unless deliberately chosen;
a submitted operation is persisted as pending at submit time; the relay is the
gas-price authority; **a wallet's address is derived from its keys** (spec 019
invariant ②) — which is why "is the extension's wallet the same wallet?" is a
correctness question in this feature, not a convenience one; one implementation;
words come from the corpus; the drawn components stay pure and gain callbacks.

**Standing exclusions**: the hosted site itself does not connect to dApps
(founder decision, 2026-09-04) — nothing about getvela.app's own behaviour
changes here. **WalletPair and the remote-inject bridge are out** (founder:
"they are not mature") — the transport registry stays open for them. No in-app
browser and no explore tab (spec 022), so `browser_history` stays unwired. The
carried debts from 025/026 (`manage_tokens`, desktop send actions, sweep mode)
are explicitly NOT in this feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A dApp finds Vela and connects (Priority: P1)

Someone with the extension installed opens a dApp and clicks "Connect wallet".
Vela is in the list — with its real name and logo — and choosing it shows what
the site is asking for: which site, which account, which network. They approve,
and the dApp receives their address.

**Why this priority**: it is the doorway. Nothing else in this feature is
reachable until a dApp can discover the wallet and be granted an account.

**Independent Test**: with the extension loaded and a local test dApp page,
`eth_requestAccounts` returns the wallet's derived address after a visible
consent step, and the dApp is listed as connected.

**Acceptance Scenarios**:

1. **Given** a page with the extension active, **When** the page loads,
   **Then** a provider is present before the dApp's own scripts run, and it is
   announced by the modern discovery mechanism with Vela's real identity and
   icon — a fresh announcement per page load, and the announced provider is the
   same object the page can reach directly.
2. **Given** a dApp that only ever looks for the legacy single provider,
   **When** it checks the compatibility flag that most such dApps gate on,
   **Then** it finds Vela and can connect — while the modern announcement
   continues to state Vela's true identity.
3. **Given** another wallet extension already owns the legacy provider slot,
   **When** Vela loads, **Then** Vela does not clobber it; discovery still
   works and both wallets stay selectable.
4. **Given** a connect request, **When** the person approves, **Then** the
   granted account and network are the core's ruling, and the dApp receives
   exactly what was granted — never more.
5. **Given** a connect request, **When** the person dismisses it, **Then** the
   dApp receives the standard user-rejection answer and no grant is recorded.
6. **Given** any of the 15 locales, **Then** every word on the consent surface
   resolves from the corpus.

---

### User Story 2 - A dApp asks for a signature and gets an answer (Priority: P1)

A connected dApp asks Vela to send a transaction, sign a message or sign typed
data. The 026 signing sheet opens — the same one, on the same machines — says
what the request does, and the answer goes back to the exact page that asked.

**Why this priority**: it is the reason the doorway exists, and it is the first
REAL transport on the seam 026 built.

**Independent Test**: from the test dApp, a transaction request opens the sheet,
approving submits through the existing spine and returns an operation hash;
rejecting returns the standard rejection.

**Acceptance Scenarios**:

1. **Given** a connected dApp, **When** it requests a transaction, **Then** the
   signing sheet renders the core's reading of it (what it does, to whom, for
   how much, at what risk) before anything is signed.
2. **Given** an approval request for an unlimited allowance, **Then** the
   never-unlimited rule holds exactly as it does on the wallet's own screens —
   the sheet defaults to a finite cap and unlimited requires a deliberate act.
3. **Given** the person approves, **Then** the operation is submitted through
   the same relay spine, persisted as pending at submit time, and the answer
   returned to the dApp is the operation's identifier — the wallet does not
   block the page waiting for a receipt.
4. **Given** the person dismisses the sheet, **Then** the dApp receives the
   standard user-rejection answer, and the request is settled exactly once.
5. **Given** two tabs ask at the same time, **Then** each answer reaches the tab
   that asked, and neither request can be answered twice.
6. **Given** a request for a network the wallet does not support, **Then** the
   dApp is told so in the standard shape, and no sheet is opened.

---

### User Story 3 - One wallet, two doorways (Priority: P1)

Someone created their wallet on getvela.app. They install the extension. It is
their wallet — the same passkey, the same address, the same money.

**Why this priority**: an address is derived from its keys. If the extension's
signing ceremony is bound to a different identity than the hosted site's, the
extension silently becomes a DIFFERENT wallet holding no money — the most
expensive kind of surprise a wallet can produce. This story exists to make that
outcome impossible, or, failing that, impossible to stumble into unknowingly.

**Independent Test**: sign in on the hosted site, note the address; open the
extension; the address is the same, and a transaction signed in the extension
verifies against the same keys.

**Acceptance Scenarios**:

1. **Given** a wallet created on the hosted site, **When** the extension is
   opened, **Then** it presents the same account and the same derived address.
2. **Given** the extension signs a request, **Then** the signature verifies
   against the account's public keys — the same keys the hosted site would have
   used.
3. **Given** the identity cannot be shared for a reason outside this project's
   control, **Then** the person is told plainly, in the corpus's words, before
   they can create or use a second wallet — a silently different address is
   never shown as "your wallet".

---

### User Story 4 - Connections are visible and revocable (Priority: P2)

The person can see which sites are connected, what each was granted, and cut any
of them off.

**Why this priority**: a granted origin is a standing permission. A wallet that
can grant but not revoke is a wallet that only gets more permissive over time.

**Independent Test**: connect the test dApp, see it listed with its grant, revoke
it, and observe that its next request must ask again.

**Acceptance Scenarios**:

1. **Given** one or more connected sites, **When** the person opens the
   connections surface, **Then** each site is shown with its identity, the
   account and network it holds, and when it was last used.
2. **Given** a connected site, **When** the person revokes it, **Then** the
   grant is gone, the live session is closed, and the site's next request is
   treated as a first-time request.
3. **Given** the person switches account or network in the wallet, **Then**
   connected sites are told, per the core's rules about what a site may see.

---

### User Story 5 - A request survives the browser's housekeeping (Priority: P2)

A request is never silently lost: not to a background process the browser
decided to shut down, not to a window the person closed, not to a page that
navigated away mid-request.

**Why this priority**: the failure mode of an extension wallet is silence — a
dApp spinner that never resolves and a person who cannot tell whether their
money moved. 026 already made "money in flight outlives every screen" true for
the wallet's own store; this extends it to the page's promise.

**Independent Test**: drive a request, then force the background process to be
torn down / close the wallet window without answering, and observe the dApp
receives a definite answer rather than hanging.

**Acceptance Scenarios**:

1. **Given** a pending request, **When** the wallet surface is closed without a
   decision, **Then** the dApp receives the standard user-rejection answer.
2. **Given** a pending request, **When** the browser tears down the extension's
   background process, **Then** the request is either resumed or definitively
   rejected — never left unanswered.
3. **Given** an approved transaction whose answer could not be delivered,
   **Then** the operation is still recorded in the wallet's own activity as
   pending, so the person can see the real outcome regardless of what the page
   saw.

---

### Edge Cases

- **Another wallet is present.** Vela must not fight over the legacy provider
  slot, and must not be made undiscoverable by a wallet that does.
- **A page that never asked.** A hostile page can post any message it likes into
  its own tab; nothing that arrives from a page may be treated as if it came
  from the wallet or from another origin.
- **A page's metadata lies.** A site's self-reported name and icon are claims,
  not facts; the origin is the fact, and it is what the consent surface leads
  with.
- **An enormous or cyclic request payload.** A request that cannot be bounded is
  refused before it reaches a screen.
- **No wallet yet.** A request arriving before the person has a wallet leads to
  wallet creation, and the request is answered (or rejected) afterwards — never
  dropped.
- **The person is mid-send in the wallet** when a dApp request arrives.
- **The dApp asks for an account it cached** but which has since been revoked or
  switched away from.
- **The tab is closed** between approval and delivery of the answer.
- **The same site in two tabs**, one connected and one not.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-301 (Presence and discovery)**: the extension MUST place an
  Ethereum provider in every ordinary web page before the page's own scripts
  run, announce it through the modern multi-wallet discovery mechanism with
  Vela's real name, icon and a fresh per-page identifier, and expose the same
  object through the legacy global when doing so does not displace another
  wallet.
- **FR-302 (Compatibility with dApps that only know one wallet)**: the legacy
  global MUST carry the compatibility markers those dApps gate on, so they can
  connect; the modern announcement MUST continue to state Vela's true identity.
  This is a deliberate, documented compatibility choice, not an impersonation of
  another product's brand.
- **FR-303 (One request channel, and it is the 026 seam)**: requests MUST travel
  from the page to the wallet surface and answers back over a channel that
  binds each request to the tab and origin that made it; the wallet side MUST
  arrive as the first REAL transport registered on the 026 signing seam, so the
  sheet, the machines and the submit spine are reused unchanged.
- **FR-304 (Permissions are the core's)**: what an origin is granted — which
  accounts, which network, for how long — MUST be decided by
  `dapp_permissions`; the extension only asks and performs. Revocation MUST be
  the same authority in reverse.
- **FR-305 (The fast answers)**: the answers a page expects instantly — the
  current account and chain for an already-granted origin — MUST come from
  `ext_cache` rather than from a fresh decision each time, and MUST NOT open a
  window. (`dapp_session`, named here in the first draft, turned out to be the
  machine for a live TRANSPORT session — WalletPair, or an in-app browser — and
  both are excluded from this feature; see research D43.)
- **FR-306 (Signing is 026's, unchanged)**: transaction and signature requests
  MUST be answered through the existing signing sheet and money spine — the
  same clear-signing reading, the same never-unlimited guard, the same
  persist-at-submit ordering, the same fee policy. No second signing path.
- **FR-307 (Identity continuity)**: a wallet founded on the hosted site MUST be
  the same wallet in the extension — the same keys, therefore the same derived
  address. If the browser's own rules make a shared signing ceremony impossible,
  the product MUST say so plainly before a second wallet can be created, and
  MUST NOT present a differently-derived address as the person's wallet.
- **FR-308 (Origin discipline)**: every answer MUST be delivered only to the
  origin that asked; request identifiers MUST be single-use; a page's claimed
  metadata MUST never be able to widen a grant, and remote content referenced by
  a page's metadata MUST NOT be fetched from anywhere but that page's own
  origin. Request payloads MUST be bounded before they reach a screen.
- **FR-309 (Reuse the drawn surfaces)**: the consent and connection-management
  surfaces MUST be the components spec 022 already drew, gaining callbacks; the
  signing surface MUST be 026's. No new screens are drawn in this feature, and
  the galleries stay pixel-unchanged.
- **FR-310 (Words from the corpus)**: every word a person reads MUST resolve
  from the vela-core corpus in all 15 locales; new keys follow the 5-step
  process.
- **FR-311 (One implementation, and the hosted site is untouched)**: the
  extension MUST be produced from the same application source as the hosted
  site — not a fork, not a second wallet codebase — and the hosted site's own
  behaviour and budgets MUST be unchanged by this feature (zero-wasm Welcome,
  a wasm-free deploy bundle, one core artifact, artifact bytes identical). The
  extension's own size MUST be recorded as a budget.
- **FR-312 (Verification without a person)**: the whole journey — discovery,
  connect, sign, answer, revoke — MUST be driveable end to end in CI with the
  extension loaded, a local test dApp, stubbed chain and relay, and the parallel
  space's fixed keyset standing in for the passkey.

### Key Entities

- **Injected provider**: the object a page sees; announces itself, forwards
  requests, and emits the events dApps listen for (account and chain changes,
  disconnection).
- **Request**: one call a page makes of the wallet, bound to the tab and origin
  that made it and to a single-use identifier, carrying what is asked and its
  arguments.
- **Grant**: what an origin has been given — accounts, network, and its
  provenance and age. Owned by `dapp_permissions`.
- **Cached answer**: the account and chain an already-granted origin may be told
  immediately. Owned by `ext_cache`.
- **Extension package**: the shippable artifact — the injected script, the page
  bridge, the background process and the wallet surface — with its own size
  budget.

## Success Criteria *(mandatory)*

- **SC-301**: from a local test dApp with the extension loaded, Vela is
  discovered through the modern mechanism with its real name and icon, and
  `eth_requestAccounts` returns the wallet's derived address after a visible
  consent step — asserted in CI.
- **SC-302**: a dApp that gates only on the legacy compatibility marker and
  never implements modern discovery can complete the same connect.
- **SC-303**: a transaction request from the test dApp opens the 026 sheet and,
  on approval, returns an operation identifier and leaves a pending record in
  the wallet's own activity; on dismissal it returns the standard user-rejection
  answer, exactly once.
- **SC-304**: message and typed-data requests return signatures that verify
  against the account's keys.
- **SC-305**: a connected site is listed with its grant and can be revoked; its
  next request is treated as first-time.
- **SC-306**: for one passkey, the extension and the hosted site present the
  SAME derived address — or, if the browser makes that impossible, the product
  says so before any second wallet exists, and that refusal is asserted.
- **SC-307**: no request is left unanswered when the wallet surface is closed
  without a decision or the background process is torn down mid-flight.
- **SC-308**: the hosted site's budgets are byte-for-byte what they were before
  this feature; the extension package's own size is recorded.
- **SC-309**: the full journey is green in CI on chromium, and every live word
  resolves in all 15 locales.

## Assumptions

- **Chrome/Chromium (Manifest V3) is the target.** Firefox and Edge use nearly
  the same manifest and are expected to be cheap follow-ons, but they are not in
  this feature. Safari already has its own extension in this repo and is not
  changed here.
- **The Safari extension is the porting truth for the page side.**
  `packages/safari-extension/src/{inpage.js, content.js, background.js,
  lib/protocol.js, manifest.json}` already implement modern discovery, the
  legacy compatibility markers, a MAIN-world guard and the page bridge, on MV3.
  They are ported with provenance headers, not redesigned. Their differences are
  in the WALLET side: Safari hands off to a native app; Chrome has no native app
  and the wallet surface is the extension's own.
- **The Expo tree is the porting truth for the wallet side**:
  `src/services/extension-bridge-transport.ts` and `dapp-transport.ts` for the
  transport shape; `wallet-state-core/{dsess-*, dperm-*, ext-cache-*}` for the
  three machines' loops; `services/{dapp-permissions, dapp-account-reconcile,
  dapp-history}` for their services (`dapp-history` was already ported in 026).
- **The connection copy largely exists**: the corpus already carries a `connect`
  namespace (101 leaves) and an `explore` namespace (54). Gaps are expected to
  be small and go through the 5-step process; a zero-delta corpus is not assumed
  in this feature the way it was in 024–026.
- **Where the wallet surface lives inside the extension, how the same
  application produces it, whether it shares storage with the hosted site, and
  how the passkey ceremony keeps its relying party** are HOW questions with real
  browser constraints behind them. They are deliberately left to the planning
  phase, to be settled by evidence (a decision record per question, in the
  manner of 024's D1–D8, 025's D9–D14 and 026's D15–D30) rather than assumed
  here. FR-307 and SC-306 state the OUTCOME those decisions must produce.
- **Store submission is not in this feature.** The deliverable is a loadable,
  packaged extension and its verification; listing it is tracked separately with
  the app-store work.
- **The relay, the chains and the money rules are exactly 026's.** This feature
  adds a way to be asked; it changes nothing about what happens after the person
  says yes.
- **The parallel space is the verification harness**, as in 026: the real
  extension and the real application with one substitution — a fixed keyset
  where the authenticator is.
