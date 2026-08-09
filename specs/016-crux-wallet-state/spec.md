# Feature Specification: Crux-Owned Wallet State — Inventory + First Wave

**Feature Branch**: `016-crux-wallet-state`

**Created**: 2026-08-09

**Status**: Draft

**Input**: User description: "参考 crux-demo 中 crux 的用法，在 rust/crates/vela-core
中写一些 crux 状态 app。分析 Expo web 版 Vela Wallet `src/` 中所有页面、模块、组件，
提取业务状态（创建钱包和登录的业务状态已由 spec 011 抽出）。现在 expo web 版本的业务
状态和 UI 状态耦合在一起，希望抽出来，这样更加好管理。使用 crux 最佳实践，写出来的
业务状态要让人容易理解和维护，并且不要破坏 expo web vela wallet 现有的功能。"

## Why

Spec 011 proved the pattern: the create-wallet and sign-in rules moved from two
React components into two Crux machines in `vela-core`, the e2e suite passed
unmodified, and the rules became deterministically testable without a browser.
Everything else in the app still keeps its business state inside components and
hooks — `useSendController.ts` alone holds ~40 `useState`/`useRef` cells whose
ordering is maintained by comments and discipline, and the dApp signing provider
carries four synchronous-ref patches for money bugs (BUG-2, BUG-3, the funding
rid race) that all trace back to the same root cause: business decisions living
in asynchronous React state.

This feature does two things:

1. **Inventory** (delivered in [inventory.md](./inventory.md)): a full analysis
   of every page, module and component under `src/` — ~120 business-state
   entries, 23 candidate machines with their invariants, priorities and source
   locations, and an explicit list of what stays in the shell. This is the
   roadmap that future specs (017+) execute; the P1 money machines (`send`,
   `sign_request`, `approval_guard`, `clear_signing`, `fee_policy`,
   `tx_tracker`) are specified there and are **out of implementation scope
   here** — each is a spec-sized effort with a large UI integration surface,
   and forcing them into one branch would violate the "break nothing" mandate.

2. **First wave** (implemented here): three small, self-contained machines that
   extend the 011 pattern from *flow-scoped* onboarding state to the wallet's
   everyday screens, and that generalize the bindings/wasm infrastructure from
   "one onboarding module" to "N domain modules" — the paved road every later
   spec drives on:

   | Machine | Replaces | Why first |
   | --- | --- | --- |
   | `display_currency` | module-level `_committed` pair + single-flight seed promise in `src/services/currency.ts` / `use-display-currency.ts` | Rule-dense (atomic code+rate commit, seed-vs-user-choice race, rate-1 semantics); consumed by every money-showing screen through one hook, so the integration surface is a single file pair |
   | `receive_watch` | the deposit-detection `useEffect` closure in `ReceiveScreen.tsx` (phased polling, baseline diff) | A textbook state machine (timers, baselines, phases) currently living untested inside one effect; merchants judge "the money arrived" by it |
   | `payment_request` | EIP-681/pay-link building in `ReceiveRequestControls` + untrusted `/pay` query parsing in `PayScreen` + the per-account receive acknowledge gate | Pure decision logic with a tiny operation vocabulary; the `/pay` parse path has a **confirmed crash** (`amount=1e18` → BigInt SyntaxError) and a **confirmed silent misparse** (`amount=0x10` → hex-parsed into an enormous prefill) that a strict Rust parser fixes structurally |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Money displays in the chosen currency, decided by the core (Priority: P1)

Every screen that shows fiat amounts (home hero, holdings, send, receipts)
renders them in the user's display currency. The pairing of currency code and
USD→fiat rate, the first-launch region seed, and the "user's explicit choice
always wins" rule are decided by a portable core; the web shell only reads KV
storage, fetches rates, and renders what the core projects.

**Why this priority**: A wrong code/rate pairing renders wrong-magnitude money
(¥12 instead of ¥1,860). The three-way race between hydration, the async region
seed, and an explicit user pick is exactly the class of bug Crux makes
exhaustively testable.

**Independent Test**: `cargo test -p vela-core --features crux` covers the
commit/seed/choice race table; the web app behaves identically to today
(same stored key `vela.displayCurrency`, same rate sources, same fallbacks).

**Acceptance Scenarios**:

1. **Given** a stored currency preference, **When** any screen loads before a
   rate has resolved, **Then** amounts render as USD at rate 1 — never the
   stored code paired with rate 1.
