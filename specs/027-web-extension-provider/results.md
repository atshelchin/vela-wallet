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

---

## Phase 5 — signing (T340–T344)

**What shipped**: a dApp asks for a signature and gets **026's sheet** — the
same four machines, the same clear-signing reading, the same never-unlimited
guard, the same fee policy. 027 added the transport that delivered the request
and the window it renders in, and nothing else.

A `personal_sign` from a connected site now opens a window showing
`localhost:8813` · Ethereum · **Sign message** · **"Hello, Vela"** (decoded, not
the hex the dApp sent) · "No network fee — off-chain signature" · *Signing
account: Parallel One* · slide to confirm.

- **One signing path** (T340). `sign_request` is app-resident precisely because
  a request can arrive while any screen is showing, and its transport registry
  already says a response goes to the transport that OWNS the request. The
  window registers itself, dispatches `request_arrived` carrying the core's
  `granted_address` — invariant ⑨: the signature is pinned to the GRANT's
  address, never to whichever account happens to be active — and the machine
  does the rest.
- **The sheet wiring moved into `<SigningHost>`.** 026 wired it into the wallet
  route because that was the only place a request could reach a person. Rather
  than write a second copy for the request window, the wiring became a component
  both mount. A second copy of the most dangerous screen in the product is not a
  refactor to postpone.
- **An ungranted origin cannot ask at all**: the core refuses with 4100 before
  any sheet exists. Asserted, because "the sheet is the only signing path" is
  only true if there is no path AROUND it either.

### One finding, and it was on screen

The first real request through the sheet read:

> Slide to confirm · **Slide to confirm · {{action}}**

`live.ts` fell back to `slideConfirmAction` — which is a TEMPLATE,
`'Slide to confirm · {{action}}'` — where the drawn control wanted a phrase, and
then rendered `hint · action` around it. When the core names no intent, the
generic word (`Confirm`) is the honest one. Same class as 026's `{{bytes}}`, and
pinned the same way: a unit that asserts no `{{` reaches the model, plus an e2e
that asserts no `{{` reaches the window's text at all.

The window's own body also sat behind the sheet while it was open; it now steps
aside.

### Two test-harness findings worth keeping

- **A settled request window closes on a short delay** (so the answer reaches
  the page first), and a test that fires its next request immediately can grab
  the CLOSING window and then wait forever for content it will never show.
  `noRequestWindow()` is now the wait, and both suites use it.
- **A floating `page.evaluate` that never settles** — the dApp is still waiting
  when the context closes — is reported as a failure of the test whose
  assertions all passed. Swallowed explicitly, with the reason.

**Recorded**: `eth_sendTransaction` reaches the same path and the same sheet,
but a transaction that goes out needs the relay and a funded fixture Safe, so
its end-to-end proof rides with Phase 7's device pass rather than a hermetic
e2e; typed data is routed and rendered by the same ladder as a message but has
no e2e of its own yet; reads and chain switching remain classified and unrouted.

**Gates**: check **1352**/0 · lint clean · unit **759** · build ×15 +
`build:extension` · e2e **133/133** (chromium + firefox + webkit) · wasm
byte-identical · corpus delta zero · extension package 35 MB.

---

## Phase 6 — connections, revocation, and two bugs only a real install could find (T350–T354)

**What shipped**: a connected site is listed where 023 drew the row for it, it
can be cut off, and cutting it off means something — the site's next request is
a first request again. Plus the durability half of the same promise: a request
is written down the moment it arrives and gone the moment it is answered.

- **The list** (T350) fills the drawn Settings → Advanced → Device storage →
  **Connections** group with one row per granted origin — host, the account it
  holds, and its own "Disconnect". 023 drew that group with a single fixture row
  ("Connected dApps · 4 sites" + "Disconnect all"); a grant is a standing
  permission, so a person has to see WHICH sites hold one. No new screen: the
  drawn rows, filled with real data, the 024–026 sibling-builder pattern.
  `SettingsHome` gained the `onstorageclear` callback the drawn `StorageGroup`
  had been waiting for since 023.
