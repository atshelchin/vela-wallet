# Research — 027 Web Extension Provider

Decisions D31–D40, continuing the program's sequence (024 D1–D8 · 025 D9–D14 ·
026 D15–D30). The three questions the spec refused to guess at are D31, D32 and
D35; all three were settled by running the browser, not by reading about it.

**How the evidence was produced**: an unpacked MV3 extension with a pinned id
(a manifest `key`), driven by Playwright against Chromium, with a CDP virtual
authenticator standing in for a platform authenticator. Probe sources are kept
out of the repo (scratchpad); every result below is reproducible from the
recipe in each decision.

---

## D31 — The passkey keeps its relying party: the extension signs under `getvela.app`

**The question**: a wallet's address is derived from its keys (spec 019
invariant ②). An extension page's origin is `chrome-extension://<id>`, which has
no registrable domain. If the signing ceremony there is forced onto a different
relying party, the extension becomes a DIFFERENT wallet holding no money.

**What was measured** — `navigator.credentials.create` from an extension page,
varying only the manifest's `host_permissions`:

| `host_permissions` | `rp.id: "getvela.app"` | `rp.id: "example.com"` |
| --- | --- | --- |
| `*://*/*` | ✅ created | ✅ created |
| `https://getvela.app/*` | ✅ created | ❌ `SecurityError` |
| *(absent)* | ❌ `SecurityError` | ❌ `SecurityError` |

The gate is exact: an extension may claim a relying party it holds host
permission for, and no other. This is a browser-process check — the refusal
arrives before any authenticator is consulted, which is what makes it
trustworthy evidence rather than an artefact of the virtual authenticator.

**The cross-doorway test** — a passkey created by a PAGE at one origin, then
asked for from the extension page under the same relying party:

- the extension's assertion returned **the same `rawId`** the page had created,
  both with an explicit allow-list and with an empty one (discoverable);
- `authenticatorData`'s `rpIdHash` equalled `sha256(rpId)` — for `getvela.app`,
  `a69533717b230610f14ea657c0bd8231dd6fc7b7108f1215a874fbb1d14df349`, verified
  independently — **the calling origin does not enter it**;
- flags were `0x05` (UP | UV), so the UV bit `validate_client_data` requires is
  set;
- the virtual authenticator's sign counter advanced 1 → 3 across the two
  assertions, so these were real ceremonies, not cached objects.

**The one thing that DOES differ** is `clientDataJSON.origin`, which reads
`chrome-extension://<id>` instead of `https://getvela.app`. That is harmless
here, and the reason is in our own verifier:
`vela-core/src/webauthn.rs::validate_client_data` checks exactly three things —
the field-order prefix `{"type":"webauthn.get","challenge":"`, a closing `}`,
and the UV flag. **It never inspects the origin.** The origin participates only
through `sha256(authenticatorData ‖ sha256(clientDataJSON))`, which the verifier
recomputes from the same bytes it was given. Chrome's extension-page
clientDataJSON was captured raw and checked against that prefix:
`matchesVelaGetPrefix: true`, `endsWithBrace: true`.

**Decision**: the extension performs the passkey ceremony directly, with
`rpId = getvela.app`, unlocked by a `host_permissions` entry for
`https://getvela.app/*`. No iframe of the hosted site, no hand-off to an https
tab, no second relying party. **One passkey, one address, two doorways.**

**Carried caveat**: measured with a CDP virtual authenticator on Chromium. The
rpId gate itself was proven real (it refuses with the wrong host permission),
which is the part that could have blocked the design; a pass on a real platform
authenticator (Touch ID) is the founder's confirmation, in the manner of 026's
live sweep. Recorded as a task, not assumed.

---

## D32 — Storage is not shared, and does not need to be

`chrome-extension://<id>` and `https://getvela.app` are separate origins, so
`localStorage` and IndexedDB do not cross between them: the extension cannot
read the hosted site's `vela.accounts`, its contacts or its transaction history.
No supported mechanism changes that, and the ones that pretend to (an iframe
bridge to the hosted site) buy a synchronisation problem in exchange.

It does not matter, because of D31. The account is not the storage — the account
is **derived from the passkey**, and `login.rs` already exists to do exactly
that: sign in with an existing passkey, look the key up, and rebuild the wallet
(with a two-signature on-device recovery branch when the index does not know it,
so the index stays a cache and never a single point of failure).