2. **Given** no stored preference and a device region whose currency the rate
   sources can price, **When** the app first launches, **Then** the currency is
   seeded and persisted only after a real rate resolves; if no rate resolves,
   the wallet stays on USD and the key stays absent (retried next launch).
3. **Given** the async seed is still resolving, **When** the user explicitly
   picks a currency in Settings, **Then** the user's choice wins and is never
   overwritten by the seed.
4. **Given** a committed code+rate pair, **When** a fresh screen mounts,
   **Then** it renders with the committed pair immediately (no USD flash, no
   partial pairing).

---

### User Story 2 - Deposit detection is decided by the core (Priority: P1)

While the Receive screen is open, the wallet quietly polls balances and
surfaces deposits as they land. The polling cadence (3s for the first minute,
then 60s, stop after 5 minutes), the baseline diff, and the false-positive
guard for partially-failed chain fetches are decided by the core; the shell
fetches tokens, runs timers, and renders the entries the core projects.

**Why this priority**: A recipient (or merchant) judges "the money arrived" by
this surface. A false positive is a funds-communication failure. Today the
whole machine lives in one `useEffect` closure with zero tests.

**Independent Test**: Core tests drive the machine with a fake clock and
scripted fetch results through every phase transition and the shrunken-result
guard; `e2e/parallel-receive.spec.ts` passes unmodified.

**Acceptance Scenarios**:

1. **Given** the screen just opened, **When** the first fetch settles, **Then**
   it only records the baseline — no deposit is reported.
2. **Given** a recorded baseline, **When** a later fetch shows a token balance
   above baseline, **Then** exactly one deposit entry per increased token is
   reported (symbol, amount delta, network, USD when priced) and the baseline
   advances.
3. **Given** a recorded baseline, **When** a later fetch returns fewer tokens
   than the baseline (a chain likely failed), **Then** no comparison happens
   and no deposit is reported — the next poll is scheduled instead.
4. **Given** the screen has been open five minutes, **Then** polling stops
   entirely; while the app is backgrounded no fetch is issued.
5. **Given** the machine reports times, **Then** the core emits epoch
   timestamps and the shell formats them (fixing the hard-coded `en-US`
   rendering as a side effect of the boundary, not as a behavior change to
   assert on).

---

### User Story 3 - Payment requests are built and parsed by the core (Priority: P2)

Building a payment request on the Receive screen (asset + optional amount →
EIP-681 URI + shareable pay-link + QR value) and parsing one on the `/pay`
landing page (untrusted query → validated, normalized request or a typed
error) are decisions of one core module, so the encode and decode sides can
never drift apart. The per-account "acknowledge before receiving" gate is part
of the same machine's view.

**Why this priority**: The `uint256`/`value` fields are money: a decimals slip
is a 10× error, and the `/pay` page currently crashes on `amount=1e18` and
silently misparses `amount=0x10` into ≈7.5×10⁴ tokens prefilled into a locked
Send. P2 only because the blast radius is smaller than the currency/deposit
surfaces used on every visit.

**Independent Test**: Core round-trip property tests (build → parse → same
request); `e2e/eip681-pay.spec.ts` and `e2e/parallel-receive.spec.ts` pass
unmodified.

**Acceptance Scenarios**:

1. **Given** an asset with `d` decimals and a human amount, **When** the
   request is built, **Then** the EIP-681 `uint256`/`value` is the exact
   base-unit integer for that amount at those decimals, and the copy payload in
   request mode is the pay-link (never the raw `ethereum:` URI).
2. **Given** an amount with more fractional digits than the asset's decimals,
   **When** the user types or the asset changes, **Then** the amount is clamped
   to the asset's precision — never silently truncated at encode time.
3. **Given** a `/pay` URL whose `amount` is not a plain decimal number
   (`1e18`, `1,5`, `0x10`, negative), **Then** the page renders the invalid-
   request surface (or an open-amount request where fields other than the
   malformed one are usable per current behavior for valid fields) — it never
   crashes and never fabricates a different amount than displayed.
4. **Given** a valid `/pay` URL, **When** "Open in Vela" is tapped, **Then**
   the locked Send receives exactly the validated recipient, chain, token and
   base-unit amount.
5. **Given** an account that has not acknowledged the receive warning, **Then**
   the QR stays covered (including while the flag is loading), copy does
   nothing and save is disabled; after acknowledging once, the account shows
   only the one-line reminder from then on.

