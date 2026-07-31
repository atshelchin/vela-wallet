# 07 — Overlays & Modals (Vela Wallet design source-of-truth)

Audit date: 2026-07-29. Repo: `/Volumes/data/production/vela-wallet` (React Native / Expo, expo-router).
Authoritative style docs read first: `DESIGN_SYSTEM.md` (older, card-heavy) and `docs/DESIGN-LANGUAGE.md`
(**confirmed current**: de-containered, hairline dividers, open heroes — overrides DESIGN_SYSTEM.md where they conflict).

This page is the master catalog of **every overlay surface** in the app. Each entry gives: trigger,
presentation per platform, layout, internal states, dismissal, and stacking notes. Token values below are
theme tokens from `src/constants/theme.ts`; hex values are given for both light and dark.

---

## 0. Token reference used by overlays (light / dark)

| Token | Light | Dark |
|---|---|---|
| `bg.base` (sheet/page bg) | `#FAFAF8` | `#141412` |
| `bg.raised` (cards, alert card, slide track) | `#FFFFFF` | `#1E1E1B` |
| `bg.sunken` (chips, inputs, code blocks) | `#F5F3EF` | `#0F0F0D` |
| `fg.base` | `#1A1A18` | `#E8E6E1` |
| `fg.muted` | `#6E6B62` | `#9A9790` |
| `fg.subtle` | `#8C887E` | `#85827A` |
| `fg.inverse` | `#FFFFFF` | `#1A1A18` |
| `accent.base` / `accent.soft` | `#E8572A` / `#FFF0EB` | `#E8572A` / `#2C1A12` |
| `success.base` / `success.soft` | `#2D8E5F` / `#EDFAF2` | `#3DA872` / `#132A1E` |
| `warning.base` / `soft` / `border` | `#92600A` / `#FFF8F0` / `#F0DCC8` | `#D4A54A` / `#2A2010` / `#3D3020` |
| `error.base` / `error.soft` | `#C62828` / `#FEF2F2` | `#F87171` / `#2D1515` |
| `info.base` / `info.soft` | `#4267F4` / `#EDF0FF` | `#5A7CF6` / `#131B33` |
| `border.base` / `border.strong` | `#ECEBE4` / `#D8D6CE` | `#2C2C28` / `#3E3E38` |

Spacing: 4px grid (`xs 2, sm 4, md 8, lg 12, xl 16, 2xl 20, 3xl 24, 4xl 32, 5xl 48`).
Radius: `sm 4, md 8, lg 12, xl 16, 2xl 20, full 9999`. Type scale (base px, ×user scale, ×1.2 web boost):
`xs 10, sm 11, base 13, lg 15, xl 17, 2xl 20, 3xl 26, 4xl 32, 5xl 40`. Font: Plus Jakarta Sans
(400/500/600/700 weight files, export still named `inter`); `font.mono` = Menlo (iOS) / monospace (Android).
Backdrop color for ALL sheet/alert backdrops: `rgba(0,0,0,0.35)` in **both** themes (extension confirm
overlay uses `rgba(0,0,0,0.4)`).

---

## 1. Foundation: `AppModal` (`src/components/ui/AppModal.tsx`)

The single cross-platform sheet primitive. Every bottom sheet in the app is built on it (exceptions listed
in §1.6). Props: `visible`, `onClose?`, `fit?` (content-height sheet), `children`.

### 1.1 iOS (default)
- Native RN `<Modal animationType="slide" presentationStyle="pageSheet" allowSwipeDismissal>`.
- `allowSwipeDismissal` re-enables UIKit's interactive pull-down (finger-tracking 1:1); the grabber is
  purely visual (a JS drag would fight the native gesture).
- Content skeleton: full-bleed `bg.base` root → **handle area** (centered, paddingTop 10 / paddingBottom 6)
  containing the **handle bar: 36 × 5, radius 3, `border.base`** → `KeyboardAvoidingView behavior="padding"`
  → `SafeAreaView edges={['bottom']}` → children.
- Wrapped in its own `GestureHandlerRootView` (RN Modal mounts a detached native root; without this, RNGH
  gestures inside the sheet — e.g. slide-to-confirm — receive no touches).

### 1.2 Android (default)
- Same `<Modal ... presentationStyle="pageSheet">` shell, but Android has no native sheet gesture, so a
  custom `PanResponder` drag lives on the handle area only.
- Whole inner content translates with the drag. Thresholds: **dismiss when dy > 90 px or fling vy > 0.5**;
  crossing 90 px fires one light "armed" haptic (re-arms if dragged back). On commit the sheet is thrown
  fully off-screen (200 ms timing) *then* `onClose` fires (no top-gap jump); under threshold → spring back
  (tension 80, friction 10).
- Drag claims on MOVE only (dy > 4 and dy > |dx|) so taps and horizontal swipes pass through.

### 1.3 `fit` sheet (iOS + Android, native only)
- Content-height bottom card over a dimmed backdrop — for short prompts where a near-full pageSheet reads
  as broken (currently: in-app browser connect-consent).
- Transparent `<Modal statusBarTranslucent animationType="none">`; own animations: backdrop fade + slide
  from measured sheet height, **220 ms in / 180 ms out**; stays mounted through the exit animation.
- Card: `bg.base`, top corners `radius.2xl` (20), `maxHeight: 92%` of screen; same handle bar; same
  drag-to-dismiss thresholds (90 px / vy 0.5, armed haptic); **backdrop tap dismisses** (unlike full
  sheets, which have no visible backdrop on native).

### 1.4 Web
- DOM portal into `#root` (container `position:absolute; inset:0; z-index:99999`).
- Backdrop `rgba(0,0,0,0.35)`, fades via `background-color 0.3s ease`; **click dismisses**.
- Sheet: anchored bottom, `bg.base`, top corners `radius.2xl` (20), `max-height: 92%`, `overflow:auto`;
  slide-up `transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)` from `translateY(100%)`.
- Drag handle (same 36×5 bar) with its own PanResponder: dismiss at dy > 80 or vy > 0.5.
- Dialog contract via `useWebDialog` (§1.5). Content hugs height (web always "fits").

