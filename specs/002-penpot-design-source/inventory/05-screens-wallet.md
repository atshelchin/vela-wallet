# 05 — Wallet Screens (`src/screens/wallet/`) — Design Source-of-Truth Report

Audience: a Penpot rebuild (tokens, component variants, per-screen boards with every state) that a future agent can re-implement in SvelteKit / GPUI / native iOS / native Android **without reading the RN code**. Everything below is VISUAL + STRUCTURAL + BEHAVIORAL spec. RN implementation trivia is included only where it encodes design behavior.

Authoritative language: `docs/DESIGN-LANGUAGE.md` ("quiet, typographic, de-containered"; reference screen = HomeScreen). `DESIGN_SYSTEM.md` is older and card-heavy; conflicts are flagged in §9.

---

## 0. File inventory (scope: every file in `src/screens/wallet/`, no subdirectories exist)

| File | Kind | Route |
|---|---|---|
| `HomeScreen.tsx` | Screen (view shell) | `/wallet` (tab; tab bar hidden — WaveDock replaces it) |
| `HomeScreen.styles.ts` | Styles for Home + Connections + toast | — |
| `useHomeController.ts` | All Home state/behavior | — |
| `BalanceDisplay.tsx` | `Balance` + `BalanceSkeleton` sub-components of Home hero | — |
| `ReceiptToast.tsx` | "money in" toast sub-component | — |
| `ConnectionsView.tsx` | Connections tab content (inline, never pushed) | — |
| `SendScreen.tsx` | Send flow shell | `/send` |
| `SendScreen.styles.ts` | All Send-flow styles | — |
| `useSendController.ts` | All Send state/behavior (3 modes) | — |
| `EnterDetailsStep.tsx` | Send step 2 (amount + recipient; split/sweep variants) | — |
| `ConfirmStep.tsx` | Send step 3 (review + slide-to-confirm) | — |
| `send-utils.ts` | Pure helpers (incl. `amountFontSize` — design behavior) | — |
| `ReceiveScreen.tsx` | Receive (Address / Request modes) | `/receive` |
| `TokenDetailScreen.tsx` | Token detail | `/token-detail` |
| `PayScreen.tsx` | Public payment-link bridge | `/pay` |
| `AddTokenScreen.tsx` | Add Token/Network full-screen host | `/add-token` |

Out of this directory (referenced but owned elsewhere — flag for the other scope reports): dApp **browser** screen (`/browser`, `src/app/browser.tsx` → connect screens), **contacts** UI (`src/components/contacts/*` — ContactPicker, ContactAvatar, RecipientTrust, RecipientTypeBadge), account switcher (`src/components/ui/AccountSwitcherModal`), QR scanner (`src/components/QRScanner`), signing sheets (`SigningReplaySheet`, `TransactionDetailSheet`, `ConnectionEventDetailSheet`), `ReceiveShareCard`. This report specs their **placement and role** on wallet screens plus full specs for the send/home-specific shared components (§8).

---

## 1. Global constants used throughout (from `src/constants/theme.ts`)

### 1.1 Color tokens — LIGHT / DARK (hex)

| Token | Light | Dark |
|---|---|---|
| `fg.base` | `#1A1A18` | `#E8E6E1` |
| `fg.muted` | `#6E6B62` | `#9A9790` |
| `fg.subtle` | `#8C887E` | `#85827A` |
| `fg.inverse` | `#FFFFFF` | `#1A1A18` |
| `bg.base` (page) | `#FAFAF8` | `#141412` |
| `bg.raised` (cards/inputs/dock) | `#FFFFFF` | `#1E1E1B` |
| `bg.sunken` (chips/inset) | `#F5F3EF` | `#0F0F0D` |
| `accent.base` | `#E8572A` | `#E8572A` (same) |
| `accent.soft` | `#FFF0EB` | `#2C1A12` |
| `success.base` | `#2D8E5F` | `#3DA872` |
| `success.soft` | `#EDFAF2` | `#132A1E` |
| `warning.base` | `#92600A` | `#D4A54A` |
| `warning.soft` | `#FFF8F0` | `#2A2010` |
| `warning.border` | `#F0DCC8` | `#3D3020` |
| `error.base` | `#C62828` | `#F87171` |
| `error.soft` | `#FEF2F2` | `#2D1515` |
| `info.base` | `#4267F4` | `#5A7CF6` |
| `info.soft` | `#EDF0FF` | `#131B33` |
| `border.base` (hairlines) | `#ECEBE4` | `#2C2C28` |
| `border.strong` | `#D8D6CE` | `#3E3E38` |

Note: dark mode `bg.sunken` is DARKER than `bg.raised` (inverted vs light). Components that must read "soft chip on raised surface" use `bg.base` + `border.strong` instead of sunken (e.g. WaveDock secondary pill) — preserve this in re-implementation.

### 1.2 Typography
- Typeface: **Plus Jakarta Sans** (400/500/600/700 files; export still named `inter.*`). `font.display` = PlusJakartaSans Bold (hero numbers). `font.mono` = Menlo (iOS) / `monospace` (Android/web) — addresses, hashes. `font.numeric` = PlusJakartaSans Regular (tabular-ish balance columns).
- Size scale (base px, user-scalable 0.85×–1.28×; web gets a fixed extra ×1.2 boost): `xs` 10, `sm` 11, `base` 13, `lg` 15, `xl` 17, `2xl` 20, `3xl` 26, `4xl` 32, `5xl` 40. Line-height presets `leading`: none 1, tight 1.2, normal 1.4, relaxed 1.6.
- Weights: 400 regular / 500 medium / 600 semibold / 700 bold.

### 1.3 Spacing / radius / shadow / motion
- Space (4px grid): xs 2, sm 4, md 8, lg 12, xl 16, 2xl 20, 3xl 24, 4xl 32, 5xl 48.
- Radius: sm 4, md 8, lg 12, xl 16, 2xl 20, full 9999.
- Shadows (all shadowColor `#1A1A18`): `sm` (0,1) 4% ×3 r, elev 1 · `md` (0,2) 6% ×8 r, elev 3 · `lg` (0,4) 8% ×16 r, elev 6.
- Motion: fast 150 ms, normal 250 ms, slow 400 ms; `spring` {damping 15, stiffness 150, mass 0.8}; `springGentle` {20, 120, 1}. Press feedback is always spring-scale (buttons 0.97, list rows 0.98). Entrance = FadeIn/FadeInDown 300–400 ms — **iOS + web only; Android renders instantly** (`entering.ts` returns undefined on Android to avoid a blank-frame flicker). Entrances play ONCE per mount (gated by a "hasEntered" ref) — never replay on re-render.
- Screen chrome: `ScreenContainer` = page bg `bg.base`, safe-area top only, horizontal padding **24** (`space.3xl`), iOS keyboard avoidance `padding` behavior.

---

## 2. HomeScreen — THE reference screen (`/wallet`)

Payment-first, activity-first single screen. No bottom tab bar (Tabs navigator exists but bar hidden); the **WaveDock** is the app's persistent bottom chrome. Everything sits open on `bg.base` — no cards except the connected-dApp card and modal sheets.

