# Delivery Report — 027 Web Extension Provider

**Branch**: `027-web-extension-provider` · Started 2026-09-04 · Base: `main` @
52ad8fa9 (PR #184 merged; not stacked).

---

## Baselines (T301, T302) — recorded @ 52ad8fa9

- **Core artifact**: `static/vela_core_bg.4603c8421603.wasm` = **3,630,664 B**.
  Must close byte-identical — the three machines this feature wires are already
  aboard, so wiring them costs zero bytes (SC-308).
- **Corpus pins**: 1536 leaf + 84 branch paths (unchanged since 024). The
  `connect` namespace already carries **101 leaves** and `explore` **54**, so
  most of the connection copy exists; unlike 024–026 this feature does NOT
  assume a zero corpus delta.
- **Green tree @ 52ad8fa9**: `pnpm check` **1327 files / 0 errors** · `pnpm lint`
  clean · `pnpm test:unit` **731** · `pnpm build` ×15 locales · `pnpm test:e2e`
  **121/121** on chromium + firefox + webkit, 16 suites.
- **Already-green Rust** for the three machines this feature wires:
  `dapp_permissions` **43 tests**, `dapp_session` **66**, `ext_cache` **29** —
  138 tests that own every decision the extension will ask for.

### Port-provenance surface @ 52ad8fa9

**The page side** — `packages/safari-extension/src/`, already MV3 and already
carrying the discovery, the compatibility flag and the MAIN-world guard:

| File | Lines | Ported? |
| --- | --- | --- |
| `inpage.js` | 355 | **whole** — the provider, EIP-6963 announcement, legacy shim |
| `content.js` | 820 | **in part** — the page bridge yes; the in-page consent SHEET no (D34: Chrome opens a dedicated window, and Safari only draws a sheet because iOS needs a synchronous gesture to launch a native app — a constraint Chrome does not have) |
| `background.js` | 348 | **in part** — routing yes; the `nativeMessaging` hand-off to the iOS app has no counterpart here |
| `lib/protocol.js` | 246 | **whole** |
| `manifest.json` | 36 | **rewritten** — same shape, four measured constraints added (D31/D33) |
| `popup.js` · `lib/theme.js` · `lib/i18n.js` | 233 · 69 · 752 | **not ported** — Safari's popup is a hand-written mini-UI; here the popup IS the app |

**The wallet side** — Expo `src/services/`: `extension-bridge-transport.ts`
**265** (the transport shape), `dapp-transport.ts` **334** (its interface),
`dapp-permissions.ts` **78**, `dapp-account-reconcile.ts` **23**.
`dapp-history.ts` was already ported in 026.

**The machines** — Expo `src/services/wallet-state-core/`:
`dperm-{types 77, connect 183, connect-types 79, popup 59}` ·
`dsess-{types 115, executor 458, session 41, resident 331}` ·
`ext-cache-{types 22, executor 85, session 36}` + `session-ext-cache-bridge 36`
= **1,522 lines**. The Rust behind them (3,992 lines) is already in the shipped
artifact.

**Total port surface**: ~3,500 lines actually ported, against 3,992 lines of
Rust that already decide everything.

### The `extension/` home (T303)

`app-web/vela-wallet/extension/` — inside the app, not beside
`packages/safari-extension`. The reasoning is in its README and in the plan's
structure decision: the extension is a build TARGET of this app (it packages its
client bundle), it shares one package manager, one lint config and one gate
suite, and it has no life apart from app-web — whereas the Safari extension is a
genuinely separate artifact talking to a native app. The scripts sit outside
`src/` because they are not SvelteKit modules and `inpage.js` in particular runs
in the page's MAIN world, where a bundler's module wrapper would be a bug.
`extension/dist` is gitignored: it is build output.

The README records the four measured constraints (D31/D33/D34/D35) at the place
where breaking them is silent, because each failure mode is invisible: no
`'wasm-unsafe-eval'` and the core simply never compiles; an inline script and
the page runs dead; a missing `https://getvela.app/*` host permission and the
extension quietly becomes a DIFFERENT, empty wallet.

**Literal audit** — two honest notes rather than a fake gate:
- `src/lib/dapp` does not exist yet; its line joins `tokens.test.ts` in Phase 3,
  when `dapp/transport.ts` creates the directory. (Same handling as 026's T203,
  which added `lib/dev` in Phase 3 and `signing/core` in Phase 5.)
- The audit collects `.svelte`, `.css` and `.ts`. The extension's page scripts
  are plain `.js` and therefore fall outside it. That is acceptable only because
  the Chrome port drops the in-page sheet — the one part of `content.js` that
  draws anything (it carries the single hex literal in the whole Safari page
  side). If any extension script ever grows UI, this must be revisited rather
  than discovered.

---

## Phase 2 — the package and the shell (T310–T315)

**What shipped**: the wallet runs inside a Chrome extension, and it is the same
wallet. `pnpm build:extension` produces a loadable MV3 package; loading it and
opening the wallet shows **`Parallel Multi · 0x88cCA0…266894`** — the golden
multi-key Safe, derived by the core inside a `chrome-extension://` origin, at
exactly the address the hosted site derives from the same keys and
`core/golden-addresses.test.ts` pins.

- **The manifest** (T310) carries the four constraints research measured: the
  pinned id (a `key`, so the relying party and the tests address ONE origin),
  `'wasm-unsafe-eval'` (without it the core does not compile at all),
  `https://getvela.app/*` (without it the passkey ceremony cannot claim the
  hosted site's relying party, and the extension silently becomes a different,
  empty wallet), and **no action popup** — see the revision below.
- **The build** (T311): `VELA_TARGET=extension` swaps in the static adapter and
  nothing else. `extension/build.mjs` prunes what the extension has no door to
  (the fixture galleries — 28.4 MB), externalises **210 inline scripts across
  105 pages**, copies the extension's own files alongside, and prints the
  package size, which is a budget: **34 MB**.
- **Units** (T312) read the BUILT package rather than the source: no inline
  script anywhere, the CSP declares wasm, the host permission is present, the id
  is pinned, and no action popup is declared. When the package is missing they
  fail rather than skipping — a budget you skipped is not a budget you met.
- **e2e** (T314, `extension-boot.e2e.ts`) loads the unpacked extension under
  `--headless=new`, recomputes the extension id from the manifest key rather
  than hardcoding it, and asserts the golden address end to end. It is
  hermetic: the context aborts every request that is not to the extension's own
  origin.

### Four things Phase 2 changed about the plan, each because something was measured

1. **D34 revised, and its evidence status corrected.** The manifest declares NO
   action popup at all. The plan had the popup as "the wallet's own doorway" and
   the dedicated window only for dApp requests — but signing IN is a passkey
   ceremony too, so the popup cannot host the wallet's front door either. The
   toolbar button opens a tab. Separately, D34 is now marked in research.md as
   **reasoned, not measured**, unlike D31/D33/D35/D39: a virtual authenticator
   resolves without showing UI, so the focus loss it avoids cannot be reproduced
   in the harness that proved the others. T360 confirms it on real hardware.
2. **D35's replacement was itself replaced.** "One client-rendered shell" turned
   out to be unbuildable: `router.type: 'hash'` — which SvelteKit documents for
   exactly this case — rejects `+layout.server.ts` as well as `+server.ts`, and
   this app resolves all 15 locales inside server loads at prerender time. Hash
   routing would have traded the corpus for a router. The extension therefore
   packages the SAME prerendered pages the site serves, and `build.mjs`
   externalises their inline scripts instead. The falsification is written down.
3. **The app is packaged at the extension ROOT, not under a folder** (found by
   the wallet page dying with `ERR_FILE_NOT_FOUND`): `WASM_URL` is absolute
   (`/vela_core_bg.<hash>.wasm`), so a subdirectory would have needed a
   base-aware rewrite that the hosted build would then have to carry too.
4. **D42 — a route path is not a file** (new). An extension URL resolves no
   directory index and no extensionless twin, and a twin cannot even be written
   where SvelteKit has already made a directory for the route's data. This was
   not theoretical: the parallel screen's "Enter" does a deliberate full
   navigation so every resident store re-hydrates, and inside the extension it
   landed on `chrome-error://chromewebdata/`. `$lib/extension/page-url.ts` now
   translates at exactly the two moments a document is really fetched — a full
   navigation, and the address bar after a client one. Both are the identity
   function on the hosted site, decided by the page's own origin rather than a
   build flag, so one bundle is correct in both places.

**One finding from the matrix, the same shape as 026's**: adding the extension
suite killed the preview worker mid-run and took 30 unrelated tests with it. The
preview is one single-threaded `workerd`; six browser workers plus a seventh
browser holding a 34 MB unpacked extension is more than it survives. Measured: 6
workers → dead, 3 workers → 123/123, twelve seconds slower. `workers: 3` is now
pinned in the config with the reason, so this is not diagnosed a third time.

**Recorded**: the toolbar button opens English until the person's stored locale
is read (the manifest cannot express "their locale"); the background worker
does nothing else yet. Both belong to Phase 3, which gives that file its real
job.

**Gates**: check **1331**/0 · lint clean · unit **738** · build ×15 +
`build:extension` · e2e **123/123** (chromium + firefox + webkit) · wasm
byte-identical (3,630,664 B) · extension package 34 MB.

---

## Phase 3 — injection and transport (T320–T325)

**What shipped**: a dApp in any tab now finds Vela, and Vela can answer it. The
whole path is real — the MAIN-world provider, the isolated-world bridge, the
service worker, and a window this extension owns — and Phase 3 lands one
complete answer through it: **a refusal**.

That is the half worth landing first. A wallet that cannot say no is not safe to
install, and the failure mode of an extension wallet is silence: a dApp promise
that never settles leaves a person unable to tell whether their money moved.
Both ways of saying no are asserted — the button, and simply closing the window.

- **The page side** (T320), ported with provenance from
  `packages/safari-extension/src/`:
  - `inpage.js` **whole** — EIP-6963 announces `Vela Wallet` / `app.getvela`
    with a data-URI icon (a remote one would leak every dApp visit to our host),
    frozen info, announced provider identical to `window.ethereum`; the legacy
    singleton carries `isMetaMask` for the many dApps that gate on it and never
    implement 6963, while 6963 keeps stating the truth. Chrome's MAIN world is
    not subject to the PAGE's CSP, so Safari's second injection path is gone —
    a strict site can no longer refuse the provider.
  - `content.js` **in part** — 96 lines out of 820. What did not come across is
    an in-page consent sheet drawn in a shadow root: Safari needs the decision
    inside the page because it must launch a native app within a synchronous
    gesture. Here the decision happens in a window the extension owns, which is
    a better place for it — the site asking for the signature cannot style,
    cover or scroll it.
  - `background.js` **rewritten** — Safari's held policy (per-origin grants, a
    read proxy, a native round-trip). This one holds none. Every decision
    belongs to the core's machines, which run in the wallet.
  - `lib/protocol.js` **whole**, minus the App Group file and the
    Universal-Link attestation dance, which exist only because Safari hands
    signing to a native app.
