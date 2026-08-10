# Integration Plan: wiring the 22 machines into Expo web

**Spec**: [spec.md](./spec.md) · **Cores**: all landed and tested (990 core tests)

Every machine now exists in `vela-core`. This file plans the second half:
making the web app dispatch through them. Native is untouched throughout
(FR-202) — each surface keeps its TypeScript controller and gains a `.web.ts`
twin, the 016 pattern.

## The per-machine recipe (unchanged from 016)

1. `src/services/wallet-state-core/<machine>-session.ts` + `.web.ts` — the
   native stub that throws and the web factory over `createJsonWasmShell`.
2. `src/services/wallet-state-core/<machine>-executor.web.ts` — the ONLY I/O
   site: one operation → one existing service call, failures converted to
   result variants (never a rejection into the loop).
3. `src/hooks/use-<surface>.ts` / `.web.ts` — the controller pair. Shared
   shapes go in a standalone types module; **a `.web.ts` must never
   value-import its own base file** (metro resolves it back to itself →
   infinite recursion, the whole app down; learned in 016).
4. Re-point the screen/component at the controller; rendering only.
5. Verify with that surface's e2e suite, unmodified.

## Grouping (by shared file, so parallel work cannot collide)

| Group | Machines | Files owned | Risk |
| --- | --- | --- | --- |
| G1 | `browser_history` | `src/app/browser.tsx` (history slice) | low |
| G2 | `manage_tokens` | `AddTokenPanel.tsx`, `AddTokenScreen.tsx` | low |
| G3 | `contacts` | `ContactsManager.tsx`, `RecipientTrust.tsx`, contacts services | low |
| G4 | `ext_cache` | `AccountFileWriter.tsx`, app-group sync | low (iOS-only surface) |
| G5 | `batch_import` | `BatchImportSheet.tsx` | low |
| G6 | `network_admin` | `SettingsScreen.tsx` network sections, `RpcProvidersModal.tsx` | medium |
| G7 | `token_trust` | `transfer-monitor.ts`, `token-autoadd.ts`, `tx-simulation.ts` consumers | medium |
| G8 | `rpc_pool` | `rpc-pool.ts` (decision half) | medium — every network call flows through it |
| G9 | `session` | `wallet-state.ts`, `_layout.tsx`, `index.tsx`, switcher | **high** — boot path |
| G10 | `balance_dashboard` + `activity_feed` | `useHomeController.ts`, `HomeScreen.tsx` | high — one agent, they share the file |
| G11 | `sign_request` + `dapp_session` + `dapp_permissions` | `dapp-connection.tsx`, `SigningSheet.tsx`, `browser.tsx` provider half, `web-request.tsx` | **highest** — one agent, all three share the provider |
| G12 | `send` | `useSendController.ts`, `SendScreen.tsx`, step components | **highest** — ~90 controller fields → events + view |
| G13 | `fee_policy`, `approval_guard`, `clear_signing`, `tx_tracker` | consumed *inside* G11/G12 in Rust; their web surfaces (GasFeeCard, EditableApproveCard, receipt polling) re-point with those groups | — |

## Sequencing

Waves of parallel agents, gates between waves, e2e after each:

1. **I1** — G1–G5 (five disjoint low-risk surfaces). Proves the recipe scales
   past the three 016 machines.
2. **I2** — G6–G8. Settings/network/trust plumbing.
3. **I3** — G9 alone (boot path; `§12.1.6` ordering must survive).
4. **I4** — G10.
5. **I5** — G11, then G12 (the two money surfaces, one at a time, each with
   the full money e2e set: approval-guard, clear-signing, batch-send,
   send-high-risk, send-to-group, eip681-pay, parallel-send,
   parallel-clear-signing, parallel-dapp).

## Standing rules for every integration agent

- **Never edit a spec file under `e2e/`.** If a suite fails, the integration
  is wrong (the suites were repaired to match current product behaviour in
  233c062 / 226846f and are now trustworthy).
- Screens keep their exact on-screen copy — e2e locates by visible text.
- Executors branch on operation type only. An `if` that decides *what happens
  next* belongs in Rust.
- Resident machines (`session`, `balance_dashboard`, `rpc_pool`,
  `dapp_session`, `token_trust`) use the module-level singleton session
  pattern from `use-display-currency.web.ts`, not per-screen sessions.
- Run `npm run typecheck` + the surface's e2e before reporting done.