### 1.5 `useWebDialog` (web-only behavior contract, `src/hooks/use-web-dialog.ts`)
- Escape closes; Tab focus-trapped inside; focus moves in on open and restores to opener on close;
  body scroll locked (ref-counted so an AppAlert stacked over an AppModal doesn't unlock early);
  container gets `role="dialog"` (or `alertdialog`) + `aria-modal="true"`.

### 1.6 Overlays NOT built on AppModal
- `QRScanner` (own full-screen RN `<Modal>`, §8), `ExtensionSignController` confirmation (plain absolute
  View, §3.5), `ReceiptToast`/banners/badges (§9), native `AppAlert` (OS `Alert.alert`, §2), the Receive
  warning gate (in-screen absolute overlay, §9.5), browser load-error overlay (§7.3),
  `AnimatedSplashOverlay` (§9.6).

### 1.7 Stacking rules (LOAD-BEARING — encode in Penpot notes)
1. **Single-modal content-swap rule**: iOS will NOT present a second native modal over an already-presented
   pageSheet (stacked modal is invisible; this was KNOWN-BUGS BUG-1, the "invisible funding modal").
   Therefore a sheet that needs a second surface **swaps its own content** instead of stacking:
   - SigningRequestModal ⇄ BundlerFundingView (§4.1),
   - BalanceDetailSheet ⇄ RpcFixForm (§6.3),
   - ContactsManager list ⇄ add/edit form ⇄ group editor (one modal, three views),
   - BugReportModal compose ⇄ success ⇄ GitHub-fallback (same modal, swapped content).
2. **Providers hosted inside modals**: the Identicon viewer is re-hosted *inside* AccountSwitcherModal and
   ContactPicker, because a root-level modal presented while a pageSheet is up deadlocks on iOS.
3. **Web stacking = DOM insertion order**: the app-level IdenticonViewerProvider mounts its sheet only when
   opened, so its portal container is appended last → always on top; it unmounts ~320 ms after close.
4. **AppAlert always above AppModal on web**: alert portal `z-index: 9999999` (body-level, fixed) vs modal
   `99999` (inside #root).
5. **ExtensionSignController** deliberately uses a plain View overlay (never RN Modal) so it can never
   collide with the just-dismissed sign modal.
6. **Swipe-dismiss routing on the sign sheet** (BUG-2 class): `onClose` is re-pointed live — pre-submit
   swipe = reject (EIP-1193 4001); once submitting/submitted = dismiss only (op proceeds). The web
   DragHandle and AndroidSheet both read `onClose` through a ref so a stale closure can't turn a dismiss
   into a reject.

### 1.8 Standard sheet header pattern (recurs in most sheets)
Row `paddingHorizontal: space.2xl (20)`, `paddingVertical: space.md (8)`:
`[34px spacer] [centered title: text.xl (17) bold fg.base, numberOfLines 1] [34×34 plain close button — X icon 18–20 px, fg.base, strokeWidth 2, no bg/border, hitSlop 8]`.
Variant: left-aligned title + right-aligned X (AccountSwitcherModal, BugReportModal-less sheets,
RpcFixForm, OnboardingSettingsModal); or title + text action ("Clear all" in error.base) in
BrowserHistorySheet.

### 1.9 Selection-row convention (pickers)
Row = leading 40 px circle (logo/symbol) + name (text.lg semibold) + sub (text.sm muted) + trailing
accent `Check` (20 px, strokeWidth 2.6) when selected. Two generations coexist (flagged in §11):
- **Legacy card rows** (CurrencySheet, NetworkFilterSheet): `bg.raised` card, `radius.xl`, 1.5 px border
  transparent → `accent.base` when selected, list gap `space.md`.
- **Current de-boxed rows** (AccountSwitcherModal, BalanceDetailSheet, FeeTokenSelector, ContactPicker,
  BrowserHistorySheet): open rows on `bg.base`, hairline 1 px `border.base` divider **inset past the
  leading icon** (e.g. `marginLeft: 40 + gap`), selected = accent check (± accent-colored name), no fill.

---

## 2. `AppAlert` — confirmation dialog (`src/components/ui/AppAlert.tsx` + `services/platform.ts#showAlert`)

- **Native (iOS/Android): the OS system alert** (`Alert.alert`) — not themed, platform-native buttons.
- **Web**: custom centered dialog rendered by `AlertProvider` through a body-level portal
  (`z-index: 9999999`, above every AppModal). `showAlert(title, message?, buttons?)` is the single API
  everywhere (global ref; falls back to `window.confirm`/`alert` before the provider mounts).
- Web layout: full-screen overlay, centered; backdrop `rgba(0,0,0,0.35)` (tap = dismiss w/o action).
  Card: `bg.raised`, `radius.xl` (16), padding `space.2xl` (20), width 85% max 340, `shadow.lg`.
  Title `text.lg` bold `fg.base` (margin-bottom 8); message `text.base` regular `fg.subtle`,
  lineHeight 22 (margin-bottom 16). Button row right-aligned, gap 8; each button padding 8×16,
  `radius.lg`, minWidth 70.
- Button variants: default = text-only `accent.base` semibold `text.base`; `cancel` = text-only
  `fg.subtle`; `destructive` = filled `error.base` with `fg.inverse` text; implicit **primary** (last
  non-cancel button when >1 buttons) = filled `accent.base` with `fg.inverse` text.
- Behavior: Escape/backdrop = dismiss; `role="alertdialog"`, focus-trapped.
- Used for all confirm/destructive prompts: remove network, clear browser history, disconnect dApp,
  contact delete, RPC-fix validation errors, scanner errors, etc.

---

## 3. Signing family

### 3.1 `SigningRequestModal` (global host, `src/components/signing/SigningRequestModal.tsx`)
- **Trigger**: any incoming dApp request (WalletPair session, in-app browser provider request, Safari-
  extension hand-off, web SDK) → `useDAppConnection().incomingRequest` non-null. Mounted ONCE at app root
  (`app/_layout.tsx`), above the navigator — overlays whatever screen is current.
- **Presentation**: full AppModal (pageSheet / web slide-up). `visible={true}` while a request exists.
- **Content swap** (§1.7-1): if `fundingNeeded` → renders `BundlerFundingView` (with `dappVariant`) in the
  SAME sheet; otherwise renders `SigningSheet`.
- **onClose routing**: funding shown → cancel funding (rejects the pending request); signError or
  submitted/submitting → dismiss; otherwise → reject (4001).

### 3.2 `SigningSheet` — the ONE signing surface (`src/components/signing/SigningSheet.tsx`)
Single render path shared by production, the Clear-Signing test harness, and read-only replay (a security
UI must not be duplicated). Container: `flex:1`, padding `space.3xl` (24). Scrollable body + fixed footer.

Body order (top → bottom):
1. **DAppBanner** — open "who's asking" header (dApp icon 36×36 radius 10, accent.soft fallback; name;
   domain; chain chip), hairline bottom border, never a card.
2. **History note** (read-only replay only): `bg.sunken` `radius.lg` row, Pen icon 15 fg.muted,
   copy "A past signature — exactly what you approved." (`text.sm` medium fg.muted).
3. **Main view — exactly one of** (priority order):
   - `PermitSignView` — off-chain permit (Permit2/ERC-2612/DAI); risk surfaced, signed verbatim (no cap
     editor — capping would desync the signature).
   - `ApprovalView` — editable spending-cap editor (never-unlimited mandate); requires an explicit
     choice before confirm enables; verb Approve/Revoke.
   - Loading fallback while descriptor resolves — centered `text.lg` fg.muted "Loading..." (prevents
     blind→clear flash).
   - `ClearSignView` — ERC-7730 decoded intent (hero token cards, flows).
   - `BatchCallsView` — EIP-5792 `wallet_sendCalls` per-leg breakdown; every granting leg must be
     capped/revoked/deliberately chosen before confirm enables.
   - `EthSignDangerView` — opaque 32-byte hash hard-warning surface.
   - `MessageSignView` — personal_sign decoded message (+ SIWE domain-binding phishing check).
   - `BlindTypedDataView` / `BlindTransactionView` — undecodable fallbacks with warnings.
   - Generic fallback: centered Shield 28 fg.muted + "Signature request" (`text.lg` regular fg.muted),
     paddingVertical `space.5xl`.
4. **BalanceChangePreview** (tx/batch): only the LOUD states — expected revert, underfunded, undeclared
   balance changes. The quiet "all matched" case is a factual row inside the Advanced panel instead.
5. **AdvancedPanel** — collapsed raw payload, resolved addresses, factual sim result.
6. **GasFeeCard** (tx/batch, live only) — fee estimate, fiat line, embedded `FeeTokenSelector`
   (de-boxed fee-asset rows, §6.7-note). Confirm stays disabled while re-quoting (`onBusyChange`).
7. **Gas-estimate-failed WarningBanner** (severity caution): "Couldn't estimate the gas fee — submitting
   may fail or time out. Tap the fee above to retry." Blocks confirm.
8. **SigningAccountRow** — quiet "signing from" row (identicon + name; tap reveals 0x). Live mode only.
9. **Pending card** (submitted, awaiting receipt): `info.soft` bg, `radius.lg`, row = small spinner
   (info.base) + mono `text.sm` info.base "Submitted — waiting for confirmation · 0x1234567890…abcdef".
10. **Error card**: `error.soft` bg, `radius.lg`, AlertTriangle 16 error.base + `text.sm` error.base text.

Footer (`buttonRow`: hairline top border, paddingTop `space.xl`, gap `space.lg`):
- Live: a single **SlideToConfirmButton** for EVERY request (no Reject button — closing the sheet rejects).
- Error state: secondary VelaButton "Dismiss". Read-only: secondary "Close".

**SlideToConfirmButton spec** (`ui/SlideToConfirmButton.tsx`): track 60 px tall, radius 30, `bg.raised`,
1 px `border.base`; knob 52 px accent circle (white arrow) inset 4 px, `shadow.md`; label `text.lg`
semibold `fg.muted` centered (fades as knob passes). Commit at ≥80 % or fast flick (≥45 % + velocity
900); tick haptic at 60 %; overdrag rubber-bands; idle knob "peeks" right to teach the gesture (stops
forever on first grab); on commit track settles to `success.soft` with border `rgba(45,142,95,0.3)`.
Disabled/loading: 0.45 opacity, loading spinner replaces label. Keyboard accessible on web
(Enter/Space). Call sites keep ≥ ~48 pt clearance below (iPhone home-indicator swipe band).

**Confirm label logic**: "Signing..." while signing; Approve/Revoke for editable approvals; decoded
intent → "Confirm {intent}" (≤12 chars localized, else "Confirm"); Sign for messages/typed data;
plain native send → "Confirm Send"; catch-all "Confirm" (never "Approve" for non-approvals).

**Confirm disabled when**: resolving descriptor; tx gas estimating or failed; fee re-quote busy;
editable approval without a choice; any batch leg still needing a choice.

**Haptics**: warning buzz on open for danger (eth_sign, unbounded approval, SIWE domain mismatch);
light on confirm commit; success when opHash lands; error on signError.

### 3.3 `SigningReplaySheet` (`ui/SigningReplaySheet.tsx`)
- **Trigger**: tapping a Connections-panel record that captured its original request (`signedRequest`).
- AppModal hosting `SigningSheet readOnly` with the persisted sign-time simulation (`replaySim`) and, for
  a still-pending op, the pending banner (re-open in-flight status). No approve/reject/gas/funding.
- Records without a captured request fall back to `ConnectionEventDetailSheet` (§6.2).

### 3.4 `MockSigningModal` (dev harness, `screens/settings/ClearSigningTestScreen.tsx`)
- Dev-only: tapping a scenario opens an AppModal driving the REAL `SigningSheet` with mock request +
  optional `simOverride`/`simFromOverride`. Identical presentation to production — by mandate.

### 3.5 `ExtensionSignController` confirmation overlay (`components/ExtensionSignController.tsx`)
- **Trigger**: Safari-extension sign hand-off (`velawallet://sign?rid`) settles (signed / rejected /
  unknown / request-missing / UL self-test). During connecting/signing it renders nothing visible (the
  global SigningRequestModal is the UI).
- **Presentation**: NOT a Modal — a plain absolute-fill View above the navigator: dim `rgba(0,0,0,0.4)`,
  content bottom-anchored; `accessibilityViewIsModal` + role alert. Tap the dimmed area = dismiss.
- **Sheet**: `bg.raised`, top radius 24, hairline top border, big up-shadow (offset −8, opacity 0.14,
  radius 24, elevation 16); grabber 36×5 radius 3 `border.strong` @80 %; centered 56 px icon badge;
  title `text.xl` bold; hint `text.base` muted lineHeight 20 max-width 300; full-width Done button
  (radius 15, paddingVertical 16).
- **Outcome grammar** (§12.3 color rules): submitted → green Check on success.soft + accent Done;
  UL self-test success → same green + accent; rejected → neutral X on bg.sunken + neutral Done
  (bg.sunken, fg.base label); expired/missing → neutral AlertTriangle; unknown → amber AlertTriangle on
  warning.soft + neutral Done. Red never used (reserved for money-loss).
- **Copy** (`connect.signHandoff`): "Signed" / "Cancelled" / "Check this in Vela Activity" / "This
  signing request expired" / "One-tap signing enabled" (+ hint "Signing in Safari will now open Vela
  directly…"); shared hint "Return to Safari — this page won't refresh"; CTA "Done".
- **Behavior**: success auto-dismisses after 2.6 s (+ success haptic); reject/expired/unknown persist
  until tapped. Subscribes to color scheme itself (renders outside the remounting Stack).

### 3.6 Web SDK popup (`app/web-request.tsx`) — popup-window route, not an in-app overlay
Functions as the connect/sign consent "dialog" for the web SDK (opened as a browser popup). Centered
card on `page` bg with identity row (Vela logo ⇄ Link2 accent mark ⇄ dApp logo/monogram). Phases:
`waiting` (spinner) → `onboarding` (inline OnboardingScreen with context header "Set up Vela to
continue") → `consent` (title "Connect with Vela", origin pill with ShieldCheck success.base, account
box with name + address, note "This site can view your wallet address and request signatures…",
primary Connect / secondary Cancel) → `unsupported-chain` (error icon, requested chainId, list of
available networks, Close) → `processing` / `done` / `error`. **Copy is hardcoded English** (not i18n)
— flagged in §11.

---

## 4. Funding / gas overlays

### 4.1 `BundlerFundingView` / `BundlerFundingModal` (`ui/BundlerFundingModal.tsx`)
The gas-account top-up surface — FALLBACK only (silent sponsorship happens invisibly first).
- **Render modes**: (a) content-swapped inside SigningRequestModal (`dappVariant`) — the BUG-1 rule;
  (b) standalone `<BundlerFundingModal>` in its own AppModal (comment says "used by the Send screen",
  but Send no longer imports it — see §11 open questions).
- **Shared header**: centered 44 px `accent.soft` circle with Fuel 22 accent icon; title `text.lg` bold
  "One quick step before you send"; network chip (`bg.sunken`, radius.full, ChainLogo 16 + `text.xs`
  semibold chain name).
- **Three internal modes**:
  1. **topup** — payment request layout: one honest status line (`text.sm` fg.muted; either the lead
     "Your transactions run on a small {SYM} fee reserve…" or a denial reason — 11 mapped denial keys:
     default / notRecognized / nonceExceeded / treasuryDepleted / balanceTooLow / rateLimited /
     pendingUnknown / serviceUnavailable / networkError / transferFailed); optional accent "Retry free
     top-up" row (RefreshCw 13 / spinner while "Requesting…"); **amount card** (VelaCard, centered:
     label `text.sm` subtle "Amount to add", fiat hero `text.xl` bold mono "≈ $x.xx", token line
     `text.sm` mono muted); **address card** (`bg.sunken`, radius.lg, 1 px border; uppercase `text.xs`
     label "Top-up address" + Copy 14 icon → accent Check when copied 2 s; mono `text.xs` full address,
     tap-to-copy = primary affordance); exchange hint "Withdrawing from an exchange? Choose the
     {network} network."; secondary VelaButton "Pay from another wallet" (EIP-681 deep link, native
     assets only); **collapsed QR** disclosure ("Show/Hide QR code", ChevronDown/Up 14) → white card
     (padding 8, radius.xl, shadow.sm) with 132 px QR of the BARE address; auto-check row ("Continues
     automatically once it arrives" + accent "Check now"/"Checking…"); collapsed "Where does this money
     go?" details paragraph; footer quiet cancel — "Not now" (Send) / **"Cancel this transaction"**
     (dApp variant).
  2. **confirming** — header + centered large accent spinner + "Your network fee is on its way —
     usually under a minute." + auto-check note + quiet cancel. NEVER styled as an error. Degrades to
     topup with `pendingUnknown` copy after 45 s.
  3. **funded** — header + 56 px `success.soft` circle with Check 28 success.base + "Network fee
     ready" (`text.lg` semibold) + accent "Continue". Auto-advances after 1.2 s (success haptic);
     the destination still requires explicit confirm/passkey.
- **Behavior**: balance polled every 5 s (confirming) / 10 s (topup); auto-retry of the free grant at
  30 s and 90 s for transient denials; `no_passkey_registered` additionally polls the wallet index
  (~3 min) and retries the instant the key resolves; dismiss (swipe) = cancel.

### 4.2 `TreasuryBootstrapSheet` (`ui/TreasuryBootstrapSheet.tsx`)
- **Trigger**: bundler treasury reports `bootstrapNeeded` on a network (relayer float below floor) at
  send/estimate time (`useSendController.maybeShowTreasuryBootstrap`).
- Full AppModal, standard header (§1.8) titled "Start this network's relayer".
- Body (scroll, paddingHorizontal `space.2xl`): centered network identity row (ChainLogo 26 + name
  `text.lg` bold + "· #chainId" `text.sm` mono subtle); lead paragraph centered muted; suggested amount
  block (label `text.xs` semibold subtle "Suggested top-up", value `~{amount} {SYM}` `text.2xl` bold
  numeric) — suggested = 2× floor − balance; **QR** of the bare treasury address (140 px on white card,
  1 px border, radius.lg); tap-to-copy address card (`bg.sunken`, radius.lg, border; label
  "Treasury · bundler operator", Copy→green Check 1.5 s, mono address, operator endpoint URL in
  `text.xs` mono subtle); **prominent disclaimer card** (`warning.soft` bg, radius.lg, AlertTriangle 18
  warning.base, `text.sm` semibold warning.base): "Non-refundable. This gas goes to the bundler
  operator (not Vela)…"; primary VelaButton "Copy address to fund" (→"Copied"), secondary
  "I've funded · Retry" (or "Close" when no retry handler).

---

## 5. Pickers (sheet-presented)

### 5.1 `CurrencySheet` (`ui/CurrencySheet.tsx`)
- **Triggers**: Settings display-currency row; payroll "Priced in" picker (custom `title` prop so a
  scoped picker doesn't read as the global setting).
- Full AppModal. Centered title `text.xl` bold ("Display currency" default). Search box: `bg.sunken`
  pill (radius.full), Search 18 subtle icon + `text.lg` medium input + clear X when non-empty.
- Rows (LEGACY card style, §1.9): `bg.raised` card radius.xl, 1.5 px transparent border →
  `accent.base` when selected; 40 px `bg.sunken` circle with currency symbol (`text.lg` bold), code
  `text.lg` semibold + name `text.sm` muted, trailing accent Check 20/2.6. List gap `space.md`.
- States: instant cached list → refreshed full list; auto-scrolls to current selection on open; empty
  search → centered "No currency matches "{q}"." Tap = select + close.

### 5.2 `NetworkFilterSheet` + `NetworkFilterButton` (`ui/NetworkFilterSheet.tsx`)
- **Trigger**: the network-filter chip (Home nav row, activity, holdings): `bg.sunken` pill radius.full
  (max-width 150) showing 3 stacked 20 px chain logos + "All" + ChevronDown, or the selected chain's
  logo + name + separate 20 px ✕ clear button (sibling, never nested).
- Sheet: standard header (title "Select Chain", right 34×34 search toggle Search⇄X). Optional search
  input (`bg.raised`, 1 px border, radius.lg, autoFocus).
- Rows (LEGACY card style): "All Networks" row (40 px `bg.sunken` circle + Globe 20) with sub "Show
  every chain", then one row per network (ChainLogo 40, name `text.lg` semibold, optional caller-supplied
  subtitle e.g. per-chain value). Selected = accent border + Check. Single-select; tap applies + closes.

### 5.3 Token picker in Receive (`components/ReceiveRequestControls.tsx`)
- AppModal wrapping the shared `TokenSelector` (search + category chips Stable/Gas/Other + network
  filter + TokenRow list + "add token" affordance) with sheet title "Select token". `hideTotals`.
- Note: in the SEND flow `TokenSelector` renders **inline as step 1 of the screen**, not in a modal.
  Its "add token" affordance opens `AddTokenSheet` (§5.4) — a sheet stacked from a *screen* (allowed);
  from the Receive picker modal it opens within that modal context.

### 5.4 `AddTokenSheet` (`ui/AddTokenSheet.tsx`)
- AppModal wrapper around `AddTokenPanel` (the same panel as the full-screen AddToken route).
  Standard header (§1.8) with title "Add token" (i18n `addToken.navTitle`), 34×34 X (18 px icon).
  Panel: paste-address form with on-chain metadata lookup, network select, add/remove — the panel is
  shared, so the sheet is purely the presentation wrapper. Fires `onChanged` for host refresh.

### 5.5 `ContactPicker` (`components/contacts/ContactPicker.tsx`)
- **Trigger**: recipient field on Send (and anywhere a recipient is chosen).
- Full AppModal, hosts its own IdenticonViewerProvider (§1.7-2). Quiet de-boxed rows (design-language
  rules 1/6/8 explicitly cited in source): 40 px avatars, hairline dividers inset past the avatar,
  section labels (FAVORITES / GROUPS / CONTACTS / RECENT), search field, optional quiet "Scan QR" row
  (ScanLine icon) that closes and hands off to the scanner, optional "add contact" empty-state action.
- Typed/pasted fresh address → direct "use this address" row (+ offer to save). Pick = fill + close.

### 5.6 `ContactsManager` (`components/contacts/ContactsManager.tsx`)
- **Trigger**: Settings → Contacts.
- ONE AppModal, three swapped views (§1.7-1): searchable list (search behind header icon; segmented
  [All | Favorites] via `SegmentedToggle` once favorites exist; group rows; import/export rows) ⇄
  add/edit contact form (name + address, auto identity enrichment ENS/Basename/passkey, favorite
  toggle, delete via destructive `showAlert`) ⇄ group editor. Back = ChevronLeft in-header.

### 5.7 `BatchImportSheet` (`components/send/BatchImportSheet.tsx`)
- **Trigger**: Send → split mode → "import table" (payroll batch).
- Full AppModal. Paste-or-upload table of (address, amount); SegmentedToggle fiat⇄token unit; editable
  exchange-rate row (rate string IS the applied rate); currency choice opens a **nested `CurrencySheet`**
  (scoped title "Priced in"); parse-error and per-row validation states (AlertCircle rows); preview list
  with ContactAvatar + RecipientTypeBadge; template CSV download; apply hands `RecipientDraft[]` back to
  the split editor. (Second-level sheet: CurrencySheet stacks over this AppModal — works because on
  native it opens after this sheet's own content, on web by insertion order; kept sibling-safe.)

### 5.8 `AccountSwitcherModal` (`ui/AccountSwitcherModal.tsx`)
- **Triggers**: Home avatar, Assets, Settings ("create actions" variant), in-app browser account button
  (footer variant).
- Full AppModal. Header: left-aligned title `text.xl` bold + optional subtitle (formatted total +
  count, `text.sm` subtle) + small spinner while balances load + right X 22.
- List: SectionLabel, then de-boxed account rows: `WalletAvatar` 40 (enlargeable → identicon viewer),
  name `text.base` semibold (**accent color when active**), short address `text.sm` mono subtle,
  right = fiat balance `text.sm` semibold muted (masked "••••" under balance privacy) + accent Check 18
  when active. Hairline divider inset 40+8. Rows sorted by balance.
- Variants: `showCreateActions` → VelaButton "Create new" + secondary "Sign in existing" (Settings);
  `footer` slot (browser: Disconnect row in error.base + hairline + "Close page" row).
- Behavior: tap = SWITCH_ACCOUNT + success haptic + optional `onSwitch` + close.

### 5.9 `BrowserHistorySheet` (`ui/BrowserHistorySheet.tsx`)
- **Trigger**: clock icon in the in-app browser / Connections tab ("Recent").
- AppModal, `maxHeight 460` (content-hugging on web). Header: title "Recent dApps" (`text.lg` 700) +
  right "Clear all" (error.base `text.sm` 600 → destructive `showAlert` confirm "Clear history?").
- Rows: favicon 28 radius 8 (Globe-in-sunken fallback), host `text.sm` 600 + optional page title 12 px
  muted, trailing per-row ✕ 16 subtle delete. Hairline top-dividers between rows. Empty: centered
  "No recent dApps yet". Tap = reopen dApp (host closes sheet + navigates).

---

## 6. Detail / explainer sheets

### 6.1 `TransactionDetailSheet` (`ui/TransactionDetailSheet.tsx`)
- **Trigger**: tap an Activity row (single tx) or a batch (split/sweep) row.
- Full AppModal, de-boxed: open hero amount (`AmountText`) + counterparty (ContactAvatar,
  RecipientName, RecipientTypeBadge) + SectionLabel'd detail rows split by hairline `Divider`
  (`DetailRow`): date, status (`TxStatusBadge`), from/to (mono, copy w/ 1.5 s check, explorer open),
  operation, chain (ChainLogo 18 + name), hash (explorer link). Batch variant renders a per-recipient
  breakdown with the split total. Rows with no data are hidden.
- **Live status convergence**: while open and status = pending it polls the bundler receipt (≤40
  attempts), updates the badge live, persists, and fires `onResolved` so the feed agrees.

### 6.2 `ConnectionEventDetailSheet` (`ui/ConnectionEventDetailSheet.tsx`)
- **Trigger**: tap a Connections-panel record with NO captured request (legacy records; otherwise
  SigningReplaySheet).
- Full AppModal, standard header with operation title. IA top→bottom: identity hero (44 px accent.soft
  circle with kind icon — Link2 connect / PenLine message / FileText typed / ArrowLeftRight tx; title;
  Globe 13 + dApp origin; right-aligned amount `text.lg` bold display-font); off-chain note for
  signatures; persisted **BalanceChangePreview** ("what moved" as approved); **signed-content code
  block** — `bg.sunken` radius.lg, mono `text.sm`, inner scroll max 220, floating copy button
  (Check success.base 1.5 s); metadata trail as hairline DetailRows (app, date, status badge,
  operation, chain, from/to, value, hash + explorer).

### 6.3 `BalanceDetailSheet` (`ui/BalanceDetailSheet.tsx`)
- **Trigger**: tapping the hero's "total is an estimate" warning line on Home.
- Full AppModal, standard header "Balance details". Two open sections:
  1. NETWORKS STILL UPDATING — per failed chain: ChainLogo 36, name, status line (`text.sm`:
     warning.base "failed" vs fg.muted "retrying" for rate-limited), trailing accent "Fix" ONLY for
     genuinely-failed chains; hairline dividers inset 36+12; accent RefreshCw retry row.
  2. TOKENS WITHOUT A PRICE — TokenRow list (usdValue = "No price"), dividers inset past 40 px logo.
- **In-place swap**: "Fix" swaps the whole sheet content to `RpcFixForm` (§6.4) — never a second modal.
- Auto-closes when everything it explains has recovered (guarded not to fire mid-fix). Empty state:
  "Everything's up to date."

### 6.4 `RpcFixForm` / `RpcFixModal` (`ui/RpcTroubleBanner.tsx`)
- Form body renders either inside its own AppModal (`RpcFixModal`, opened from the RpcTroubleBanner
  chips — parent-owned single instance) or swapped into BalanceDetailSheet.
- Layout: header row title "Fix RPC" + X 22 with hairline bottom border; chain identity (ChainLogo 32 +
  name + "Chain ID"); warning card (`warning.soft`, 1 px `warning.border`, Wifi 14 `#C07A0A`); uppercase
  field label; URL input (`bg.sunken`, border, radius.lg, autoFocus); accent save button (disabled 0.5
  opacity, spinner while validating); provider chips (Alchemy/QuickNode/dRPC/Chainlist — `bg.sunken`
  pills with ExternalLink 12); footer accent "report this" row.
- Validation: probes `eth_chainId` before saving; unreachable / wrong-chain → `showAlert` errors;
  preserves saved explorer/bundler overrides.

### 6.5 `IdenticonViewerSheet` + `IdenticonViewerProvider` (`ui/IdenticonViewer*.tsx`)
- **Trigger**: tap any enlargeable avatar (Home account, switcher rows, contacts, recipient picker) →
  `useIdenticonViewer()(name, address)` (no-op for non-addresses).
- AppModal (content-height on web; native pageSheet), standard header "Identicon".
- Body centered: identicon at min(56 % width, 220 px) inside a hairline ring (+12 px, `bg.raised`,
  1 px border); name `text.2xl` bold; caption `text.sm` muted ("A visual fingerprint of this
  address…"); tap-to-copy row (`bg.sunken` radius.lg): Copy 15 subtle + mono `text.base` address ⇄
  Check 15 success + semibold success "Copied" (2 s, success haptic).
- Provider mounting rules are stacking-critical (§1.7-2/3): app-root instance mounts on open, appends
  last (top-most on web), delayed unmount 320 ms; re-hosted instances live inside AccountSwitcherModal
  and ContactPicker for iOS.

---

## 7. Settings & onboarding modals (all standard AppModal sheets)

### 7.1 In `screens/settings/SettingsScreen.tsx`
- **NetworkEditorModal** — "Network settings": scroll of per-network `NetworkConfigCard`s (chain header,
  fields RPC URL / Explorer (/ Bundler), health badges — colored dot + label: green ok / amber invalid /
  red offline or not-HTTPS, save/delete). Modal title `modalTitle`; remove = destructive `showAlert`.
- **EndpointEditorModal** — "Service endpoints": description, 4 endpoint fields (chain-data index,
  passkey index, bundler service, fiat rates) each with `ServiceHealthBadge`, reset-to-defaults row.
- **FormatPickerModal** (generic) — number / date / time format pickers chosen by live example rows;
  radio-style selected accent check; title + subtitle.
- **AddNetworkModal** — add custom network by chainId/RPC: states searching → checkingCompatibility →
  result card (name, chainId, native symbol, testnet tag) → custom-RPC entry → error; reset on close.
- **RpcProvidersModal** (`RpcProvidersModal.tsx`) — one API key per provider (Alchemy / dRPC / Ankr):
  masked key input (Eye/EyeOff), per-provider expandable VelaCard, "test" probes every supported
  network's `eth_chainId` with latency badges (fast <300 ms / ok <800 ms / slow, red fail), external
  provider links.
- Also opened from Settings: `AccountSwitcherModal` (showCreateActions), `CurrencySheet`,
  `ContactsManager`, `BugReportModal`.

### 7.2 `BugReportModal` (`ui/BugReportModal.tsx`)
- **Triggers**: Settings "Feedback" row; error-context entry points (`prefillWhat` seeds the field,
  e.g. sync failure on CreateWalletScreen).
- ONE AppModal, three swapped contents:
  1. **Compose**: title "Report a problem" `text.lg` bold + subtitle "Tell us what went wrong."
     `text.sm` muted; auto-grow description input (`bg.sunken`, 1 px border, radius.lg, min-height
     120/160 by screen height) with placeholder "e.g. I tapped Send and the screen froze."; quiet
     "+ Add steps to reproduce" disclosure → second input (min 96, autoFocus); accent "Send report"
     (disabled until text; loading "Sending…"); consent line `text.xs` subtle "Only what you see is
     sent — never keys, seed phrase, or balances."; collapsed "What will be sent" preview
     (Chevron toggle → `bg.sunken` `text.xs` scrubbed diagnostics); underlined footer link
     "Prefer GitHub? Open the issue form →". No Cancel — sheet dismisses via drag/backdrop/X.
  2. **Success**: "Thanks — reported!" + issue number (new vs deduped copy), secondary "View report",
     accent "Done". Success haptic.
  3. **Fallback** (backend down): "Open on GitHub instead" + prefilled-form explanation, accent
     "Open GitHub form", secondary "Cancel". User input is never lost.

### 7.3 `OnboardingSettingsModal` (`screens/onboarding/WelcomeScreen.tsx`)
- **Trigger**: gear on the Welcome/onboarding screen; auto-opens with a warning banner when the passkey
  index endpoint is unreachable.
- AppModal: header (title + RefreshCw 18 + X 22); optional warning banner (AlertTriangle 18 accent);
  APPEARANCE section — three theme chips Light/Dark/Auto (icon + label, active = accent icon/border);
  PASSKEY INDEX section — hint, URL field with live `HealthDot`, save-on-blur, "Reset to default";
  `__DEV__` extra: "Simulate failure" button.

---

## 8. In-app browser overlays (`app/browser.tsx`)

### 8.1 Connect-consent sheet — the ONLY `fit` AppModal in the app
- **Trigger**: dApp calls `eth_requestAccounts` (or first state method needing a grant) with no stored
  grant for the origin.
- `AppModal fit` (§1.3): content-height card over dimmed backdrop; on Android a full pageSheet used to
  cover the page entirely — the fit sheet is the deliberate fix.
- Content (padding 16/8/12, gap 8): dApp logo 44×44 radius 12 (captured favicon → site /favicon.ico →
  Globe-in-raised fallback); title "Connect to {host}" `text.lg` 700; body `text.sm` muted lineHeight
  20 "This site wants to see your address and ask you to sign. It can't move funds without your
  approval."; account row (name 600 + tabular short address, hairline top border); actions row:
  secondary "Cancel" + accent "Connect" (flex 1 each, gap 8).
- Dismiss (backdrop tap / drag / Cancel) = reject the pending request. Approving writes the grant AND
  a `connect` activity record. Merge rule: a second request while the sheet is open merges into the
  same consent (never a second sheet).

### 8.2 Load-error overlay
- In-screen absolute-fill over the WebView (`bg.base`, centered): TriangleAlert 28 subtle, title
  "Couldn't load this page" `text.base` 600, error body `text.sm` muted (2 lines), secondary VelaButton
  "Try again" (min-width 140). Cleared by reload.

### 8.3 Loading bar
- 2 px `accent.base` progress strip under the top bar while the page loads (not an overlay per se, but
  the browser's loading affordance).

### 8.4 Browser-hosted instances of shared overlays
- `AccountSwitcherModal` with Disconnect/Close-page footer (§5.8); `BrowserHistorySheet` (§5.9);
  destructive `showAlert` "Disconnect this site?"; the global `SigningRequestModal` renders ABOVE the
  browser (mounted at root).

---

## 9. Non-modal overlays: toasts, banners, badges, gates

### 9.1 `ReceiptToast` (`screens/wallet/ReceiptToast.tsx` + HomeScreen.styles)
- **Trigger**: incoming funds detected while Home is visible ("money in" cue).
- Absolute, top-centered at `safeTop + 8`, zIndex 50, `pointerEvents:none` (purely informational,
  no tap, no manual dismiss — host controls lifetime).
- Pill: `success.base` bg, radius.full, padding 8×16, `shadow.lg`; 8 px `fg.inverse` dot + text
  `text.lg` bold `fg.inverse`: "{amount} {token} received".
- Entrance: 320 ms fade + slide down from −24 (Easing.out(quad)).

### 9.2 `RpcTroubleBanner` (`ui/RpcTroubleBanner.tsx`)
- **Trigger**: one or more chains with ALL RPC endpoints failing (NOT rate-limit — 429 is transient and
  deliberately shows no banner). Rendered from Home's header area, inline (pushes content).
- Card: `warning.soft` bg, 1 px `warning.border`, radius.lg, padding 12; AlertTriangle 14 `#C07A0A`;
  headline `text.sm` semibold warning.base ("{name} RPC unavailable" / count variant); one chip row per
  chain: ChainLogo 16 + name + accent "Fix" link → opens `RpcFixModal` (§6.4).
- Entrance fadeInDown 300 ms, plays once (hasEntered ref — design-language rule 10).

### 9.3 `ParallelSpaceBadge` (`components/dev/ParallelSpaceBadge.tsx`)
- Persistent app-wide pill at `safeTop + 6` whenever the parallel-space test env is active (fixed
  passkey). FlaskConical icon + "PARALLEL SPACE". Wrapper `pointerEvents:box-none`; tapping opens
  `/parallel`. Renders null outside the mode. Exists so test/real spaces can never be confused.

### 9.4 Copy-feedback pattern (`hooks/use-copy-feedback.ts`)
- Not a toast: copying swaps the Copy icon for a Check (success.base or accent per surface) and/or the
  label for "Copied" for 1.5–2 s in place. Used by funding sheet, treasury sheet, identicon viewer,
  detail sheets, receive, settings. Haptic chosen per call site (light vs success).

### 9.5 Receive warning gate (`screens/wallet/ReceiveScreen.tsx`)
- In-screen absolute overlay covering the QR card (zIndex 10, `bg.base` — deliberately page-colored and
  light, not a heavy card) until first acknowledgement: ShieldAlert 28 warning.base, title, body,
  reassurance line, VelaButton confirm. While the flag loads (null) the overlay covers with no content
  (prevents QR flash). Acknowledge persists; gate never re-shows.

### 9.6 `AnimatedSplashOverlay` (`components/animated-icon.tsx` / `.web.tsx`)
- One-shot launch overlay: brand mark scales from (screenH/90)× down to 1× while fading out, 600 ms
  keyframe, elastic-0.7 easing tail; unmounts itself when finished. The only place >500 ms animation is
  allowed (DESIGN_SYSTEM rule 7.1).

### 9.7 Loading overlays
- No global loading modal exists. Full-screen waits are in-route centered spinners (`app/parallel/index.tsx`,
  browser "Preparing wallet…", web-request `waiting`). In-sheet waits are inline ActivityIndicators
  (funding confirming, switcher balances, RPC probes). Buttons carry their own loading state
  (VelaButton spinner; SlideToConfirm loading).

---

## 10. QR scanner overlay (`components/QRScanner.tsx`)

- **Triggers**: Send recipient scan, Connect (WalletPair) scan, ContactPicker scan row, contact form.
- **Presentation**: own full-screen RN `<Modal animationType="slide">`; native adds
  `statusBarTranslucent` + light-content translucent StatusBar; web uses `transparent` Modal. Black
  (`#000`) full-bleed camera stage; own GestureHandlerRootView.
- **Chrome (over camera)**:
  - Header overlay (absolute top, padding to safe inset, zIndex 10): 44×44 plain icon buttons — left X
    (white, 22/2.5); centered title "Scan QR" `text.lg` bold white; right group: torch (Flashlight 20 —
    active state = white filled circle + black icon), image-upload (ImagePlus 20), camera-flip
    (SwitchCamera 20, native only).
  - Center scan frame: 240×240; four white corner brackets 28×28, 3 px stroke, 12 px corner radius;
    native-only animated scan line (2 px, `rgba(255,255,255,0.6)`, 2 s ease in-out, up-down loop,
    inset 8).
  - Footer overlay (absolute bottom, safe inset): native-only zoom slider (track 3 px
    `rgba(255,255,255,0.28)`, white fill, 20 px white thumb w/ shadow, max-width 320) + hint
    "Point camera at a QR code" `text.sm` medium `rgba(255,255,255,0.7)`.
- **States**: permission-denied → centered Camera icon + explanation + accent "Grant Permission" button
  (radius.xl, accent bg); scanning; scanned (decode paused, success haptic, host closes); web camera
  fallback (zbar-WASM → jsQR); upload-decode errors via `showAlert` ("No QR Found" / "Error").
- **Dismissal**: X or hardware back (`onRequestClose`). No swipe-dismiss.
- Zoom: 0–1 intent, pinch + slider + auto-hunt on native; web has NO zoom UI (decoder center-crop
  far-reach instead).

---

## 11. Conflicts, drift and notes for the Penpot rebuild

1. **DESIGN_SYSTEM.md vs DESIGN-LANGUAGE.md**: modal presentation guidance agrees ("pageSheet on
   native, portal slide-up on web"). But DESIGN_SYSTEM's card-heavy §6.5 ("Confirmation Cards =
   VelaCard elevated") is superseded — current sheets use open hairline rows. Two picker generations
   coexist in shipped code (§1.9): **CurrencySheet + NetworkFilterSheet still use the legacy
   bordered-card row** (raised card, 1.5 px accent border on selection) while newer sheets are de-boxed.
   Decide in Penpot: either document both variants or mark the card rows for migration.
2. **BundlerFundingModal standalone wrapper is likely dead code**: its comment says "used by the Send
   screen", but `send-tempo-gate.test.ts` asserts SendScreen does NOT contain it, and the only live
   render path is the SigningRequestModal content swap. Treasury bootstrap replaced it in Send.
3. **AppAlert is unthemed on native** (system Alert.alert) — the styled dialog spec (§2) applies to web
   only. A Penpot board should carry both: system-alert placeholder (native) + styled card (web).
4. **web-request.tsx copy is hardcoded English** (not i18n) — flag for localization before it's treated
   as canonical copy.
5. **QRScanner uses raw white/black hex** (deliberate: camera chrome) — exempt from the tokens-only
   rule; QR cards inside funding/treasury sheets also pin `#FFFFFF` behind QR codes in both themes
   (scannability).
6. **RpcTroubleBanner + RpcFixForm use raw `#C07A0A`** for the amber icon instead of `warning.base` —
   minor token drift.
7. **ExtensionSignController sheet uses `bg.raised` + radius 24 + heavy shadow**, unlike AppModal's
   `bg.base` + radius 20 — an intentional "system sheet" look, but it's a second bottom-sheet recipe;
   note as a variant.
8. **Dismissal thresholds differ**: native drag 90 px / web 80 px (both vy 0.5). Encode 90 as canonical.
9. **Toast has no queue/stack system** — ReceiptToast is the only toast; error/success feedback
   elsewhere is inline cards, alerts, or haptics. Don't invent a snackbar system in Penpot.
10. **Keyboard avoidance inside sheets**: `KeyboardAvoidingView behavior="padding"` on BOTH platforms
    (per the app's modal keyboard pattern).
11. **Every sheet must work in light AND dark** — all surfaces above are token-driven except the noted
    hex pins.

---

## 12. Penpot board checklist (one board per overlay per state)

| Overlay | States to board |
|---|---|
| AppModal shell | iOS pageSheet, Android sheet (rest + dragged), fit sheet, web sheet (rest + backdrop) |
| AppAlert (web) | 1-button, 2-button w/ cancel+primary, destructive; native = OS placeholder |
| SigningSheet | loading, clear-signed, approval editor (unchosen/chosen/revoke), permit, batch (needs-choice/ready), personal_sign, SIWE-mismatch, eth_sign danger, blind typed, blind tx, sim-fail warning, gas-estimate-failed, signing, submitted-pending, error, read-only replay (settled + in-flight) |
| BundlerFundingView | topup (lead), topup (each of 11 denial lines is copy-only — board 3: retryable, non-retryable, pending-unknown), topup + QR expanded, topup + details expanded, confirming, funded; dApp-variant cancel copy |
| TreasuryBootstrapSheet | default, copied, no-retry variant |
| ExtensionSignController | signed, rejected, pending-unknown, expired, one-tap-enabled |
| web-request card | waiting, onboarding, consent, unsupported-chain, error, processing, done |
| CurrencySheet | default (selected in view), searching, empty |
| NetworkFilterSheet | default, searching, w/ subtitles; trigger chip (all vs selected) |
| TokenSelector-in-modal | default, searching, category filtered, multi-select, empty |
| AddTokenSheet | form, resolving, resolved, error |
| ContactPicker | default, searching, typed-address, groups, empty |
| ContactsManager | list, list-searching, segmented-favorites, form (add/edit), group editor |
| BatchImportSheet | paste, parsed preview, row errors, rate editing, nested currency picker |
| AccountSwitcherModal | loading, loaded, active-row, privacy-masked, create-actions, browser-footer |
| BrowserHistorySheet | empty, populated, clear-all alert |
| TransactionDetailSheet | pending (live-polling), confirmed, failed, batch breakdown |
| ConnectionEventDetailSheet | connect, message, typed, tx (+sim preview), content-missing |
| BalanceDetailSheet | networks-only, tokens-only, both, rate-limited row, fix-form swap, empty |
| RpcFixForm/Modal | empty, prefilled, saving, error alerts |
| IdenticonViewerSheet | default, copied |
| Settings modals | network editor, endpoint editor (+health badges), format picker, add network (4 states), RPC providers (idle/testing/results) |
| OnboardingSettingsModal | normal, unreachable-warning, dev |
| BugReportModal | compose, compose+steps, compose+preview, sending, success (new/deduped), fallback |
| Browser consent (fit) | favicon, fallback-logo |
| Browser error overlay | default |
| QRScanner | scanning (native w/ zoom+scanline, web), torch-on, permission |
| ReceiptToast / RpcTroubleBanner / ParallelSpaceBadge / Receive gate / Splash | single boards |