- **The singular label.** A per-site row first read "Disconnect **all**" —
  the group's own words on a row that cuts off one site. `connect.browser.disconnect`
  already exists in the corpus, so the manifest gained the field and the row
  says "Disconnect". A label that gets tapped by someone who meant something
  else is not a copy nit.
- **Revocation asks no machine.** What a grant MEANS is `dapp_permissions`';
  revoking is the ABSENCE of one, and the core rules on the next request exactly
  as it rules on a first.
- **The stale sweep** (T351): a record outlives the worker on purpose, but it
  cannot outlive the tab that asked. On a cold start every record from before is
  unanswerable — the page's `sendResponse` died with the previous worker and
  content.js has already settled that page on its deadline — so they are dropped
  rather than left for a window to open on.

### The two bugs the founder found by installing it

Both were invisible to every gate in this feature, and both are worth more than
the code that fixed them.

1. **`Cannot load extension with file or directory name _app.`** Chrome reserves
   every top-level name beginning with `_`; SvelteKit's client assets live in
   `_app/`. Fixed with `kit.appDir: 'app'` for the extension target only — the
   hosted site keeps `_app` and its budgets cannot move. **Playwright's
   `--load-extension` tolerates what `chrome://extensions` refuses**, so the
   whole automated suite was green while a hand install was impossible.
   `package.test.ts` now reads the BUILT package and asserts no reserved
   top-level name, because this is an "it cannot be installed" failure.
2. **The passkey dialog said `chrome-extension://bjbdmn…` instead of
   `getvela.app`.** `relyingPartyId()` reads `window.location.hostname`, which
   under an extension origin is the extension id. The manifest has held the
   `https://getvela.app/*` host permission since Phase 2 — the entire point of
   research D31 — and the code never used it. One line:
   `if (isPackagedApp()) return RELYING_PARTY_NATIVE`. The same function also
   feeds the public-key index's rpId, so both doorways were wrong and both are
   fixed by it.

   **Why no gate caught it, which is the part worth keeping**: this failure
   never errors. It mints a perfectly valid passkey for a relying party nothing
   else shares, and since the address is derived from the KEYS, the person lands
   in a different, empty wallet. And `extension-boot.e2e.ts` — the suite written
   precisely to prove "the SAME address" — derives from the parallel space's
   FIXTURE public keys, whose signer takes its rpId from the same function: it
   is self-consistent whatever that function returns. **An address test cannot
   catch an rpId bug**, because rpId does not enter address derivation; it
   enters the signature's `rpIdHash`. The unit test now pins the branches
   directly.

   Carried, reported and not fixed: `eip681.ts::payLinkBase()` builds a payment
   link from `location.origin`, which inside the extension is a
   `chrome-extension://…/pay` URL nobody else can open. Cosmetic, not
   money-losing; it wants the hosted `/pay` base.

**One more harness finding**: the connections e2e hung until it was given a
phone viewport. A default 1280-wide context renders the DESKTOP settings layout,
where "Advanced" is not a row to tap — so the test was driving a surface no
extension user will ever see, since the extension's own windows are phone-width.

**Recorded**: the per-site `ConnectionPanel` 022 drew (account, network, the
"a connection is not permission to move money" sentence) still has no list route
to hang off on web; the storage row is what ships. Account- and chain-change
notifications to connected sites are not wired — no live document to push into
until a request opens one.

**Gates**: check **1354**/0 · lint clean · unit **765** · build ×15 +
`build:extension` · e2e **135/135** (chromium + firefox + webkit) · wasm
byte-identical · corpus delta zero.

---

## Phase 7 — budgets, the channel's own promises, and an honest close (T360–T364)

### The security pass (T362)

The channel contract makes seven promises. Five were already asserted by the
suites that needed them; `extension-security.e2e.ts` covers the two that were
true only because the code said so — and they are the two a page can actually
attack:

- **A page cannot rename itself.** It posts a request onto the real channel
  claiming to be `https://app.uniswap.org`; the window names `localhost:8815`.
  `sender.origin` is added on the far side of the message boundary by the
  browser, and the page's own claim never reaches a grant.
- **A page cannot get one request answered twice.** The same id again opens no
  second window. An operation answered twice is an operation a dApp may act on
  twice.