## Carried-forward gaps (raised by integration agents, owned by later waves)

- ~~**`SendScreen.tsx:169` still writes contacts through the TypeScript service
  on web**~~ — closed by G12. The receipt's "save contact" is now
  `SendController.saveReceiptContact()`: native keeps `saveContact()`, web
  dispatches the contacts core's own `save` through
  `saveContactThroughCore()` (`use-contacts-book.web.ts`). The contacts core is
  the single writer on that key on web.
- **`RecipientTrust` has no chain context**, so the contacts core cannot
  resolve identities from it. The component gained an optional `chainId` prop
  that nobody passes yet (zero new RPC, zero e2e change); the surfaces that
  know their chain should start passing it.
- **`ext_cache`'s real surface is iOS-only** and therefore has no automated
  coverage here. `markUniversalLinkVerified()` keeps byte-identical native
  semantics, but a device pass of `e2e/safari/` is the honest confirmation.
- ~~**`session_ended` is not dispatched yet**~~ — G9 landed the wire
  (`session-ext-cache-bridge.web.ts`) as a *capability*: the executor
  implements `ClearExtensionCache`, but the session core still never emits it,
  so logout stays memory-only exactly as today. Open question 2 (should logout
  clear storage?) remains a product decision, undecided and visible.
- **`§12.1.6` still runs on `web-request.tsx:207`'s `setTimeout(0)`.** G9
  deliberately left it: `dispatchWalletSession({type:'switch_account'})` is
  synchronous in the core but React has not committed when it returns, so
  acking `SwitchActiveAccount` immediately would regress any surface still
  reading the signer through `useWallet()`. **G11's path**: (1) put the yield
  inside the executor to reproduce today's timing exactly and delete the
  timeout in the same commit; (2) then stop reading the signer from React on
  the sign path — take it from `sign_request`'s own `active_index` — and the
  yield disappears for good. **Index-domain trap**: `SwitchActiveAccount.index`
  is consumed by the session, where an out-of-range index is a silent whole
  no-op — feed `sign_request` from `walletSessionAccounts()` so both lists are
  the same list, or a mismatched reconcile silently signs from the wrong
  account (the exact failure §12.1.6 exists to prevent).
- **`tx_tracker` is not wired, and `activity_feed` needs it.** The feed core
  re-reads the store (without celebrating) on `ReconcileCompleted{resolved_count}`
  — the verdict is `tx_tracker`'s, not the feed's. G10 left the seam as
  `notifyFeedReconciled(n)` in `feed-resident.web.ts`, and today's real caller is
  `reconcileFeedPending(address)` in the same file, which runs the existing
  TypeScript `reconcilePendingTransactions` on each tick exactly where `loadData`
  step 1b ran it. **When `tx_tracker` lands**: delete `reconcileFeedPending` and
  have that machine call `notifyFeedReconciled` after its own reconcile settles.
  The core side needs no change, and nothing else in the app calls the seam.
  **G12 added the second seam**: `setSendTrackerSink()` in
  `send-executor.web.ts` receives `SendOperation::TrackSubmitted` (emitted only
  after `RecordsPersisted`, invariant ⑥) with the op hash, its record ids, the
  chain and the live `SubmitResult`. Unlike the `sign_request` seam this one has
  a real fallback rather than a faked source: with no sink installed the
  executor runs the very `result.waitForTxHash()` chain that
  `useSendController.ts:1045-1070` ran, at the same point in the sequence.
  Installing a sink replaces it wholesale.

- **Two send behaviours differ from the TypeScript controller on web, both
  deliberate** (G12). (1) The core's `ToggleAllMultiTokens` selects every
  valuable token on the filtered CHAIN, while `TokenSelector` hands
  `onToggleAll` its own search/category-filtered list; sweeping tokens the user
  cannot see is a fund-safety regression, so the shell reproduces
  `use-token-multi-select.ts` by toggling each visible row through the core's
  per-token event, and the aggregate event is unused on web. (2) A scanned
  EIP-681 request re-locks in place (the core's `ScanResolved` re-runs `Open`
  itself) instead of `router.replace`, so the address bar keeps the URL the
  screen was opened with and a hard refresh loses the lock.

- **`makeRecipientId()` now mints `rcpt_s{n}`.** The `send` core seeds split
  rows from its own deterministic `rcpt_{n}` counter, which the shell module
  cannot see; two independent counters over one namespace collide into a
  duplicate React key and a contact picker that fills two rows at once. Ids are
  opaque at every read site, so the prefix is free.