---

### User Story 4 - The multi-app infrastructure is paved (Priority: P2)

A developer adding the next machine (any of the 20 remaining in
[inventory.md](./inventory.md)) touches only: one new Rust module (+ tests),
one entry in the bindings generator, one wasm bridge declaration, and one
`.web.ts` hook + executor in the app. No changes to the effect loop, the JSON
shell, the build pipeline, or any other machine.

**Why this priority**: 016's lasting value is the paved road. If adding
machine №4 requires re-deriving infrastructure, the roadmap stalls.

**Independent Test**: The three wave-1 machines share one generalized bindings
generator and one generic wasm bridge; `npm run gen:core-types -- --check`
passes; `npm run build:wasm` stays under the 1,000,000-byte gate.

---

### Edge Cases

- Rate resolves for a currency the user changed away from meanwhile → the
  stale rate must not pair with the new code (commit is atomic per code).
- Device locale reports a malformed or non-ISO currency code → ignored, stay
  USD.
- Deposit polling fetch rejects (network error) → schedule next poll, report
  nothing.
- Deposit lands while a *previous* deposit entry is displayed → new entry
  prepends; baseline advances only on confirmed increase.
- Account switches while Receive is open → watcher restarts with a fresh
  baseline for the new address; the acknowledge gate reloads for that account.
- `/pay` with `dec` display-hint contradicting the amount encoding → the
  validated base-unit amount wins; hints only label.
- EIP-681 URIs with legacy `pay-` prefix or scientific-notation amounts →
  parsed tolerantly exactly as today (`2.014e18` accepted on the *parse* side;
  the strict grammar applies to *untrusted /pay query* input).
- Web page reload mid-flow → all three machines rebuild from their shells'
  stored state exactly as the current implementations do (no new persistence).

## Requirements *(mandatory)*

### Functional Requirements

**Inventory**

- **FR-001**: The feature MUST deliver a complete business-state inventory of
  `src/` (pages, modules, components, hooks, services) as
  [inventory.md](./inventory.md), naming for each candidate machine: scope,
  model, events, operations, invariants with `file:line` provenance, priority,
  and integration notes — plus an explicit not-migrating list with reasons.

**Core placement & gating (all three machines)**

- **FR-002**: All new machines MUST live in `rust/crates/vela-core/src/app/`
  behind the existing default-off `crux` cargo feature; the default build (the
  one iOS/Android uniffi links) MUST NOT compile them (verified via
  `cargo tree` as in 011).
- **FR-003**: Machines MUST follow the 011 house style: private `Model`,
  semantic `ViewModel`, events tagged `#[serde(tag = "type", rename_all =
  "snake_case")]`, shell results as variants (never exceptions), i18n keys
  never localized copy, `attempt`/generation correlation for every in-flight
  operation, and doc comments explaining each rule's provenance.
- **FR-004**: Each machine MUST declare its own per-domain operation/result
  vocabulary (no additions to the onboarding `ShellOperation` union, no shared
  god-union).

**display_currency**

- **FR-005**: The core MUST commit code and rate as one atomic pair; a stored
  code MUST never surface paired with the rate-1 fallback.
- **FR-006**: The first-launch seed MUST persist only after a real rate
  resolves; an absent stored key MUST always mean "the user never chose"; a
  user's explicit choice MUST never be overwritten by the seed.
- **FR-007**: The core MUST distinguish "rate genuinely 1 (USD)" from
  "unpriceable right now" (display may fall back to 1; the seed decision MUST
  NOT treat unpriceable as 1) — mirroring today's `resolveRate` vs `getRate`.
- **FR-008**: The web hook `useDisplayCurrency` MUST keep its exact public
  shape (`{code, symbol, rate, fmt}`); number formatting and locale rules stay
  in the shell.

**receive_watch**

- **FR-009**: The polling policy MUST be core-owned: 3s cadence for the first
  60s, then 60s, stop at 5min, skip while backgrounded; timers are shell
  operations (`Wait`-style), never core clocks.
- **FR-010**: The first settled fetch MUST only establish the baseline; a
  fetch returning fewer tokens than the baseline MUST be skipped (no diff, no
  report); the baseline MUST advance only on a confirmed increase.
- **FR-011**: Deposit entries MUST be projected structurally (symbol, delta,
  chain id, optional USD, epoch time); the shell owns formatting.

**payment_request**

