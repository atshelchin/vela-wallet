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

---

## Phase 2 — the code is data (T410–T415) 🎯 the trap

**What shipped**: the receive code, the payment-request code and the share card
encode the address. `jsqr` — a decoder that knows nothing about the encoder —
reads it back off the rendered screen.

### The plan said port 554 lines. Checking first said don't.

`src/services/qrcode.ts` is 554 hand-rolled, dependency-free lines, and the plan
called it the porting truth. **Nothing in the Expo tree imports it.** Expo's real
encoder is the `qrcode` npm package, used by `components/QRCode.tsx` and
`components/ui/TransactionReceipt.tsx`.

Porting code that has never run in production, under a heading that calls it
verified, is the worst kind of port. So the encoder is `qrcode` — the same one
the phone ships — and the only thing ported is `qr-path.ts` (20 lines), which
merges consecutive dark modules into one `h` run so the whole code is a single
SVG path. Per-cell rendering leaves hairline white gridlines from pixel
rounding, and a code with gridlines photographs badly, which is how most people
read one. Research D44 is corrected with the reasoning.

**Measured while deciding**: a plain address encodes to **29 modules at version
3** — exactly the `RECEIVE_MODULES = 29` spec 021 drew the card at, so that
geometry was chosen against a real code. A 131-character EIP-681 link encodes to
**49 modules**, so the card takes a varying module count rather than assuming 29.

### The placeholder stays

`qr-pattern.ts` is not deleted and keeps its own honest header. The galleries are
canon and their screenshots are diffed; a fixture that suddenly encoded a real
address would put real addresses in the gallery. `QRCard` takes an optional
`code` — absent means the placeholder, and every live surface supplies a real
one. Both branches render through the same `<path>`, so the placeholder draws
the pixels it always drew.

### The assertion that would have caught this in 021

Two round trips, not one screenshot:

- **unit** (`wallet/qr.test.ts`): rasterise what the card draws, hand it to
  `jsqr`, demand the address back — and the same for a full EIP-681 payment
  link, so amount, asset and chain are proven to survive.
- **e2e** (`receive-code.e2e.ts`): drive the real screen, take the path out of
  the rendered DOM, rasterise it the way a camera would see it, decode. It
  asserts 29 modules and the exact address.

"A QR appeared" is precisely the assertion a decorative pattern passes, which is
why neither of these is that.

**One finding, and the test caught ME**: the e2e first asserted an address
reconstructed from the shortened form `0x0cE19C…084e2e`. The decode returned the
real one and the test failed — proving the decode is genuinely reading the
rendered code, since a pattern would have returned nothing. The full derived
address now lives in `live-helpers.ts` as `TEST_ACCOUNT_ADDRESS` with a note that
the shortened form is unguessable by construction.

**Recorded**: the share card's live builder is wired and supplies the code, the
name, the address lines and the identicon; the *image* it produces ("Save
image") is Phase 3's, alongside the rest of the receive tooling.

**Gates**: check **1361**/0 · lint clean · unit **771** · build ×15 +
`build:extension` · e2e **139 passed / 1 skipped** (chromium + firefox + webkit)
· wasm byte-identical · corpus delta zero.
