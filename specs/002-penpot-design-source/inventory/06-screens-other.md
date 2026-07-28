# 06 — Screens: Settings, Onboarding, Connect, Dev

Source of truth: `src/screens/settings/`, `src/screens/onboarding/`, `src/screens/connect/`, `src/screens/dev/` in the Vela Wallet repo (`/Volumes/data/production/vela-wallet`), plus the shared primitives they render. Authoritative style docs read: `DESIGN_SYSTEM.md` (older, card-heavy) and `docs/DESIGN-LANGUAGE.md` (current, de-containered — wins on conflict). All measurements are in base px at text-scale 1.0; every `text.*` size multiplies by the user scale factor (0.82–1.35) and on web by an additional fixed 1.2 boost.

---

## 0. Token reference (needed by every screen below)

### 0.1 Color tokens — light / dark

| Token | Light | Dark |
|---|---|---|
| `fg.base` | `#1A1A18` | `#E8E6E1` |
| `fg.muted` | `#6E6B62` | `#9A9790` |
| `fg.subtle` | `#8C887E` | `#85827A` |
| `fg.inverse` | `#FFFFFF` | `#1A1A18` |
| `bg.base` (page) | `#FAFAF8` | `#141412` |
| `bg.raised` (cards/inputs/modals) | `#FFFFFF` | `#1E1E1B` |
| `bg.sunken` (chips/inset) | `#F5F3EF` | `#0F0F0D` |
| `accent.base` | `#E8572A` | `#E8572A` (same) |
| `accent.soft` | `#FFF0EB` | `#2C1A12` |
| `success.base` / `.soft` | `#2D8E5F` / `#EDFAF2` | `#3DA872` / `#132A1E` |
| `warning.base` / `.soft` / `.border` | `#92600A` / `#FFF8F0` / `#F0DCC8` | `#D4A54A` / `#2A2010` / `#3D3020` |
| `error.base` / `.soft` | `#C62828` / `#FEF2F2` | `#F87171` / `#2D1515` |
| `info.base` / `.soft` | `#4267F4` / `#EDF0FF` | `#5A7CF6` / `#131B33` |
| `border.base` (hairlines) | `#ECEBE4` | `#2C2C28` |
| `border.strong` | `#D8D6CE` | `#3E3E38` |

NOTE: `DESIGN_SYSTEM.md` §3.1 still lists the pre-WCAG values `fg.muted #7A776E` and `fg.subtle #B0ADA5` — STALE; theme.ts is authoritative.

### 0.2 Type, space, radius, shadow, motion

- Font: **Plus Jakarta Sans** (400/500/600/700 weight files). `font.mono` = Menlo (iOS) / `monospace` (Android/web). `DESIGN_SYSTEM.md` §2.1 still says System/SF Rounded — STALE.
- Sizes: xs 10, sm 11, base 13, lg 15, xl 17, 2xl 20, 3xl 26, 4xl 32, 5xl 40.
- Space: xs 2, sm 4, md 8, lg 12, xl 16, 2xl 20, 3xl 24, 4xl 32, 5xl 48.
- Radius: sm 4, md 8, lg 12, xl 16, 2xl 20, full 9999.
- Shadows: sm (0,1, 4% α, r3, elev1), md (0,2, 6% α, r8, elev3), lg (0,4, 8% α, r16, elev6); shadow color always `#1A1A18`.
- Motion: fast 150ms, normal 250ms, slow 400ms; press spring `{damping 15, stiffness 150, mass 0.8}`.
- **Entrance animations run on iOS + web only.** `fadeIn/fadeInDown/fadeInUp` return `undefined` on Android (deliberate — avoids a blank first frame). Any re-implementation must treat entrances as iOS/web-only polish, never load-bearing.

### 0.3 Shared primitives used by these screens (specs the screens rely on)

- **ScreenContainer**: page bg `bg.base`, SafeArea (top edge by default), `paddingHorizontal 24`, iOS keyboard-avoid `padding` behavior.
- **SectionLabel**: text.sm (11), semibold, `fg.subtle`, uppercase, letterSpacing 0.6, marginTop 20 / marginBottom 8 (screens often override margins).
- **VelaButton**: full-width pill, radius 16, paddingVertical 16; variants `primary` (bg `fg.base`, text `fg.inverse`), `accent` (bg `accent.base`, white text), `secondary` (transparent, 1.5px `border.strong`, text `fg.base`); label text.lg semibold; compact variant paddingV 12 / paddingH 20, label text.base; disabled/loading opacity 0.45; loading swaps label for ActivityIndicator; press = spring scale 0.97. No destructive variant exists (screens override `backgroundColor` for danger — see Sign Out).
- **VelaCard**: bg `bg.raised`, radius 16, 1px `border.base`, shadow.sm; `elevated` = borderless + shadow.md. No default padding.
- **SegmentedToggle**: transparent track, content-sized segments (paddingV 8 / paddingH 16, minHeight 44, gap 2), label text.base semibold `fg.muted` → active `fg.base` (color-only change); one floating active chip (radius.full, bg `bg.raised`, 1px `border.strong`, shadow.sm) that springs position+width; selection haptic; horizontal scroll when labels run long; optional leading icon render-prop and numeric badge (18px pill, bg `fg.base`, text `fg.inverse` xs bold).
- **AppModal**: iOS native pageSheet with pull-down; Android full modal with custom drag-to-dismiss from the handle (threshold 90px / fling 0.5, haptic at threshold); web = portal bottom sheet, backdrop `rgba(0,0,0,0.35)`, top radius 20, maxHeight 92%, 300ms slide cubic-bezier(0.4,0,0.2,1), Escape/focus-trap; `fit` variant = content-height bottom card over dimmed backdrop. Handle bar 36×5, radius 3, `border.base`, in a 10-top/6-bottom padding strip. Sheet surface = `bg.base` (not raised).

---

## 1. SETTINGS

### 1.1 SettingsScreen — route `/(tabs)/settings`

The bottom tab bar is hidden app-wide (`(tabs)/_layout.tsx` sets `tabBarStyle display:'none'`); Settings is reached from the Home header and provides its own close control.

**Purpose**: the app's whole preference tree — account, browser extension, appearance, localization, advanced networking, hidden developer tools, about, sign-out.

**Layout**: ScreenContainer → ScrollView (`paddingTop 8`, `paddingBottom 48`, no scroll indicator).

**Header** (fadeIn 0ms/300ms): row, space-between, marginBottom 24.
- Title "Settings" — text.3xl (26) bold, `fg.base`, letterSpacing −0.5.
- Close: plain X icon 22/stroke2 `fg.base` in a 40×40 hit area (no bg — per design language "plain icon buttons") → `router.navigate('/wallet')`.

