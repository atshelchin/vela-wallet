# 04 — Information Architecture & Navigation Map (Vela Wallet)

Source of truth: `src/app/` (expo-router v5 file-based routing, typed routes enabled), `src/screens/`, `app.json`, `ios/VelaWallet/VelaWallet.entitlements`.
Purpose: the IA/navigation-map page for the Penpot design source-of-truth. Everything a re-implementation (SvelteKit / GPUI / native iOS / native Android) needs to rebuild the navigation skeleton, screen inventory, presentation styles, deep links, and flow arrows.

---

## 1. Route inventory (complete — every file route)

expo-router maps `src/app/**` files to URL routes 1:1. There are **no dynamic `[param]` routes** in this app — all parameterization is via query params. Routes marked "auto-registered" have no `<Stack.Screen>` entry in the root layout and therefore get the **default card (push) presentation**.

| Route (URL) | File | Presentation | Access gate | Screen component |
|---|---|---|---|---|
| `/` | `src/app/index.tsx` | Redirect-only (spinner while wallet state loads) | — | redirects → `/(tabs)/wallet` if a wallet exists, else `/onboarding` |
| `/(tabs)` group | `src/app/(tabs)/_layout.tsx` | Tabs navigator, **tab bar hidden** (`tabBarStyle: {display:'none'}`), no headers | — | — |
| `/wallet` | `src/app/(tabs)/wallet.tsx` | Tab (the only screen most users ever see behind overlays) | — | `screens/wallet/HomeScreen` |
| `/connect` | `src/app/(tabs)/connect.tsx` | Tab (reachable only by URL/deep link — **no in-app navigation targets it**; legacy/deep-link surface) | wallet must exist (shows "no wallet" empty state otherwise) | `screens/connect/ConnectScreen` |
| `/settings` | `src/app/(tabs)/settings.tsx` | Tab; opened from Home header gear via `router.navigate('/settings')` | — | `screens/settings/SettingsScreen` |
| `/onboarding` | `src/app/onboarding.tsx` | Plain stack screen (full-screen, no modal) | — | `screens/onboarding/OnboardingScreen` |
| `/send` | `src/app/send.tsx` | **modal** (`presentation: 'modal'`) | — | `screens/wallet/SendScreen` |
| `/receive` | `src/app/receive.tsx` | **modal** | — | `screens/wallet/ReceiveScreen` |
| `/token-detail` | `src/app/token-detail.tsx` | **modal**; params: `symbol, network, balance, priceUsd, tokenAddress, …` (query) | — | `screens/wallet/TokenDetailScreen` |
| `/add-token` | `src/app/add-token.tsx` | **modal** | — | `screens/wallet/AddTokenScreen` |
| `/about` | `src/app/about.tsx` | **modal** | — | `screens/settings/AboutScreen` |
| `/safari-extension` | `src/app/safari-extension.tsx` | **modal**; row only shown on iOS | — | `screens/settings/SafariExtensionScreen` |
| `/history` | **NO FILE** | registered `<Stack.Screen name="history" options={{presentation:'modal'}}/>` in root layout but the route file does not exist | — | **DEAD REGISTRATION — flag: leftover from the removed History screen (History merged into Home's Activity tab)** |
| `/sign` | `src/app/sign.tsx` | **Trampoline, deliberately NOT modal** (a modal presentation here hides the global signing sheet — device-verified regression). Renders one frame of app background, hands `rid` to the root `ExtensionSignController`, then `router.back()` (or `replace('/')`) | — | (no visible screen) |
| `/web-request` | `src/app/web-request.tsx` | Plain stack screen; **web-only in practice** (opened as a browser popup window by the Vela Web SDK; `?session=` param; MessageChannel handshake; closes itself via `window.close()`) | — | inline `WebRequestScreen` (phases: waiting / onboarding / consent / unsupported-chain / processing / done / error) |
| `/browser` | `src/app/browser.tsx` | Auto-registered → default **push** (deliberately non-modal so the global SigningRequestModal renders above it); param `?url=` (re-validated http(s) only); full-screen in-app dApp browser; native-only (web shows `connect.browser.unsupported` fallback) | — | inline `BrowserScreen` |
| `/pay` | `src/app/pay.tsx` | Auto-registered → default **push**. Public payment-link bridge; params `to, chain, token, amount, sym, dec, net`. Invalid params → invalid-link state | — | `screens/wallet/PayScreen` |
| `/clear-signing-test` | `src/app/clear-signing-test.tsx` | Auto-registered → default **push** | `__DEV__` OR `dev_unlocked` AsyncStorage flag; else `<Redirect href="/(tabs)/wallet"/>` | `screens/settings/ClearSigningTestScreen` |
| `/receipt-harness` | `src/app/receipt-harness.tsx` | Auto-registered → default **push**; not linked from any UI (URL/deep-link only) | `__DEV__` OR `dev_unlocked`; else redirect to wallet | `screens/dev/ReceiptHarnessScreen` |
| `/parallel` group | `src/app/parallel/_layout.tsx` | Stack, headerless. Registered in root Stack **only when `__DEV__`**, but the layout itself allows prod entry when `dev_unlocked === '1'` (else redirect to wallet). Entering arms the fixed-key fixture signer + loads fixture wallet; app-wide PARALLEL SPACE badge turns on | `__DEV__` or `dev_unlocked` | — |
| `/parallel` (index) | `src/app/parallel/index.tsx` | Transient loader (mirrors splash), then `<Redirect href="/(tabs)/wallet"/>` — the parallel space **reuses every real screen** | as above | — |
| `/parallel/connect` | `src/app/parallel/connect.tsx` | Re-export of the real `ConnectScreen`, running in the parallel space (paste the e2e relay's connect URL) | as above | `screens/connect/ConnectScreen` |
| `+html` | `src/app/+html.tsx` | Not a route — web HTML shell wrapper | — | — |

**Root layout stack registration order** (`src/app/_layout.tsx`): `(tabs)`, `onboarding`, `send`(modal), `receive`(modal), `token-detail`(modal), `add-token`(modal), `history`(modal, dead), `about`(modal), `safari-extension`(modal), `sign`(plain), `web-request`(plain), `parallel`(dev-only). `unstable_settings.initialRouteName = '(tabs)'` — the wallet home is the **navigation anchor**: any deep link (e.g. `/sign`) pushes ON TOP of the wallet, so dismissing an overlay always lands on Home, never a dead end, on both cold and warm launch.

**Headers:** every navigator sets `headerShown: false`. All navigation chrome is screen-owned (see §7).

**Theme/language remount:** the root `<Stack>` is keyed on `` `${resolvedTheme}-${language}` `` — switching theme or language remounts the whole navigation tree in place (instant, no restart).

---

## 2. Tab structure — the real one vs. the visible one

- The `(tabs)` Tabs navigator exists **only to keep `/wallet`, `/connect`, `/settings` URLs and deep links resolving**. Its bar is hidden. There is **no bottom tab bar anywhere in the app**.
- The *visible* top-level switcher is an **in-screen `SegmentedToggle` on Home**: `[ Activity | Assets | Connections ]` (Connections shows a badge dot when a dApp session is live). This is home-screen state, not routing — the URL stays `/wallet`.
- The *visible* bottom bar is the **WaveDock** (Home only): full-bleed bar on `bg.raised` with 1px top hairline, `DOCK_BAR_HEIGHT = 86` above safe-area inset. Three actions: **Receive** (neutral pill, ArrowDownLeft), **Scan** (circular 56px FAB, centered, overlapping the bar's top edge by half — focal point, ScanLine icon), **Send** (accent pill, ArrowUpRight — the single accent action because it moves money).
- Settings and Connect present as **full pages with their own X close** (top-right) that `router.navigate('/wallet')` — they behave like peers of Home, not stacked children.

---

## 3. Deep links & inbound URLs (complete)

Scheme: **`velawallet://`** (`app.json` → `"scheme": "velawallet"`). expo-router maps `velawallet://<path>` onto the same route table, so *every* route above is scheme-reachable. Specific, purposeful entry points:

1. **`velawallet://sign?rid=<uuid>`** — Safari Web Extension → app sign hand-off. Hits the `/sign` trampoline; the request id goes to `ExtensionSignController`; the signing sheet + result render as overlays over whatever screen was open.
2. **`https://getvela.app/sign?rid=<uuid>`** — Universal Link (iOS `applinks:getvela.app` entitlement). **NOT routed by expo-router** (the domain is not a router prefix): `AccountFileWriter` listens for the launch URL, matches `^https://getvela\.app/sign(…)$`, drives the same sign bus, and marks "UL verified" so the extension can switch from the scheme to the UL. `rid=ul-selftest` is an attestation probe, not a real sign.
3. **`velawallet://browser?url=<https-url>`** — opens the in-app dApp browser; the `url` param is re-validated as http(s) (never `file:`/`javascript:`).
4. **Payment links** — `https://wallet.getvela.app/pay?to&chain&token&amount&sym&dec&net` (native fallback base) or `<current-origin>/pay?…` on web/self-hosted. Generated by Receive's "payment request" mode (`buildPayLink`); the marketing site (`getvela.app/pay`, SvelteKit) hosts the public bridge page. In-app `/pay` renders the same bridge.
5. **`velawallet://onboarding?mode=create`** — jumps straight to the create-wallet form (any other/absent mode value lands on Welcome).
6. **EIP-681 URIs (`ethereum:…`)** — not an OS-registered scheme for this app; consumed via the QR scanner and pasted text, routed to `/send` prefilled+locked. Pay page's "open in wallet app" button emits a raw EIP-681 URI for *other* wallets.
7. **`velawallet://parallel/connect`** — e2e/dev entry into the parallel-space Connect screen (used by Safari-extension concurrency checks; cold + warm launch verified).
8. **`velawallet://expo-development-client/...`** — Expo dev-client launcher only (dev builds).
9. **Vela Web popup** — `/web-request?session=<id>` opened as a browser popup by the HTTPS dApp SDK (web deployment only); origin-checked MessageChannel handshake.

Android: scheme via manifest (no custom `intentFilters` in `app.json`); no Android App Links configured (flag: UL parity gap with iOS).

---

## 4. Navigation topology (ASCII)

```
ROOT STACK  (headerless; anchor = (tabs); keyed remount on theme/language)
│
├── (tabs)  — Tabs navigator, BAR HIDDEN
│   ├── /wallet  ◄── HOME & universal anchor  [HomeScreen]
│   │     in-screen SegmentedToggle: Activity | Assets | Connections
│   │     bottom WaveDock: Receive · Scan(FAB) · Send
│   ├── /connect   [ConnectScreen]  (deep-link/URL only; X → /wallet)
│   └── /settings  [SettingsScreen] (from Home gear; X → /wallet)
│
├── /onboarding  (plain)   [OnboardingScreen: welcome ⇄ create steps]
│
├── MODALS (slide-up card over anchor)
│   ├── /send          [SendScreen: select-token → enter-details → confirm → receipt]
│   ├── /receive       [ReceiveScreen: Address | Payment-request toggle]
│   ├── /token-detail  [TokenDetailScreen]
│   ├── /add-token     [AddTokenScreen]
│   ├── /about         [AboutScreen  · 6-tap logo → dev_unlocked]
│   ├── /safari-extension [SafariExtensionScreen · iOS only]
│   └── /history       ← registered, NO FILE (dead)
│
├── PUSH (default card, auto-registered)
│   ├── /browser?url=  [in-app dApp browser · native only]
│   ├── /pay?to&chain… [payment-link bridge]
│   ├── /clear-signing-test   (dev-gated)
│   └── /receipt-harness      (dev-gated, URL-only)
│
├── TRAMPOLINES / HEADLESS
│   ├── /sign?rid=      → ExtensionSignController overlay, then back()
│   └── /web-request?session=   (web popup; self-closing)
│
├── /parallel (DEV group; prod via dev_unlocked)
│   ├── /parallel          → arms fixture wallet → Redirect /wallet
│   └── /parallel/connect  → real ConnectScreen (fixture signer)
│
└── ALWAYS-MOUNTED GLOBAL OVERLAYS (render above every route)
    ├── SigningRequestModal   (clear-signing sheet: dApp tx/message/blind)
    ├── ExtensionSignController (drives ext-sign sheet + result over any screen)
    ├── ParallelSpaceBadge    (self-gating; marks fixture mode app-wide)
    ├── AlertProvider (AppAlert), IdenticonViewerProvider (avatar zoom)
    └── AccountFileWriter (headless; UL handler + extension account cache)
```

---

## 5. Screen-flow list (which screen navigates where, on what action)

### Boot / redirect
- `/` → `/(tabs)/wallet` (wallet exists) | `/onboarding` (no wallet). Spinner while loading.
- Sign-out (Settings) → `dispatch LOGOUT` + `router.replace('/')` → lands on `/onboarding`.
- `useSafeRouter.back()` (used by About, Pay, Safari-extension, Token-detail, others): falls back to `router.replace('/(tabs)/wallet')` when there is no back stack (e.g. cold deep-link).

### Onboarding (order of flow)
1. **Welcome** (`/onboarding`, step `welcome`): tagline + primary "Create wallet" + secondary "I already have a wallet" + gear (opens **OnboardingSettingsModal** — theme/appearance + passkey-index endpoint editor; auto-opens after 3 failed health probes of the passkey index).
2. "Create wallet" → step `create` (**CreateWalletScreen**, same route, local state): name input + acknowledgment checkboxes → passkey creation → sign-proof → public-key upload (upload-failed branch: retry / start-over / bug-report modal / enter-anyway) → **Enter** → `router.replace('/(tabs)/wallet')`.
3. "I already have a wallet" → passkey `authenticate()` → local account match → home; else passkey-index lookup → home; 404 → **two-signature recovery offer** (AppAlert) → recover on-device → home. Network failure → endpoint settings modal.
4. Deep link `?mode=create` skips Welcome.
5. Embedded mode: `/web-request` renders OnboardingScreen inline with `onComplete` (no navigation) when a dApp request arrives and no wallet exists.

### Home (`/wallet`) — outbound
- Header account chip → **AccountSwitcherModal** (sheet; per-account balances; "Create new" / "Sign in existing" → both `router.push('/onboarding')`). Single-account tap = copy address instead. Tapping the avatar itself zooms the identicon (IdenticonViewer overlay).
- Header gear → `router.navigate('/settings')`.
- Balance number tap → privacy mask toggle (in place; masks feed + holdings; EyeOff appears only when masked).
- "Balance stale/unpriced" row → **BalanceDetailSheet** (per-network failures; row → RpcFixModal).
- RpcTroubleBanner "Fix" → **RpcFixModal**.
- Toggle row → NetworkFilterButton → **NetworkFilterSheet**.
- WaveDock: Receive → `push('/receive')`; Send → `push('/send')`; Scan → **QRScanner overlay** (full-screen component, not a route).
- QR scan / pasted text routing (`onScan`): EIP-681 w/ chain → `push('/send', {prefilled…, locked:'1'})`; bare address → `push('/send?prefilledRecipient=…')`; WalletPair URI → connect inline + switch to Connections tab; remote-inject bridge URL → same; any web URL/bare host → `push('/browser', {url})`; otherwise invalid-QR alert.
- Activity row → **TransactionDetailSheet** (or **SigningReplaySheet** for past dApp signatures, **ConnectionEventDetailSheet** for connection events); batch rows → batch variant.
- Assets tab (HoldingsList): token row → `push('/token-detail', {…token params})`; "+ Add token" → `push('/add-token')`; empty state card → `push('/receive')`.
- Connections tab (ConnectionsView): Connect → opens scanner; paste-link field → same URI routing; browser-history row → **BrowserHistorySheet** → open → `push('/browser', {url})`; disconnect → confirm alert; event row → detail sheet.
- ReceiptToast (incoming payment) — transient overlay top of Home; suppressed while balance is masked.

### Send (`/send`, modal) — internal steps (single route, state-machine)
`select-token` (X closes) → `enter-details` (ArrowLeft back; recipient field w/ ContactPicker sheet, per-row QR scan, split/sweep multi-modes, BatchImportSheet) → `confirm` (GasFeeCard + FeeTokenSelector sheet) → **TransactionReceipt** replaces the screen (Done → `router.back()`; save-contact option). Side surfaces: QRScanner overlay (full-request rescan does `router.replace('/send', lockedParams)`); lock-error states (unknown network → "Add network" CTA / unsupported token → cancel to back); TreasuryBootstrapSheet (relayer float depleted); funding/top-up modal via signing pipeline.
Entry params: `prefilledRecipient`, `prefilledChainId`, `prefilledTokenAddress`, `prefilledAmountBase`, `locked=1`, `preselectedSymbol`, `preselectedNetwork`.

### Receive (`/receive`, modal)
Back arrow → `back()`. SegmentedToggle: **Address** (QR + copy + chain list + explorer links) | **Payment request** (amount/token form → EIP-681 QR + shareable pay-link; copy copies the LINK; Save/share branded card image).

### Token detail (`/token-detail`, modal)
ArrowLeft → `back()`. Send → `push('/send', {preselectedSymbol, preselectedNetwork})`; Receive → `push('/receive')`; copy contract address.

### Settings (`/settings`) — outbound + owned modals
X → `navigate('/wallet')`. Rows (top→bottom): Account → AccountSwitcherModal · Contacts → ContactsManager (sheet w/ groups/import/export/payroll) · Feedback → BugReportModal · [iOS] Safari Extension → `push('/safari-extension')` · Language → LanguagePickerModal · Text-size slider (inline) · Theme picker (inline) · Avatar-style picker (inline) · Currency → CurrencySheet · Number/Date/Time format → FormatPickerModal ×3 · **Advanced** (collapsible): Networks → NetworkEditorModal, RPC Providers → RpcProvidersModal, Add Network → AddNetworkModal, Service Endpoints → EndpointEditorModal · **Developer** (visible only when `dev_unlocked`; collapsible): Treasury → TreasuryModal, Clear Signing → `push('/clear-signing-test')` · About → `push('/about')` · Sign out → confirm AppModal (pending-sync warning variant) → LOGOUT + `replace('/')`.

### About (`/about`, modal)
ArrowLeft → `back()`. Logo tapped 6× within 3s windows → sets `dev_unlocked=1` + success haptic (unlocks Developer section, `/clear-signing-test`, `/receipt-harness`, `/parallel` in prod builds).

### Connect (`/connect`)
X → `navigate('/wallet')`. States: disconnected (guide + Scan QR button + paste-link) / connecting / connected (session info + disconnect w/ confirm) / error (+retry). Web URL input → `push('/browser', {url})`. QRScanner overlay.

### Browser (`/browser`)
ArrowLeft/X in chrome; Android hardware back steps web history first; account-switcher footer "Close browser" → `router.back()`. Owned overlays: connect-consent AppModal (`fit` sheet), AccountSwitcherModal, error/insecure-origin states. All signing → global SigningRequestModal above it. Visits recorded to browser history (surfaced on Home's Connections tab).

### Pay (`/pay`)
"Open in Vela" → `push('/send', locked prefill)`. "Pay another way" expands: EIP-681/address QR toggle, open-in-wallet-app (`ethereum:` URI), copyable manual details. Invalid params → invalid-link state.

### Global signing overlays (no route)
dApp request (WalletPair / bridge / browser / extension / web popup) → **SigningRequestModal** sheet (clear-signed / message / blind-sign layouts; asset-change simulation; gas + fee-token; funding top-up content-swap; approval guard) → result confirmation. Renders over ANY screen; `/sign` and UL launches feed it via `ExtensionSignController`.

---

## 6. Dev-only IA
- **Gate:** `__DEV__` OR AsyncStorage `dev_unlocked === '1'` (set by 6-tap About logo; also set when entering parallel space).
- Routes: `/clear-signing-test` (Settings row), `/receipt-harness` (URL only), `/parallel`, `/parallel/connect`.
- `ParallelSpaceBadge`: always mounted (NOT `__DEV__`-gated — prod can be in parallel mode); tap → `router.navigate('/parallel')`; marks fixture-key mode so the fixture wallet is never mistaken for a real one.
- Console-only surfaces (`__DEV__` web): `vela.*` fault-injection, metrics, parallel consoles.
- Test env doctrine (docs/PARALLEL-SPACE.md): `/parallel/*` = the REAL app pixel-for-pixel, only the passkey is a fixed keyset — design implication: **no parallel-specific screens exist to draw except the badge**.

## 7. Navigation chrome conventions (for Penpot components)
- Modal/pushed screen header pattern (DESIGN_SYSTEM.md §6.1): `[icon button] [title] [spacer]`, hitSlop 8. **X** = closes a self-contained surface at its root (Send step 1, Settings, Connect, Receive uses ArrowLeft); **ArrowLeft** = steps back within a flow (Send steps 2–3, Token-detail, About, Add-token, Safari-extension, dev screens).
- Full-page peers (Settings/Connect) use top-right X → `/wallet`; modals use top-left control.
- Sheets/modals are `AppModal` (bottom sheet, focus-trapped on web, Escape closes); confirms are `AppAlert`; both global providers.
- Design-doc conflict to flag: DESIGN_SYSTEM.md still describes card-heavy screens & "Depth Through Shadow"; DESIGN-LANGUAGE.md (authoritative) mandates de-containered pages, hairline dividers, cards ONLY for AppModal sheets / genuinely distinct surfaces — the current screens follow the latter. Also DESIGN_SYSTEM.md lists Inter font zones while the app boots Plus Jakarta Sans + Inter (see typography report); and its screen list predates the Home IA merge (no History screen exists anymore).

## 8. Anomalies / open items for the design file
1. `history` modal registered in root layout with **no route file** — dead registration; do not draw a History screen (Activity tab replaced it).
2. `(tabs)/connect` has **zero in-app entry points** (Home's Connections tab + scanner absorbed pairing); it survives for deep links/e2e. Decide whether Penpot keeps it as a real board (recommended: yes, deep-link surface) or marks it legacy.
3. `/browser`, `/pay`, `/clear-signing-test`, `/receipt-harness` rely on **default push presentation** (never declared) — intentional for `/browser` (global sheet must overlay it) but implicit for the rest.
4. iOS has Universal Links (`applinks:getvela.app`, `/sign` only); **Android has no App Links** configured.
5. `/web-request` imports from `packages/vela-sdk` and uses `window` — web-deployment-only surface; native builds should never present it.
6. Back-stack safety: several screens use `useSafeRouter` (fallback `/(tabs)/wallet`), others call raw `router.back()` (Send, Receive, Browser footer, harness screens) — raw calls are safe only because those screens are always pushed; a re-implementation must preserve the "anchor behind everything" invariant (`initialRouteName '(tabs)'`).
