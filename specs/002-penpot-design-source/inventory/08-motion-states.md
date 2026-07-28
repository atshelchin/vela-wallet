# 08 — Motion, Interaction & State Patterns (cross-cutting)

Pattern library for the Penpot "Interaction patterns" page. Every pattern lists exact
parameters (durations, scales, spring configs, trigger conditions) and everywhere it
applies. Source of truth: `src/constants/theme.ts`, `src/constants/entering.ts`,
`src/constants/text-scale.ts`, `src/constants/color-scheme.ts`, component sources cited
inline. Authority order: `docs/DESIGN-LANGUAGE.md` (current, de-containered) overrides
`DESIGN_SYSTEM.md` (older, card-heavy) where they conflict — conflicts flagged in §20.

---

## 1. Motion tokens (theme.ts)

| Token | Value | Use |
|---|---|---|
| `motion.fast` | 150 ms | micro transitions |
| `motion.normal` | 250 ms | standard transitions |
| `motion.slow` | 400 ms | screen-level entrances |
| `motion.spring` | `{ damping: 15, stiffness: 150, mass: 0.8 }` | ALL press feedback, SegmentedToggle chip, VelaRefresh settle |
| `motion.springGentle` | `{ damping: 20, stiffness: 120, mass: 1 }` | reserved gentler spring (rarely used) |

Rules (DESIGN_SYSTEM §7, still honored): interactive feedback is always `withSpring`
never `withTiming`; entrances complete ≤ 500 ms incl. delay; no bounce/elastic on content
(the splash overlay is the only elastic exception); never animate > 2 properties on one
element.

---

## 2. Entrance animations

### 2.1 Platform-aware helpers — `src/constants/entering.ts`

- `fadeIn(delay = 0, duration = 300)` → Reanimated `FadeIn.delay(d).duration(dur)`
- `fadeInDown(delay = 0, duration = 300)` → `FadeInDown…`
- `fadeInUp(delay = 0, duration = 400)` → `FadeInUp…`
- **iOS only.** All three helpers are `if (!isIOS) return undefined`
  (`entering.ts:23/29/35`) — on Android AND web the element renders instantly.
  Rationale is Android's blank-frame flicker (one visible frame at opacity 0);
  web simply rides the same non-iOS branch and gets the settled render.
- Design consequence: entrance motion is an iOS-only enhancement; Android and web
  ship the *settled* state. Penpot boards must not depend on entrance motion to
  establish hierarchy.

### 2.2 Stagger recipes actually in use (delay ms / duration ms)

- **HomeScreen**: header `fadeIn(0,400)`; hero+nav block `fadeInDown(60,400)`.
- **SettingsScreen**: header `fadeIn(0,300)`; sections `fadeInDown` at 50/75/100/135/150/175/200/225, all 300.
- **AboutScreen**: logo `fadeIn(0,400)`; sections `fadeInDown(150,400)`, `(200,400)`.
- **SafariExtensionScreen**: hero `fadeIn(0,400)`; sections `fadeInDown` 120/220/300, 400.
- **TokenDetailScreen**: hero `fadeIn(0,400)`; buttons `fadeInDown(100,400)`; details `fadeInDown(200,400)`.
- **ConnectScreen**: header `fadeIn(0,300)`; content `fadeInDown(50,300)`; scan section `fadeInDown(150,300)`.
- **ReceiveScreen**: sections `fadeInDown(100,400)` and `(200,400)` (hasEntered-gated); deposit box `fadeIn(0,300)`.
- **WelcomeScreen** (onboarding, slowest allowed): `fadeIn(200,600)`, `fadeIn(500,600)`, button `fadeInUp(700,500)`.
- **CreateWalletScreen**: state containers `fadeInDown(0,400)`; status rows `fadeIn(0,200)`.
- **Send flow**: each step `fadeInDown(0,300)` (SendScreen/EnterDetailsStep/ConfirmStep); tx-status block `fadeInDown(0,200)`; ConfirmAssets list `fadeInDown(0,200)`.
- **AddTokenPanel**: result cards `fadeInDown(0,300)` (4 sites).
- **ConnectionFlowStates**: fingerprint card `fadeInDown(50,300)`; waiting `fadeIn(0,300)`; error `fadeInDown(0,300)`.
- **ContactsManager**: search header `fadeIn(0,160)`.
- **Collapsible** (`ui/collapsible.tsx`): expanding body `FadeIn.duration(200)` (raw Reanimated, not gated).
- **List rows**: `TokenRow` = `fadeIn(index*40, 300)`; `ActivityRow` = `fadeInDown(index*40, 300)`.

### 2.3 `hasEntered` gating — "entrances play once" (DESIGN-LANGUAGE rule 10)

Pattern: `const hasEntered = useRef(false); useEffect(() => { hasEntered.current = true; }, []);`
then `entering={hasEntered.current ? undefined : fadeInDown(...)}`.
Purpose: a parent re-render burst (e.g. account switcher refreshing every account's
balance) must NOT replay the entrance — without the gate the hero/list appears to
slide/flicker behind the modal.
Applied in: `HomeScreen` (header + hero block), `useHomeController` (owns the ref),
`ActivityRow` (per-row), `RpcTroubleBanner`, `ReceiveScreen` (two sections).
Note: `TokenRow` does NOT gate (its `fadeIn` re-fires on remount, acceptable because the
Assets list is keyed by address and remounts only on account switch).