- **The transport** (T321): `$lib/dapp/transport.ts`, the FIRST real occupant of
  026's `sign_request` registry. Ported from Expo's
  `extension-bridge-transport.ts`, but shorter and more honest — it speaks to
  its own service worker rather than across a native bridge, so there is no
  second process holding a copy of the answer.
- **The request window** (T322): a new `[locale]/request` route, prerendered ×15
  like every other, worded entirely from the EXISTING corpus — the connect
  copy written for the in-app browser (spec 022) says the right thing wherever
  a request arrives from, which is what one corpus is for. **Corpus delta:
  zero.**
- **Vectors** (T323) import the REAL page-side module rather than a copy: a
  constant that disagrees with the shipped one is exactly the bug they exist to
  prevent.

### Two things the phase had to decide, and one it refused to

1. **The page scripts are BUNDLED, not copied.** MV3 content scripts are
   classic scripts — `import` is a syntax error there, and only the service
   worker may be a module. They are written as modules anyway, because
   `lib/protocol.js` has to be one file all three sides agree on, and a shared
   constant copied three times is a constant that will disagree three ways.
   `esbuild` now runs inside `build:extension`.
2. **`esbuild` was declared as a dependency of this app**, not left to resolve.
   It was resolving from the repo ROOT's `node_modules` — the same hidden-
   dependency shape 026 found with `xlsx`, caught this time before it shipped.
   That is twice; the rule is now explicit: **a new build-time import gets
   declared in `app-web/vela-wallet/package.json` the moment it is used.**