**Section containers**: each `marginBottom 20`; staggered entrances fadeInDown at 50 / 75 / 100 / 135 / 150 / 175 / 200 / 225ms (300ms duration).

**SettingsRow** (the single row recipe used by every navigation row):
- Pressable row, `padding 16` (all sides), relative.
- Leading icon chip: 34×34, radius 10, bg `bg.sunken`, containing a 16px Lucide icon in `fg.muted`. One quiet recipe for all rows — accent/semantic tints are reserved for states, never navigation (explicit code comment).
- Content column (flex 1, marginLeft 12, gap 2): title text.lg semibold `fg.base`; optional subtitle text.sm regular `fg.subtle`.
- Trailing: ChevronRight 16 `fg.subtle` when pressable (or a custom right element, e.g. ExternalLink 16 on the feedback row).
- Divider: absolutely positioned hairline, `left: 66, right: 0, height 1, border.base` — inset past the icon, Apple-Wallet style. `showDivider=false` on each section's last row.
- Accessibility: role button, label "title, subtitle".
- Section labels above the rows use overrides `marginTop 0, paddingHorizontal 16` so the label's left edge aligns with row titles.

**Section: ACCOUNT** (label `settings.sections.account` = "Account")
1. Row [User icon] — title = active account name (fallback "No Wallet"), subtitle = short address (`0x1234…abcd`) or "Switch account" → opens **AccountSwitcherModal**.
2. Row [BookUser] — "Contacts" / manage subtitle (from contacts namespace) → opens **ContactsManager** sheet.
3. Row [MessageSquare] — "Send feedback" / "Report a bug or share an idea", trailing ExternalLink 16 → opens **BugReportModal**. No divider.

**Section: BROWSER — iOS only** (label `safariExt.sectionLabel` = "Browser")
- Row [Puzzle] — "Use Vela in Safari" / "Connect to any dApp in the browser" → pushes `/safari-extension`. Rendered only when `Platform.OS === 'ios'` (the Safari Web Extension exists only there).

**Section: APPEARANCE** (= "Appearance")
1. Row [Languages] — "Language", subtitle = resolved endonym, plus "· System" suffix when preference is auto (e.g. "English · System") → opens **LanguagePickerModal**.
2. **TextScaleSlider** (inline control, paddingV 20 / paddingH 16, gap 12):
   - Left label "A" text.sm semibold `fg.subtle`; right label "A" text.xl semibold `fg.subtle`.
   - Track: 4px tall, radius 2, `border.base`; fill (left of thumb) also `border.base` — visually neutral (a code comment claims "only the fill carries accent" but the implemented fill is neutral; comment is stale).
   - 6 tick dots 8×8 radius 4 `border.strong`, evenly spaced (one per level).
   - Thumb: 28×28 circle, bg `bg.raised`, 2px `border.strong`, shadow.md; hitSlop 12.
   - Behavior: pan gesture; snaps to nearest of 6 levels while dragging, applying the scale **live** with a light haptic per snap; on release, springs to the snapped tick (damping 20, stiffness 200). Levels: Compact 0.82 · Small 0.91 · Standard 1.00 (default) · Comfortable 1.10 · Large 1.22 · Extra Large 1.35. The whole screen re-renders instantly on change (useStyles).
