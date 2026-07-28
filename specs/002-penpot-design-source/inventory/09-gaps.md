# 09 — Gaps & Contradictions (completeness critique of reports 01–08)

Audit date: 2026-07-29. Every claim below was spot-checked against source
(`src/constants/theme.ts`, `src/constants/entering.ts`, `src/constants/text-scale.ts`,
`src/i18n/index.ts`, `src/app/*`, `src/components/**`, `packages/safari-extension/*`).
Format: each item = what's missing/wrong → where to look → suggested action.

---

## 0. META: the eight reports are scattered across three directories

The orchestrator passed literal `undefined` paths, so the set is split:

- `01-tokens.md`, `02-ui-primitives.md`, `03-domain-components.md`, `06-screens-other.md`,
  `07-overlays-modals.md` → `/private/tmp/claude-501/-Volumes-data-production-vela-wallet/116b5a10-16d2-4e35-b39d-94a6c5058826/scratchpad/`
  (**session scratchpad — will be garbage-collected; copy out before doing anything else**)
- `04-ia-navigation.md`, `05-screens-wallet.md` → `/Volumes/data/production/vela-wallet/` (repo root, untracked)
- `08-motion-states.md`, this file → `/Volumes/data/production/vela-wallet/undefined/`

- [ ] Consolidate all nine files into one intended directory before Penpot work starts.

---

## 1. MISSED UI SURFACES (no report specs them)

### 1.1 In-app dApp browser screen chrome — the biggest missed screen
`src/app/browser.tsx` (647 lines). Report 04 covers the route, report 07 covers its
*overlays* (consent fit-sheet §8.1, load-error §8.2, loading bar §8.3), but **nobody specs
the persistent browser chrome**:

- Top bar: favicon (or `Lock 14 fg.muted` for secure origins) + host (1 line) + page
  title (1 line) in `hostWrap`.
- 2px `accent.base` loading strip under the top bar (07 §8.3 has one line; no geometry).
- **Bottom bar** (`bottomBar`): `ArrowLeft 22` back (color dims `fg.base`→`fg.subtle` when
  `!canGoBack`), `RotateCw 20 fg.muted` reload, **account pill** (`acctPill`:
  `WalletAvatar size 20 letterSize 11` + account name + green connected dot when the site
  has a grant) — this is the dApp-browser account-switcher *trigger* and it is specced
  nowhere — plus `ExternalLink` open-in-system and `X` close.
- Center states: "Preparing wallet…" spinner state and no-wallet state
  (`connect.list.noWallet`).
- [ ] Add a full browser-screen board (chrome + all states) to the screens report; add the
  account pill to 02's WalletAvatar size axis (20 px is missing from its 32/38/40/44 list).

### 1.2 LanguagePickerModal — named but never specced
`src/screens/settings/SettingsScreen.tsx` L951 (`LanguagePickerModal`). Reports 04/06 name
it as a Settings row target and 06 conflict #9 notes it "renders 16 rows", but there is
**no layout spec** (row anatomy, Follow-System row with resolved-endonym subtitle,
selection mark, endonym typography across scripts).
- [ ] Spec it alongside FormatPickerModal in 06 §1.1 (it's the picker where all 15 scripts
  render simultaneously — also the natural i18n stress board, see §4).