3. **What the phase refused to invent**: `eth_chainId` and `eth_accounts` from
   an ungranted origin answer `4100`, and open no window. The obvious
   convenience — return `0x1` and `[]` — would have been a business rule living
   in a service worker, which is exactly what this program does not do.
   `ext_cache` and `dapp_permissions` answer them in Phase 4. The warm-up calls
   `inpage.js` makes on every page load already swallow their own rejections, so
   nothing on a dApp's screen is worse for the wait.

**Recorded**: reads (`eth_call` and friends) are classified but not yet routed;
the toolbar button and the request window both open in the browser's UI language
rather than the person's stored choice (the manifest cannot express "their
locale", and the stored one is not readable until the wallet boots).

**Gates**: check **1341**/0 · lint clean · unit **751** · build ×15 +
`build:extension` · e2e **127/127** (chromium + firefox + webkit) · wasm
byte-identical · **corpus delta zero** · extension package 35 MB.

---

## Phase 4 — connecting (T330–T337) 🎯 MVP

**What shipped**: a dApp asks, a person decides, and the site stays connected.
End to end on the real machines: the site asks → `dapp_permissions` rules →
the window shows who is asking → the core authors the grant, the audit row and
the answer → the next question is answered from what the core published, with
no window and no second decision.

Driven against a test dApp with the fixture wallet seeded through the parallel
space: `eth_accounts` before any grant is `[]` (a disconnected wallet, no
prompt — what EIP-1193 asks for); `eth_requestAccounts` opens a window headed
**"Connect to localhost:8812"**; Connect returns
`["0xD400866e00B055B20752a826CD5C89b811de130b"]` — the core's own derivation,
never a stored field; and the same question afterwards is answered instantly.