- **FR-012**: EIP-681 build, pay-link build, amount sanitation (clamp to asset
  decimals), and `/pay` query validation MUST be core-owned and share one
  base-unit conversion, so display and encoding can never diverge.
- **FR-013**: `/pay` query parsing MUST be strict for amounts (plain decimal
  grammar only), returning typed errors; malformed input MUST yield the
  invalid surface, never a crash, never a silently different amount.
- **FR-014**: The acknowledge gate MUST be core-owned per account: QR covered
  while the flag loads and until acknowledged; copy/save enabled only after.
- **FR-015**: In request mode the copy payload MUST be the pay-link; in
  address mode the raw address. QR value falls back to the bare address until
  a request is built.

**Infrastructure**

- **FR-016**: The bindings generator MUST be generalized to emit per-app
  TypeScript types into per-app `generated/` directories with a `--check`
  drift gate, following the `gen:onboarding-types` pattern (one npm script,
  parameterized per app).
- **FR-017**: The wasm bridge MUST be generalized so each machine exports a
  `dispatch/resolve_effect/view` class over its own vocabulary; the existing
  onboarding classes MUST remain byte-compatible (no change to
  `onboarding-core/generated` or the onboarding wire).
- **FR-018**: The committed `rust/pkg-web/` artifact MUST be rebuilt and stay
  under the existing 1,000,000-byte gate; `build-web.mjs --check` MUST pass.

**Regression safety**

- **FR-019**: Native (iOS/Android) behavior MUST be unchanged: Hermes has no
  WebAssembly, so native keeps the existing TypeScript logic via the 011
  platform-split hook pattern (`use-x.ts` native / `use-x.web.ts` crux).
- **FR-020**: These e2e specs MUST pass unmodified: `parallel-receive.spec.ts`,
  `eip681-pay.spec.ts`, `smoke.spec.ts`, plus the onboarding pair from 011.
  On-screen copy MUST stay byte-identical (e2e locates by visible text).
- **FR-021**: Existing jest suites MUST pass; `eip681.test` semantics carry
  over to core tests (the TS module remains for native).
- **FR-022**: Every machine MUST have deterministic core tests covering its
  transition table, all failure paths, and stale-result rejection — testable
  without a browser.

### Key Entities

- **CurrencyPair**: `{code, rate}` — the only thing money-showing screens read.
- **DepositEntry**: `{at_epoch_ms, items: [{symbol, amount_delta, chain_id, usd?}]}`.
- **PayRequest**: validated `{recipient, chain_id, token_address?, amount_base?
  (decimal string), display: {symbol?, decimals, network_name?}}` — the single
  normalized type both the builder and the `/pay` parser speak.
- **PayLinkError**: `invalid_recipient | invalid_chain | malformed_amount`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `inventory.md` catalogs ≥ 20 candidate machines with invariants
  and provenance; the P1 money machines each have enough detail to start a
  spec without re-reading the codebase.
- **SC-002**: Three machines live in `vela-core` with ≥ 30 core tests total,
  all passing via `npm run test:core`, none requiring a browser.
- **SC-003**: `npm run typecheck`, `npm run lint`, `npm run test:unit` and the
  FR-020 e2e set pass with zero edits to the e2e specs.
- **SC-004**: The wasm artifact stays ≤ 1,000,000 bytes with all three
  machines linked.
- **SC-005**: The `/pay` crash inputs (`1e18`, `1,5`, `0x10`) render the
  invalid/open surface instead of crashing — verified by a unit test at the
  shell mapping layer or core parse tests.
- **SC-006**: Adding a fourth machine requires no infrastructure edits
  (checked by code review of the wave-1 diff: generator and bridge are
  data-driven).

## Assumptions

- The `crux_core` 0.19 dependency, effect-loop plumbing, and JSON boundary
  from 011 are the accepted foundation; no framework changes.
- The three wave-1 machines are screen-scoped (core lifecycle = screen
  lifecycle), so the 011 session pattern applies as-is; the resident-core
  paradigm needed by `session`/`balance_dashboard`/`rpc_pool` is deferred to
  the spec that first needs it (recorded in inventory.md open questions).
- Product-decision questions surfaced by the analysis (logout semantics,
  grant/session expiry, deposit-baseline advance rule, health-check gating)
  are recorded in inventory.md and explicitly NOT decided by this feature.
- The `/pay` malformed-amount fix is a defect fix shipped with this feature;
  current e2e does not pin the crashing behavior.