### 2.1 Layout top-to-bottom
1. **(Conditional) Receipt toast** — absolute, top = safeTop + 8, centered (§2.10).
2. **Header row** (padH 24, padT 8, padB 12, gap 8, row, entrance fadeIn 0/400 once):
   - **Account pressable** (flex 1, row, gap 8, padV 2):
     - `WalletAvatar` 44 px (identicon; tapping the avatar itself enlarges it — handled inside the component; the rest of the row opens the account switcher).
     - Column: account name (`text.lg` 15, bold, `fg.base`, 1 line, shrink) + ChevronDown 15 px `fg.subtle` stroke 2.4 **only when >1 account**; below it the short address (`text.sm` 11, medium, MONO, `fg.subtle`, e.g. `0x1234…abcd`).
     - Behavior: >1 account → opens AccountSwitcherModal (title "Switch Account", subtitle "N accounts · $total", per-account cached balances refresh live, create-account actions shown). Exactly 1 account → tap copies the address to clipboard (no modal).
   - **Settings icon button**: plain 44×44 (no bg/border/shadow), lucide `Settings` 22 px `fg.base` stroke 2 → navigates `/settings`.
3. **Scrollable content** (per-tab; all share ONE header block rendered inside the list so it scrolls away):
   - **Balance hero** (open, NO card; padT 12, padB 20; entrance fadeInDown 60/400 once; whole hero scales 1→1.03→1 on incoming money — "balance pulse", 220 ms out-quad up, 1000 ms back):
     - Label: `"Total balance · USD"` (uppercase, `text.sm` 11 semibold, `fg.subtle`, letterSpacing 0.6). The currency CODE is always appended (`· {dc.code}`) because the symbol alone is ambiguous.
     - **The number** (tap target = whole line, hitSlop 8; tapping toggles balance privacy, persisted app-wide):
       - Normal: `AmountText` atomic number, ideal size **52–56 px** display-bold, letterSpacing −1.2, `fg.base`; **currency symbol subordinated at 0.58×**; decimals tail at 0.56× in `fg.subtle` (28 px style), letterSpacing −0.5; fit-to-width one line, min scale 0.55, then compact notation ($1.23M). Decimals shown per `shouldShowDecimals(value, code)`.
       - **Hidden (privacy) state**: six 16 px round dots (`fg.base`, gap 12) + `EyeOff` 20 px `fg.subtle` at the right — the ONLY chrome the hero ever shows; row height pinned to 63 px so toggling doesn't shift layout. Privacy also masks: activity amounts, fiat sublines, holdings balances, the switcher, and suppresses the receipt toast.
       - **Unknown/loading state**: `BalanceSkeleton` — 208×46 bar, radius 8, `bg.sunken`, centered in the 63 px line box; a 96 px-wide `bg.raised` band at 85% opacity sweeps left→right, 1150 ms in-out-quad, infinite. Shown only when: no live tokens AND no cached total AND first fetch not yet settled ("never show a fake 0").
     - **(Conditional) "estimate" notice row** (only after 3 silent force-retries with backoff 1.5 s/4 s/8 s still leave the total incomplete): row, gap 2, marginTop 8, self-start, pressed opacity 0.6; `AlertTriangle` 12 px `warning.base` stroke 2.5 + text (`text.sm` medium `warning.base`) — copy: failed chains → **"Some balances are still updating."** else unpriced tokens → **"Some tokens couldn't be priced."** — + ChevronRight 14 px `warning.base`. Tap → BalanceDetailSheet (§2.11). While partial, the displayed total = max(live, cached) — never a confidently-wrong smaller number.
   - **(Conditional) RpcTroubleBanner** (§8.14) — only for chains whose failure is NOT rate-limiting (rate-limited = transient, self-healing → cached balance quietly, NO banner; this is the confirmed rate-limit UX rule).
   - **Nav row** (row, space-between, gap 8, marginBottom 12):
     - `SegmentedToggle` with 3 options: **Activity | Assets | Connections** (Connections gets a numeric badge `1` when a dApp session is connected/reconnecting).
     - `NetworkFilterButton` — soft `bg.sunken` full-radius chip, max width 150: default = 3 overlapping 20 px chain logos (2 px `bg.raised` ring, −8 overlap) + "All" (`text.base` semibold `fg.base`) + ChevronDown 13; selected = that chain's 20 px logo + name + a separate 20 px round ✕ clear button. Tap → NetworkFilterSheet.
4. **Tab content** (see 2.4–2.6). List content: padH 24, padBottom = 86 (dock) + bottom inset + 20.
5. **WaveDock** (full-bleed absolute bottom, §8.1): Receive (neutral pill) · Scan (floating 56 px circle FAB, icon only) · Send (accent pill).

### 2.2 Pull-to-refresh (all three tabs)
Custom branded `VelaRefresh` (native RefreshControl NOT used): finger-tracked 1:1 elastic pull, trigger at 72 px, 0.4 resistance beyond, one crisp haptic at the trigger crossing, a 30 px arc (stroke 3) that "draws" with pull progress then spins while refreshing, spring-back on release. Caption under the indicator = **"Updated {relative time}"** (freshness is the payoff of the pull). A pull forces a real RPC re-fetch (bypasses the 5-min token cache) and holds the spinner ≥650 ms.

### 2.3 Data/refresh behavior encoded in design
- Auto-refresh every 10 min; on the Activity tab a live poll every 10 s ("near-real-time payments").
- Streaming: chains merge in as they respond — the total NEVER dips to $0 mid-refresh.
- Account switch: hero paints instantly from the cached total (no $0 flash); Assets list is remounted (no stale holdings).
- Pending sends reconcile on every focus (a pending payment survives app restart and later flips confirmed/failed).

### 2.4 Activity tab (default)
Feed = FlatList of date groups:
- **Day header**: `"Today"` / `"Yesterday"` / localized date — `text.sm` semibold `fg.subtle`, marginTop 16, marginBottom 4 (not uppercase).
- **ActivityRow** (§8.3) per transfer; **hairline separator ONLY between consecutive item rows** — never touching a day header — 1 px `border.base`, **inset left 44+12+2 = 58 px** (past the avatar, Apple-Wallet style).
- Row subtitle shows a resolved counterparty name when available (own account name → ENS/.bnb/Vela index → stored name → short address), swapping in live as resolution completes.
- Row tap → `TransactionDetailSheet` (single tx) or batch breakdown sheet (grouped batch row).
- **New-receipt celebration**: newest incoming row plays a `success.soft` full-row glow fading over 1600 ms + success haptic + ReceiptToast + hero balance pulse. Not played for backlog on first load.
- **Empty state** (per network filter): centered, padTop 48, gap 8 — 64 px `bg.sunken` circle + `Inbox` 28 `fg.subtle`; title `text.xl` bold `fg.base` "No activity yet" (or "No activity on this network"); sub `text.base` regular `fg.subtle` centered "Incoming payments will appear here in real time.".
- Masked mode: amounts become 4 tight 7 px dots (green-tinted for incoming), fiat hidden.