### 2.4 Splash (only >500 ms animation allowed)

`components/animated-icon.tsx` — `AnimatedSplashOverlay`: full-screen keyframe, 600 ms,
scale `screenH/90 → 1`, opacity 1→0 between 20%–70%, `Easing.elastic(0.7)`; solid
backdrop `#208AEF`. `AnimatedIcon`: 128 px tile, gradient `#3C9FFE→#0274DF` radius 40,
logo fades/scales 1.3→1 over 600 ms, glow layer rotates 7200° over 4 min.
⚠️ This still shows the Expo template logo/colors (off-brand blue) — flag for rebrand;
not part of the confirmed design language.

---

## 3. Press feedback (spring scale)

All via `withSpring(target, motion.spring)` on `transform.scale`, on `onPressIn`, back to
1 on `onPressOut`. Never `TouchableOpacity`.

| Element | Scale | Extra |
|---|---|---|
| `VelaButton` (all variants) | 0.97 | disabled/loading opacity 0.45; loading swaps label → `ActivityIndicator` |
| `WaveDock` Send/Receive pills | 0.97 | `hapticLight()` fired on pressIn |
| `WaveDock` Scan FAB | 0.92 | `hapticLight()` on pressIn (deeper dip = round FAB) |
| `TokenRow` | 0.98 | — |
| `ActivityRow` | 0.98 | only when `onPress` provided |
| `SlideToConfirmButton` knob | ×1.06 grow while grabbed | spring `{damping 16, stiffness 320}` |

Opacity-pressed variants (secondary affordances, via `({pressed}) => [...]`):
`balanceStalePressed` 0.6 · `copyRowPressed` (IdenticonViewerSheet) 0.6 ·
`reconnectBtnPressed` 0.82 + scale 0.985 · `ctaPressed`/`doneBtnPressed` 0.92 ·
plus `rowPressed`/`pressedHeading` one-offs. Guidance for Penpot: pressed state =
scale 0.97–0.98 for primary rows/buttons, opacity ~0.6 for inline text links,
opacity ~0.9 for full-width flat CTAs.

---

## 4. VelaRefresh — branded pull-to-refresh (`ui/VelaRefresh.tsx`)

Custom, gesture-driven, identical on iOS/Android/web (native RefreshControl is never used).

**Geometry & thresholds**
- `TRIGGER = 72 px` pull distance to arm; `REST = 72 px` parked height while refreshing.
- 1:1 finger tracking until 72 px, then over-pull resistance `×0.4` (the resistance
  change IS the threshold feel).
- Release ≥ 72 px → spring to REST (motion.spring) + fire `onRefresh`; else spring to 0.
- Pull only engages when the list is at scrollTop ≤ 1; upward drag hands back to scroll
  (`activeOffsetY(12)` / `failOffsetY(-12)` on native Pan; raw touch events on web).

**Haptic**: single `hapticLight()` the instant the pull crosses 72 px (latched; re-arms
if you back off below the trigger).