**Decision**: the extension keeps its own profile and its own storage. Its first
run is a **login**, not an import: the same passkey rebuilds the same wallet at
the same address. Contacts, history and settings are per-doorway and are not
synchronised in this feature — a limitation to state plainly rather than paper
over.

---

## D33 — MV3 extension pages need `wasm-unsafe-eval`, or the core cannot load

**What was measured** — the real 3,630,664-byte core artifact, fetched and
compiled inside an extension page:

| `content_security_policy.extension_pages` | `WebAssembly.compile` |
| --- | --- |
| *(MV3 default)* | ❌ `CompileError` — "neither 'wasm-eval' nor 'unsafe-eval' is an allowed source of script" |
| `script-src 'self' 'wasm-unsafe-eval'` | ✅ compiled, 46 imports, ~30 ms |

**Decision**: the extension's manifest declares
`"content_security_policy": { "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" }`.
Without it the wallet does not start at all — every decision the product makes
lives in that binary. This is a store-review-visible declaration and is expected
to be explained in the listing.

---

## D34 — Requests open a dedicated window, never the action popup

An extension's action popup is dismissed the moment it loses focus. A passkey
ceremony takes focus by definition — the platform authenticator's own prompt.
A signing sheet living in the action popup would therefore close itself in the
middle of every signature, and the dApp would see silence.

**Decision**: the extension has **no action popup at all**. The toolbar button
opens the wallet in a tab, and every dApp-initiated request opens a dedicated
window that survives focus changes, is bound to the requesting tab, and answers
exactly once. This mirrors what every shipping extension wallet does, for the
same reason. (Phase 2 revised this from "the popup is the wallet's own doorway":
signing IN is a passkey ceremony too, so the popup cannot host the wallet's own
front door either.)

**Evidence status — reasoned, NOT measured**, unlike D31/D33/D35/D39 on this
page. A virtual authenticator resolves without showing UI, so the focus loss
this decision avoids cannot be reproduced in the harness that proved the others.
It is confirmed on real hardware in T360, and the cost of being wrong is only a
tab where a popup would have done.

---

## D35 — The extension's pages are a client-rendered shell, not the prerendered site

**The question**: the app builds today with `adapter-cloudflare` and prerenders
15 locale routes. Can that output simply be packaged?

**What was measured** — a prerendered page carries **2 inline `<script>` blocks**
(SvelteKit's hydration payload) and 36 absolute `/_app/…` references. Absolute
paths are fine: they resolve under the extension's own root. Inline scripts are
not:

| `extension_pages` CSP | inline `<script>` |
| --- | --- |
| `script-src 'self' 'wasm-unsafe-eval'` | ❌ refused — "Executing inline script violates … CSP" |
| the same, plus a correct `'sha256-…'` of that script | ❌ **the extension fails to load at all** (`ERR_BLOCKED_BY_CLIENT`) |

So a hash is not an escape hatch — Chrome rejects the manifest outright. MV3
does not accept `'unsafe-inline'` or nonces here either.

**Decision**: the extension ships **one client-rendered shell page** (no SSR, no
prerendering, no inline hydration payload) that boots the same application from
external bundles, plus the request window. Fifteen prerendered locale documents
are a hosted-site concern — SEO and first-paint for strangers — and buy the
extension nothing; the extension's locale comes from the person's setting at
boot. The hosted site's build is untouched, so its budgets (zero-wasm Welcome,
worker purity, artifact bytes) are unaffected by construction.

---

## D36 — The transport: one channel, and it is 026's seam

Requests travel page → content script → background service worker → the request
window, and the answer travels back. The wallet-side end registers on the
`sign_request` transport registry 026 built, whose only occupant today is the
test requester: a response goes to the transport that OWNS the request, and the
registry already enforces that. Nothing above the transport changes — the
signing sheet, the four machines and the submit spine are reused as they are.

The page side is ported from `packages/safari-extension/src/` (`inpage.js` 355
lines, `content.js` 820, `background.js` 348, `lib/protocol.js` 246), which
already implements discovery, the MAIN-world guard and the bridge on MV3. The
wallet side is ported from Expo's `extension-bridge-transport.ts` (265) against
the `dapp-transport.ts` interface.

**Decision**: port the page side; write the wallet side as the first REAL
transport on the seam; change neither the sheet nor the machines.

---

## D37 — MV3 tears the background down; a request may never be lost

