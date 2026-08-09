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

- **`SendScreen.tsx:169` still writes contacts through the TypeScript service
  on web** (the receipt's "save contact" action). The contacts core owns every
  other writer; this one is safe today only because each contacts panel
  re-reads on open and the executor clears the TS cache after every write.
  **G12 must route it through the core** — until then it is the last
  split-brain writer on that key.
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
| I5 | per-wave, above | pending |