- **`dapp_permissions`** (T330), ported whole from the Expo web-popup entry's
  four modules. The core owns every branch: `decide_popup_request` for the
  question, `consent_approved` for what an approval authors —
  `WriteGrant` + `SaveConnectionRecord` + `Respond` — and `browser_closed` for
  how a torn-down window settles. `dperm-connect.ts` came with its own
  fail-closed rule intact: if the core does not end up with a consent sheet open
  for exactly this origin, it authors nothing rather than mint a grant the
  machine never sanctioned.
- **The audit row is written**, not skipped. It is the reason that port exists
  in the Expo tree at all — a connection nobody can see is a connection nobody
  can revoke — and it lands through 026's own transaction writer, under its
  lock, beside the sends.
- **`ext_cache`** (T332) with one substitution: on Safari the snapshot is a file
  in an App Group, because the wallet and the extension are two processes; here
  they are the same extension, so it is a key in `chrome.storage.local`. The
  core still owns everything in it, including the chain id (its own constant, by
  invariant ⑤ — not a shell default). Two of its operations have no counterpart
  in Chrome and are ANSWERED rather than skipped: the Universal-Link attestation
  is "never attested", which is simply true here, and an unanswered effect
  stalls the loop.
- **Not ported**: `dapp-permissions.ts`'s `resolveGranted` / `shouldDropGrant`
  (TypeScript twins of rules the core owns — the same call 026 made about
  `clear-signing`'s twin), and `dapp-account-reconcile.ts`, whose web variant is
  deliberately empty because `sign_request` does the reconcile.

### One machine dropped, with its reasons written down (D43)

The spec, the plan and the tasks all named three machines. **`dapp_session` is
not one of them.** It is the machine for a live TRANSPORT session — its
executor's own documentation is about the mutual exclusion between a WalletPair
pairing and a browser document — and both of its reasons to exist are excluded
from this feature: WalletPair by founder decision, the in-app browser by spec
022. Wiring it would have produced a machine connected to nothing, kept alive by
tests written to justify it. The Expo tree settles the question by example: its
web popup, which is the same shape as this window, uses `dapp_permissions`
alone.

### The fund-safety rule Phase 3 got wrong

Phase 3's service worker answered **4001** when a request window closed. The
core disagrees, and its reason is the whole point of `SettleForwarded` carrying
a code at all: a window torn down with an answer still owed settles **4900
unknown-pending**, because *a dApp reads 4001 as "the user said no, nothing
happened" and re-sends — double-spending an operation that may already be at the
bundler.* An explicit Cancel stays 4001; that one really is "nothing happened".

The window now settles itself with the core's own answer on teardown, and the
worker keeps a backstop for a window that died before it could. Both e2e were
corrected, and the assertion is written as `not.toBe(4001)` first, because that
is the failure that costs money.

### Two twins, and how they are held to the core

The service worker cannot run the core — a 3.6 MB binary to answer
`eth_accounts` on every page load is not a trade anyone would make — so two of
`dapp_permissions`' rules exist a second time in `extension/lib/protocol.js`:
what a granted origin may see, and how a closed window settles.
`instant.test.ts` drives the REAL core over the same matrix and demands
identical answers, including the load-bearing case: a cold read, before the
wallet has published anything, must NOT be read as "the account is gone" — that
would log the person out of every open dApp on every browser start.

**Recorded**: a signing request from a granted origin reaches the window's
`forward_to_signing` branch and waits there — Phase 5 mounts 026's sheet on it;
reads and chain switching are classified but not yet routed; the connection
LIST and revocation are Phase 6's, though the rows they will read are being
written now.

**Gates**: check **1351**/0 · lint clean · unit **758** · build ×15 +
`build:extension` · e2e **130/130** (chromium + firefox + webkit) · wasm
byte-identical · corpus delta zero · extension package 35 MB.
