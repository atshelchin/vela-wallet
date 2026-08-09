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

## Verification ledger

| Wave | Gates | Status |
| --- | --- | --- |
| cores | cargo 990/990, typecheck, lint, jest 1526, verify:wasm, drift gates, uniffi crux-free | ✅ |
| D7 loading | dev server 200 + asset 200, smoke + parallel-receive 8/8 | ✅ |
| full e2e baseline | every suite against the D7 build | in progress |
| I1…I5 | per-wave, above | pending |