### 2.5 Assets tab — `HoldingsList` (§8.4)
Header row under the hero: `SectionLabel` **"ASSETS"** left; right actions = search toggle (plain 32 px icon btn, `Search` 15, `fg.muted`, turns `accent.base` when open) + "＋ Add" (accent text-button `text.sm` semibold) → `/add-token`. Search field appears on demand: `bg.sunken`, radius 12, NO border, 16 px input (web anti-zoom floor). Rows = `TokenRow` 40 px logo (§8.5); hairline sep inset 8+40+12 = 60 px. Row tap → `/token-detail` with the token's params. Loading (funded wallet, scan not yet painted) = no empty state (blank list). Empty + unfiltered = tappable open state (padding 32, centered): 48 px `accent.soft` circle + `ArrowDown` 22 accent; **"Deposit your first asset"** (`text.xl` semibold `fg.muted`); "Tap here to see your address and receive tokens" — tap navigates `/receive`. Filter/search with no matches = plain centered `fg.subtle` line "No matching tokens" (never the deposit card under a funded hero).

### 2.6 Connections tab — `ConnectionsView`
Single active dApp session + its signing history. Four states:
1. **connecting / error** → inline `ConnectionFlowStates` (pairing fingerprint → waiting → failure w/ "scan again"); user never leaves the tab.
2. **disconnected** (empty state; centered, padTop 32, gap 8): 56 px `bg.sunken` circle + `Plug` 26 `fg.subtle`; title `text.xl` semibold **"No active connection"**; one-line sub `fg.muted` "Scan, or enter a link / URL". Below: **paste row** — multiline mono input (`bg.sunken`, radius 12, 1 px `border.base`, minH 56 / maxH 108, `text.base` mono, placeholder from connect ns) + 56×56 accent submit square (radius 12, `ArrowRight` 18 white; disabled = `bg.sunken` fill + `fg.subtle` icon). Accepts WalletPair URI → pairing; remote-inject bridge URL → bridge; any web URL/host → opens in-app browser `/browser`. Under it, only when browser history exists: plain text-button `History` 15 `fg.muted` + "recently opened" label → BrowserHistorySheet. **Signing-history list still renders below the empty state whenever events exist** (browser/extension-signed txs land with no live session — they must stay reviewable).
3. **connected / reconnecting** → **VelaCard elevated** (one of the few true cards; padding 16, marginBottom 16): row = 44 px dApp monogram tile (radius 13, `bg.sunken`, first letter `text.xl` bold) + name (`text.lg` semibold) & URL (`text.sm` regular `fg.muted`) + status cluster (7 px dot + label `text.sm` semibold — green `success.base` "Active", or `warning.base` "Reconnecting…" w/ 0.8-opacity dot). Note line `text.sm` medium `fg.muted` "Only one active connection at a time" (turns `warning.base` "Couldn't reconnect. Try again, or disconnect and re-pair." when stuck). While reconnecting: **Reconnect now** button — accent fill, radius 12, padV 12, white `RefreshCw` 16 continuously spinning (900 ms/turn linear), pressed = opacity 0.82 + scale 0.985, label flips to "Reconnecting…" for 1.4 s after a tap (haptic on press). Always: **Disconnect** — outline button (`bg.raised`, 1 px `border.base`, radius 12, padV 12, `text.base` semibold ink) → confirm dialog (destructive) before tearing the session down.
4. **Signing-activity list** (connected or historyMode): header row — `"CONNECTION ACTIVITY · N"` (uppercase `text.sm` semibold `fg.subtle`, ls 0.8) + right "Clear" text-button (`Trash2` 13 + `text.sm` semibold `fg.subtle`) → confirm dialog. Empty = `fg.subtle` line "No requests yet on this connection.". Row (padV 12, bottom hairline, bg = page): label (`text.base` semibold) + subtitle (`text.sm` `fg.muted`) | status pill only when not confirmed — full-radius, padH 4/padV 2, `info.soft`+`info.base` "Processing" or `error.soft`+`error.base` "Failed" (`text.xs` semibold) | relative time (`text.sm` `fg.subtle`) | ChevronRight 16. **Swipe left** reveals a full-height `error.base` delete action (white `Trash2` 18 + "Delete"). Tap → `SigningReplaySheet` (full read-only replay of the original signing panel) when the record captured its request, else `ConnectionEventDetailSheet` (metadata detail).

### 2.7 QR scan entry (dock Scan or Connections)
Scanner result routing: EIP-681 w/ chainId → `/send` locked-prefilled; bare address → `/send?prefilledRecipient=…`; WalletPair/bridge URI → connect (jumps to Connections tab); URL → `/browser`; anything else → alert "Invalid QR" / "Please scan a valid Ethereum address or connection URI.".

### 2.8 Modals/sheets Home can open
AccountSwitcherModal · NetworkFilterSheet · BalanceDetailSheet · RpcFixModal (single shared instance for banner chips AND sheet Fix rows) · TransactionDetailSheet (single or batch) · SigningReplaySheet · ConnectionEventDetailSheet · BrowserHistorySheet · QRScanner (full-screen). All modal sheets = `AppModal` (native pageSheet / web slide-up portal), content bg `bg.base`, centered `text.xl` bold title with 34 px spacer + 34 px round close btn.

### 2.9 Interactions summary
Tap balance = hide/show (persisted; disabled while skeleton). Tap notice = balance detail. Tap avatar = enlarge identicon; tap rest of account row = switcher/copy. Pull = branded refresh + freshness caption. Tabs = spring-slide chip + selection haptic. Swipe = delete connection event. Dock press-in = light haptic + spring scale (pills 0.97, FAB 0.92).

### 2.10 ReceiptToast
Absolute, self-centered, z 50, top = safeTop+8. Pill: `success.base` fill, radius full, padV 8 padH 16, `shadow.lg`; 8 px white dot + `text.lg` bold white **"{amount} {token} received"**. Enter: 320 ms out-quad fade + slide down 24 px. Auto-dismiss 2.8 s. Suppressed while balance privacy is on.

### 2.11 BalanceDetailSheet (§8.13 for styles)
"Why is my total an estimate?" — title **"Balance details"**. Sections (only when non-empty): **NETWORKS STILL UPDATING** (note copy explains cached balance) — rows: 36 px chain logo, name `text.lg` semibold, status line `text.sm` medium — `warning.base` "RPC unavailable" or `fg.muted` "Rate-limited · retrying automatically"; genuinely-failed rows get an accent "Fix" text-button that swaps the sheet content IN PLACE to the RpcFixForm (never a second stacked modal); below, accent "Retry now" (`RefreshCw` 14). **TOKENS WITHOUT A PRICE** — note "balances are correct… not counted in your total"; `TokenRow`s with usd column = "No price"; tap → token detail. All rows hairline-separated, inset past their leading icon. Auto-closes when everything recovers. Empty transitional copy "Everything's up to date.".

---

## 3. Send flow (`/send`) — 3 steps × 3 modes

Shell: `ScreenContainer`; nav bar (padV 12) = single left icon button 40×40 — **X** (22, `fg.base`) on step 1, **ArrowLeft** on steps 2–3 — plus a 60 px spacer. No title in the nav; each step carries its own `text.3xl` (26) bold title with 20 marginBottom. Steps fade in (fadeInDown 0/300). Back from confirm is blocked while a tx is in flight.

Modes: **single** (1 token → 1 recipient, amount), **split 一币多人** (1 token → N recipients, per-row amounts), **sweep/multiSelect 多币一人** (N tokens on ONE chain → 1 recipient, full balances minus gas reserve). Split/sweep submit as one MultiSend UserOp (one signature, one fee).