- **The Home chain-chip filter is applied in the shell, not through
  `activity_feed`'s `ChainFilterChanged`.** The core's filtered projection is
  reproduced exactly by dropping non-matching items and eliding the headers that
  leaves empty (items are newest-first, so a day's rows are contiguous); keeping
  the unfiltered list is what still lets the network sheet count every chain's
  events. `ChainFilterChanged` is therefore currently unused on web.
- **`activity_feed`'s celebration flag is consumed by whichever `StoreLoaded`
  lands next**, and a tick issues the read and the scan together. If a scan ever
  answered *before* the store read it raced, the stale read would eat the flag
  and the new receipt would appear with no toast/glow/haptic. A multi-chain
  `eth_getLogs` sweep is never faster than an AsyncStorage read, so this is not
  reachable today — but it is a core-side ordering assumption, not a shell one.
- **Reference stability in the session resident is load-bearing.** It memoizes
  the view and the projected account array so `state.accounts` identity
  survives a switch, as the reducer's did; eight sites key effects/memos off
  `[state.accounts]`. Do not "simplify" `walletSessionAccounts()` away.

- **`activity_feed`'s celebration flag is not bound to the read that set it**
  (port-fidelity defect, found during I4). The TypeScript original bound the
  celebration to a specific `loadData` call by closure; the Rust port consumes
  the flag on whichever `StoreLoaded` arrives next. A tick issues the store
  read and the incoming-transfer scan together, so if a scan ever answered
  before the read it raced, the stale read eats the flag and a genuine receipt
  lands with no toast, glow or haptic. Unreachable today (an `eth_getLogs`
  sweep is never faster than an AsyncStorage read) — reproducing it needed a
  deliberately slowed mock. **Fix: correlate the read** (`ReadTxStore` gains a
  `read_id`, `StoreLoaded` echoes it, the flag names the read it belongs to),
  the same echo pattern `manage_tokens` and `token_trust` already use.

## Verification ledger

| Wave | Gates | Status |
| --- | --- | --- |
| cores | cargo 990/990, typecheck, lint, jest 1526, verify:wasm, drift gates, uniffi crux-free | ✅ |
| D7 loading | dev server 200 + asset 200, smoke + parallel-receive 8/8 | ✅ |
| full e2e baseline | every suite against the D7 build | ✅ 68 passed, 0 failed |
| I1 (G1–G5) | typecheck, jest 1554, full e2e | ✅ 69 passed, 0 failed |
| I2 (G6–G8) | typecheck, lint 0, jest 1583, full e2e | ✅ 69 passed, 0 failed |
| I3 (G9 session) | typecheck, lint 0, jest 1597, build:web static-renders 25 routes, full e2e | in progress |
| I4 (G10 balance_dashboard + activity_feed) | typecheck, lint 0, jest 1623, build:web static-renders 25 routes | ✅ (e2e pending — dev server held) |
| I5a (G11 sign_request + dapp_session + dapp_permissions) | per-wave, above | ✅ |
| I5b (G12 send) | cargo 990/990, typecheck, lint 0, jest 1655 (+19 real-core send tests), verify:wasm, build:web static-renders 25 routes | ✅ (e2e pending — dev server held) |


## Post-integration follow-ups (owner-decided, landed)

- **RPC overrides refuse on proof, save on doubt.** `probeRpcChainId` existed
  but the save path never called it, so a wrong-chain URL entered the pool at
  the highest tier and silently poisoned balances. Now a *reported mismatch*
  refuses; a probe that times out or cannot answer is "unable to verify" and
  the save proceeds — the discipline the compatibility checker already used.
  Web only: native's TypeScript controller keeps its ungated save.
- **Sign-out clears the signed-in wallet, not the device.** Exactly
  `vela.accounts` + `vela.activeAccountIndex`. Everything else survives, and
  that is safe *by construction*: the address is derived from the passkey, so
  re-login rebuilds the same identity and every address-keyed and origin-keyed
  record re-aligns with no migration. `pendingUploads` survives because it is
  an outbox. Copy rewritten in all 15 locales. Native changed too — the copy
  is shared, so memory-only there would have been a lie.
- **Two gates were dead at HEAD**: `verify:i18n` and `verify:identicon` both
  imported the base64 module the D7 change retired. Repaired, and every other
  verification script was run to check for the same rot.

## Closed in the final pass

- **`§12.1.6` step 2** — the sign path takes its signer from `sign_request`'s
  own accounts, so the `setTimeout(0)` yield is gone. The switch is validated
  before dispatch and verified before the ack; a mismatch never resolves, so
  `confirm_gate_open` stays false rather than acking a wrong-account
  signature. (Throwing would not have been fail-closed: `toFailure` answers
  `account_switched` unconditionally.)
- **`dapp_permissions`** — the "unreachable" judgement was verified before
  acting and was accurate (`decide_popup_request` had no caller on any
  platform). It now has the minimum event/view projection to be dispatched,
  and the popup authorisation runs through it.
- **`dapp_session`** — integrated; one deliberate divergence, pinned by a
  test: a backoff reconnect is acked WITHOUT calling `transport.reconnect()`,
  because `WalletPairTransport` owns the identical ladder and driving both
  would put two writers on one relay channel — the dead-channel collision
  BUG-5/6 came from.
- **Erase this device** — prefix scan over `vela.` with an explicit keep-list
  (`vela.pendingUploads` only), re-enumerating afterwards and failing if
  anything survived. `clearAll()` is deleted rather than left as a
  near-synonym.

## Phase 2 — the signing sheet reads its judgements from the cores (`52dbddb`)

An audit of the "22/22 integrated" claim found the distinction that matters:
**a `.web` session existing per machine is not the same as every business
judgement on that screen being core-decided.** Controller-centric domains
coincide; component-centric ones do not. The signing sheet decided 25 of its
26 judgements in TypeScript while `clear_signing.rs` and `approval_guard.rs`
shipped complete inside the wasm with **zero construction sites in `src/`**.
The check that catches this is `grep -c "new <X>Core("` per machine, not the
presence of a session file.

Both cores are now constructed on web and own the decode fallback order, risk
grading, SIWE phishing, the dangerous-view dispatch, the eight approval
shapes, allowance-choice derivation, per-leg batch gating and the confirm-time
re-encode. Two TypeScript self-contradictions died with it: non-printable
detection ran an ASCII-only regex in the view and a Unicode-aware predicate in
the service (so a CJK/emoji message rendered correctly *and* raised a false
"disguised transaction" warning), and SIWE phishing was adjudicated twice, so
the haptic and the red banner could disagree.

An adversarial review of the merged result found seven wiring defects. The
blocker, found independently by three of four lenses: `batchResolving` had one
reset guarded by `!cancelled`, so a superseded `wallet_sendCalls` latched the
sheet into permanent loading whose only exit was dismissing it — and dismissal
**is** the reject path, so the dApp collected a 4001 the user never gave. It is
now derived from `(input key, tagged output)` in `clear-batch.ts` and cannot
latch. Also fixed: a first-frame regression (one machine on `useLayoutEffect`,
the other on a passive `useEffect`, so the sheet painted a generic fallback
card before the real danger surface), per-leg sessions that downgraded three
process-wide caches, index-paired stale batch rows, a lost hex-message warning
on native, a stray ellipsis, and a gallery fixture drift.

**`e2e/parallel-clear-signing.spec.ts:87` was widened** to match its sibling at
`clear-signing.spec.ts:219`, which had been updated for the adaptive blind
surface (`b968190`/`f4eb833`) when it landed. This copy was missed and kept
passing on a ~200ms transient: the pre-crux sheet flashed the red "Unable to
decode" warning before the simulation landed, and the assertion caught it at
83ms rather than the settled surface. Verified against `bfcbab3` in a baseline
worktree with one spec file pointed at both apps — identical from 300ms on, and
identical on the harness route. The sheet now resolves through
`surface:'loading'` instead of flashing a warning it may immediately retract.

**Two structural facts about the gates, learned here:**
`jest.config.js` is `testEnvironment: 'node'` matching only `*.test.ts` (not
`.tsx`), so **no test renders a component or runs a hook** — the cores are
exhaustively covered and the wiring layer, where all seven defects lived, is
not. And playwright's `retries: 1` reports fail-then-pass as "flaky" with a
zero exit code, so a deterministic regression can read as a known flake;
re-measure with `--retries=0`.

## `fee_policy` — the core's money math is fixed; the web wiring is deliberately NOT landed

`fee_policy` was the last machine with zero construction sites on web. Wiring
it was attempted and **pulled**, on purpose. What landed is the core half.

**The bug that made it worth doing anyway.** `calculate_in_band_fee_amount`
evaluated `ceil_div(mul(mul(native_amount, native_usd), fee_unit), …)` in u128
with *saturating* multiply. The saturation landed on the **numerator** — exact
value `1.26e46` for a 700k-gas send at 30 gwei with ETH at $2,000, twenty-four
orders past `u128::MAX` — and the following division by `1e26` pulled it back
to `3.4e12`, which then lost to the `$0.01` `stable_minimum`. **126 DAI quoted
as one cent**, a 12,600× undercharge, for every 18-decimal gas asset (DAI, and
USDT/USDC on BNB Chain). The `mul` doc comment asserted this was impossible
("saturates *upward* … never a silently cheap one") and that comment is why
nobody looked.

The whole money layer now evaluates in `U256` (`alloy_primitives`, the width
`approval_guard` already uses) with exactly two narrowing points. The rule is
stated where the helpers live, and it is **not** "clamp upward" — it is
**never clamp an intermediate**, because a clamped numerator is silently undone
by the division that follows. Unrepresentable values return `None` →
`FeeFailure::CalculationFailed`: the only honest answers are the exact one or a
refusal. Two independent differential fuzz campaigns (6,000 and 400 cases over
decimals 0–78, USD prices `1e-8`–`1e34`, gas prices to `1e37`) found **zero**
cases where the core quotes cheaper than the TypeScript half; every divergence
is the core refusing.

**Why the gates were green through all of it**: every `in_band_fee` vector and
every parity scenario used a 6-decimal token. The corpus now pins fee-asset
decimals **0, 4, 6, 8 and 18** — including the exact `126000000000000000000`
case — plus a new `tempo_expected_gas` family, closing the hole where
`tempo_reimbursement` took `expected_gas` as an *input* so the model producing
it was never compared across languages. Both halves replay the corpus, and both
assert the decimals coverage structurally, so "everything is 6 decimals" cannot
silently reopen.

**Why the wiring was pulled.** Four rounds, each verified, each followed by an
independent review that found a *new* money defect: a Tempo `settlementRecipient`
overwritten by the in-band picker row (every Tempo send failing at submit); a
quote simulated against a native fee leg while submit builds an ERC-20 one
(straddling the 1 KiB `ESTIMATION_REQUIRED_CALLDATA` cliff, so web enabled a
confirm native refuses); the u128 overflow above; then a fix that landed on
`select_fee_asset` while the path the wallet actually dispatches is
`GasFeeCard.handleFeeTokenSelect`; then a re-quote that priced an *empty*
operation because `ConfirmStep.tsx:300-312` renders `GasFeeCard` with no `tx`
and no `batchCalls`.

That is a seam problem, not an agent problem. The core is designed around a
**live session** — `SelectFeeAsset`, the TTL, `options[].amount`,
`confirm_fee_ready`. The attempt integrated at a per-estimate *promise driver*
while `GasFeeCard` kept patching fee estimates locally in TypeScript, so the
shell and the core each kept deciding part of one number. Every round found the
next place they disagreed.

**When it is redone**: give `GasFeeCard` a live session that owns the options,
the TTL and the selection, and move the Send flow's pre-confirm estimate
(`useSendController.handleContinue`) into that same session so there is exactly
one writer of the fee. Landing that requires the confirm screen to pass the real
`tx`/`batchCalls` it is confirming. `Event::QuoteRequested` already carries
`fee_token`, so the simulated operation can be byte-identical to the submitted
one — that part is done and kept.

**Also caught here**: `build-web.mjs --check` is a real gate and it failed on a
tree whose jest suites were all green — the committed wasm had been built from
an intermediate source state that no longer existed. Green tests over a stale
artifact prove nothing about the source. Run the provenance check before
believing a wasm-backed suite.

## Still open

- **Native has no e2e.** Sign-out's native behaviour changed in this branch
  and `ext_cache`'s real surface is iOS-only; both want a device pass
  (`e2e/safari/run_matrix.py`).
- **Two HomeScreens are mounted on web** (react-navigation keeps the inactive
  stack screen). Pre-existing, diagnosed on a clean baseline in 233c062, and
  currently worked around in one spec assertion. Rooting it out means touching
  navigation config — its own change, with its own risk assessment.
