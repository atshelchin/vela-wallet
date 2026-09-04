# Implementation Plan: Web Extension Provider

**Branch**: `027-web-extension-provider` | **Date**: 2026-09-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/027-web-extension-provider/spec.md`

## Summary

Ship the same application a second way — as a Chrome MV3 extension — so that a
dApp in any tab discovers Vela, and its requests reach the signing sheet 026
already built. The page side is ported from the Safari extension, which already
implements discovery and the bridge on MV3. The wallet side becomes the FIRST
real transport on 026's `sign_request` seam. Three machines join the web tier —
`dapp_permissions`, `dapp_session`, `ext_cache` — and decide everything about
grants, sessions and the fast answers; the extension only asks and performs.

The feature's central risk was settled before planning: **the extension can
perform the passkey ceremony under `rpId = getvela.app`** (research D31), so it
is the same wallet at the same address, and storage need not be shared at all
(D32).

## Technical Context

**Language/Version**: TypeScript strict, SvelteKit 2 / Svelte 5 runes; the
extension's page and background scripts are plain ES modules; wasm
(`rust/pkg-web`) unchanged.
**Primary Dependencies**: existing. No new runtime dependency is expected.
**Storage**: the extension's own origin — IndexedDB KV + localStorage, the same
shapes the hosted site uses, deliberately NOT shared with it (D32).
**Testing**: vitest (executor arms, transport arms, protocol vectors) +
Playwright driving an unpacked extension under `--headless=new` with a local
test dApp, the 026 stub chain/relay and the parallel space's fixed keyset (D39).
**Target Platform**: Chrome / Chromium, Manifest V3. The hosted Cloudflare build
is untouched.
**Constraints**: extension pages must declare `wasm-unsafe-eval` or the core
cannot load (D33); extension pages may contain NO inline script and hashes are
not an escape hatch (D35); the action popup cannot host a signing ceremony
(D34); the hosted site's budgets must be byte-identical afterwards; zero
business rules in extension code; corpus changes only through the 5-step
process.
**Scale/Scope**: ~1,800 lines of ported page-side scripts (inpage 355, content
820, background 348, protocol 246), ~500 lines of transport, three machine loops
(~1,100 lines of ported executor/session/resident), one shell build target, the
022 connection surfaces gaining callbacks, ~5 new e2e suites.

## Constitution Check

| Rule | Status |
| --- | --- |
| One implementation / tokens only / i18n via corpus / generated regenerated / fixtures canon / components pure / core decides | ✅ the extension is a second BUILD of one application, not a second wallet; the 022 surfaces gain callbacks and stay pure |
| One PR one problem (§2) | ✅ seven phases, one commit + gate each |
| High-risk (§3) | ⚠️ **High**: a new attack surface (every page can talk to the extension) and a new signing doorway. Mitigations: the permission decisions are the core's 1,341-line machine, not extension code; the ported page side already carries its origin discipline and its MAIN-world guard; every answer is bound to the tab and origin that asked; the signing path is 026's, unchanged, with the never-unlimited guard intact; the identity question was settled by measurement before any code (D31) and gets a real-device pass before close (Phase 7). Rollback per phase. |

## Project Structure

### Documentation (this feature)

```text
specs/027-web-extension-provider/
├── spec.md · plan.md · research.md (D31–D40)
├── data-model.md · contracts/ · quickstart.md
├── checklists/requirements.md · tasks.md · results.md (ledger, per phase)
```

### Source Code

```text
app-web/vela-wallet/
  src/lib/dapp/core/{dperm,dsess,ext-cache}-*.ts   # the three machine loops
  src/lib/dapp/live.ts                             # views → the 022 models
  src/lib/dapp/transport.ts                        # the first REAL 026 transport
  src/lib/explore/ui/ConnectionPanel.svelte        # + callbacks (drawn in 022)
  src/routes/extension/                            # the shell + request window
  extension/                                       # the MV3 artifact
    manifest.json · inpage.js · content.js · background.js · lib/protocol.js
    build.mjs                                      # app build + page scripts → dist/
  e2e/extension-*.e2e.ts · e2e/testdapp/
```

**Structure Decision**: everything that decides lives in `src/lib/dapp/` beside
the other domains, exactly as 024–026 placed theirs. The page-side scripts live
in `app-web/vela-wallet/extension/` — INSIDE the app, not beside
`packages/safari-extension` — for three reasons: the extension is a build TARGET
of this app (it packages its client bundle, D35) and `build:extension` is its
script; one package manager, one lint config, one gate suite; and unlike the
Safari extension, which is a genuinely separate artifact talking to a native app,
this one has no life apart from app-web. They sit outside `src/` because they are
not SvelteKit modules and must never be bundled by it.

## Phases

| # | Phase | Gate |
| --- | --- | --- |
| 1 | Setup — baselines (hosted-site budgets, corpus pins, port-provenance list @ 52ad8fa9), green tree, the `extension/` home, literal-audit list | results.md |
| 2 | The package and the shell — manifest (`wasm-unsafe-eval`, pinned id, host permission for `getvela.app`), the inline-script-free shell build, the core loading in a `chrome-extension://` page, and a REAL login with a passkey proving the same derived address | gates + an e2e that loads the unpacked extension and signs in |
| 3 | Injection and transport — port inpage/content/background/protocol with provenance; the wallet-side transport registered on 026's seam; the request window (D34) | gates + a test dApp seeing the provider and reaching the wallet |
| 4 | Connect (US1) — `dapp_permissions` + `dapp_session` + `ext_cache` wired; consent from the 022 ConnectionPanel; `eth_requestAccounts` end to end | gates + connect e2e (SC-301/302) |
| 5 | Sign (US2) — requests routed into 026's sheet; transaction, message and typed data; the answer back, exactly once | gates + signing e2e (SC-303/304) |
| 6 | Connections and resilience (US4, US5) — listing, revocation, account/chain events; the answer-or-reject guarantee under worker teardown | gates + revoke and resilience e2e (SC-305/307) |
| 7 | Real-device pass, budgets, closeout — Touch ID confirmation of D31, hosted-site budgets byte-identical, extension package size recorded, SC verdicts, 028 handoff | full suite + ledger |

## Complexity Tracking

| Violation | Why | Simpler alternative rejected |
| --- | --- | --- |
| A second build target for one application | extension pages forbid inline script, and 15 prerendered locale documents buy the extension nothing (D35) | packaging the hosted build as-is — measured, and it does not load |
| A `host_permissions` entry for `https://getvela.app/*` | it is the only thing that lets the extension sign under the hosted site's relying party, which is what makes it the SAME wallet (D31) | an iframe of the hosted site (needs user activation per ceremony, and buys a storage-sync problem); a hand-off to an https tab (a tab switch per signature) |
| A dedicated request window rather than the action popup | the action popup closes when the passkey prompt takes focus (D34) | none — the popup path cannot complete a signature |
| Extension storage separate from the hosted site's (D32) | separate origins; no supported mechanism joins them | an iframe storage bridge — a synchronisation problem in exchange for what `login` already does for free |
