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