### 3.1 Step 1 — Select Token (title "Select Token") = shared `TokenSelector` (§8.6)
Search chip (sunken, full radius) · category chips **All / Stablecoins / Gas / Other** (sunken chip; ACTIVE = solid `fg.base` fill + inverse text — neutral ink, accent reserved for money-moving actions) · NetworkFilterButton · summary row "N tokens | $total" · TokenRow list (40 px logo, contract-address copy chip on ERC-20 rows) · footer accent "＋ Add Token" plain centered row → AddTokenSheet. Empty: "No tokens with balance" / filtered "No matching tokens" + add row. Loading: centered "Loading tokens...".
**Sweep affordance**: picking a specific network switches rows to checkbox mode (22 px round checkbox; ON = accent fill + white check; selected row bg `accent.soft`) + a "Select all valuable" master row; with ≥1 selection a sticky **accent** VelaButton appears — label "Continue" (1 token) or **"Send {n} · {chain} →"** (2+ → sweep). "All networks" stays single-select (one batch = one chain).

### 3.2 Step 2 — Enter Details (`EnterDetailsStep`)
Title: **"Send {SYMBOL}"** (single/split) or **"Send tokens"** (sweep).

**Token hero** (single/split only; open block, marginBottom 24; tap = back to token picker, disabled when EIP-681-locked): 44 px TokenLogo w/ chain badge · symbol `text.lg` bold + chain `text.sm` medium `fg.subtle` · right column balance (AmountText `text.xl` display-bold right-aligned, maxWidth 58%, minScale 0.7, compact) + fiat `text.sm` medium `fg.muted`. ERC-20 tokens add a hairline (inset 56 px) + contract row (inset 56): "Token Address" `fg.subtle` · short mono address right-aligned `fg.muted` · Copy 14 `fg.subtle` → Check 14 `success.base` for 1.5 s.

**Amount hero (single mode)** — open on the page (no box), `SectionLabel` "AMOUNT":
- Input: display-bold, **dynamic font size ≈ round(230 / max(len, 5.75)) clamped 17–40 px** (Cash-App smooth shrink, never abbreviated), placeholder "0" `fg.subtle`, decimal keyboard, selection color `fg.muted`, locale decimal mark shown while storing canonical dot, decimals capped at token decimals (or fiat 2/0).
- Right of the input: while empty → **Max** chip (soft `bg.sunken` full-radius, `text.sm` semibold `fg.muted`); once typing → unit label (token symbol or currency code) at 0.7× the amount size (min 16), `fg.subtle`.
- Below: **conversion toggle row** (only when priced): `ArrowUpDown` 14 `fg.muted` + `text.sm` medium `fg.muted` — shows the other denomination ("≈ $12.34" or "0.0042 ETH"); tap swaps input denomination (fiat mode is in the display currency, not hard-USD) converting the typed value.
- **Inline warning** (live, `text.sm` medium `error.base`): "You do not have enough {SYMBOL}…" / "Insufficient {sym} to cover amount + gas fees" / "You need {sym} to pay gas fees" (fee-asset aware: same-token fee reserves, separate ERC-20 fee balance checks).
- **Max behavior**: native → balance − quoted in-band fee (string-exact, never trips its own gas warning); ERC-20 paid in itself → balance − 1.5× quoted fee; else full balance.

**Recipient (single & sweep)**: label row "RECIPIENT" (uppercase `text.sm` semibold `fg.muted` ls 0.8) + auto-growing input (48→100 px) in a sunken 1 px-bordered radius-12 wrap; placeholder "0x... address"; trailing inside icons (single mode, not when prefilled): `ScanLine` 22 and `BookUser` 22 `fg.muted` (each a 40×40 plain button on page bg). Below, once a valid 0x40 address: **identity row** — 28 px ContactAvatar + resolved name via `RecipientTrust` (contact › vela › ens; ink-colored, calm) + `RecipientTypeBadge` (Contract/Wallet/Verified tag).

**Split/payroll entries (single mode, unlocked, not prefilled)**: two side-by-side dashed pills (flex 1, radius 12, dashed 1 px `border.base`, padV 8): "＋ Add recipient" and `FileUp` "Import list" — accent text `text.base` semibold. Add → **split mode** seeded with the current recipient/amount + one empty row; Import → BatchImportSheet.

**Split mode** replaces amount+recipient with `MultiRecipientEditor` (§8.8): per-recipient sunken cards (the deliberate exception: a repeating compound form group), footer total row + over-balance error, add/import dashed pills, cap 20 recipients (BATCH_MAX_RECIPIENTS). Dropping to ≤1 rows returns to single mode carrying the remaining values.

**Sweep mode**: summary row "**{n} tokens · {chain}**" (`text.sm` semibold muted) + fiat total (`text.lg` bold numeric); then per-token open rows (32 px logo · symbol/chain — chain line appends "**· gas reserved**" when the sent amount is trimmed below balance for the fee — · right amount + ≈fiat), hairlines inset 44 px; then the same recipient input + identity row (BookUser only).

**Continue** CTA: `VelaButton` primary (full-width dark-ink fill, radius 16, padV 16, `text.lg` semibold inverse), marginTop 12; label flips to "Preparing..." with spinner while estimating. Disabled until valid (mode-aware) or while estimating. Press → validation alerts (Invalid Address / Invalid Amount / Insufficient Balance) → mandatory gas estimate on the REAL calldata (15 s timeout → "Could not prepare transaction" alert) + relayer-treasury preflight → step 3. A depleted treasury opens **TreasuryBootstrapSheet** instead of confirm.

### 3.3 Step 3 — Confirm (`ConfirmStep`), title "Confirm"
**Transfer review — open From→To flow** (no card; "money follows the person"):
- **Party row** (row, top-aligned, gap 8): 38 px avatar (WalletAvatar sender / ContactAvatar recipient) · name (`text.base` bold; recipient name = RecipientTrust + RecipientTypeBadge, first-time tag deliberately NOT shown on plain sends) over short mono address (`text.sm` medium `fg.muted`) · right amount column — sender **−{amount} {SYM}** (`text.base` bold numeric `fg.base`), recipient **+{amount} {SYM}** (`success.base`); each with "≈ {fiat}" subline (`text.xs` medium `fg.subtle`).
- **FlowArrow** between parties: 38 px-wide column (centered under the avatar), 1.5×16 px hairline shaft flowing into a `MoveDown` 20 icon in `border.base` at stroke 1.5 (head pulled up −4 so the shaft reads continuous).
- **ConfirmAssets** below the recipient (§8.9): single/split = one quiet sunken pill "‹logo 20› {SYM} · {Network}"; sweep = collapsed cluster of ≤4 overlapping 22 px logos (+N more disc) + "{n} tokens · ≈ $total" pill that expands (fadeInDown 200) into open per-token rows (36 px logo, amount, ≈fiat, "· gas reserved" note).
- **Split variant**: sender party row (with −total), FlowArrow, label "{N} recipients" (`text.xs` uppercase `fg.subtle`), then an internally-scrolling list (maxHeight 320, ~5 visible): numbered rows — index (`text.xs` numeric `fg.subtle`, minW 16) · 32 px avatar · name/trust + short address · +amount/fiat.
- **Sweep variant**: sender (no amount) → FlowArrow → recipient → ConfirmAssets cluster.

