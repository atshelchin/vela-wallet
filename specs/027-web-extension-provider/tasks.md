# Tasks: Web Extension Provider

**Input**: specs/027-web-extension-provider/ (plan, research D31–D40, data-model,
contracts, quickstart). Branch from `main` @ 52ad8fa9 (PR #184 merged).

**Format**: `[ID] [P?] [Story] Description` — US1 connect · US2 sign · US3
identity · US4 connections · US5 resilience. Markers: `[ ]`/`[X]`/`[~]`.
Phases = plan's seven commits. Paths repo-root-relative; `pnpm` runs in
app-web/vela-wallet. Every port carries a provenance header
`// Ported from <path> @ 52ad8fa9`.

---

## Phase 1: Setup (one commit)

- [X] T301 Baselines into results.md: hosted-site budgets (wasm bytes/fingerprint,
      deploy-bundle purity, one artifact), corpus pins, green tree
      (check/lint/unit/e2e counts) @ 52ad8fa9
- [X] T302 [P] Port-provenance list with line counts: `packages/safari-extension/src/*`,
      `src/services/{extension-bridge-transport,dapp-transport,dapp-permissions,dapp-account-reconcile}.ts`,
      `src/services/wallet-state-core/{dsess-*,dperm-*,ext-cache-*}.ts`
- [X] T303 [P] `extension/` package home + `src/lib/dapp` added to the
      literal-audit source list (tokens.test.ts)

## Phase 2: The package and the shell (one commit) — blocks 3–7

- [X] T310 [US3] MV3 manifest: pinned id (`key`), `extension_pages` CSP with
      `'wasm-unsafe-eval'` (D33), `host_permissions` including
      `https://getvela.app/*` (D31) and `*://*/*` for injection, action popup,
      web-accessible `inpage.js`
- [X] T311 [US3] The shell build (`pnpm build:extension`): one client-rendered
      page, NO inline script (D35), external bundles, assets under the extension
      root; `extension/build.mjs` assembles it with the page-side scripts
- [X] T312 [US3] Unit: the built shell contains zero inline `<script>` (the
      measured blocker), and the manifest declares the wasm CSP
- [X] T313 [US3] The core loads in a `chrome-extension://` page and a REAL
      passkey login lands — same rpId, same derived address
- [X] T314 [US3] e2e `extension-boot.e2e.ts`: unpacked extension under
      `--headless=new`, pinned id, CDP virtual authenticator on the SAME page
      (D39); sign in and assert the address the hosted site derives (SC-306)
- [X] T315 Full gate; results.md Phase 2 entry

## Phase 3: Injection and transport (one commit)

- [X] T320 [US1] Port `inpage.js` (EIP-1193 + EIP-6963 + the legacy
      compatibility flag + the MAIN-world guard), `content.js`, `background.js`,
      `lib/protocol.js` with provenance; strip the native-messaging hand-off
      that only Safari needs
- [X] T321 [US1] `src/lib/dapp/transport.ts` — the first REAL transport on 026's
      `sign_request` registry, against the `dapp-transport.ts` interface;
      ported from `extension-bridge-transport.ts`
- [X] T322 [US1] The request window (D34): opened per request, bound to the
      requesting tab, answers exactly once, `4001` on close
- [X] T323 [P] [US1] Units: protocol vectors (id single-use, origin carried,
      size bound, malformed refused), transport arms
- [X] T324 [US1] e2e `extension-discovery.e2e.ts` + `e2e/testdapp/`: the
      provider is announced with Vela's identity before the page's own scripts
      run, and a request reaches the wallet
- [X] T325 Full gate; results.md Phase 3 entry

## Phase 4: Connect (one commit) 🎯 MVP

- [ ] T330 [US1] Port `dperm-{types,connect,connect-types,popup}.ts` →
      `src/lib/dapp/core/dperm-*.ts`; `dapp-permissions.ts` +
      `dapp-account-reconcile.ts` services
- [ ] T331 [US1] Port `dsess-{types,executor,session,resident}.ts` →
      `src/lib/dapp/core/dsess-*.ts` (the resident owns the live connection)
- [ ] T332 [P] [US1] Port `ext-cache-{types,executor,session}.ts` — the fast
      answers an already-granted origin gets
- [ ] T333 [US1] `src/lib/dapp/live.ts`: the three views → the 022
      `ConnectionSheet` / `ConnectionModel`; `ConnectionPanel.svelte` gains
      callbacks (gallery pixel-unchanged)
- [ ] T334 [US1] `eth_requestAccounts` end to end: consent surface → grant →
      the granted account only; dismissal answers `4001` and records nothing
- [ ] T335 [P] [US1] Units: dperm/dsess/ext-cache arms; live builders
- [ ] T336 [US1] e2e `extension-connect.e2e.ts` (SC-301) + a MetaMask-only test
      page (SC-302)
- [ ] T337 Full gate; results.md Phase 4 entry

## Phase 5: Sign (one commit)

- [ ] T340 [US2] Route `eth_sendTransaction`, `personal_sign`,
      `eth_signTypedData_v4` and the batch verbs into 026's `sign_request` —
      no second signing path
- [ ] T341 [US2] The answer: an operation identifier at submit time, never a
      blocked page waiting for a receipt; the pending record is written first
- [ ] T342 [P] [US2] Units: method routing, the answer shapes, the
      unsupported-chain refusal
- [ ] T343 [US2] e2e `extension-signing.e2e.ts` (SC-303/304): transaction →
      sheet → operation hash + pending record; reject → `4001` exactly once;
      message and typed data verify; an unlimited approval still cannot be slid
- [ ] T344 Full gate; results.md Phase 5 entry

## Phase 6: Connections and resilience (one commit)

- [ ] T350 [US4] The connections surface: list with grant and last use, revoke,
      and the core's rules for what a switch of account or chain tells a site
- [ ] T351 [US5] The answer-or-reject guarantee: the worker holds no
      authoritative state, a request is written down on arrival, a closed window
      answers `4001`, a torn-down worker resumes or refuses (D37)
- [ ] T352 [P] Units: revocation arms, the resilience paths
- [ ] T353 e2e `extension-connections.e2e.ts` (SC-305) and
      `extension-resilience.e2e.ts` (SC-307)
- [ ] T354 Full gate; results.md Phase 6 entry

## Phase 7: Real device, budgets, closeout (one commit)

- [ ] T360 [US3] The real-device pass (D31's carried caveat): a real platform
      authenticator, a wallet created on `https://getvela.app`, the SAME address
      in the extension, one verifying signature → results.md
- [ ] T361 [P] Budget re-assertions: the hosted site byte-identical (Welcome
      zero-wasm, worker purity, one artifact, artifact bytes); the extension
      package's own size recorded as its budget
- [ ] T362 [P] A security pass over the channel contract: origin discipline,
      single-use ids, no wildcard delivery, bounded payloads, icon loaded only
      from the requesting origin
- [ ] T363 Close results.md: SC-301…309 verdicts, deviations, 028 handoff
      (Firefox/Edge, the store listing, cross-doorway sync), native-tier note
- [ ] T364 Final sanity: all gates + `gen-core-types --check`

## Dependencies

Phase 2 blocks 3–7 (nothing runs until the wallet boots inside the extension);
Phase 3 blocks 4 and 5 (no channel, no request); Phase 4 blocks 5 (a request
from an ungranted origin is a connect, not a signature); Phase 7 last.

## MVP strategy

Phases 1–4 = a dApp can discover Vela and connect, with the identity question
already proven in Phase 2. Phase 5 makes it useful; 6 makes it safe to live
with; 7 confirms it on real hardware.