An MV3 service worker is evicted when idle, and the Safari work already recorded
how badly that can behave (`docs/safari-extension/ARCHITECTURE.md` FACT-3:
messages to a dead worker returning `undefined` with no error). Chrome is far
better behaved than iOS Safari here, but "better behaved" is not a guarantee.

**Decision**: the worker holds no authoritative state. A request is written down
when it arrives and answered from what is written; a request window closed
without a decision answers `4001`; an approved operation is persisted as pending
at submit time (026's rule, unchanged), so the person sees the truth in their own
activity even when the page never got its answer.

---

## D38 — Announce the truth; carry the compatibility flag

The ported `inpage.js` already resolves this and records why: EIP-6963 announces
Vela's real identity, while the LEGACY `window.ethereum` singleton carries
`isMetaMask: true` because many dApps hard-gate on it and never implement 6963.
Vela does not take the legacy slot when another wallet already holds it.

**Decision**: keep that behaviour exactly, keep its comment, and state it in the
feature's own record — it is a deliberate compatibility choice, made once,
already argued.

---

## D39 — Verification: an unpacked extension, headless, in CI

**What was measured**: Playwright's `headless: true` does **not** load
extensions — the extension page comes back `ERR_ABORTED`. Passing
`headless: false` with `--headless=new` in `args` **does**: the extension loads,
its pages open, and CDP's virtual authenticator attaches.

**Decision**: 027's e2e runs `chromium.launchPersistentContext` with
`--headless=new` and `--load-extension`, a pinned extension id (manifest `key`),
a local test dApp page, the 026 stub chain and stub relay, and the parallel
space's fixed keyset for the signer. Two further recipe notes found the hard
way: a CDP virtual authenticator is scoped to the target it was added to, so a
second page has no authenticator and the ceremony simply hangs; and
`chrome://extensions` is not navigable from Playwright, so the extension id must
be pinned rather than discovered.

---

## D40 — What is NOT in this feature

- **WalletPair and remote-inject** — founder, 2026-09-04: not mature. The
  transport registry stays open for them.
- **The hosted site connecting to dApps** — it does not, and nothing about
  getvela.app changes here.
- **`browser_history` and an in-app browser** — spec 022's ruling stands.
- **Firefox, Edge, and the Chrome Web Store listing** — the manifest is close to
  portable and the package is the deliverable; publishing is tracked with the
  store work.
- **Cross-doorway sync of contacts, history and settings** (D32) — stated as a
  limitation, not silently omitted.
- **The 025/026 carried debts** (`manage_tokens`, desktop send actions, sweep
  mode) — one spec, one problem.


---

## D42 — A route path is not a file, and an extension URL forgives nothing

Found while making the app actually run inside the package, and it is the reason
Phase 2 was worth doing before any dApp plumbing.

**What was measured**, against the packaged extension:

| asked for | result |
| --- | --- |
| `…/en/wallet.html` | ✅ the page |
| `…/en/` | ❌ `ERR_FILE_NOT_FOUND` — extension URLs resolve **no directory index** |
| `…/en` | ❌ `ERR_FILE_NOT_FOUND` — and no extensionless fallback either |
| an extensionless twin file beside the page | ❌ impossible — SvelteKit has already made `en/wallet/` a directory for the route's `__data.json` |

So every trick at the FILE level is closed, and the consequence is not
theoretical: the parallel screen's "Enter" does a deliberate `location.assign`
to `/en/wallet` (a full navigation, so every resident store re-hydrates from the
swapped wallet), and inside the extension that landed on
`chrome-error://chromewebdata/`. A reload after any client navigation did the
same.

**Decision**: the app keeps route paths everywhere and translates them at
exactly the two moments a document is really fetched —
`$lib/extension/page-url.ts`:

- `packagedHref()` at a deliberate full navigation (the app has exactly two,
  both on the parallel screen);
- `normalizePackagedUrl()` in `afterNavigate`, putting the document's own name
  back in the address bar so a reload finds a file.

Both are the identity function on the hosted site, decided by the page's own
origin rather than a build flag — the same bundle is correct in both places.

**Also confirmed here**: `router.type: 'hash'`, which SvelteKit documents for
exactly this situation, is unusable — it rejects `+layout.server.ts` as well as
`+server.ts`, and this app resolves all 15 locales inside server loads at
prerender time. Hash routing would trade the corpus for a router. D35's
correction stands, now with the falsification written down.