**BalanceChangePreview** (simulation; safety-only here): silent when the sim merely corroborates the shown From→To; LOUD states surface — predicted revert ("This transaction is expected to fail — you'd still pay gas."), underfunded native, unexpected asset movement, self-transfer note.

**GasFeeCard** (§8.7) — the ONE gas surface (no speed tiers; everything runs 'fast'; no technical rows): collapsed row "Network fee | ~0.0012 POL ≈ $0.003" + refresh icon + chevron when a fee-asset choice exists (sub-label "Paid with {SYMBOL}"); auto-expands the first time options arrive; expanded = FeeTokenSelector rows (per asset: balance + est. cost + ≈fiat; unaffordable rows disabled); auto-defaults to the first AFFORDABLE asset (a 0-native account never strands on native); failure state = `warning.base` "Tap to retry" + refresh glyph. While it re-quotes it raises a busy flag that disables the confirm slide.

**Same-asset-fee blocker** (fee re-quote made the amount unpayable): alert card — `error.soft` fill, 1 px `error.base` border, radius 12, padding 12; `AlertCircle` 20 `error.base`; title `text.sm` semibold `error.base` "Not enough {SYM} to cover this transfer"; body `fg.muted` naming amount + fee + total vs balance; bold max line "You can send up to {max} {SYM}.". The slide is replaced by a primary **"Edit amount"** button → returns to step 2 with the amount field focused.

**Commit control** = `SlideToConfirmButton` (§8.10): 60 px full-radius QUIET raised track (`bg.raised`, 1 px `border.base`) + 52 px ACCENT knob with white ArrowRight; centered muted label "Confirm & Send" ("Checking gas..." while busy); hint "Slide to confirm". Never red — risk is signaled by the tags above, not the commit surface (founder mandate). Bottom clearance `space.5xl` 48 keeps it off the iPhone home-indicator band.

**In-flight status panel** (replaces the slide; sunken radius-16 bordered box, padding 16, fadeInDown 200): spinner (accent) + `text.base` medium `fg.muted` — "Preparing transaction..." → "Waiting for biometric..." → "Submitting to network...". A subtle **X cancel** appears after 3 s during preparing/signing (aborts the passkey prompt; a cancelled send never resurrects a prompt). **Error state**: `AlertCircle` 20 `error.base` + message (`error.base`; always a calm localized string — raw RPC errors are never shown; generic = "The transaction couldn't be submitted. Your funds are safe — please try again."; bundler-underfunded = "Bundler account needs more gas…"), plus an outline **"Try Again"** button. Passkey cancel silently returns to idle. Success = success haptic the moment the bundler accepts (userOpHash) — on-chain hash resolves in the background.

### 3.4 Success — full-screen `TransactionReceipt` (§8.11)
Replaces the whole flow. Bank-style capturable card on `bg.base`: top hero with a state-tinted vertical gradient (success/warning/error `.soft` → `bg.raised` at 82%) behind the token logo (52 px; sweep = ≤3 overlapping 46 px logos), status stamp row (CheckCircle2/Clock/XCircle 18 + `text.lg` bold in state color — "Confirmed" / "Submitted" / "Failed"), meta line "{chain} · {datetime} (· total)". Then the SAME From→To flow as confirm (split = numbered scrolling recipients ≤260 px; sweep = token list on a 1.5 px left rule between From and To). Meta rows (top hairline each): "UserOp Hash" tap-to-copy; "Tx Hash" → explorer (shown once resolved, incl. failed). State strip: confirmed → 72 px QR of the explorer link + "Scan to view on explorer"; submitted → hint "Sent! Confirming on-chain…" + a warning-tinted 7 px progress bar w/ 60 s countdown ("00:37" → "Still confirming") + "Checking on-chain status every 3 seconds" (self-polls; countdown is expectation-setting, not a deadline); failed → `error.base` hint "The transfer reverted on-chain — your funds were not sent…". Footer signature: 34 px app logo, "VELA WALLET" (ls 2.5), "getvela.app". Below the card: icon+label text actions (Explorer / Share / Save to contacts→Check "Saved"; single-send only, not split) and a full-width dark **Done** button → back.

### 3.5 EIP-681 locked entry & exceptions
Locked scan pre-fills token+chain+recipient(+amount, which locks the amount field; an amount-less request stays editable). Resolving spinner (accent, centered). Exceptions (centered column, gap 12): 64 px `accent.soft` circle + icon (Globe / AlertCircle 30 accent), title `text.xl` bold, body `text.base` `fg.subtle` centered — **"Network not supported"** + "…(chain {id})" with primary **"Add this network"** (loading state; inline `error.base` failure line) and a muted "Cancel" text-button; or **"Unknown token"** + Cancel only.

### 3.6 TreasuryBootstrapSheet (§8.12)
Opens from Continue-preflight, pre-sign recheck, or an underfunded/relayer-down submit error. Title "Start this network's relayer"; chain identity row (26 px logo + name + `· #chainId`); lead copy; "Suggested top-up ~{amount} {SYM}" (suggests 2× the floor); 140 px QR of the BARE treasury address on white; sunken address card ("Treasury · bundler operator" + full mono address + operator endpoint, tap-to-copy w/ Check feedback); warning-soft disclaimer card ("Non-refundable… goes to the bundler operator (not Vela)…"); primary "Copy address to fund" / "Copied"; secondary "I've funded · Retry" (re-runs the interrupted step) or "Close".

### 3.7 Other Send-flow sheets
- **QRScanner** (full-screen camera): per-row scan in split mode fills just that row; a full EIP-681 scan re-enters Send locked.
- **ContactPicker**: fills the single recipient or the targeted split row; whole-group pick seeds split mode with the group's addresses; offers scan handoff (not when locked).
- **BatchImportSheet** (payroll; §8.15): paste/upload `(name,address,amount)` rows priced in fiat, editable rate, converts → token amounts, seeds split mode. Cap = 20; over-cap and rejected-row notices; over-balance total in `error.base`.

---

## 4. ReceiveScreen (`/receive`)

Shell: `ScreenContainer` + ScrollView (padBottom 100). Header: back ArrowLeft 40×40 · centered title `text.xl` bold "Receive" · 40 px spacer.

**Mode toggle** (SegmentedToggle, centered alone in its row, marginBottom 16): **Address | Request**.

