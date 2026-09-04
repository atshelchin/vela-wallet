# Delivery Report — 028 Web Port Completion

**Branch**: `028-web-port-completion` · Started 2026-09-04 · Base: `main` @
28d25ae9 (PR #185 merged; not stacked).

---

## Baselines (T401–T403) — recorded @ 28d25ae9

- **Core artifact**: `static/vela_core_bg.4603c8421603.wasm` = **3,630,664 B**.
  Must close byte-identical: both machines this feature gives a screen to
  (`manage_tokens`, and `send`'s sweep half) are already aboard, so wiring them
  costs zero bytes.
- **Corpus pins**: 1536 leaf + 84 branch paths, unchanged since 024. Unlike
  024–027 this feature does NOT assume a zero delta — preference rows, the
  scanner's refusals and the import report may need words that do not exist yet,
  and each will go through the 5-step process.
- **Green tree @ 28d25ae9**: `pnpm check` **1354 files / 0 errors** · lint clean
  · unit **765** · build ×15 + `build:extension` · e2e **138 passed / 1 skipped**
  on chromium + firefox + webkit. The one skip is 027's `test.fixme` for SC-304,
  which is this feature's stated precondition and not its task.
- **A flake worth watching**: one baseline run reported 137/1 and a non-zero
  exit while a second suite held port 4173. Run alone it is 138/1 every time.
  The extension suites launch their own browsers on top of the shared preview
  worker, which is the contention `workers: 3` was pinned for in 027 — if this
  appears again with nothing else running, it is real and gets chased.

### Port-provenance surface @ 28d25ae9 — 3,155 lines

| File | Lines | Why |
| --- | --- | --- |
| `components/QRScanner.tsx` (web engine only) | 693 | the decode ladder `docs/qr-scanner-web.md` measured |
| `services/qrcode.ts` | 554 | the encoder — dependency-free, byte mode, v1–10, EC-M |
| `services/contact-io.ts` | 341 | export/import, existing entry wins |
| `services/locale-format.ts` | 331 | explicit presets, never `Intl` |
| `services/share-card.ts` | 330 | address + code + identicon, composed |
| `services/fiat-convert.ts` | 231 | as its consumers need it |
| `services/erase-device.ts` | 160 | the namespace sweep |
| `services/currency-catalog.ts` | 158 | as needed |
| `services/readonly-rpc-gate.ts` | 109 | as needed |
| `services/token-list-filter.ts` | 98 | as needed |
| `services/image-decode.ts` | 74 | the picked-image path |
| `services/avatar-style.ts` | 54 | a preference |
| `services/saved-contact.ts` | 22 | beside `contact-io` |

**Not ported, with reasons**: the TypeScript twins Rust owns (`clear-signing`,
`approval-guard-editor`, `local-descriptors`, `siwe`); the WalletPair, webview
and native transports; App Group sync; `deployer-api`. See research D52.

**Already drawn, waiting only for wiring** — this feature draws nothing:
`AddTokenModel` / `AddTokenTab` / `AddTokenResult` with 31 fixture references
and `go('add-token')` routed from both `FlowsMobile` and `FlowsPanel`; the
sweep picker's `multi_select_mode` / `multi_selected_ids` in `SendView`;
`ShareCardModel`; `ScanSurface`; every preference row.

### The two decoder dependencies (T403)

`@undecaf/zbar-wasm` (239 KB of wasm) and `jsqr` (257 KB), declared in
**app-web's own `package.json`** — the rule 026 learned with `xlsx` and 027
re-learned with `esbuild`: a build-time or runtime import gets declared in the
package that uses it, the moment it is used, or a clean checkout builds an
import pointing at nothing.

They are **runtime** dependencies, not dev: the decoder ships to the browser.
Both are lazy (nothing loads until a scanner opens) and both are served from our
own origin — Expo fetches zbar from a CDN because Metro cannot import a module
using `import.meta`; Vite can, and this repo does not fetch code from third
parties at runtime (D45).

Encoding needs no dependency at all.