3. Full-width hairline (`height 1, border.base, marginHorizontal 16`).
4. **ThemePicker** — a SegmentedToggle (paddingV 12 / paddingH 16 wrapper) with 3 options: Light [Sun icon], Dark [Moon], Follow System [Monitor]; icons 14/stroke2 colored `fg.base` when active else `fg.subtle`. Persists color-scheme preference (auto/light/dark); switching remounts the nav tree with rebuilt colors.
5. Hairline.
6. **AvatarStylePicker** — SegmentedToggle with 2 options: "Initials" (preview = 18px circle bg `bg.sunken` with the account's first letter at 9px bold `fg.base`) and "Identicon" (preview = 18px Nimiq identicon seeded by the address, fallback seed "vela"). Previews keep one neutral look in both states (content, not state glyphs).

**Section: LOCALIZATION** (= "Localization") — four "how values render" rows, every subtitle is a **live example**:
1. Row [Banknote] — "Currency", subtitle `"{code} · {formatted 1234.56}"` (e.g. "USD · $1,234.56") → opens **CurrencySheet** (shared searchable currency picker; single-select, applies + closes on tap; rate pre-warmed so Home paints converted values on return).
2. Row [Hash] — "Number format", subtitle = current preset example (auto shows "Automatic · {example}") → **FormatPickerModal** (number).
3. Row [Calendar] — "Date format" → FormatPickerModal (date).
4. Row [Clock] — "Time format" → FormatPickerModal (time). No divider.

**FormatPickerModal** (generic, one per pref; AppModal page):
- Container bg `bg.base`; header row (paddingH 24 / paddingV 16, bottom hairline): title text.xl bold + X 22 close.
- Scroll content padding 16; subtitle paragraph text.sm `fg.muted` lineHeight 20 (e.g. "How amounts are grouped and the decimal mark shown." / "Order of day / month / year and the separator." / "12-hour or 24-hour clock.").
- Option rows, de-boxed: paddingV 12 / paddingH 8, hairline separators (marginH 8). Example text: text.lg semibold **mono** `fg.base`; note below text.sm `fg.muted`. Selected = trailing Check 20 accent stroke 2.6 — selection never shifts layout (no fill/outline). Tap = select + close.
- Number options (sample 1,234,567.89): Automatic (note "System") · `1,234,567.89` · `1.234.567,89` · `1 234 567,89` · `12,34,567.89` (note "Indian").
- Date options (sample 2026-06-13): Automatic (note "System") · `2026/06/13` · `06/13/2026` · `13/06/2026` · `13.06.2026` · `2026-06-13`.
- Time options (sample 13:45): Automatic (System) · `13:45` (note "24-hour") · `1:45 PM` (note "12-hour").

**Section: ADVANCED** (= "Advanced") — collapsible; header row = SectionLabel + ChevronDown 14 `fg.subtle` (rotates 180° when open), paddingRight 16. Collapsed by default. When open, 4 SettingsRows:
1. [Globe/Network icon] "Networks" / "RPC, Explorer & Bundler URLs" → **NetworkEditorModal**.
2. [Zap] "RPC Providers" / "Alchemy, dRPC, Ankr keys" → **RpcProvidersModal** (§1.5).
3. [Plus] "Add Network" / "Add custom EVM network" → **AddNetworkModal**.
4. [Server] "Service Endpoints" / "Chain data, identity index, Bundler" → **EndpointEditorModal**. No divider.

**Section: DEVELOPER** (= "Developer") — hidden until `dev_unlocked` (set by tapping the About-screen logo 6× — see §1.2); collapsible like Advanced. Rows:
1. [Key] "Treasury" / "View treasury address & balances" → **TreasuryModal**.
2. [Key] "Clear Signing Test" / "ERC-7730 signing UI preview" → pushes `/clear-signing-test`.

**About & Sign Out**
- Row [Info] "About" / "Vela Wallet v{version}" (APP_VERSION "1.0.0") → pushes `/about`.
- Sign Out: an open, centered de-boxed row (paddingV 16, gap 8): LogOut icon 16 `fg.muted` + "Sign Out" text.lg semibold `fg.base`. Quiet ink — the danger lives in the confirm modal. Opens the Sign Out confirmation (first checking for pending key uploads).

**Sign Out confirmation** (AppModal; content padding 24, top 20, centered):
- Icon: 56×56 circle bg `error.soft` with LogOut 24 `error.base` stroke2.
- Title "Sign Out" text.xl bold; description text.base `fg.muted` centered lh22: "Your wallet data stays on this device. Sign back in anytime with your passkey (Face ID / fingerprint)."
- Conditional warning banner (only when a public-key upload is pending): full-width row, bg `warning.soft`, radius 12, padding 16, AlertTriangle 16 `warning.base` + text.sm medium `warning.base` lh20: "Your public key hasn't been synced to the server yet. Signing out now may prevent recovery on other devices."
- Destructive CTA: VelaButton `accent` with `backgroundColor` overridden to `error.base` (full width). Label "Sign Out", or "Sign Out Anyway" when the warning shows. Loading state while dispatching LOGOUT → replace `/`.
- "Cancel" — quiet text button, text.base semibold `fg.muted`, paddingV 12.

**NetworkEditorModal** (AppModal page)
- Header (paddingH 24 / V 16, bottom hairline): "Networks" text.xl bold + X.
- Scroll content padding 16, gap 12: one **NetworkConfigCard** (VelaCard, overflow hidden) per network (built-in defaults + user's custom networks).
- Card header (padding 16, gap 12): ChainLogo 36 (remote logo, fallback colored circle+label) · name text.lg semibold + "Chain {id}" text.sm `fg.subtle` · [custom networks only: Trash2 14 `fg.subtle` delete button] · ChevronRight 16 `fg.subtle` (rotates 90° when expanded).
- Expanded body (paddingH 16, bottom 16, gap 12, full-bleed hairline on top): two fields — "RPC URL" and "EXPLORER". Field = label row (label text.xs semibold `fg.subtle`, uppercase, letterSpacing 1 + **HealthBadge**) above a TextInput (text.sm, weight 500, mono, `fg.base`, padding 12, bg `bg.sunken`, radius 12, 1px `border.base`). Saves on blur; saving flushes RPC pool + bundler cache. The bundler URL is intentionally NOT editable per network (global Service Endpoint applies, pool appends `/<chainId>`).
- HealthBadge states: checking = 10px spinner `fg.subtle`; ok = 6px green dot + "{n}ms" text.sm medium in `success.base`; error = red dot + "Offline" in `error.base`. Health checks run whenever a card expands (RPC via `eth_chainId` over HTTPS or WSS; explorer via no-cors reachability).
- Deleting a custom network: alert "Remove Network" / "Remove this custom network?" with Cancel / destructive Remove.

**EndpointEditorModal** (AppModal page)
- Header: "Service Endpoints" text.xl bold; right cluster (gap 12): ExternalLink 18 `fg.muted` (opens the self-deploy README anchor), RefreshCw 18 (re-runs all health checks), X 22.
- Intro paragraph text.sm `fg.muted` lh20: "These services power your wallet.\nYou can deploy your own instances for full self-custody."
- Four VelaCards (padding 16, marginBottom 12). Card header: left column (label text.sm **bold** uppercase letterSpacing 0.5 `fg.base` + hint text.xs `fg.subtle`) and a **ServiceHealthBadge** right; hairline under the header; then an AutoGrowTextInput (mono text.sm, bg `bg.sunken`, radius 12, 1px border, minHeight 56, top-aligned) whose placeholder is the default URL. Saves on blur (trims, strips newlines, invalidates RPC pools, re-checks).
  1. "CHAIN DATA INDEX" — "Provides network info, token data, and chain logos" — default `https://ethereum-data.awesometools.dev`.
  2. "PASSKEY INDEX" — "Stores passkey public keys for cross-device sign-in" — default `https://p256-index-rs.getvela.app`.
  3. "VELA RELAY" — "Vela Relay compatible endpoint required" — default `https://vela-relay.getvela.app`.
  4. "FIAT RATES" — "USD-based exchange rates that drive the currency list — swap for wider coverage." — default `https://vela-currency.getvela.app/v2/rates?base=USD`.
- ServiceHealthBadge states: checking spinner; `ok` green dot + "{n}ms"; `not_https` red + "HTTPS required"; `unreachable` red + "Offline"; `invalid_response` **warning** dot + detail (e.g. "Not a valid vela-relay service" / "No rates returned"). Identity is verified against `/api/health` (`service` field must match), fiat by validating a USD rates payload.
- Footer: "Reset to Defaults" — centered accent text button (text.base semibold `accent.base`).

**AddNetworkModal** (AppModal page; content padding 24)
- Header "Add Network" + X (closing resets all state).
- Intro text.base `fg.muted` lh22: "Search by network name, token symbol, or Chain ID."
- Search input (config-input recipe: mono sm, sunken, radius 12, border), autoFocus, placeholder "e.g. Gnosis, ACE, 648...". 300ms debounce.
- Suggestions: a VelaCard list (paddingV 4); rows paddingV 12 / H 16 with name text.base semibold + meta "Chain {id} · {SYMBOL}" text.sm `fg.muted`, ChevronRight 14, hairline between rows.
- Loading rows (centered, paddingV 24): small accent spinner + "Searching..." or "Checking compatibility..." text.base `fg.muted`.
- Inline error text.sm medium `error.base` (e.g. "This network is already added", "Chain {id} not found", "No RPC endpoint available for this network").
- Chain info VelaCard (padding 20, gap 4): name text.lg bold; "Chain ID: {id}" and "Native: {SYMBOL}" text.sm `fg.muted`; optional "Testnet" chip — text.xs semibold `warning.base` on `warning.soft`, radius 4, self-start.
- "Custom RPC (optional)" VelaCard: title text.sm bold; input; when non-empty a secondary VelaButton "Re-check with this RPC".
- Best-RPC VelaCard: CheckCircle2 16 green + "Best RPC: {n}ms" text.sm medium; URL below text.xs `fg.subtle`, single line, indented 30.
- Compatibility VelaCard: title "Compatibility Check"; then status rows (CheckCircle2 14 green or XCircle 14 red + name; missing names tinted `error.base`): first "P256 Precompile (RIP-7212)", then each required contract by name.
- RPC-failed VelaCard: AlertTriangle 16 `warning.base` + "Unable to verify — RPC request failed"; error detail text.sm `error.base`; secondary "Retry" button.
- CTA states: compatible → accent VelaButton "Add Network" (loading while saving; adds `custom-{chainId}` network with fastest RPC, closes). Incompatible (but RPC ok) → centered hint "Some required contracts are not yet deployed on this chain.\nUse the Vela Wallet Chain Setup tool to deploy them, then come back and re-check." + accent "Open Chain Setup Tool" (opens `https://biubiu.tools/apps/vela-wallet-chain-setup`) + secondary "Re-check".

**TreasuryModal** (AppModal; Developer section) — bundler gas-treasury inspector.
- Scroll content padding 20 (top 16). Centered title "Treasury" text.xl bold with an absolute-right RefreshCw 18 `fg.subtle`.
- Loading: accent ActivityIndicator. Unreachable: centered text.sm `fg.muted` "Could not reach bundler".
- Loaded: QR code (120px) on a white card (padding 12, radius 16, shadow.sm — **always `#FFFFFF`, even in dark mode**, for scannability); address box (bg `bg.sunken`, radius 12, padding 12, 1px border) with label "ADDRESS (ALL NETWORKS)" text.xs semibold uppercase `fg.muted` + Copy 14 icon that flips to an accent Check 14 for 2s on tap-to-copy (with haptic); the address itself text.xs mono selectable.
- "BALANCES" label row with right-aligned total "$X.XX" text.sm bold (4 decimals under $0.01).
- One VelaCard (padding 0) listing every network: row (paddingH 12 / V 8, opens the address on the chain explorer) = name text.sm medium + ExternalLink 10 · right column: amount text.sm semibold mono (tinted `warning.base` with a leading AlertTriangle 12 when below the recommended float) + optional "$usd" text.xs `fg.muted`; underfunded rows also show "min {amount}" text.xs `fg.muted` under the name; per-row spinner while loading; hairline separators inset 12. (Tempo chains show the pathUSD 6-decimal balance instead of native.)
- Footer "Close" — quiet centered text.base medium `fg.subtle`.

**Other modals opened from this screen** (shared components; listed here for completeness of the settings tree, full specs belong to the components report):
- **AccountSwitcherModal** — title "Accounts", subtitle "Total {amount}"; avatar + balance-sorted account list with Check on active; `showCreateActions` adds "Create New Account" / "Sign In with Existing" actions.
- **ContactsManager** — address book sheet: searchable list (search behind a header icon), SegmentedToggle [All | Favorites] with counts, groups, import/export, add/edit form with identity resolution.
- **BugReportModal** — one-click bug report; description field min-height 120 (160 on ≥700px screens); collapsible "exactly what will be sent" preview; backend proxy with prefilled-GitHub-URL fallback.
- **CurrencySheet** — searchable display-currency picker.

### 1.2 AboutScreen — route `/about`

**Purpose**: brand + technical credentials + links; hosts the hidden developer unlock.

**Layout**: ScreenContainer → ScrollView (paddingBottom 100).
- Nav header (paddingV 12, marginBottom 8): ArrowLeft 22 in 40×40 → back; centered "About" text.xl bold; right spacer minWidth 50.
- Logo section (centered, marginBottom 24; fadeIn 0/400): wordmark "vela" — 40px (via scaleFont, so 48px on web) bold `fg.base`, letterSpacing 3, with the final "a" in `accent.base`. **Hidden interaction: 6 taps on the wordmark within a rolling 3s window sets `dev_unlocked=1`** (success haptic; reveals the Developer section in Settings and unlocks the `/clear-signing-test` + `/receipt-harness` routes in production builds).
- Version line "v1.0.0 ({git commit})" text.sm medium `fg.subtle`, marginTop 4.
- Tagline "A simpler way to own crypto" text.base `fg.muted`, marginTop 8.
- "TECHNICAL DETAILS" section title (text.sm semibold `fg.subtle` uppercase letterSpacing 1) above a VelaCard (padding 16; fadeInDown 150/400) of 5 label/value rows (paddingV 8; label text.sm `fg.muted`; value text.sm semibold mono `fg.base`):
  - Wallet — "Safe v1.4.1"
  - Authentication — "WebAuthn / P-256"
  - Account type — "ERC-4337 (Smart Account)"
  - Signer module — "SafeWebAuthnSharedSigner"
  - Networks — "{count} EVM chains" (live network count)
- Links VelaCard (fadeInDown 200/400): three rows (paddingV 16 / H 20; label text.base semibold + ExternalLink 14 `fg.subtle`; full-width hairlines): Website → getvela.app · GitHub → github repo · Safe Wallet → safe-smart-account v1.4.1 tree. Rows open the in-app/system browser.
- Footer text.sm `fg.subtle` centered lh20: "Built with care. Your keys, your coins."

Flag: this screen is still card-heavy (tech + links cards) — legacy `DESIGN_SYSTEM.md` styling, not yet migrated to the de-containered language.

### 1.3 SafariExtensionScreen — route `/safari-extension` (iOS-only entry point)

**Purpose**: onboarding guide for enabling the Vela iOS Safari Web Extension.

**Layout**: ScreenContainer → ScrollView (paddingH 20 — note: 20, on top of the container's 24; paddingBottom 48).
- Nav header (height 44): ArrowLeft 22 left-aligned in 40×40; centered "Safari Extension" text.lg semibold; 40 spacer.
- Hero (open, no card; fadeIn 0/400): "Use Vela in Safari" text.3xl bold letterSpacing −0.02; body text.base lh22 `fg.muted` marginTop 12: "Almost any dApp can connect to Vela right in Safari — only signing hops to Vela for a quick Face ID."
- "ENABLE IT ONCE" section label; steps VelaCard (padding 0; fadeInDown 120/400) with 4 rows (padding 16, gap 12, hairline between): numbered badge 22×22 circle bg `accent.soft` with accent bold number · a 17px accent Lucide icon (Compass, Puzzle, ShieldCheck, Wallet) · step copy text.base lh21:
  1. "Open a dApp site in Safari."
  2. "Tap "Aa" → Manage Extensions → turn on Vela Wallet."
  3. "Tap "Aa" → Vela Wallet → Allow."
  4. "In the site's Connect Wallet list, pick Vela Wallet."
- One-tap card (fadeInDown 220/400): VelaCard with bg `accent.soft`, transparent border; head row Zap 16 accent (filled) + "One-tap signing" text.base semibold; body text.sm lh20 `fg.muted`: "Face ID confirms, then you're back on the page. Tap "Test one-tap signing" in the extension popup once and even the "Open in Vela?" prompt goes away."
- CTA (fadeInDown 300/400): **custom** accent button — bg `accent.base`, radius 15 (hardcoded), paddingV 16, centered white text.lg semibold "Open getvela.app in Safari"; pressed state opacity 0.92; haptic then `Linking.openURL('https://getvela.app')` (opens the real default browser, deliberately not an in-app SFSafariViewController, because extensions only live there).
- Hint under CTA, text.sm `fg.subtle` centered: "That's where the "Aa" menu is."

Flag: the CTA is a bespoke button (radius 15, opacity press) rather than VelaButton — violates the "VelaButton = the only CTA" mandate from the design-review backlog.

### 1.4 ClearSigningTestScreen — route `/clear-signing-test` (Developer)

Route gating: allowed when `__DEV__` OR `dev_unlocked` (async check; renders nothing while checking, redirects to `/wallet` when denied).

**Purpose**: preview harness that drives the REAL `<SigningSheet>` (production signing UI) with 27 mock scenarios — one rendering path so the harness can never drift from production.

**Layout**: ScreenContainer → ScrollView (paddingBottom 48).
- Header (row, gap 12, marginTop 16 / bottom 20): back button — 36×36 circle bg `bg.sunken` with ChevronLeft 22; title "Clear Signing Test" text.2xl bold + subtitle "ERC-7730 signing UI scenarios" text.sm `fg.muted`.
- One VelaCard (padding 0, overflow hidden) listing all scenarios: row paddingV 16 / H 20, gap 12 — icon tile 40×40 radius 12 with a per-scenario tinted bg + 18px icon (colors are HARDCODED hexes, light-mode only: accent `#E8572A`/`#FFF0EB`, amber `#d4890a`/`#FFF8F0`, violet `#6c5ce7`/`#EEF0FF`, red `#d43a2a`/`#FEF2F2`, green `#22a456`/`#EDFAF2`; default FileText on `#F1F1F1`) · title text.base semibold · subtitle text.xs `fg.muted`; hairline dividers (marginH 20).
- Scenario list (id — label — sublabel): erc20-transfer "ERC-20 Transfer / Clear sign — transfer(address, uint256)"; erc20-approve "ERC-20 Approve (Unlimited)"; eth-transfer "ETH Transfer / Plain transfer — no calldata"; personal-sign "Personal Sign / Message signing — login/auth"; eip712-permit "EIP-712 Permit2 / Typed data — gasless token approval"; permit2-single-unlimited "Permit2 Approve (Unlimited) / Off-chain signature — can't be capped"; eip712-unknown "EIP-712 Unknown / Typed data — no descriptor (blind)"; blind-tx "Blind Transaction / Unknown contract — no descriptor"; 1inch-swap "1inch Swap"; nft-transfer "NFT Transfer / ERC-721"; nft-approve-all "NFT Approve All / setApprovalForAll"; vault-deposit "Vault Deposit / ERC-4626"; vault-withdraw "Vault Withdraw / ERC-4626"; erc20-transferFrom "ERC-20 TransferFrom"; hex-message "Hex Message Sign / non-printable hex"; large-eth-send "Large ETH Send / 10 ETH"; erc20-approve-limited "ERC-20 Limited Approve"; eth-sign "eth_sign (raw hash) / Blind-sign trap — should hard-warn"; siwe-phish "SIWE domain mismatch / phishing"; increase-allowance "increaseAllowance / show resulting total"; batch-calls "EIP-5792 batch / wallet_sendCalls — per-call breakdown"; expired-swap "Expired swap deadline"; send-own-account "Send to own account"; scam-drain "Scam drain / sim reveals the drain"; deploy-contract "Deploy contract / no assets leave"; send-contact "Send to a contact"; native-swap "Native swap (ETH → token)".
- Hint below the card, text.sm `fg.muted` centered lh18: "Tap a scenario to open the signing modal with mock data. Clear signing descriptors are fetched live from the ERC-7730 registry."
- Tap → AppModal hosting `<SigningSheet>` with the mock request (dApp shown as "PancakeSwap / pancakeswap.finance"); approving pops an alert "Signed!" / "This is a test — no actual signature was created."

### 1.5 RpcProvidersModal (file in settings/, opened from Settings → Advanced)

**Purpose**: one global API key per provider (Alchemy / dRPC / Ankr) that unlocks all networks the provider serves; feeds the RPC pool's `provider` tier (priority: per-network override > provider keys > Vela built-in > chain index).

**Layout** (AppModal page): header (paddingH 16 / V 12, hairline): "RPC Providers" text.xl bold + X. Scroll content padding 16, gap 12, intro text.sm `fg.muted` lh 1.5×: the priority description above.

Per provider — a VelaCard (padding 16, gap 12):
- Head row: provider label text.lg semibold + status: "Not set" text.sm medium `fg.subtle` (no key) · 12px spinner (testing) · pill (paddingH 8 / V 2, radius.full) — green `success.soft`/`success.base` "{n} networks" when any network passes, else amber `warning.soft`/`warning.base` "Check key".
- Input row: secure TextInput (mono text.base, bg `bg.sunken`, radius 8, paddingH 12 / V 8, minHeight 40; placeholder "API key" / "dkey") + Eye/EyeOff 18 `fg.muted` reveal toggle (only when non-empty). Key persists on blur and auto-tests.
- Actions row (space-between): "Get a key" — quiet link (text.sm semibold `fg.muted` + ExternalLink 13; accent deliberately withheld: "accent is reserved for commit actions, not sign-up detours") opening the provider dashboard; "Test" — small button bg `bg.sunken` radius 8 (text.sm semibold `fg.base`), disabled while testing.
- After a test: summary row (top hairline, paddingTop 8): "Supports {n} of {total} networks" text.sm medium `fg.muted` + Chevron up/down 16; expands a per-network list (gap 8): ChainLogo 22 + name text.base medium + **LatencyBadge** — 7px dot + "{n}ms" text.sm semibold, color-coded: <300ms `success.base`, <800ms `warning.base`, ≥800ms `error.base`; failed = grey `fg.subtle` "Unavailable".
- Keys auto-test on open for providers that already have one.

---

## 2. ONBOARDING

### 2.1 Flow structure & boot

- `app/index.tsx`: while wallet state loads → full-page `bg.base` with a large `accent.base` ActivityIndicator (this is the effective splash beyond the native splash image); then redirect to `/(tabs)/wallet` (has wallet) or `/onboarding`.
- `/onboarding` renders **OnboardingScreen**, a 2-step state machine: `welcome` ↔ `create`. Deep link `?mode=create` jumps straight to the create form. Embedded hosts (e.g. the HTTPS dApp popup) can pass `onComplete` to finish in place; otherwise completion replaces to `/(tabs)/wallet`.
- On mount it health-checks the Passkey Index (3 tries, 2s apart, `/api/health` identity check). If all fail → `endpointUnreachable` → the **OnboardingSettingsModal** auto-opens with a warning banner.

**Emotional/visual arc**: cold boot → warm-neutral page with a single accent spinner → the **always-dark brand Welcome screen** (black `#1A1A18`, white wordmark, slow staggered fades — the only place slow animation is allowed) → the light, form-like Create step (page bg, quiet form) → a tense biometric ceremony narrated by small blue status lines → a green success moment with the address as the reward → the warm light app. Failure branches stay calm: sync failure is framed as fixable ("Cross-Device Sync" header, retry + settings + report), never scary.

### 2.2 WelcomeScreen (step `welcome`)

**A fixed-dark brand screen — it never follows the theme.**
- Container: full-screen `#1A1A18` (hardcoded; deliberate brand exception to "tokens only"), SafeArea top+bottom, paddingH 24.
- Center block (flex 1, centered): wordmark "vela" — 48px (scaleFont) bold, `#FFFFFF`, letterSpacing 3, final "a" `#E8572A`. Entrance fadeIn delay 200 / 600ms. DEV-only: long-press 800ms on the wordmark opens the settings modal.
- Tagline (fadeIn 500/600): "Your keys, your coins.\nSimple as a tap." — text.lg regular, `rgba(255,255,255,0.45)`, centered, lineHeight 24, marginTop 16.
- Button block pinned to bottom (paddingBottom 24, gap 12; fadeInUp 700/500):
  - Primary "Create Wallet": bg `#E8572A`, radius 16, paddingV 20, white text.lg **bold** letterSpacing 0.3. Spring 0.97 press.
  - Secondary "I already have a wallet": transparent, 1px border `rgba(255,255,255,0.12)`, radius 16, paddingV 20, text.lg semibold `rgba(255,255,255,0.5)`. Loading state (passkey sign-in in flight): ActivityIndicator in `rgba(255,255,255,0.5)`; button disabled.

**Sign-in behavior (no dedicated screen — alerts + system passkey sheet):** authenticate with an existing passkey → verify Safe-WebAuthn compatibility → local account match, else query the passkey index; on index-404, an alert offers **signature recovery** ("Recover Your Wallet" / "The key server has no record of this passkey yet. Confirm one more signature to rebuild its public key — and your wallet address — on this device." — buttons "Not Now" / "Recover Now"), which requests one more passkey signature and rebuilds the wallet on-device. Alert inventory: "Not Supported" (no biometrics), "Device Not Compatible" (provider incompatible → suggests Google Password Manager), "Sign In Failed" (with message + Face ID/Touch ID hint), "Recovery Didn't Work" (safe-to-retry copy). Network-ish failures instead flip `endpointUnreachable` and open the settings modal. User cancel = silently return.

### 2.3 OnboardingSettingsModal (pre-login settings; also reachable from Create's failure state)

AppModal page, bg `bg.base`. Header (paddingH 24 / V 16, hairline): "Settings" text.xl bold; right: RefreshCw 18 + X 22.
- Warning banner (only when auto-opened by unreachable endpoint): row bg `accent.soft`, radius 12, padding 16, AlertTriangle 18 `accent.base` + text.sm medium `accent.base` lh20: "The Passkey Index service is unreachable. Wallet creation and sign-in require this service. Please configure a reachable endpoint below."
- "APPEARANCE" SectionLabel → theme row: three equal-width custom buttons (row gap 8): each = icon 16 + label text.sm, bg `bg.sunken`, radius 12, paddingV 12; **active = bg `accent.soft` + 1.5px `accent.base` border + accent semibold label + accent icon** (Sun "Light" / Moon "Dark" / Monitor "Auto"); selection haptic. NOTE: this is NOT the shared SegmentedToggle and uses accent for selection — divergent from the app-wide pattern (flagged below).
- "PASSKEY INDEX" SectionLabel → hint paragraph text.sm `fg.muted` lh20 ("This service stores your passkey's public key for cross-device sign-in. Vela Wallet never has access to your passkey's private key.") → field: header row "Endpoint URL" text.sm semibold + **HealthDot** (checking = 8px spinner; ok = 6px `success.base` dot + "{n}ms" 11px weight-500 green; any failure = **`accent.base`-colored** dot + detail text — note: uses accent, not `error.base`, unlike the in-app HealthBadge) → mono input (config-input recipe). Saves + re-checks on blur.
- "Reset to Default" — centered accent text button.
- DEV builds only: "DEBUG" SectionLabel + quiet "Simulate Endpoint Failure" button (text.sm medium `fg.muted`).

### 2.4 CreateWalletScreen (step `create`)

ScreenContainer (top+bottom safe edges). Three mutually exclusive content states + a persistent bottom slot.

**Header** (centered, paddingV 16): title text.xl bold — "Create Wallet" (form) / "Wallet Created" (success) / "Cross-Device Sync" (sync-failure). Back arrow: ArrowLeft 20 `accent.base` stroke 2.5 in an absolute-left 44×44 target (hidden in the sync-failure state; returns to Welcome).

**State A — Form** (fadeIn 0/400; content paddingTop 32, in a keyboard-persistent ScrollView):
- "ACCOUNT NAME" label — text.sm semibold `fg.muted`, uppercase, letterSpacing 0.8, marginBottom 8.
- Name input — text.lg regular `fg.base`, bg `bg.raised`, 1px `border.base`, radius 16, paddingH 20 / V 16, autoFocus, return-key "done"; disabled while loading or when a registration is pending resume. Placeholder "Enter a name for your account".
- Below: hint text.sm `fg.subtle` lh18 "This name is stored with your public key on-chain for cross-device sign-in." — OR live validation in `accent.base` medium when the UTF-8 name exceeds the 27-byte passkey budget: "This name is too long to fit in a passkey — please shorten it."
- Acknowledgment checklist (marginTop 24, gap 16): 4 rows, each a Pressable toggling its own check — unchecked Square 18 `fg.subtle` stroke 1.5 / checked CheckSquare 18 `accent.base` stroke 2; copy text.sm `fg.muted` lh20:
  1. "This is a self-custodial wallet. Your passkey private key is managed by your device's password manager (iCloud Keychain / Google Password Manager). Vela Wallet cannot access or recover it."
  2. "If you lose your device, you can restore your wallet on a new device through your iCloud or Google account."
  3. "If your iCloud or Google account is compromised, your wallet control may also be compromised. Protect it with a strong password and 2FA."
  4. "I agree to the [Privacy Policy] and [Terms of Service]." — inline links in `accent.base` semibold underline → getvela.app/privacy & /terms.
- Status row (appears during the ceremony; fadeIn 0/200, centered, gap 8, marginTop 16): Loader icon 14 `info.base` + text.sm medium `info.base`. Staged copy in order: "Setting up secure identity..." → (system passkey sheet) → "Verifying identity..." (a proof signature — the passkey must prove it can SIGN before anything is persisted) → "Extracting public key..." → "Computing wallet address..." → "Syncing public key...". Cancel copy: "Setup was cancelled." / "Verification was cancelled. Please try again."
- CTA (marginTop 24): VelaButton **primary** (dark) — "Create Wallet"; disabled until name valid + ALL 4 boxes checked; loading during the ceremony. If registration succeeded but verification was cancelled, the button relabels "**Finish Verification**" and resumes with only a signature (never mints a second passkey); beneath it an escape hatch appears: centered hint text.sm `fg.subtle` "Verification keeps failing? Your device may not have saved this passkey properly. It's safe to start over — nothing has been created yet." + underlined accent link "Start over with a new passkey".
- Alert inventory: "Not Supported" (no biometrics); "Error" (raw message); "Passkey Didn't Sync" (non-discoverable credential explainer, guides to iCloud Keychain / Google Password Manager, "nothing is lost"); "Device Not Compatible" (Safe-incompatible response format).

**State B — Success** (`created`; fadeInDown 0/400, centered, gap 12):
- 72×72 circle bg `success.soft` with CheckCircle2 40 `success.base` stroke 1.5.
- Title "Your wallet is ready!" — text.xl bold **`success.base`** (a deliberate green-title moment).
- Message text.base `fg.muted` centered lh20: "Your address works on all {count} supported networks."
- Address box — full-width row, bg `bg.sunken`, radius 12, paddingH 16 / V 12: address text.sm medium mono middle-ellipsized + Copy 14 `fg.subtle` → tap copies, flips to Check 14 `success.base` for 2s.
- Hint text.sm `fg.subtle` centered: "Your passkey is verified and your key is synced — you're all set."
- Bottom slot: primary VelaButton "Enter Wallet" → dispatches the account and enters the app.

**State C — Sync failure** (`uploadFailed`; passkey verified but the index upload failed after 3 auto-retries at 1s/2s backoff):
- 72×72 circle bg `accent.soft` with AlertTriangle 32 `accent.base`.
- Title "Sync failed" text.xl bold `accent.base`; message text.base `fg.muted` centered: "Wallet created, but your public key wasn't synced to the server. You won't be able to sign in on other devices until this is resolved."; hint text.sm `fg.subtle`: "Check your network, or configure a custom endpoint below."
- Links: "Open Settings" (text.base semibold `accent.base` underline → OnboardingSettingsModal); "Report this error" (text.sm medium `fg.muted` underline → BugReportModal prefilled with the error); "Technical details" quiet disclosure (text.xs `fg.subtle` underline) expanding a mono `bg.sunken` radius 12 box with the raw error (kept deliberately un-alarming).
- Bottom slot: primary VelaButton "Retry Upload" (loading while retrying; success flips to State B). The back arrow is hidden here — the account is NOT saved locally until the server confirms, so retreating would strand an unrecoverable wallet.

---

## 3. CONNECT

### 3.1 ConnectScreen — route `/(tabs)/connect`

**Purpose**: manage the single remote dApp session (WalletPair E2E channel or Remote-Inject bridge) — pair, verify, monitor, disconnect. Also the entry point that routes plain web addresses into the in-app dApp browser.

**Layout**: ScreenContainer → ScrollView (paddingBottom 48). Page header (fadeIn 0/300; marginTop 16 / bottom 20): "Connect" text.3xl bold letterSpacing −0.5 + plain X 22 in 40×40 → `/wallet`.

**Empty/no-wallet state**: centered column (paddingV 48, gap 12): Shield 32 `fg.subtle` + "Create a wallet first" text.lg `fg.muted`.

**State: Disconnected** — guide + actions (both open sections, no cards):
- SectionLabel "Connect to dApps"; then 3 **StepRows** (row, gap 12): leading 40×40 circle bg `accent.soft` with an accent icon (QrCode 18 / Lock 12 / Zap 18, stroke 2) · title text.lg semibold · subtitle text.sm `fg.muted`. Between rows: vertical connector 2×16 `border.base` at marginLeft 19 (centered under the circles).
  1. "Get a pairing URI" / "From a WalletPair dApp or the browser extension"
  2. "Verify the 4-digit code" / "Make sure it matches on both sides"
  3. "Done" / "Requests appear here automatically"
- Actions (fadeInDown 150/300; marginTop 20, gap 16): accent VelaButton "Scan QR Code" → QRScanner modal. Divider row: two flexing hairlines around "or" text.sm `fg.muted`. Paste hint text.sm `fg.subtle` centered: "Connect a dApp, or open any website". Input row (gap 8): mono text.sm input (bg `bg.sunken`, radius 12, padding 12, flex 1, placeholder "walletpair link or web address", return-key "go") + a plain 44×44 ArrowRight 20 icon button — `fg.subtle` disabled / `accent.base` enabled.
- Input routing: WalletPair URI → E2E pairing; remote-inject URL → bridge pairing; anything URL-ish (even a bare host like `app.uniswap.org`) → pushes `/browser?url=…`; otherwise alert "Invalid Link" / "Not a valid connection link. Supported: WalletPair URI or Remote Inject URL."

**State: Connecting** — rendered by the shared **ConnectionFlowStates** (same component inlined on Home → Connections, so pairing never yanks the user to another screen):
- *Fingerprint verification (WalletPair)* — a deliberate security gate, kept LIGHT: a soft surface (bg `bg.sunken`, radius 16, 1px `border.base`, padding 20, centered, gap 12) — Fingerprint 28 `accent.base` + "Verify Connection" text.xl bold; hint text.base `fg.muted` "Confirm this code matches what the dApp displays:"; 4 digit boxes 52×64, radius 12, bg `bg.raised`, 1px `border.strong`, digit 28px bold mono; optional dApp identity row (14px favicon or Globe + name text.sm mono `fg.subtle`); "End-to-end encrypted" pill (Lock 12 + text.xs semibold, `success.soft`/`success.base`, radius.full); actions: full-width accent "Confirm" + secondary "Cancel".
- *Waiting (remote bridge)* — centered (paddingV 48, gap 12): 64×64 circle in `accent.base` at 12% alpha (`+ '12'` suffix) with Radio 32 accent; "Waiting for dApp to accept..." text.lg semibold **`accent.base`**; hint "Go back to the dApp and approve the connection." text.base `fg.muted`; compact secondary "Cancel".
- *Error* — open typographic state (no card; paddingV 32, centered, gap 8): 64×64 circle `error.soft` with AlertTriangle 28 `error.base`; "Connection Failed" text.xl bold; message (server error or "Unable to connect to the bridge.") text.base `fg.muted`; full-width accent "Scan Again" + (when a session exists) secondary "Retry".

**State: Connected / Reconnecting** (fadeInDown 50/300; open section, no card):
- Header row (gap 8): status dot 10×10 — `success.base`, or `warning.base` at 0.7 opacity when reconnecting; title "Connected" / "Reconnecting..." text.xl bold; WalletPair sessions add a right-aligned "E2E" pill (Lock 10 + text.xs semibold on `success.soft`).
- Info group — three de-boxed rows (paddingV 12, gap 8; hairline separators inset `marginLeft 22` = 14px icon + 8 gap): ① dApp — 14px favicon (radius 3) or Globe 14 `fg.muted` + "Name (host)" · ② wallet — Smartphone 14 + "Account name (0x12…cd)" · ③ chain — Link 14 + chain name. Row text: text.sm, weight 500, mono, `fg.subtle`, single line.
- Hint text.base `fg.muted`: "Signing requests from dApps will appear automatically."
- Secondary VelaButton "Disconnect" (marginTop 20) → confirm alert (destructive "Disconnect" / "Cancel") before tearing the session down.

**QRScanner** (modal, shared component): full-screen camera with corner frame, torch/zoom/flip/photo-import controls, jsQR+zbar decoding on web — spec belongs to the components report.

---

## 4. DEV (brief)

### 4.1 ReceiptHarnessScreen — route `/receipt-harness`

Gate: `__DEV__` or `dev_unlocked` (same pattern as clear-signing-test). **Purpose**: renders the REAL `<TransactionReceipt>` + `<TransactionDetailSheet>` with mock props (BNB-chain USDT/USDC fixtures) so batch-send visuals verify without login/bundler.

- Top bar: "‹ Back" text button in `accent.base` · "Receipt harness" text.lg bold · 44 spacer. (Copy is intentionally not localized — dev surface.)
- Control panel (ScrollView, paddingH 12): uppercase group labels text.xs semibold `fg.muted`; wrapping chip rows. **Chip**: paddingH 8 / V 4, radius.full, bg `bg.raised`, 1px `border.base`, label text.sm medium `fg.muted`; active = bg `accent.soft` + `accent.base` border + accent label.
  - Scenario: Single · Split (1→N) · MultiSelect (N→1).
  - Status: Submitted · Confirmed · Failed.
  - Actions: "▶ Simulate confirm (2.5s)" (flips submitted→confirmed live to demo the status stamp/QR/hash transition) · "Open detail sheet (#1)" · "Preview share image (#2)" (web only — renders the exact share-canvas PNG into a 520px-tall preview block on `bg.sunken`).
- Bottom: the live TransactionReceipt fills remaining space above a top hairline.

---

## 5. Conflicts, inconsistencies & flags (for the Penpot rebuild)

1. **DESIGN_SYSTEM.md is stale where it conflicts with theme.ts + DESIGN-LANGUAGE.md**: font (System/SF-Rounded vs actual Plus Jakarta Sans), fg.muted/subtle hexes, "cards everywhere" guidance. DESIGN-LANGUAGE.md + theme.ts win.
2. **Card usage split**: SettingsScreen root, ConnectScreen and the format/language pickers follow the de-containered language (open rows + inset hairlines). But AboutScreen, SafariExtensionScreen, ClearSigningTestScreen and every settings sub-modal (network/endpoint/provider/add-network cards) still use VelaCards. Inside modal sheets this arguably reads as "genuinely distinct surfaces", but About/SafariExtension are plain pushed screens on the old pattern.
3. **OnboardingSettingsModal theme picker** is a bespoke 3-button row with accent-filled selection — not the mandated SegmentedToggle, and it spends accent on a non-commit selection. Same modal's HealthDot colors failures `accent.base` (in-app equivalents use `error.base`).
4. **Hardcoded hexes**: WelcomeScreen (deliberate, documented brand-dark exception), ClearSigningTestScreen scenario icon tints (light-only values — will look wrong in dark mode), SafariExtensionScreen CTA (`#fff` text, radius 15), TreasuryModal QR card `#FFFFFF` (deliberate for scan contrast).
5. **No destructive button variant** — Sign Out overrides VelaButton-accent's background with `error.base`; a Penpot component should model `destructive` as a first-class variant.
6. **Text-scale slider**: code comment says the fill carries accent; implementation paints fill in `border.base` (neutral). Rebuild should decide one way (implemented = neutral).
7. **Entrances are iOS/web-only** (Android renders instantly) — capture animations as optional layers.
8. **SettingsRow divider inset is 66px** while icon+padding math gives 62 (16+34+12) — the 66 is intentional-looking but undocumented.
9. **i18n index comment says "12 locales"; SUPPORTED_LANGUAGES actually lists 15** (en, zh, zh-TW, zh-HK, ja, ko, vi, id, tr, ru, es-MX, pt-BR, fr, it, de) → language picker renders 16 rows (Follow System + 15).
10. **Hidden affordances to preserve**: About-logo 6-tap dev unlock (3s window, success haptic); Welcome-logo DEV long-press for settings; dev sections/routes keyed off the same `dev_unlocked` flag.
