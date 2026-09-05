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

---

## Phase 3 (wip) — the decode engine (T420, T421, T424)

**What shipped**: the wallet can read a QR code. The engine is ported and proven
against the encoder Phase 2 landed, in a real browser.

- **`services/qr-decode.ts`** carries the ladder `docs/qr-scanner-web.md`
  measured, unchanged in substance: zbar at 1200/1000/800/600/400 with a
  downscale FIRST (a canvas downscale is a low-pass filter — it is what removes
  JPEG noise and moiré), then jsQR with `binInvert(160)` / `invert` /
  `binarize(160)` for the clean screenshots zbar refuses. A camera frame decodes
  at 1000 wide; a picked image is tried thoroughly, because a person is waiting
  on an answer rather than watching a viewfinder.
  Both decoders are **lazy** — nothing is fetched until a scanner opens.
- **`flows/core/scanner.svelte.ts`** is the camera and, mostly, its refusals.
  Each one is a different thing for a person to do, and only if it is said: a
  refusal they can undo in site settings (`denied`, which covers both "said no
  now" and "said no once and the browser remembers"), no camera at all
  (`absent` — most desktops), an insecure origin (`insecure`, where
  `getUserMedia` is simply undefined and the fix is the URL, not the device),
  and `unavailable` for everything else. Support is checked BEFORE asking, so a
  device without a camera never raises a prompt someone then has to dismiss.
- **`ScanSurface`** gains an optional `feed` snippet and a `notice` line. Absent,
  it draws exactly what the gallery has always drawn.

**T421 is not a port, and that is the finding**: Expo's `image-decode.ts` is a
pure-JS JPEG decoder that exists because native has no canvas. A browser decodes
images itself, so the picked-image path is `createImageBitmap` and nothing else.
74 lines not written.

**Proven in a real browser** (`qr-decode.svelte.test.ts`, the vitest browser
project): the real zbar WASM reads back an address and a full EIP-681 payment
link from what the receive card renders, and returns null for a blank image
rather than inventing something. Together with Phase 2's round trip this is the
whole loop a person performs — one shows a code, another scans it.

**One finding from the literal audit**: it failed on `1200px` / `1000px` / `5px`
inside this module's PROSE. The audit scans `src/lib/services` for px literals,
and it was right to: the fix is to write "1200 wide" and "about five pixels per
module", not to weaken the audit for comments.

### Still open in this phase

- **T422's route wiring** — `ScanSurface` has its slots; `FlowsMobile` /
  `FlowsPanel` do not yet forward them, and nothing drives `scanner` yet.
- **T423** — a decoded address does not yet reach the send form
  (`set_recipient`) or the sweep picker.
- **T425** — the scan e2e.
- **Two corpus words are missing** for the refusals the corpus has no phrase
  for: no camera on this device, and an insecure origin. `permissionText`,
  `noQrFound`, `noQrFoundMsg` and `errorImage` already cover the rest.

**Gates at this commit**: check **1366**/0 · lint clean · unit **783**
(+12: seven browser decode cases, five refusal cases) · e2e **139 passed / 1
skipped** on chromium + firefox + webkit.

**The e2e number cost four worthless runs to get, and the reason is worth more
than the number.** Every one of them was poisoned by something else I was
running at the same time:

- two Playwright suites at once fight over port 4173, and `reuseExistingServer`
  means the loser silently tests the winner's build — one run reported "18
  passed" in 29.8 minutes;
- killing a run to start another leaves the first's partial output looking like
  a failure (one stopped at test 75/140 because I had just `pkill`ed it);
- and a manual `pnpm build` alongside a suite's own build is the sharpest of
  them: two `vite build` processes write `.svelte-kit/output`, one deletes what
  the other is about to read, and the crash reads
  `ENOENT: no such file or directory, scandir '.svelte-kit/output/client'` —
  which looks exactly like a broken build and is not one.

**The rule: one build or suite at a time, and touch nothing while it runs.** It
is the same lesson 026 learned as worker starvation and 027 pinned as
`workers: 3` — this is that lesson applied to the person driving, not to the
config.

---

## Phase 3 (complete) — the scanner reads, and says why when it cannot

**What closed**: T422, T423, T425, T426. The wallet now reads a code from the
camera or from a chosen image, on both layouts, and every way it can fail has
its own sentence on the screen.

### The scanner is the CORE's state, and that is what made T423 small

`SendView` has carried `show_scanner` and the `open_scanner` / `close_scanner` /
`scan_resolved` events since the machine was written. So the shell holds no
"scanner is open" flag at all:

- the recipient row's scan button dispatches `open_scanner`;
- `sendState` reads `view.show_scanner` and shows `s1` — ahead of the fee sheet
  and the importer, and ahead of the core's own stage;
- a decode dispatches `scan_resolved`, which fills the row AND closes the
  surface in one transition, in Rust.

That is also why the **sweep picker needs nothing of its own** (T423's second
half): the sweep's recipient row is the same `RecipientField` with the same
`scanLabel`, so it opens the same core scanner and is filled by the same event.
Had this been a shell boolean, it would have been two.

**The one shell rule left** is the wallet home's, and it is Expo's verbatim
(`useHomeController.ts:529`): with no session open there is nothing to dispatch
INTO, so a scanned code OPENS one — prefilled, and `locked: true` when the
request names a chain to lock to. `parseEIP681` was already ported (spec 026);
the shell only tokenizes, and every decision about the parse is `send.rs`'s.

### `FlowsPanel` was one surface too many

The wip note listed it as unwired. It has no scan branch and never did — the
desktop scanner is a centred modal (DS1L) the route draws over the window,
because a viewfinder in a 380px column is the wrong shape. Both call sites are
now live and both share ONE `{#snippet}`, so there is one `<video>` and one
camera no matter which layout is drawn.

### Three carried gotchas, all of them real

- **The file input is mounted, not conditional.** `click()` on an input that is
  not in the document opens nothing, and "choose a photo" is the entire way out
  for someone whose camera was refused.
- **`pointer-events: none` on the `<video>`.** It fills the frame the brackets
  mark and would otherwise eat the taps meant for the tools under it.
- **A two-second re-arm.** Expo re-arms its scanner after a decode, and the
  reason survives the port: a poster with an unusable code in frame must not end
  the scan, and re-arming instantly would decode that same code forever.

### The corpus grew by three words, and the artifact is NOT byte-identical

`componentsUi.scanner.{noCamera,insecureOrigin,cameraUnavailable}` × 15 locales
= 45 strings. The corpus was searched before it was grown: `permissionText`
covers the refusal a person can undo in site settings, and nothing existing said
"there is no camera here", "this page is not on HTTPS" or "something else has
the camera". These are refusals **native never had** — a phone has a camera and
an app has no origin — which is why the port could not carry them.

The Phase 1 baseline said the core artifact must close byte-identical. **It does
not, and the reason is words rather than machines**: the shared key-path table
is compiled into `vela-core` (catalogs are not — every locale is fetched as JSON
at runtime), so three paths cost **129 bytes**:

| | Phase 1 | now |
| --- | --- | --- |
| artifact | `vela_core_bg.4603c8421603.wasm` | `vela_core_bg.7caac430e4b3.wasm` |
| bytes | 3,630,664 | 3,630,793 (+129) |
| corpus | 1,536 leaf + 84 branch | 1,539 leaf + 84 branch |

T460's budget assertion should be restated accordingly: **one** core artifact,
still the only one a wallet route loads — which the e2e already proves against
the new fingerprint — and any byte delta explained. "Byte-identical" was the
right pin for two machines that were already aboard; it was never the right pin
for a feature whose own baseline says the corpus will grow.

**The 5-step corpus recipe has a sixth step, and a wrong flag.**
`cargo test -p vela-core --features i18n-all` does not compile — `app` is behind
the `crux` feature, so the parity suites cannot see the machines. It is
`--features i18n-all,crux`.

**The 45 strings are mine, not a translator's.** They follow each locale's own
register (zh-HK in spoken Cantonese, de/fr formal to match the neighbouring
lines) and they want a human eye before release, like every machine-written
batch this project has shipped.

### What the e2e actually proves (SC-402)

`scan.e2e.ts`, five tests, all on real pixels — `qrcode` writes a PNG in Node,
the browser decodes it with the real ladder, and nothing in the app is on both
ends:

1. a picked code's address reaches the **send form's recipient field**, exactly;
2. the scanner opened FROM that form fills the row it was opened from — the
   core's `open_scanner` → `scan_resolved` round trip;
3. a refused camera says so, and the photo path is still on the same screen;
4. a machine with no camera gets a DIFFERENT sentence, because it is a
   different thing to do about it;
5. a code that decodes to something that is not a payment says *that* — which
   is also the control for (1): a decoder returning nothing would report "no QR
   found" instead.

### Known and named, not hidden

A scan at desktop width opens the send panel with the scanned recipient in it,
and that panel still cannot be DRIVEN — `FlowsPanel` gets live send data but no
send actions until **T453** (Phase 6). This is the state the desktop send is
already in when opened from the sidebar; the scan does not make it worse, and
one phase closes it.

**Gates**: check **1366**/0 · lint clean · unit **787** (+4 notice cases) ·
build ×15 + `build:extension` · e2e **144 passed / 1 skipped** on chromium +
firefox + webkit · root `jest src/__tests__/i18n/` 75 passed (leaf pin
22,758 → **22,803**) · `cargo test -p vela-core --features i18n-all,crux` green ·
`lint:i18n` no new defects · `verify:i18n` 73,085 comparisons, zero divergences.

---

## Phase 4 — preferences that do what they say (T430–T437)

**What shipped**: the six rows 023 drew and nobody wired. Theme, language, the
number / date / time presets and the avatar style now change what they name,
survive a reload, and are read everywhere the app prints a figure. "Erase this
device" erases this device.

### The presets are the product's, and `Intl` gets one job

`services/locale-format.ts` is the port, and the rule it exists for survives the
platform change: **explicit rules, never `Intl` for the output**. A wallet that
renders a figure by the browser's idea of a locale is a wallet where the same
balance reads two ways on two machines, and where a person cannot tell a
thousands separator from a decimal point in a language they are guessing at.

`Intl` appears exactly once — in the `auto` DETECTION, reading the platform's
conventions to pick a preset. That is a different act from letting it format
money, and its result is a preset like any other.

**Where the preset landed, and where it deliberately did not**:

| Surface | What changed | Why |
| --- | --- | --- |
| Money (`moneyParts`, `moneyText`) | grouping **and** decimal mark | D47's own sentence: this includes money, which is why it is not cosmetic |
| Token amounts (`trimBalance`) | the decimal mark only | a decimal comma read as a thousands separator is a hundredfold mistake about an amount; but the mocks draw token amounts ungrouped, and this feature wires preferences rather than redrawing screens |
| Day headers older than yesterday | the date preset | which is what the phone does — `activity.ts::dayGroupLabel` calls the same `formatDate`, so the two clients group a history the same way |
| `services/activity.ts::formatUsd` | **untouched** | it writes a STORED field in a record whose shape is the Expo compatibility contract, not a string anyone renders. Reformatting it would change data, not presentation |

**A dead parameter went with it.** `dayLabel(…, locale)` and
`liveActivityGroups(…, locale)` no longer consult a locale, so the parameter and
the `locale?: string` field in three input interfaces were removed rather than
left as a signature that lies about what it reads.

### Preferences have no machine, and none was invented

`services/preferences.svelte.ts` is shell state (D48). A Rust machine holding
four enums and no rule would be a machine in name only — compare
`display_currency`, which HAS one, because choosing a currency has a rule behind
it (a rate must exist, and an unpriceable currency must refuse).

**localStorage, not the IndexedDB KV**, and the reason is the same one 024 gave
`vela.serviceEndpoints`: these are read SYNCHRONOUSLY while a screen renders —
every money figure asks the number preset — and the theme has to be on the
document before the first paint. Record shapes are Expo's byte-for-byte
(`vela.localePrefs` one JSON object, `vela.avatarStyle` and `vela.language` bare
strings), so a phone and a browser would read each other.

`vela.theme` is the one key Expo has no counterpart for: a phone follows the OS
and offers no choice; a browser tab is a window inside someone else's chrome,
where "follow the OS" is a preference rather than the only option. `system`
**removes** the attribute rather than writing a resolved value — a pinned "dark"
would stop following an OS that changes at sunset, which is the whole meaning of
the choice.

**Applied before first paint**, in `app.html`'s existing inline script, for the
same reason spec 012 put the launch decision there: a theme that arrives in
`onMount` paints the OS palette first and then flips, which on a wallet reads as
a glitch rather than a setting.

**`avatar-style.ts` was not ported as a module.** Its 54 lines are an
AsyncStorage cache plus a listener set plus a version counter — all three of
which are what `$state` already is. The preference folded into `preferences`;
what WAS ported is the artwork: `initialsSvg` is `WalletAvatar.tsx`'s
non-identicon branch, same 0.34 letter-to-diameter ratio, same `V` fallback when
there is no name. It is composed as an SVG STRING because every avatar in the
app already takes one (the identicon comes from vela-core that way), and its
colours are `var(--…)` token references — so it wears whatever palette the page
is wearing and follows a theme change without being rebuilt.

### Erase deletes a namespace, and names its one exception

Carried verbatim, including the reasoning that produced it: **a delete-list
erase is wrong by default and only accidentally right**. Nothing about a
hand-maintained list of keys fails when the app grows a key, so it drifts in
silence and the failure is found by someone whose data was supposed to be gone.

The web made one thing bigger: Expo had ONE AsyncStorage; a browser has three
stores — `localStorage`, the IndexedDB KV, and (extension build only)
`chrome.storage.local`. All three are swept by the same rule, and a store this
build does not have contributes nothing rather than failing. `storage.ts` gained
`getAllKeys()` for exactly this: a sweep has to be able to ask what is actually
here.

The keep-list is one key — `vela.pendingUploads` — and
`contracts/erase-scope.md` now carries its reason rather than implying it. The
verification pass re-enumerates and `EraseIncompleteError` rejects, which is
what stops the route sending a person to first run over a partial wipe. On
failure they stay signed in, on the same sheet, with the reason in the sheet's
own danger callout and the button still live.

**No corpus change**: `settings.eraseDevice.*` already carried all eight
strings, `failed` included. It only needed adding to the settings message
manifest, which is a type and a mapping, not a word.

### One finding, from the e2e

`seedSignedIn` re-imposes a wallet before EVERY document (it is an
`addInitScript`), so after an erase navigates to Welcome the harness has already
written `vela.accounts` back. The first version of the test read that as a
failed erase. What the erase did is therefore measured on the keys the harness
does not write — a key no feature has ever written, and an IndexedDB store that
must come back empty — with the reason recorded in the test rather than in
somebody's memory.

### What is live in Settings now, and what is still a picture

FR-411 asked for the route's own description of itself to stop lying, and it
does. **Live**: the network list, its editor, the add-network wizard (024); the
display currency (024); the connected sites (027); and now the theme, the
language row, the three format presets, the avatar style and the erase. **Still
canon data**: the latency figures, the storage accounting and the RPC-provider
health — those wait for the features that measure them.

### Named, not hidden

- The desktop's localization dropdowns gained per-row `options`, so a live panel
  can open any of the three menus while DST3's single pinned-open `dropdown`
  stays exactly the board it was drawn as.
- Choosing a language NAVIGATES, because on the web a language is a route: every
  locale is its own prerendered page. The choice is also stored, but `/`'s
  Accept-Language negotiation is server-side and cannot read it — a returning
  person who lands on `/` still gets their browser's answer. Recorded here
  rather than fixed, because fixing it means a redirect on a page whose whole
  budget is that it ships no JavaScript.

**Gates**: check **1373**/0 · lint clean · unit **812** (+25: 12 format presets,
6 erase, 7 preference store) · build ×15 + `build:extension` · e2e **159 passed /
1 skipped** on chromium + firefox + webkit · corpus delta **zero** (the erase
copy already existed, `failed` included — it needed a manifest entry, not a
word) · core artifact unchanged from Phase 3.

**And the run before it failed 30 tests, which was my machine and not the code.**
An ORPHANED `workerd` (parent gone, 31 minutes old) was still on the box beside
an 18-hour `vite dev` from someone's editor; with `reuseExistingServer: true` a
suite can end up measuring a server nobody owns, and when that one went away
thirty tests reported "Could not connect to the server" at once. Killed the
orphan, re-ran, 159/1 in 2.4 minutes. Phase 3's rule stands and now has a
corollary: **one suite at a time, and check for orphans before believing a red
run** — `lsof -ti tcp:4173` and `pgrep -f workerd` before, not after.
