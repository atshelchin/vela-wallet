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