- **A page cannot use the wallet as an open RPC relay.** `eth_signTransaction`
  is refused — it is not caught by the signing predicate, which is exactly why
  the router is an allowlist rather than a denylist.

### Budgets (T361)

The hosted site is untouched by the extension's existence: `git diff main --
rust/` is empty, the artifact is **3,630,664 B**, Welcome fetches no wasm, the
deploy bundle carries none, one artifact serves every route. `budgets.e2e.ts`
gained the 027-shaped assertion: **the dApp channel's vocabulary must not reach
Welcome** — the layer entered the graph when three routes started using it, and
the page a stranger meets has no business carrying a line of it.

The extension package: **35 MB**, 120 pages. Its composition is worth writing
down, because the obvious next saving is not the code:

| | |
| --- | --- |
| fonts (`.woff` + `.woff2`) | **17.0 MB** — 632 files, every subset of every family |
| javascript | 7.6 MB (318 files) |
| the core | 3.6 MB |
| route data (`__data.json`) | 3.5 MB |
| pages | 0.8 MB |
| the page-side scripts | inpage **39 KB** · background 10 KB · content 4 KB |

Half the package is fonts nobody asked for on any single visit. Recorded as the
first thing to look at, not fixed here.

### SC-304 is NOT met, and this is what is known

`e2e/extension-signing.e2e.ts` carries a `test.fixme` that states it. Measured
while writing it:

- the slide control DOES commit — its fill goes 0% → 100%, so `onconfirm` fires
  and `approve_tapped` reaches the resident;
- the confirm gate is open (`aria-disabled="false"` — the core's own
  `confirm_gate_open` ANDed with the guard and the fee);
- and then nothing. No error on the sheet, no console output, no state change,
  and the decisive one: **`navigator.credentials.get` is never called**, so the
  passkey ceremony does not even start. The chain stops between `approve_tapped`
  and `sign_and_submit`.

It is very likely **not a 027 regression**. 026 shipped `signing-scenarios` with
a rejection test and an unlimited-approval test and never drove an approve to
completion; its task list said "approve submits through the spine" and no
assertion holds it to that. This is the first time anything asked the web
signing path to finish, and it did not. Un-fixme the test when it does; do not
weaken it.

### T360 — the device pass, which is the founder's

Two of this feature's most important bugs were found by installing it, and
neither was reachable from any harness. The remaining confirmations need a real
platform authenticator and are listed in the quickstart; the short version:

1. Create a wallet on **https://getvela.app**, note the address.
2. `pnpm build:extension`, load `extension/dist` unpacked, open the wallet, sign
   in. **The passkey dialog must say `getvela.app`, not `chrome-extension://…`**,
   and the address must be the same one. That closes D31's carried caveat and
   SC-306's real half.
3. Connect a real dApp and sign something. That is what would close SC-304 —
   and if it fails the same way, the finding above is confirmed on hardware too.

---

## Success-criteria verdicts

| SC | Verdict |
| --- | --- |
| **SC-301** discovery + connect returns the derived address, after a visible consent step | ✅ `extension-connect`: EIP-6963 announces Vela with its real identity and icon; consent names the real origin; the grant returns the core's own derivation |
| **SC-302** a dApp that only knows one wallet can connect | ✅ a fixture page that never listens for 6963 and gates on `isMetaMask` completes the same connect |
| **SC-303** a transaction request opens 026's sheet; dismissal returns the standard refusal exactly once | ⚠️ **partial**. The sheet is proven on the real machines for `personal_sign` — decoded content, real origin, signing account, no fee for an off-chain signature, and no template placeholder — and dismissal is proven. A transaction that actually SUBMITS is blocked by the same gap as SC-304 |
| **SC-304** message and typed-data requests return verifying signatures | ❌ **not met** — see above. The test exists and is `fixme`d with everything measured |
| **SC-305** a connected site is listed with its grant and can be revoked; its next request is first-time | ✅ `extension-connections`: listed by host with its account in the drawn storage group, revoked from its own row, and the next `eth_accounts` is `[]` again |
| **SC-306** one passkey, the SAME address in both doorways | ⚠️ **hermetically ✅, on hardware pending**. The extension derives `0x88cCA0…266894` — the address the hosted site derives from the same keys. The relying-party bug that would have broken this for a REAL passkey was found by the founder and fixed (rpId is now `getvela.app` under an extension origin); confirming it needs a real authenticator (T360) |
| **SC-307** no request is left unanswered | ✅ a window closed without deciding settles with the CORE's code — 4900, never 4001 — a record is written on arrival and gone once answered, and stale records are swept on a cold worker start |
| **SC-308** hosted budgets unchanged; extension size recorded | ✅ artifact byte-identical, zero-wasm Welcome, worker purity, one artifact, dApp channel absent from Welcome; package 35 MB, composition recorded |
| **SC-309** green in CI on chromium; every live word from the corpus | ✅ e2e **138 passed / 1 skipped** on three engines; **corpus delta zero** — every word the request window and the connections rows show already existed |