**QR block** (open on page, no card; entrance fadeInDown 100/400 once):
- QR 200 px inside a **literal-white** quiet-zone frame (radius 16, 1 px `border.base`, padding 20) — white is hard-coded in BOTH themes (scanners need contrast). Missing address → 200 px sunken placeholder "No address".
- **Warning GATE (first visit per account)**: a full covering overlay on `bg.base` (z 10) hides the QR until acknowledged; while the persisted flag loads the overlay is blank (never flash the QR). Content: ShieldAlert 28 `warning.base`; title `text.xl` bold **"Before you receive"**; body `fg.subtle` relaxed "Only send assets on supported networks — unsupported transfers may be lost permanently."; a `success.base` reassurance line "Your address is the same on every supported network. Funds sent here are safe and yours — even before your wallet is deployed."; full-width primary **"I Understand"**. After acknowledgment it permanently decays to a one-line `text.xs` `fg.subtle` reminder under the QR ("Supported networks only — transfers on other networks may be lost."). Copy/save actions are disabled until acknowledged.
- Identity: account name `text.2xl` bold centered; Request mode adds the truncated receiving address (`0x12345678...abcdef`, mono `fg.muted`).
- **Copy button** — THE accent action, a plain de-boxed stretched row (minH 44, padV 12): Address mode = truncated mono address (`text.base` medium `fg.base`) + `Copy` 18 **accent**; Request mode = "Copy payment link" in `inter.semibold` accent (copies the public `/pay` web link, not the raw `ethereum:` URI). Copied state (2 s): text+icon flip to `success.base` "Copied" + Check 18.
- **Save image** — secondary plain text-button under copy (ImageDown 17 `fg.muted` + `text.sm` semibold ink "Save image" / "Generating..."; busy = 0.4 opacity): captures a branded share card (off-screen `ReceiveShareCard`; web renders to canvas). Feedback alerts: saved to photos / downloaded / permission needed.
- **Deposit detection** (screen polls balances while open: every 3 s for 1 min, then 60 s until 5 min, then stops): landed deposits append an open hairline-topped section — per entry a 6 px `success.base` dot + `HH:MM:SS` time (`text.xs` `fg.muted`), then rows inset past the dot: **+{amount} {SYM}** (`text.base` semibold `success.base`) | "{network}  {$usd}" (`text.sm` `fg.muted`). Success haptic on land. Success ink stays on dot+amount only.

**Lower half** (one persistent block — switching modes swaps content without remount/entrance replay):
- **Address mode**: `SectionLabel` "SUPPORTED NETWORKS" + a wrapped strip of tappable 22 px chain logos (each in a transparent full-radius chip w/ reserved 1.5 px border; ACTIVE = accent border + `accent.soft` fill; all others dim to 0.4 while one is selected; light haptic). Below: default caption "One address across all {N} networks" (`text.sm` `fg.subtle`), or when a chip is active the revealed detail row "**{Name} · Chain ID {id}**" (`text.sm` semibold ink) + ExternalLink 13 → chain explorer.
- **Request mode**: `ReceiveRequestControls` — open de-boxed asset picker row (44-ish; token logo + "{SYM}" value + "{network}" sub + ChevronDown; tap → full TokenSelector sheet fed with EVERY token incl. zero-balance/custom, `hideTotals`), hairline, then amount input as a soft sunken chip (flex input `text.lg` semibold + trailing symbol `fg.muted`) with hint `text.xs` `fg.subtle` "Leave blank to let the sender choose the amount". Builds EIP-681 QR + summary + public pay-link live.

---

## 5. TokenDetailScreen (`/token-detail`)

Params-driven (symbol, name, network, balance, decimals, logos, tokenAddress, priceUsd, chainName). Shell: `ScreenContainer` + ScrollView (padBottom 100). Nav: ArrowLeft · centered symbol `text.xl` bold · 50 px spacer.

1. **Hero** (open, no card; fadeIn 0/400): identity row — 44 px TokenLogo (chain-badged) + symbol `text.lg` bold / chain `text.sm` medium `fg.subtle`; then the balance as `AmountText` at `text.4xl` (32) display-bold, ls −0.8, unit ticker subordinated in `fg.subtle`, fit-to-width min 0.6, compact; below, "**≈ {fiat}**" as PLAIN text `text.2xl` semibold display `fg.muted` (deliberately NOT AmountText — the fit cascade flickered/shrank this short line; annotation, not hero).
2. **Action row** (fadeInDown 100/400): two flex-1 VelaButtons — **Send** (primary dark) → `/send?preselected…`; **Receive** (secondary outline) → `/receive`.
3. **Details** (fadeInDown 200/400; open rows padV 12, label `text.sm` regular `fg.subtle` left / value `text.sm` medium `fg.base` right, `Divider` hairlines between; section itself padH 12): rows in order, each conditional — **Name** (only if ≠ symbol) · **Contract** (short addr + Copy 12 `fg.subtle` → Check 12 green; tap-to-copy) · **Decimals** · **Price** ("1 {SYM} = {fiat}") · **Transactions** ("View on Explorer" `fg.muted` + ExternalLink 12; opens token- or address-scoped explorer URL).

No loading/empty/error states of its own (all data arrives via params).

---

## 6. PayScreen (`/pay`) — public payment-link bridge

Opened from a shared link; web-first surface. Invalid params → centered "Invalid payment link" + "This link is missing a valid recipient or network…".