**Indicator** (30 px ring, 3 px stroke, starts at 12 o'clock):
- Track: full circle `color.border.base` at opacity 0.6.
- Arc: `color.accent.base`, round caps; drawn fraction = `0.08 + p×0.62` while pulling
  (p = pull/72 clamped 0..1), fixed `0.72` while refreshing.
- Wrapper: scale `0.55 + p×0.45` while pulling, 1 while refreshing; rotation `p×130°`
  while pulling; continuous spin `360°/750 ms linear` while refreshing; unwind to 0 over
  160 ms when done.
- Chip behind ring (native only): 44 px circle (`RING+14`), `bg.raised`, shadow
  `{0,2, 0.08, r6, elev3}`; transparent on web.
- Band fade-in: opacity = `pull / (0.7×72)` clamped to 1; band translates with the pull.

**Status caption**: optional `statusText` under the ring — `text.xs`, `inter.medium`,
`fg.subtle`. Home passes `"Updated {{ago}}"` (`home.lastUpdated`) — freshness is the
point of pulling.

**Minimum dwell**: Home's `onRefresh` awaits `Promise.all([loadData(true), 650 ms timer])`
so the spinner never flashes for less than ~650 ms. A user pull always bypasses the 5-min
token cache (forceRefresh).

**Scroll props contract** (spread on the child `Animated.FlatList/ScrollView`):
`bounces=false`, `overScrollMode="never"`, `contentInsetAdjustmentBehavior="never"`,
`automaticallyAdjustKeyboardInsets=true`, `keyboardShouldPersistTaps="handled"`,
`keyboardDismissMode="interactive"`, `scrollEventThrottle=16`. Web additionally requires
`overscroll-behavior: none` on html/body (global.css) so Android Chrome's native
pull-to-refresh doesn't eat the gesture.

Used by: Home Activity tab, Home Connections tab, `HoldingsList` (Assets tab). `enabled`
prop lets a host disable the pull while a sheet is open.

---

## 5. Haptics vocabulary (`services/platform.ts` — all no-op on web)

| Function | expo-haptics call | Meaning |
|---|---|---|
| `hapticLight()` | `impactAsync(Light)` | neutral touch acknowledgement |
| `hapticSelection()` | `selectionAsync()` | selection tick (lighter than impact) |
| `hapticSuccess()` | `notificationAsync(Success)` | positive outcome |
| `hapticWarning()` | `notificationAsync(Warning)` | blocking validation / "are you sure" |
| `hapticError()` | `notificationAsync(Error)` | failed tx / rejected sign / invalid input |

**Complete call-site inventory** (design-behavioral contract — where each buzz fires):

- `hapticLight`: VelaRefresh trigger crossing; AppModal drag past dismiss threshold
  (Android sheet, fit sheet); WaveDock all three buttons on pressIn; TokenRow contract-
  address copy; ActivityRow tap; SlideToConfirm grab + 60% tick; SigningSheet the moment
  the user commits the slide; Send flow various copy taps; Receive network chip toggle +
  explorer link + share; Settings rows (3 sites); ConnectionsView reconnect;
  Contacts search open/close/filter/row-tap (6 sites); ContactPicker rows/scan/add;
  BatchImportSheet currency row + import step; TreasuryBootstrapSheet copy;
  BundlerFundingModal QR toggle + 2 actions; PayScreen copy; WelcomeScreen theme-color
  pick; SafariExtension CTA; QRScanner torch toggle; TransactionReceipt userOp copy;
  GroupEditor remove.
- `hapticSelection`: SegmentedToggle change (only when value actually changes);
  TokenSelector category chip; WalletAvatar / ContactAvatar identicon-enlarge tap;
  ExtensionSignController "rejected" outcome.
- `hapticSuccess`: money-in celebration (`useHomeController.celebrateReceipt`); send
  accepted by bundler (`useSendController` ~L997); SigningSheet `pendingOpHash` lands;
  SlideToConfirm commit; QR scan success (4 sites); address/copy confirmations (About,
  IdenticonViewerSheet, TransactionReceipt ×2, share-card ×2); AddTokenPanel add/import
  (3 sites); AccountSwitcher account switched; BugReportModal submitted; ContactsManager
  contact saved; GroupEditor save/create; BatchImportSheet applied; BundlerFundingModal
  funded (2 sites); ExtensionSignController self-test pass + signed outcome.
- `hapticWarning`: SigningSheet on arrival of a dangerous request (`eth_sign`, unlimited
  non-reducing approval, SIWE domain mismatch); ExtensionSignController missing/unknown.
- `hapticError`: send failed (2 sites in useSendController); SigningSheet `signError`.

Copy-to-clipboard pairing rule (use-copy-feedback docstring): haptic choice stays at the
call site — `hapticLight` for incidental copies, `hapticSuccess` for "the point of the
screen" copies (e.g. Receive address).

---

## 6. SlideToConfirmButton (`ui/SlideToConfirmButton.tsx`) — the commit control

Used for every consequential commit (Send confirm, all dApp signing). Replaces tap.

- Track: height 60, radius 30, `bg.raised`, 1 px `border.base`; label `text.lg`
  `inter.semibold` `fg.muted` centered (insets 60 px each side).
- Knob: 52 px accent circle (`accent.base`), white `ArrowRight` 22/2.6, `shadow.md`,
  4 px padding; web cursor `grab`; hitSlop 10 all sides.
- Commit: release ≥ 80 % of track (`COMPLETE=0.8`), or flick ≥ 900 px/s velocity past
  45 % (`FLICK_MIN=0.45`). On commit: track interpolates to `success.soft` +
  border `rgba(45,142,95,0.3)` over 220 ms; knob glides to end 110 ms; then
  `hapticSuccess()` + `onConfirm`.
- Under-threshold release: spring back `{damping 18, stiffness 260}`.
- Rubber-band overdrag ×0.12 both ends (right capped +10 px).
- Mid-drag tick: `hapticLight` at 60 % (latched per drag); grab = `hapticLight` + knob
  scale 1.06 (`{damping16, stiffness320}`).
- Idle teach: knob "peeks" +9 px (240 ms out, spring back `{13,240}`) after a 2.2 s
  delay, 3 repeats; killed forever on first grab.
- Loading: knob parks at end hosting a white `ActivityIndicator`; disabled/loading =
  opacity 0.45. Re-arms (springs home, clears latch) when leaving blocked state.
- Gesture yields to vertical scroll: `activeOffsetX ±6`, `failOffsetY ±14`.
- A11y: `role=button`, label=title, hint prop, `accessibilityActions:[activate]`
  (screen-reader double-tap fires directly); on web the track is tabbable and
  Enter/Space fires — keyboard users bypass the drag.
- Placement rule: never rests against the bottom screen edge — keep ≥ ~48 pt clearance
  (iPhone app-switcher swipe owns that band).

---

## 7. Loading states

### 7.1 BalanceSkeleton (the only shimmer skeleton) — `BalanceDisplay.tsx`
- Shown when balance is *unknown* (no live tokens, no cached total, first fetch in
  flight) — never a fake "0".
- Bar 208×46, `radius.md`, `bg.sunken`, centered in the ~63 px hero line box.
- Sweep band 96 px wide, `bg.raised` at opacity 0.85, translateX loops
  `-96 → 208+96` over 1150 ms, `Easing.inOut(quad)`, infinite.
  (Raised-on-sunken reads as a highlight in BOTH themes.)
- A11y: `accessibilityRole="progressbar"`, label "…".

### 7.2 ActivityIndicator conventions (everything else)
- Inside buttons: replaces the label, tinted to the label color (`VelaButton`,
  RpcFixForm save 16 pt white, SlideToConfirm knob small white).
- Inline rows: small accent spinner + status text (`ConfirmStep` tx status: "Preparing…/
  Waiting for passkey…/Submitting…"), each with `fadeInDown(0,200)` entrance.
- GasFeeCard: value column literally reads `Estimating…` (`componentsUi.gas.estimating`)
  while quoting; refresh affordance is a 14 pt `RefreshCw` that swaps to a 14 pt muted
  `ActivityIndicator` while re-quoting.
- HoldingsList: `loading` (likely-funded but scan not painted) returns `null` from
  ListEmpty — suppresses the empty state rather than flashing it.
- ReconnectButton (ConnectionsView): continuously spinning `RefreshCw` 16 pt white,
  360°/900 ms linear infinite + label flips to "Reconnecting…" for 1400 ms after tap.
- QRScanner scan line: translateY loops 0 → frame−2 px, 2000 ms, `Easing.inOut(ease)`,
  infinite reverse.

### 7.3 Stream-in, never blank
Home paints the activity feed from on-device store instantly, then reconciles/ discovers
in background; token totals stream per chain and merge (a slow chain keeps its last
value — the total never dips to $0 mid-refresh).

---

## 8. "Money in" celebration set (Home)

Trigger: a NEW incoming transfer discovered after first pass (`celebrateReceipt`).
Four coordinated cues:
1. **Row glow** (`ActivityRow isNew`): full-row wash `success.soft`, opacity 1 → 0 over
   1600 ms (withTiming), absolute overlay, no border.
2. **Balance pulse**: hero scale `1 + 0.03×p` — up 220 ms `Easing.out(quad)`, down
   1000 ms.
3. **Receipt toast** (`ReceiptToast`): pill fixed at `insets.top + 8`, centered,
   `success.base` bg, `radius.full`, `shadow.lg`, white 8 px dot + `text.lg inter.bold`
   white "`{{amount}} {{token}} received`"; enters over 320 ms `Easing.out(quad)` with
   translateY −24 → 0 + fade; auto-dismisses after 2800 ms; `pointerEvents="none"`.
4. **`hapticSuccess()`**.
Privacy rule: toast is suppressed while balance privacy (masking) is on — it would leak
the number the mask hides. Backlog is never celebrated (first load pass is silent).
Dev seam: `velaSimulateReceipt(100,'USDT')` in web console replays the full effect.

---

## 9. Continuous/status indicators

- **Connection dot** (Home Connections): 7 px dot — `success.base` when connected;
  reconnecting = `warning.base` at opacity 0.8 (static, no pulse). Status text matches
  color. ⚠️ DESIGN_SYSTEM's "pulsing opacity 0.3↔1.0, 800 ms" status pattern no longer
  exists anywhere in src — do not carry it into Penpot.
- **Spinners**: VelaRefresh arc 750 ms/rev; ReconnectButton 900 ms/rev; both linear.
- **Splash glow**: 7200° over 4 min (§2.4).

---

## 10. Error & warning surfaces

### 10.1 RpcTroubleBanner (chains whose every RPC failed; rate-limited chains excluded)
- Container: `warning.soft` bg, 1 px `warning.border`, `radius.lg`, padding `space.lg`,
  gap md, marginBottom lg. Entrance `fadeInDown(0,300)`, hasEntered-gated.
- Icon: `AlertTriangle` 14 pt, hardcoded `#C07A0A` (⚠️ token deviation — should be
  `color.warning.base`). Same hex on the fix-form's Wifi icon.
- Copy: 1 chain → "`{{name}} network is unavailable`"-style single string
  (`assets.rpcUnavailableSingle`); else count variant. Per-chain chip rows: 16 px chain
  logo + name (`text.sm inter.medium fg.base`) + accent "Fix" link.
- Fix flow (`RpcFixForm`, single shared instance): chain row (32 px logo), warning box
  (same warning.soft/border recipe), uppercase label (`text.sm semibold`, ls 0.5),
  URL input (`bg.sunken`, 1 px border.base, radius.lg), accent save button
  (disabled opacity 0.5, spinner while validating), provider chips
  (Alchemy/QuickNode/dRPC/Chainlist — `bg.sunken` `radius.full` 1 px border chips with
  12 pt ExternalLink), and a last-resort "report this" accent link row. Validation:
  probes `eth_chainId`, alerts on unreachable/wrong-chain BEFORE saving.

### 10.2 Stale-balance notice (hero)
Row under the balance, shown only when `balancePartial && noticeAllowed`:
12 pt `AlertTriangle` + `text.sm inter.medium warning.base` copy + 14 pt ChevronRight;
pressed opacity 0.6; opens BalanceDetailSheet. Copy: failed chains →
"Some balances are still updating." (transient, honest); unpriced tokens →
"Some tokens couldn't be priced." (permanent — never promises an update).

### 10.3 Send/sign failure
ConfirmStep `txStatus==='error'`: row with 20 pt `AlertCircle` `error.base` + error text,
plus a Retry text button that resets to idle. SigningSheet: `hapticError` on signError;
dangerous requests get `hapticWarning` on arrival (see §5).

### 10.4 GasFeeCard estimate failure
Value column switches to "Estimate failed" in warning color + a 16 pt warning `RefreshCw`;
the entire row press becomes retry.

### 10.5 ConnectionFlowStates error (pairing)
Open typographic state (no card): 64 px `error.soft` circle with 28 pt `AlertTriangle`
`error.base`, `text.xl bold` title, muted message, accent "Scan again" + secondary
"Retry" full-width buttons. Enters `fadeInDown(0,300)`.

### 10.6 Dialogs — `showAlert()`
Native: system `Alert.alert`. Web: `AppAlert` portal above all modals (z 9,999,999) —
centered card `bg.raised`, `radius.xl`, padding `2xl`, maxWidth 340 (85 % width),
`shadow.lg`; backdrop `rgba(0,0,0,0.35)`; title `text.lg bold`, message `text.base
regular fg.subtle` lh 22; right-aligned button row: cancel = subtle text, primary =
accent-filled `radius.lg`, destructive = `error.base`-filled; full `useWebDialog`
contract (§17). Role `alertdialog`.

---

## 11. Rate-limit UX & degraded-data model

Two distinct failure sets from `services/rpc-pool.ts`:
- `getFailedRpcChains()` — every endpoint failing (real breakage).
- `getRateLimitedChains()` — failure is 429/rate-limit: transient and self-healing.

Behavioral contract (encodes the "Rate-limit UX" product decision):
1. Rate-limited chains are FILTERED OUT of RpcTroubleBanner
   (`failedChainIds.filter(id => !rateLimitedChainIds.includes(id))`) — never nag the
   user to swap RPC for a limit that lifts in seconds.
2. Balance quietly falls back to cache: hero shows
   `max(liveTotal, cachedTotal)` whenever partial; a complete clean fetch becomes the new
   cached "last known good" (`setAccountBalance`).
3. The "still updating" notice is grace-gated: an incomplete result gets 3 silent forced
   retries at 1.5 s / 4 s / 8 s before `noticeAllowed` flips true. A clean result resets
   the budget.
4. Rate-limited chains still count toward `balancePartial`, so the hero notice can show,
   but the BalanceDetailSheet distinguishes them from broken chains.
5. Refresh cadence: focus + every 10 min in foreground; 10 s live poll while the
   Activity tab is visible; pull always forces.
Dev validation: `vela.rateLimitRpc(chain|'all')`, `vela.failRpc`, `vela.slowRpc(ms)`,
`vela.flakyRpc(p)`, `vela.nullPrice`, `vela.forceFunding`, `vela.status/clear/help`
(web console, dev only — `services/dev/fault-injection.ts`).

---

## 12. Offline states

There is NO dedicated offline banner and no NetInfo dependency. Offline is handled as
graceful cache degradation, indistinguishable from RPC failure:
- Balances: `balance-cache` per-account totals (hero paints instantly from cache on
  account switch — never a $0 flash).
- Activity feed: on-device store paints first, network reconciles after.
- Fiat FX: 6 h in-memory + persisted cache for offline/first paint (`fiat-fx.ts`,
  `fiat-rates.ts` persisted fallback + ship-known addresses).
- Currency picker: static base list for instant/offline paint (`currency.ts`).
- Total offline → all chains enter the failed set → RpcTroubleBanner appears (arguably
  misleading copy when the device itself is offline — see open questions).
`isAppActive()` gates background polling (AppState / document.visibilityState).

---

## 13. Empty states — full inventory

Current language: OPEN states (icon in a soft circle + title + subtitle, no card) —
DESIGN_SYSTEM §6.4's card variant is superseded except where noted.

| Surface | Visual | Copy (en) |
|---|---|---|
| Home Activity | 64 px `bg.sunken` circle + 28 pt Inbox `fg.subtle`; title `text.xl bold fg.base`; sub `text.base fg.subtle` centered lh 20; top padding `5xl` | "No activity yet" / (network filter on:) "No activity on this network" + "Incoming payments will appear here in real time." |
| Assets (HoldingsList) | tappable open block padding `4xl`: 48 px `accent.soft` circle + 22 pt ArrowDown accent; title `text.xl semibold fg.muted`; sub subtle; whole block navigates to Receive | "Deposit your first asset" + "Tap here to see your address and receive tokens" |
| Assets, filter/search miss | single centered `text.base fg.subtle` line (explicitly NOT the deposit card under a funded hero) | "No matching tokens" |
| Connections tab | host-rendered: "No active connection" + "Scan, or enter a link / URL" (`home.connEmptyTitle/Sub`) |
| Balance detail sheet | "Everything's up to date." (`home.balanceDetailEmpty`) |
| History screen | "No Transactions Yet" + "Your sent transactions will appear here. You can also view full history on the block explorer."; filter: "No transactions on this network" |
| Contacts | "No contacts yet" + "People you send to show up here. Save the ones you use often."; search: "No matches for “{{query}}”" |
| Contact picker | "No recipients yet" + "Paste an address or scan a QR to send right away." |
| dApp browser history | "No recent dApps yet" (history icon itself hidden until history exists — fresh installs stay clean) |
| Currency sheet | "No currency matches \"{{query}}\"." |
| Add-token network picker | "No networks match \"{{query}}\"" |
| Batch import | "Import recipients" placeholder state |

---

## 14. Modal & sheet motion (`ui/AppModal.tsx`)

Four platform variants, one API (`visible/onClose/fit`):
- **iOS**: native `pageSheet` + `allowSwipeDismissal` (OS-driven 1:1 pull-down); static
  36×5 handle bar (`border.base`, radius 3, paddingTop 10 / bottom 6).
- **Android**: full-screen Modal + custom whole-sheet drag from the handle region only.
  Dismiss: drag > 90 px (`DISMISS_DY`) or fling vy > 0.5; threshold crossing fires one
  `hapticLight` (re-arms below); on dismiss the sheet is thrown fully off-screen in
  200 ms THEN closed; else spring back `{tension 80, friction 10}`.
- **Fit sheet** (`fit`, both native platforms): content-height bottom card over dimmed
  backdrop `rgba(0,0,0,0.35)`; enter 220 ms / exit 180 ms translate of measured height +
  backdrop fade; same 90 px drag-dismiss + haptic; top radius `2xl` (20), max height 92 %.
- **Web**: DOM portal into `#root`, slide-up `transform 0.3 s cubic-bezier(0.4,0,0.2,1)`
  + backdrop `rgba(0,0,0,0.35)` fade 0.3 s; top radius `2xl`; max-height 92 %; drag
  handle closes past 80 px / vy 0.5. Full dialog a11y via `useWebDialog` (§17).
- Keyboard: every native variant wraps content in `KeyboardAvoidingView
  behavior="padding"` (both platforms) + SafeArea bottom edge.
- Stacking rule (iOS): never present a sheet while dismissing a sibling — swap content
  in place instead (e.g. RpcFixForm renders inside BalanceDetailSheet; the funding modal
  is a single-modal content swap).

---

## 15. Dark-mode behavior

Mechanism: tokens are MUTABLE — `rebuildColors(isDark)` rewrites `color.*` in place and
bumps a style version; `createStyles()` (Proxy) lazily rebuilds stylesheets; the nav
`Stack key={resolved}` in `_layout.tsx` remounts the whole tree, so screens never
subscribe individually. Preference: auto/light/dark, persisted (`vela.colorScheme`);
`Appearance.setColorScheme` syncs native chrome (status bar, keyboard); web writes a
`theme-color` meta (`#FAFAF8` light / `#141412` dark) + html/body bg on mobile widths.
In-app browser chrome reads live tokens (toolbar `bg.base`, controls `accent.base`).

Full palettes (light → dark):
- fg.base `#1A1A18→#E8E6E1` · fg.muted `#6E6B62→#9A9790` · fg.subtle `#8C887E→#85827A`
  · fg.inverse `#FFFFFF→#1A1A18`
- bg.base `#FAFAF8→#141412` · bg.raised `#FFFFFF→#1E1E1B` · bg.sunken `#F5F3EF→#0F0F0D`
  (⚠️ sunken is BELOW raised in dark — components must not assume sunken-on-raised
  contrast; WaveDock secondary pill uses `bg.base` + `border.strong` for this reason)
- accent.base `#E8572A` (same both) · accent.soft `#FFF0EB→#2C1A12`
- success `#2D8E5F/#EDFAF2 → #3DA872/#132A1E`
- warning `#92600A/#FFF8F0/border #F0DCC8 → #D4A54A/#2A2010/#3D3020`
- error `#C62828/#FEF2F2 → #F87171/#2D1515` (light base deepened for WCAG 4.5:1)
- info `#4267F4/#EDF0FF → #5A7CF6/#131B33`
- border.base `#ECEBE4→#2C2C28` · border.strong `#D8D6CE→#3E3E38`
Shadows keep a FIXED dark shadowColor `#1A1A18` in both modes (a theme-following shadow
would become a white glow in dark). Backdrops are fixed `rgba(0,0,0,0.35)`.

---

## 16. Text scale (user-set, app-wide)

Six levels (`constants/text-scale.ts`): compact 0.82 · small 0.91 · standard 1.0 ·
comfortable 1.10 · large 1.22 · xlarge 1.35. Default `standard` on both platforms;
persisted `vela.textScale`.
⚠️ DESIGN_SYSTEM.md (and older docs) say "0.85×–1.28×" — code says **0.82–1.35**; code wins.

Mechanics with design consequences:
- Every `text.*` token = round(base × factor × webBoost); web boost = ×1.2 (native OS
  font scaling still applies ON TOP on native — `allowFontScaling` stays default true).
- `scaleFont(n)` applies the web boost to raw sizes (e.g. fingerprint digits 28,
  search input 16).
- Change applies instantly: token rebuild + version bump; `createStyles` Proxy
  invalidates, `useStyles` hook re-memos; Settings preview uses the hook path.
- Layouts must survive 0.82 AND 1.35: fit-to-width text is the standard defense —
  `AmountText` hero `minScale 0.55` (+ compact "$1.23M" fallback), TokenRow balance
  `adjustsFontSizeToFit minimumFontScale 0.7`, ActivityRow amount `0.85`;
  SegmentedToggle scrolls horizontally instead of truncating; labels are never clipped.
- Web inputs floor at 16 px on coarse pointers (global.css) to kill iOS Safari focus zoom.

---

## 17. Accessibility patterns (in place — keep)

- Every pressable: `accessibilityRole="button"` + translated `accessibilityLabel`.
- Stateful controls: `accessibilityState={{selected}}` (SegmentedToggle),
  `{{disabled, busy}}` (VelaButton), `{{disabled}}` (SlideToConfirm).
- Touch targets: ≥ 44×44 via size (WalletAvatar 44, ActivityRow avatar 44, QRScanner
  header buttons 44, SegmentedToggle `minHeight 44` — commented "WCAG 2.5.8 floor",
  contact/batch rows minHeight 44) or `hitSlop` (default 8, 6 on a few dense headers;
  ~100+ usages — raw grep counts drift between audits, don't pin an exact number).
- Web focus ring (global.css): keyboard-only `:focus-visible` on
  a/button/[role=button|link|radio|switch|tab]/[tabindex] — box-shadow
  `0 0 0 2px <page-bg>, 0 0 0 4px #E8572A` (page-bg `#FAFAF8` light / `#141412` dark);
  text inputs deliberately excluded (caret only, like native). Tappable rows suppress
  text-selection/outline (`userSelect:none`, `outlineStyle:none` — TokenRow).
- Web dialogs (`use-web-dialog`): Escape closes; Tab focus-trapped; focus moves in on
  open and restores to opener on close; ref-counted body scroll lock (stacked
  AppAlert-over-AppModal safe); `role="dialog"/"alertdialog"` + `aria-modal`.
- Composite rows speak once: ActivityRow joins title/amount/counterparty/fiat/time into
  ONE label; in privacy mode the amount is omitted from speech.
- Privacy masking is visual dots (7 px row dots / 16 px hero dots), not bullet glyphs
  (Android spacing bug), with hero `accessibilityLabel` switching to "show balance".
- Skeleton exposes `role="progressbar"`.
- SlideToConfirm alternates: native `accessibilityActions activate`; web tabindex +
  Enter/Space (§6).
- Icon-only buttons are plain glyphs (no card/border) but always carry a label
  (Settings gear, Scan FAB, close X).

---

## 18. Keyboard avoidance

- **ScreenContainer** (all screens): iOS `KeyboardAvoidingView behavior="padding"`;
  Android `behavior={undefined}` — native `adjustResize` resizes the window ('height'
  mis-measures under edge-to-edge).
- **AppModal** (every native variant incl. Android + fit): `behavior="padding"` on BOTH
  platforms (sheet contexts differ from screens).
- **VelaRefresh scrollables**: `automaticallyAdjustKeyboardInsets` (iOS lifts focused
  mid-screen fields; Android no-op), `keyboardShouldPersistTaps="handled"` (a tap on a
  button lands while the keyboard is up instead of only dismissing it),
  `keyboardDismissMode="interactive"` (iOS drag-to-dismiss follows the finger).
- Web: 16 px input floor + `maximum-scale=1` viewport kill iOS Safari auto-zoom.

---

## 19. State-copy patterns (voice)

- Honest uncertainty, never confident wrong numbers: "Some balances are still updating."
  (only after silent retries), "Some tokens couldn't be priced." (no false promise),
  skeleton instead of "0", "~" prefix + "≈ fiat" on every fee estimate.
- Progressive commitment verbs on async: "Preparing… → Waiting for passkey… →
  Submitting…"; button label swaps to "Checking gas…" while quoting.
- Empty states = invitation, not apology: first line states the fact ("No activity
  yet"), second line promises the future ("Incoming payments will appear here in real
  time.") or gives the action ("Tap here to see your address…").
- Freshness surfaced, not implied: "Updated {{ago}}" under the pull indicator.
- Failure always ships its exit: retry affordance (tx error Retry, GasFeeCard tap-to-
  retry, error state "Scan again"/"Retry"), or a fix flow (RPC), or a report link.

---

## 20. Conflicts & deviations to flag in Penpot

1. **Text scale range**: DESIGN_SYSTEM.md says 0.85–1.28; code is 0.82–1.35 (6 levels).
2. **Pulsing status indicator** (DESIGN_SYSTEM §1.3/§7: opacity 0.3↔1.0, 800 ms) no
   longer exists in src; connection status is a static colored dot.
3. **Card-heavy guidance** (VelaCard-everywhere, shadow-for-depth, §6.4 empty-state
   card): superseded by DESIGN-LANGUAGE de-containering. Surviving legitimate cards:
   AppModal/AppAlert sheets, warning/confirm gates (fingerprint card, RPC warning box),
   selected options. HoldingsList/Home empty states are already open (no card).
4. **Hardcoded warning hex `#C07A0A`** in RpcTroubleBanner + RpcFixForm icons (tokens
   demand `color.warning.base`; also fixed hairline `lineHeight: 18/20/22` raw values in
   several state styles — they don't scale with text).
5. **Splash overlay still Expo-branded** (blue gradient, expo-logo asset) — off design
   language entirely.
6. **TokenRow entrance not hasEntered-gated** (unlike ActivityRow) — intentional-looking
   but inconsistent with rule 10.
7. **Entrances are iOS-only** (Android and web suppressed by design — `entering.ts`
   returns `undefined` on both) — Penpot must document motion as enhancement, with the
   static layout as the Android/web baseline.
8. **DESIGN_SYSTEM font-zone table is stale**: fonts are Plus Jakarta Sans (export still
   named `inter`), not SF Rounded/System per zone; `font.numeric` = Jakarta regular
   (tabular figures built in), `font.mono` = Menlo/monospace.

---

## 21. i18n resilience (design concern)

15 languages ship (`SUPPORTED_LANGUAGES`, en + 14 translations — `src/i18n/index.ts:46`;
the file's "12 locales" header comment is stale), including expansion-heavy de/ru/tr/id
and CJK-compact zh/ja/ko. Every fixed-geometry text surface below must be judged at the
extremes of §16's user scale (0.82 AND 1.35, ×1.2 web boost on top). Penpot boards
should carry a "longest shipped string" variant, not just the English string.

### 21.1 WaveDock pills — no truncation rule exists → FLAG
Label `text.xl` (17) — bold primary / semibold secondary — beside a 22 pt icon, gap
`space.md` (8), padH `space.md` (8), inside a `flex: 1` pill; the row reserves a 64 px
scan slot (56 + 2×4) plus `space.lg` (12) side padding (`WaveDock.tsx:53, :151-159,
:175-185`). The label has **no `numberOfLines` and no font-fit**: an overlong label
wraps to a second line and grows the pill taller than the fixed `DOCK_BAR_HEIGHT` 86 bar.
Crunch case: de "Empfangen" (9 ch) / ru "Отправить"/"Получить" (de/ru
`componentsUi.json:230-231`) at scale 1.35 (17 → 23 px) on narrow (≤360 pt) screens.
- [ ] Pick a rule: forbid wrap + fit-to-width (ActivityRow-amount style) or a per-locale
  char budget; document it here and in 02.

### 21.2 SlideToConfirmButton — English-derived ≤15-char budget, busted by 5 locales
Single-line label (`numberOfLines={1}`, `text.lg` 15 semibold, centered) inside
symmetric 60 px insets (`labelRow left/right = TRACK_H` —
`SlideToConfirmButton.tsx:247, :281-282`); overflow = mid-word end-ellipsis, no font-fit.
The "keep label short (max ~15 chars)" budget is a comment written against English
(`SigningSheet.tsx:489`). Per-locale audit of the strings actually fed to it:
- ru `send.confirmSendBtn` "Подтвердить и отправить" = **23 ch**
- tr `send.checkingGas` "Gas kontrol ediliyor..." = **23 ch**
- de `send.confirmSendBtn` "Bestätigen & senden" = **19 ch**
- de `signing.signing` "Wird signiert ..." = **17 ch** · id "Menandatangani..." = **17 ch**
SigningSheet's `li.length > 12` guard (`SigningSheet.tsx:502`) caps only the interpolated
*intent*, never the surrounding template (tr `confirmIntentLabel` =
"{{intent}} işlemini onayla" — 16 ch of fixed text before the intent even lands).
At scale 1.35 the ru/tr labels ellipsize on common phones.
- [ ] Per-locale label review or fit-to-width on the track label; re-state the budget as
  a per-locale rule, not an English char count.

### 21.3 VelaButton / AppAlert buttons vs long ru/de labels
`VelaButton`: full-width, label `text.lg` semibold (compact: `text.base`), **no
`numberOfLines`** — a long label wraps and grows button height (`VelaButton.tsx:69,
:86-92`); benign for stacked full-width CTAs, but side-by-side pairs (e.g. error-state
"Scan again"/"Retry", §10.5) can end up different heights per locale.
`AppAlert` buttons: `minWidth 70` + padH 16 (`space.xl`) in a right-aligned
`flexDirection: row` with gap `space.md` that **never wraps** (`AppAlert.tsx:181-192`) —
three long ru/de buttons can overflow the maxWidth-340 card. Native alerts are immune
(system `Alert.alert`); this is web-only exposure.
- [ ] Stress web AppAlert with 3-button ru variants; allow row wrap or vertical stacking
  past a width threshold.

### 21.4 Truncation-side inventory (`numberOfLines={1}` — who yields?)
| Surface | Rule in code | Who wins / who yields |
|---|---|---|
| SettingsRow (`SettingsScreen.tsx:84-85, :1671-1673`) | title + subtitle have NO numberOfLines; content `flex: 1` | Nothing truncates — text wraps, the row grows; chevron/right accessory keeps its slot |
| DetailRow (`DetailRow.tsx:43, :53-56`) | label natural width, no shrink; value wrap `flexShrink 1` + `numberOfLines 1` | Label wins; VALUE end-ellipsizes (long de labels squeeze the value cell) |
| ActivityRow line 1 (`ActivityRow.tsx:111-127, :205-217`) | title `flexShrink 1` + ellipsis; amount `flexShrink 1` + `adjustsFontSizeToFit minimumFontScale 0.85` | Both shrinkable: amount defends itself by font-fitting to 0.85× before ellipsis; title ellipsizes first in practice |
| ActivityRow line 2 (`ActivityRow.tsx:132-135, :232-246`) | subtitle `flexGrow/flexShrink 1, minWidth 0`; fiat `flexShrink 0` | FIAT never yields; counterparty truncates |

### 21.5 LanguagePickerModal = the all-scripts stress board
16 rows (Follow System + 15 endonyms) render Latin, Cyrillic, CJK simplified/
traditional, Hangul, Kana, Vietnamese diacritics and Turkish simultaneously
(`SettingsScreen.tsx:951-1005`; names `src/i18n/index.ts:57-73`) — the one screen where
every script must pass at 0.82 AND 1.35. Board it in Penpot as the i18n acceptance
surface. ⚠ Row label style `fmtExample` carries `fontFamily: font.mono`
(`SettingsScreen.tsx:1683` — shared with FormatPickerModal, where mono suits format
examples): endonyms render in Menlo/monospace with system-font fallback for CJK/Cyrillic
— decide whether that's intentional for language names.

### 21.6 Content risks (project history — not geometry)
- **zh-HK register**: must stay spoken Cantonese, not recycled written Chinese — a
  visual-QA pass can't catch this; needs a Cantonese reader.
- **Translator-note leakage**: machine translation previously shipped translator notes
  inside strings; any string that looks "double length" in a board may be one.
- **No ICU plurals**: i18next here has no ICU — plural/count variants are explicit keys;
  boards must not assume English singular/plural pairs exist in every locale.