## Deviations (consolidated)

1. **`dapp_session` is not wired** (D43). It is the machine for a live transport
   session; WalletPair and the in-app browser are both excluded from this
   feature, so wiring it would have produced a machine connected to nothing.
2. **Two rules exist twice**: `resolve_granted` and the closed-window settlement
   have twins in `extension/lib/protocol.js`, because a service worker cannot
   load a 3.6 MB core to answer `eth_accounts`. `instant.test.ts` drives the real
   core over the same matrix and demands identical answers.
3. **The extension packages the site's prerendered pages** rather than a
   client-rendered shell (D35, corrected in Phase 2): hash routing, which
   SvelteKit documents for this exact case, rejects the server loads this app's
   build-time i18n lives in.
4. **A route path is not a file** (D42): full navigations and the address bar are
   translated to `.html` under the packaged app, as the identity function on the
   hosted site.
5. **The per-site `ConnectionPanel` 022 drew has no list route on web**; the
   drawn settings storage rows are what ships.
6. **Reads and chain switching are classified but not routed** — `eth_call` and
   `wallet_switchEthereumChain` answer "Vela cannot answer that yet" rather than
   an invented default.
7. **Account- and chain-change events are not pushed to connected sites**: there
   is no live document to push into until a request opens one.
8. **`payLinkBase()` builds a `chrome-extension://…/pay` link inside the
   extension** — cosmetic, reported, unfixed; it wants the hosted `/pay` base.
9. **D34 (no action popup) is reasoned, not measured** — a virtual authenticator
   shows no UI, so the focus loss it avoids cannot be reproduced in the harness.

## Handoff

### The next thing anyone should do

**Find out why an approve does not complete.** It blocks SC-303's second half and
SC-304 entirely, it is the difference between "a dApp can talk to Vela" and "a
dApp can use Vela", and the evidence is already narrowed to one hop:
`approve_tapped` arrives, the gate is open, `sign_and_submit` never reaches
`navigator.credentials.get`.

### To 028

- **Firefox and Edge**: the manifest is close to portable. Chrome-specific today:
  the `key`-pinned id and `minimum_chrome_version`.
- **The Chrome Web Store listing**, with the two permissions that need
  explaining: `*://*/*` (injection) and `https://getvela.app/*` — the second one
  is what makes the extension the same wallet, and the listing should say so.
- **Fonts**: half the package. Subset them.
- **Cross-doorway sync** of contacts, history and settings (D32): storage is
  per-origin and the account is recovered from the passkey, so identity is
  shared and everything else is not.
- **`dapp_session`** waits for whichever spec brings a real transport session.

### The rule this feature earned

**Install it by hand before believing any of it.** Two of the three most
serious bugs here — a package Chrome refuses to load, and a passkey minted for
the wrong relying party — were invisible to a suite that runs the real extension
in a real browser on every commit. The second one could not be caught by the
test written specifically to catch it, because a fixture signer reading the same
function is self-consistent whatever that function returns.

**Gates (T364)**: `pnpm check` **1354 / 0** · `pnpm lint` clean · `pnpm test:unit`
**765** · `pnpm build` ×15 + `pnpm build:extension` · `pnpm test:e2e` **138
passed / 1 skipped** (chromium + firefox + webkit) · `gen-core-types --check`
current in every mirror · wasm byte-identical · corpus delta zero.
