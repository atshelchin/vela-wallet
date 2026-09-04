# Quickstart — 027 Web Extension Provider

## Gates (unchanged order)
`pnpm check` → `pnpm lint` → `pnpm test:unit -- --run` → `pnpm build` →
`pnpm build:extension` → `pnpm test:e2e` + repo-root `gen-core-types --check`.
Corpus changes (if any) follow the 5-step process.

## Loading the extension by hand
1. `pnpm build:extension` → `extension/dist/`
2. `chrome://extensions` → Developer mode → "Load unpacked" → `extension/dist/`
3. The id is pinned by the manifest `key`, so it does not change between loads.

## Hermetic scenarios (CI)
Playwright, `chromium.launchPersistentContext` with `headless: false` **plus
`--headless=new` in `args`** — `headless: true` does not load extensions at all
(D39) — a pinned extension id, and a CDP virtual authenticator added to the
SAME page that will use it (a virtual authenticator is scoped to its target).

1. **The wallet starts inside the extension** — the shell page opens, the core
   compiles under the declared CSP, and a passkey login lands on an address.
2. **Discovery (SC-301/302)** — the test dApp sees the announced provider with
   Vela's identity, and a MetaMask-only test page reaches the same connect.
3. **Connect (SC-301)** — `eth_requestAccounts` opens the consent surface and
   returns the granted account; dismissal returns `4001` and records nothing.
4. **Sign (SC-303/304)** — a transaction opens 026's sheet and returns an
   operation identifier with a pending record; message and typed-data requests
   return verifying signatures.
5. **Revoke (SC-305)** — a connected site is listed, revoked, and must re-ask.
6. **Resilience (SC-307)** — the request window is closed without a decision and
   the background is torn down mid-flight; both produce a definite answer.

## The real-device pass (T360 — the founder's, and the only one that counts)

Two of this feature's most serious bugs were found by installing it, and neither
was reachable from a harness that runs the real extension in a real browser on
every commit. Do this by hand:

1. `pnpm build:extension`, then `chrome://extensions` → Developer mode →
   **Load unpacked** → `app-web/vela-wallet/extension/dist`. It must load. (It
   did not, until Phase 6: Chrome refuses any top-level name starting with `_`,
   and Playwright's `--load-extension` tolerates what this dialog refuses.)
2. Create a wallet on **https://getvela.app** first and note its address.
3. Open the extension's wallet and sign in. **The passkey dialog must say
   `getvela.app`, never `chrome-extension://…`** — that is the difference
   between your wallet and a different, empty one — and the address must match
   step 2. This closes D31's carried caveat and SC-306's real half.
4. Connect a real dApp and sign something. This is what would close SC-304; if
   the approve hangs the way it does in CI, the finding in results.md is
   confirmed on hardware too.

## Budgets
The hosted site's build is untouched: Welcome fetches no wasm, the deploy bundle
carries none, one core artifact, artifact bytes identical. The extension package
records its own size.