Layout (ScrollView, padV 20, gap 16):
1. Brand row centered: 24 px app icon (radius 6) + "Vela Wallet" `text.base` bold.
2. **Hero card** = `VelaCard elevated` (padding 20, centered): 56 px TokenLogo (chain-badged) · eyebrow "PAYMENT REQUEST" (`text.xs` semibold `fg.subtle` uppercase ls 0.5) · headline "{amount} {SYM}" `text.3xl` bold · network row (16 px ChainLogo + name in **accent** `text.base` semibold; only when the logo badge doesn't already say it) · **payee identity row** — sunken radius-12 bordered stretch row: 28 px ContactAvatar + RecipientTrust name + RecipientTypeBadge over short mono address; trailing Copy 16 → Check (tap-to-copy) · primary **"Open in Vela Wallet"** (→ `/send` locked) · muted text-button **"Pay with another wallet"** (toggles card 3).
3. **Other-wallet card** = `VelaCard` (padding 20, centered): SegmentedToggle **Request | Address** → 180 px QR on literal white (radius 16 box) + hint ("Scan with an EIP-681 wallet" / "Any wallet can scan — pick the network, token & amount yourself"); Request mode adds an outline "Open in wallet app" (deep-links `ethereum:` URI); then "Or enter these details by hand:" and hairline-topped detail rows — Recipient (copyable) · Network "{name} ({chainId})" w/ 18 px logo · Token ("{SYM} (native coin)" or "{SYM} · 0x1234…" copyable, 18 px logo) · Amount ("{amount} {SYM}" or "Any amount"). Copy feedback = green Check 1.5 s per row.

(Design-language note: this screen intentionally keeps cards — it renders on arbitrary public web contexts, a genuinely distinct surface.)

---

## 7. AddTokenScreen (`/add-token`)

Thin host: ScreenContainer + nav bar (ArrowLeft 40×40 · centered "Add Token" `text.xl` bold · 50 px spacer) + the shared `AddTokenPanel` (also presented elsewhere as a bottom sheet — same panel, two presentations). Panel copy set: tabs "ERC-20 Token"/"Native Token", network search ("Name or chain ID (e.g. Avalanche, 43114)"), compatibility check ("Checking compatibility..." / "Compatible" / "Not compatible with Vela Wallet"), token search/add ("Search Token" → "Add to Wallet" → "Added"), errors ("Not Found", "This network is already added", …). Full panel spec belongs to the components report.

---

## 8. Shared components — specs as used by these screens

### 8.1 WaveDock (Home bottom bar)
Full-bleed absolute bottom. Bar: height **86** + bottom inset, `bg.raised`, 1 px top hairline `border.base`. **Scan FAB**: 56 px circle centered, overlapping the bar's top edge by half; `bg.raised`, 1 px `border.base`, `shadow.md`; `ScanLine` 26 `fg.base`; icon-only; press = haptic + spring 0.92. **Button row** (absolute, bottom = inset+8, padH 12, gap 4): two flex-1 pills flanking a 64 px scan slot — each radius 16, padV 16, 1 px border, icon 22 + label `text.xl`; **Receive** = secondary: `bg.base` fill + `border.strong`, `ArrowDownLeft` + semibold ink (NOT sunken — dark-mode contrast rule); **Send** = THE accent action: `accent.base` fill+border, `ArrowUpRight` + bold white (xl size is a WCAG large-text requirement). Arrow glyphs deliberately mirror ActivityRow's in/out arrows. Screens must reserve scroll clearance 86 + inset + breathing room.

### 8.2 SegmentedToggle
Content-sized text tabs, horizontally scrollable (labels NEVER truncate; long locales scroll). Transparent track, gap 2. Active indicator = ONE floating chip that springs (position AND width) between segments: full radius, `bg.raised` fill, 1 px `border.strong`, `shadow.sm` (redundant cues — this warm palette can't carry selection on fill alone). Segment: padV 8, padH 16, minH 44, gap 4; label `text.base` semibold — `fg.muted`, active `fg.base` (color-only change; weight would resize and re-spring). Optional badge: ≥18 px round `fg.base` pill, `text.xs` bold inverse. Selection haptic on change; active segment auto-scrolls into view; chip hidden until first measure (no 0-width border flash).

### 8.3 ActivityRow
De-boxed row, edge-to-edge (padV 16, padH 2, gap 12), page bg; press spring 0.98 + light haptic; entrance fadeInDown staggered `index×40 ms`/300 once. **Avatar**: 44 px circle — outgoing `bg.sunken` + `ArrowUpRight` 19 `fg.subtle`; incoming `success.soft` + `ArrowDownLeft` 19 `success.base`; bottom-right 18 px chain-logo badge with a 2 px `bg.raised` ring. **Content** (3 lines, gap 3): L1 = direction title left (`text.base` semibold `fg.muted` — deliberately calm) ↔ amount right (`text.xl` bold, number fitted 0.85 min; TICKER subordinated `text.sm` semibold `fg.muted`; incoming amount = `success.base`); masked = four 7 px dots (green when incoming). L2 = counterparty (mono `text.sm` medium `fg.muted`, owns the line width) ↔ fiat (`text.sm` medium `fg.muted`). L3 = optional time `text.xs` `fg.subtle` (omitted on Home — date headers carry time). `isNew` = `success.soft` full-row wash fading 1600 ms. One combined a11y label; amount omitted from it when masked.

### 8.4 HoldingsList — covered in §2.5 (header/search/empty specs there). Hairline inset 60 px; virtualized.

### 8.5 TokenRow
Row: padV 12, padH 8, gap 12, radius 12; press spring 0.98; entrance fadeIn `index×40`/300. Optional leading 22 px round checkbox (multi-select; on = accent fill + white check, row bg `accent.soft`). 40 px TokenLogo (chain badge). Info: symbol `text.lg` semibold; chain `text.sm` `fg.subtle`; optional contract chip — sunken full-radius micro-chip (`text.xs` mono `fg.muted` short address + Copy 11; copied = green "Copied" + Check 11). Right: balance `text.lg` semibold numeric (fits to 0.7) or 4-dot mask; usd `text.sm` numeric `fg.muted`.

### 8.6 TokenSelector — covered in §3.1. Also reused by Receive's Request builder (all tokens incl. zero-balance, `hideTotals`).

### 8.7 GasFeeCard (shared with dApp signing sheet — the two surfaces must not drift)
Collapsed row (padV 12, no horizontal inset — shares the sheet's left edge): label col — "Network fee" `text.sm` medium `fg.muted` + optional "Paid with {SYM}" `text.xs` `fg.subtle`; right — value col ("~{amount} {SYM}" `text.sm` semibold ink; "≈ {fiat}" `text.xs` `fg.subtle` only when ≥ $0.005 — below that the token amount is the honest primary) + refresh icon-btn (14; spinner while re-quoting) + chevron up/down 16 (only when >1 fee asset). States: estimating = "Estimating..."; failed = `warning.base` "Tap to retry" + `RefreshCw` 16 warning (whole row taps to retry). Expanded = `FeeTokenSelector` row list — per option: token identity + Balance + Est. cost + ≈fiat; selecting recalculates locally from the shared quote (confirm stays gated via the busy flag; on error the selection reverts). Auto-reveals once options first load; auto-defaults to the first affordable asset once per chain/account (manual picks never overridden). Tempo chains use the same UI with an ERC-20 (pathUSD) default.

### 8.8 MultiRecipientEditor (split)
Stack gap 8 of **recipient cards**: `bg.sunken`, radius 16, 1 px `border.base`, padding 12, gap 4. Card head: "Recipient {n}" `text.sm` semibold `fg.muted` + (when >1) a 28 px `bg.base` square remove ✕. Address: auto-grow input on `bg.base` (radius 12, 44→96 px, `text.sm`) + 40 px `bg.base` BookUser button. Under it: invalid → `text.xs` `error.base` "Invalid Address"; valid → 20 px ContactAvatar + RecipientTrust/TypeBadge identity row (same treatment as single mode — a recipient never reads differently between modes). Amount: `bg.base` radius-12 row — flex input `text.lg` semibold + trailing symbol `text.base` semibold `fg.muted`; "≈ {fiat}" `text.xs` below. Footer: dashed add/import pills (add disabled at 20 = 0.4 opacity); **total row** — "{N} recipients" ↔ "{total} {SYM}" `text.base` bold (over-balance → `error.base`) + ≈fiat; over-balance also prints "Insufficient Balance" in `error.base`.

### 8.9 ConfirmAssets / 8.10 SlideToConfirmButton / FlowArrow — fully specced in §3.3. SlideToConfirm extra detail: thumb 52 in a 60 track (pad 4); commit at 80% or a fast flick (>900 px/s past 45%); mid-drag tick haptic at 60%; overdrag rubber-bands (0.12 factor, max 10 px); on commit the track settles to `success.soft` fill + `rgba(45,142,95,0.3)` border over 220 ms and the knob hosts a white spinner while loading; label fades/drifts right as the knob approaches; idle "peek" nudge (+9 px, 3×, 2.2 s delay each) teaches the gesture and dies forever on first grab; disabled = 0.45 opacity; web = focusable, Enter/Space activates; re-arms (springs back, clears latch) when un-blocked after cancel/retry.

### 8.11 TransactionReceipt — §3.4. Card: `bg.raised`, radius 16, 1 px `border.base`, overflow hidden; share/export renders a 390-pt-wide 2× canvas twin (same layout language) — sunken outer bg, raised card, identical labels.

### 8.12 TreasuryBootstrapSheet — §3.6. 8.13 BalanceDetailSheet — §2.11.

### 8.14 RpcTroubleBanner + RpcFixForm/Modal
Banner (in Home header flow, marginBottom 12): `warning.soft` fill, radius 12, 1 px `warning.border`, padding 12; `AlertTriangle` 14 (fixed `#C07A0A`); text `text.sm` semibold `warning.base` — "{Name} RPC unavailable" / "{N} networks RPC unavailable"; below, per chain a chip row: 16 px logo + name (`text.sm` medium ink) + accent "Fix" link. FixForm (in RpcFixModal or swapped into BalanceDetailSheet): header "Fix RPC" + ✕ (bottom hairline); body padding 24 gap 16 — chain identity (32 px logo + name + "Chain ID: {id}"), warning-soft callout ("All RPC endpoints for this network are failing…", `Wifi` 14 `#C07A0A`), "RPC URL" uppercase label + sunken bordered input (placeholder `https://rpc.example.com`), accent **"Save & Retry"** (validates: unreachable → alert; wrong chain → "That RPC serves a different network (chain X, expected Y)"), a hairline-topped "Where to get a reliable RPC" block with provider chips (Alchemy / QuickNode / dRPC / Chainlist — sunken bordered full-radius chips + ExternalLink 12), and a centered accent "Still not working? Report it" row (prefilled bug report).

### 8.15 BatchImportSheet (payroll)
AppModal; container padH 20. Header "Import recipients" `text.2xl` bold + ✕. SegmentedToggle unit: "In {fiat}" | "In {SYM}" (fiat default when priced). Paste area: sunken radius-16 mono textarea 84–140 px (placeholder shows 2 example CSV lines). Plain text-buttons row: `FileUp` "Import file" ("Reading…" busy) + `Download` "Get template" → "Template saved" (CSV: name,address,amount). De-containered **Rate** section (`SectionLabel` + open rows + hairline): "Priced in" row → currency code + chevron (opens CurrencySheet); "1 {SYM} =" + a content-sized underlined rate input (editable; the shown string IS the applied rate) + right "Auto" reset; states "Fetching rate…" / "Rate unavailable — enter one manually." / "No market price — set your own rate above.". **Preview list**: per row — ContactAvatar + name/short-addr (+TypeBadge) | right fiat `text.xs` muted over token amount `text.sm` semibold; invalid/duplicate rows at 0.5 opacity with "Invalid address" / "Duplicate — skipped". Notices (`text.xs` `warning.base` + AlertCircle): "Only the first 20 recipients will be sent.", "N rows skipped (invalid or duplicate).". Footer (top hairline): total row ("N recipients" ↔ "{total} {SYM}" bold, `error.base` + "Total exceeds your {SYM} balance." when over) + primary **"Import N recipients"** (disabled = sunken fill).

### 8.16 NetworkFilterSheet
AppModal; head = 34 spacer · "Select Chain" `text.xl` bold · search toggle (Search/X 18). Optional search input (raised, bordered, radius 12, `text.lg`). List gap 8: rows = `bg.raised`, radius 16, 1.5 px transparent border, padding 12 — **selected = accent border** + trailing accent Check 20. First row "All Networks" (40 px sunken Globe circle, sub "Show every chain"); chain rows = 40 px logo + name `text.lg` semibold + optional sub (`"{n} events"` on Home; `"{n} tokens"` in the token picker). Single-select; tap applies and closes.

### 8.17 VelaButton (CTA)
Variants: **primary** = `fg.base` fill (dark ink; inverse text), **secondary** = transparent + 1.5 px `border.strong` (ink text), **accent** = `accent.base` fill (inverse text). Radius 16; padV 16 (compact: padV 12, padH 20); label `text.lg` semibold (compact `text.base`); `shadow.sm` on filled variants; spring 0.97 press; disabled/loading = 0.45 opacity; loading = spinner replaces label. Accent is reserved for actions that move money / commit; most CTAs here are primary-ink.

### 8.18 SectionLabel
`text.sm` 11 semibold `fg.subtle`, uppercase, ls 0.6, marginTop 20 / marginBottom 8 (zeroed when inline in a header row).

### 8.19 AmountText (atomic number)
One-line monetary display: (1) fit-to-width from ideal size, (2) below `minScale` switch to compact notation ($1.23M) instead of illegible shrink, (3) two-tier type — integer large; decimals/unit tail at 0.56×; optional subordinated currency symbol (`symbolScale`, hero uses 0.58). Line-height = 1.12×size. Never wraps mid-number.

---

## 9. Doc conflicts observed (DESIGN_SYSTEM.md vs current code/DESIGN-LANGUAGE.md)

1. **Cards**: DESIGN_SYSTEM §5.2/§6.5 prescribes VelaCard + "confirmation cards"; current Send confirm, token detail, Receive, Home are fully de-boxed (open rows + hairlines + SectionLabel). Cards survive only in: AppModal sheets, connected-dApp card, PayScreen, receipt card, MultiRecipientEditor row-cards, deliberate warning gates. Penpot should model "card" as the exception variant.
2. **TokenSelector add-token**: styles file still contains the old dashed-card `addTokenRow` (SendScreen.styles), but the live component uses a plain centered accent row — the plain row is current.
3. **Fonts**: DESIGN_SYSTEM §2.1 says System/SF-Rounded/Inter; actual is Plus Jakarta Sans everywhere (tokens still *named* `inter`), mono = Menlo/monospace.
4. **fg.muted/subtle hex** in DESIGN_SYSTEM (`#7A776E`/`#B0ADA5`) are STALE — WCAG-corrected values are `#6E6B62`/`#8C887E` (theme.ts is authoritative).
5. **Error color**: doc's `#EF4444` superseded by `#C62828` (light) for AA contrast.
6. **Empty-state icon spec** (§6.4: 56 px circle) varies by screen in practice: Home activity 64, Connections 56, Assets 48 — capture per-screen.
7. **DESIGN_SYSTEM §6.1 nav pattern** (Back · Title · spacer) holds for Receive/TokenDetail/AddToken, but SendScreen deliberately has NO nav title (step titles instead) — keep as a variant.
8. **Entrances**: doc says "FadeInDown on screen entry" unconditionally; actual rule = iOS/web only, once-per-mount, Android instant.

## 10. Behavioral invariants worth boards/notes in Penpot

- Balance display precedence: skeleton (unknown) → cached (no live) → max(live, cached)+notice (partial) → live. Never a fake 0; never a shrinking mid-refresh total.
- Notice gating: 3 silent retries (1.5/4/8 s) before "still updating"; failed-chain wording wins over unpriced wording.
- Rate-limited chains: cached balance + NO fix banner (self-healing); they appear in BalanceDetailSheet labeled "Rate-limited · retrying automatically" without a Fix action.
- Privacy mask is global and persisted (hero, feed, holdings, switcher, toast suppression).
- Split mode collapse: deleting to one row returns to single mode with values carried.
- Fee-quote validity is per-chain; leaving confirm resets the fee-asset choice; a busy re-quote disables the slide.
- In-band fee: the signed fee is EXACTLY the displayed quote; a stale quote is rejected loudly and re-confirmed — never silently re-priced.
- Send success is declared at bundler acceptance (userOpHash); the explorer link/QR lights up later; slow polls never turn a submitted payment into an error, only definitive drop/revert marks Failed.
- Every send commit = slide-to-confirm; the surface is never red.
- QR quiet zones are literal `#FFFFFF` in both themes (Receive, Pay, Treasury).
- Hairline insets always align under TEXT, past the leading icon: 58 (activity 44 px avatar), 60 (token rows 40 px logo), 56 (send hero 44), 48 (balance-sheet 36), 44 (sweep rows 32).