### 1.3 Safari-extension popup UI — a second, hand-duplicated token system
`packages/safari-extension/src/popup.html` + `popup.js` (and the iOS target copy
`targets/safari/assets/popup.html`). A fully styled 306-px-wide popup: header logo +
brand, account card (name / mono address / chain chip), site-status row (8 px green/gray
dot + host), grant-access and one-tap-signing affordances. Zero coverage in any report.
Two design-system-critical facts:
- Its CSS **hand-duplicates the Vela color tokens** ("kept in sync with
  src/constants/theme.ts" — a drift risk exactly like the bundler string coupling), with
  light/dark via `data-theme` + `prefers-color-scheme`.
- It uses `-apple-system/SF Pro`, **not Plus Jakarta Sans** — a deliberate(?) divergence
  no report records.
- [ ] Decide scope: if the popup is part of the design source-of-truth, spec it + flag the
  duplicated palette as a sync obligation; if not, record the exclusion explicitly.

### 1.4 safe-recovery-extension (scope decision needed)
`packages/safe-recovery-extension/` (WXT/MV3: sidepanel + webauthn pages under
`src/entrypoints/`). Separate user-facing surface, uncovered.
- [ ] One-line scope ruling in the master doc (likely "out of scope — separate product"),
  so a future agent doesn't assume it was audited.

### 1.5 web-request.tsx covered only at phase-name depth
`src/app/web-request.tsx` (376 lines). 07 §3.6 lists the 7 phases but gives no
layout/measurement spec (identity row geometry, origin pill, account box, button row).
Copy record CORRECTED 2026-07-29 (this file originally claimed "12 t() calls" — wrong):
`web-request.tsx` has **zero** `t()` calls (no `useTranslation` import); all ~25 in-file
strings are hardcoded English. The route only *renders* localized content in its
onboarding phase because it embeds the fully-i18n'd OnboardingScreen. See 06 §3.2.
- [ ] Expand to full per-phase spec; file the partial-i18n state precisely.

### 1.6 Custom-network fallback disc colors are hardcoded light-mode grays
`src/screens/settings/SettingsScreen.tsx` L658-659: networks added via AddNetworkModal get
`iconColor '#888888'` / `iconBg '#F0F0F0'` as ChainLogo fallback-disc colors — fixed
light grays that will render as bright discs in dark mode. 03 §7.7 specs ChainLogo's
fallback mechanism but no report catches this hardcoded data default.
- [ ] Add to the hardcoded-hex inventory (02 §Z-7 / 08 §20.4).

---

## 2. CONTRADICTIONS BETWEEN REPORTS (ground truth verified in code)

### 2.1 Entrance animations: web does NOT get them — 05/06/08 are wrong
`src/constants/entering.ts`: all three helpers are `if (!isIOS) return undefined` —
**iOS-only**; web takes the Android path (instant render).
- Correct: 01 §15.4, 02 §0.6 ("returns undefined on Android AND web").
- **Wrong**: 05 §1.3 ("iOS + web only; Android renders instantly"), 06 §0.2 ("run on
  iOS + web only"), 08 §2.1 ("Web behaves like iOS") — and 08 is the *motion* report, so
  this error would propagate into every Penpot motion board.
- [ ] Correct 05/06/08; rule: entrance motion = iOS-only enhancement; Android AND web
  ship the settled state.

### 2.2 Text-scale range: 02/03/05 repeat the stale 0.85–1.28
`src/constants/text-scale.ts`: 6 levels, **0.82–1.35**, default `standard` on both
platforms (the file's own header comment "Android defaults to comfortable" is stale — 01
conflict #10 caught this). 01 §14, 06 §0, 08 §16 are correct; **02 §0.4, 03 §0.2, 05 §1.2
state "0.85×–1.28×"** (copied from stale DESIGN_SYSTEM.md).
- [ ] Fix the three reports; any "must survive min/max scale" test note should read
  0.82–1.35 (×1.2 web boost; × OS scale on native).

### 2.3 BundlerFundingModal standalone wrapper: 02 vs 07 — 07 wins
02 D9 says it "renders standalone (Send)". `grep` confirms **zero imports of
`BundlerFundingModal` anywhere in src/** — only the `BundlerFundingView` content-swap
inside SigningRequestModal is live (07 §11.2's dead-code call is correct; Treasury
bootstrap replaced it in Send).
- [ ] Amend 02 D9: mark the standalone AppModal wrapper "dead code — do not board";
  only the dApp content-swap variant exists.

### 2.4 Minor count/size drift
- 02 header: "41 files" in `src/components/ui/` — actual **40** (all 40 are covered).
- Sheet-header close-icon size: 02 D1b says X = 20; 07 §1.8 says "18–20" (AddTokenSheet
  really uses 18). Pick one canonical + exception note.
- i18n: `src/i18n/index.ts` header comment says "12 locales" — stale; SUPPORTED_LANGUAGES
  = **15** (en + 14), picker renders 16 rows. 06 conflict #9 is right; earlier project
  notes saying "14 locales" mean 14 *translations*.
- [ ] One-line fixes.

---

## 3. TASK-MANDATED COVERAGE CHECK (verified)

| Surface | Status |
|---|---|
| ParallelSpaceBadge | ✅ 03 §6 (full spec incl. `#7c3aed` rationale) + 07 §9.3 + 04 §6 |
| dApp-browser account switcher | ⚠️ modal variant ✅ (07 §5.8 footer variant) but trigger pill + chrome missing → gap 1.1 |
| Extension account surface | ⚠️ ExtensionSignController ✅ (03 §7.8, 07 §3.5); extension popup ✗ → gap 1.3 |
| ContactAvatar / identicons | ✅ 03 §5.1 (8-hue HSL sets, identicon gating), 02 A8/A9 |
| AmountText | ✅ 02 A6 + 05 §8.19 (tailScale 0.56 / symbolScale 0.58 / minScale consistent) |
| SegmentedToggle | ✅ 02 B1 + 05 §8.2 + 06 §0.3 (consistent) |
| SectionLabel | ✅ 02 A3 (incl. 0.6 vs docs-0.8–1.2 conflict) |
| Divider / DetailRow | ✅ 02 A4 + inset-rule inventory (03 §8.3, 05 §10) |
| Token values vs theme.ts | ✅ all spot-checked hexes, TEXT_BASE, spacing, radius, shadows, motion.spring, DOCK_BAR_HEIGHT 86, WEB_TEXT_BOOST 1.2 — accurate |
| 27 clear-signing scenarios | ✅ count verified in `clear-signing-scenarios.ts` |
| `/history` dead registration | ✅ verified `_layout.tsx` L114 |

---

## 4. i18n TEXT-EXPANSION: no report treats it as a design concern (task-mandated)

15 languages ship (`src/i18n/index.ts`), including expansion-heavy de/ru/fr and
CJK-compact zh/ja/ko, yet no report enumerates which fixed-geometry surfaces are at risk.
Scattered fragments exist (08 §16 "SegmentedToggle scrolls instead of truncating"; 03
§1.1 confirm-label ≤~15 chars, intent ≤12 chars; 02 D18 "title may wrap 2 lines") but
there is no consolidated section.
- [ ] Add an "i18n resilience" section (best home: 08) covering at minimum:
  - **WaveDock pills**: `text.xl (17) bold` labels in flex-1 pills — check de "Empfangen" /
    ru "Получить" at scale 1.35 (no documented truncation rule).
  - **SlideToConfirmButton**: single-line label with 60 px side insets — the ≤15-char
    `buttonLabel()` budget is English-derived; verify per-locale.
  - **VelaButton / AppAlert buttons**: minWidth 70 + padH 16 vs long ru/de labels.
  - **SettingsRow / DetailRow**: which side truncates (`numberOfLines 1` inventory).
  - **ActivityRow line 1**: title vs fitted amount — who yields per locale.
  - **LanguagePickerModal** (gap 1.2) as the all-scripts stress board.
  - Known content risks from project history: zh-HK spoken-Cantonese register,
    translator-note leakage, no ICU plurals.

---

## 5. SMALLER MISSES WORTH ONE LINE EACH

- **WalletAvatar sizes**: add 20 px (browser pill) to 02 A9's size axis.
- **`hitSlop` canonical value**: 01 §18 says default 8 with variants — fine — but 08 §17
  says "111 usages" vs 01 "~102"; reconcile or drop the counts.
- **07 §12 board checklist** has no "browser chrome" row (follows from gap 1.1) and no
  "LanguagePickerModal" row (gap 1.2).
- **`docs/DESIGN-REVIEW-2026-07.md` backlog** (SegmentedToggle-only, VelaButton-only
  mandates) is cited by 02/06 for individual violations (AddTokenPanel tab switcher,
  SafariExtension bespoke CTA, OnboardingSettingsModal theme chips, RpcFixForm save
  button, TransactionReceipt Done button) — but no report aggregates the violation list
  into one "migration debt" table for Penpot. Cheap win: collect the 5+ known bespoke
  CTAs/segmented controls in one place.
- **Boot spinner / +html phone frame / QRScanner / ReceiptHarness / privacy mask** — all
  verified covered; no action.

---

## 6. Scope rulings (2026-07-29)

Resolves the open scope decisions in gaps 1.3 and 1.4. These rulings are normative for
the Penpot file; record them on the `00 Start Here` page so no future agent re-litigates.

### 6.1 Safari-extension popup — EXCLUDED from the Penpot source of truth
`packages/safari-extension/src/popup.html` + `popup.js` (iOS target copy
`targets/safari/assets/popup.html`) is **not** boarded. It is a WebKit-hosted HTML
surface with its own rendering constraints, not a React Native screen. Two standing
warnings travel with this exclusion:
- **Palette drift risk**: its CSS hand-duplicates the Vela color tokens — the file
  says so itself: "Vela tokens — kept in sync with src/constants/theme.ts (canonical:
  lib/theme.js)" (`popup.html:6`), light/dark via `data-theme` +
  `prefers-color-scheme`. Same failure mode as the bundler string coupling: any
  theme.ts palette change (§15 of report 08) silently strands the popup. A token
  change in Penpot does NOT propagate here; the sync obligation is manual.
- **Typeface divergence**: the popup sets
  `font: 14px/1.45 -apple-system, "SF Pro Text", system-ui` (`popup.html:33`;
  mono = `ui-monospace/"SF Mono"/Menlo`, `popup.html:45`) — **SF Pro, not Plus
  Jakarta Sans**. Treat as accepted platform-native styling for the extension
  chrome, not a bug — but it means popup screenshots must never be used as type
  reference for the app.

### 6.2 safe-recovery-extension — OUT OF SCOPE (separate product)
`packages/safe-recovery-extension/` (WXT/MV3; `sidepanel/` + `webauthn/` entrypoints
under `src/entrypoints/`) is a separate user-facing product, not part of the wallet
app's design surface. Not audited by reports 01–08, not boarded, not in the
acceptance gate. A future design pass on it starts from zero — nothing in this
inventory covers it.

### 6.3 Dev / parallel space — documented on page `10`, excluded from acceptance gate
Per `data-model.md` §1: page `10 Dev & Parallel Space` (dev screens, PARALLEL SPACE
badge/env, fault-injection UX) is **documented but excluded from the gate** —
matching the code reality that `/parallel` registers only when `__DEV__` (or
`dev_unlocked === '1'`) and reuses every real screen with a fixture signer
(report 04 §route table). The badge itself stays in scope (03 §6) because it renders
inside production screens.
