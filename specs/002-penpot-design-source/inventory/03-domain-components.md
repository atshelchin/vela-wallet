# 03 — Domain Components (Vela Wallet)

Design-source-of-truth report for Penpot reconstruction. Scope: `src/components/send/`, `src/components/signing/`, `src/components/contacts/`, `src/components/dev/`, and root-level `src/components/*.tsx` files, plus the two signing-critical `ui/` components explicitly requested (`GasFeeCard`, `FeeTokenSelector`).

All values below are read directly from source. **Token → value tables are given once in §0 and referenced by name everywhere else** — every component supports light AND dark automatically because it only ever references mutable `color.*` tokens (exceptions are explicitly flagged as "hardcoded").

---

## 0. Token ground truth (from `src/constants/theme.ts`)

### 0.1 Colors — light / dark

| Token | Light | Dark |
|---|---|---|
| `fg.base` | `#1A1A18` | `#E8E6E1` |
| `fg.muted` | `#6E6B62` | `#9A9790` |
| `fg.subtle` | `#8C887E` | `#85827A` |
| `fg.inverse` | `#FFFFFF` | `#1A1A18` |
| `bg.base` | `#FAFAF8` | `#141412` |
| `bg.raised` | `#FFFFFF` | `#1E1E1B` |
| `bg.sunken` | `#F5F3EF` | `#0F0F0D` |
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
| `border.base` | `#ECEBE4` | `#2C2C28` |
| `border.strong` | `#D8D6CE` | `#3E3E38` |

### 0.2 Type scale (base px; multiplied by user scale 0.85–1.28, and ×1.2 on web)

`xs`=10, `sm`=11, `base`=13, `lg`=15, `xl`=17, `2xl`=20, `3xl`=26, `4xl`=32, `5xl`=40. `scaleFont(N)` = raw N (×1.2 web only, no user scale participation beyond createStyles rebuild).

### 0.3 Fonts

Typeface is **Plus Jakarta Sans** (weights 400/500/600/700 loaded as separate files; the style helper is still exported as `inter.*`). `font.mono` = Menlo (iOS) / `monospace` (Android/web). `font.display` = PlusJakartaSans_700Bold. `font.numeric` = PlusJakartaSans_400Regular (tabular figures).

### 0.4 Spacing / radius / shadow / motion

space: xs 2 · sm 4 · md 8 · lg 12 · xl 16 · 2xl 20 · 3xl 24 · 4xl 32 · 5xl 48.
radius: sm 4 · md 8 · lg 12 · xl 16 · 2xl 20 · full 9999.
shadow.sm: y1 blur3 op.04; shadow.md: y2 blur8 op.06; shadow.lg: y4 blur16 op.08 (all `#1A1A18`).
motion: fast 150ms, normal 250ms, slow 400ms, spring {damping 15, stiffness 150, mass 0.8}.

### 0.5 ⚠ Conflicts: DESIGN_SYSTEM.md vs current code (DESIGN-LANGUAGE.md wins)

1. **Stale hexes in DESIGN_SYSTEM.md**: `fg.muted` listed as `#7A776E` and `fg.subtle` as `#B0ADA5` — code darkened them to `#6E6B62` / `#8C887E` for WCAG. Error red listed nowhere but was `#EF4444`; code uses `#C62828` (light). Use §0.1 above.
2. **Fonts**: DESIGN_SYSTEM.md says `font.sans` = System and `font.display` = SF Rounded. Code bundles Plus Jakarta Sans for both. Use Plus Jakarta Sans.
3. **Dark mode**: DESIGN_SYSTEM.md is light-only; full dark palette exists in code and must be a Penpot theme.
4. **Card-heavy guidance** ("Depth Through Shadow", VelaCard everywhere, Confirmation Cards §6.5) is superseded by DESIGN-LANGUAGE.md de-containering. All components in this scope follow the new language: open rows + hairline `border.base` dividers; a **filled/tinted card always means "attention"** (warning/danger), a plain card only for genuinely distinct surfaces (modal sheets, security gates).
5. **Border tokens** (`border.base/strong`) exist in code but are absent from DESIGN_SYSTEM.md's color table.

### 0.6 Signing color grammar (explicit, enforced in code comments)

- **Orange accent** is reserved for the slide-to-confirm control (and CTAs). Never a headline hue on the signing sheet.
- A **colored headline/eyebrow is always red** and always means "this can lose you money" (`intentColor()`: danger→`error.base`, everything else→`fg.base`). Green eyebrow only for a revoke (safe).
- Amber (`warning.base`) lives only inside `WarningBanner` / small "Expired" tags — never headlines.
- Green (`success.base`) = incoming amounts (+), verified, revoke, quiet sim-ok rows.
- risk→color map (`riskColors()`): safe→success.base, normal→accent.base, caution→warning.base, danger→error.base.

---

## 1. Signing surface — architecture

**Single render path** (security mandate): production dApp modal, the clear-signing test harness, and read-only replays all render **`SigningSheet`**. Wrappers:

- `src/components/SigningRequestModal.tsx` — pure barrel; re-exports from `./signing/`.
- `src/components/signing/SigningRequestModal.tsx` — production wrapper: one `AppModal` (native pageSheet / web slide-up). When bundler funding is needed it **swaps the sheet's content** to `BundlerFundingView` (never stacks a second modal — iOS can't present two). Swipe-dismiss routing: pre-submit swipe = reject (EIP-1193 4001); once submitting/submitted or errored = dismiss only (the op proceeds).

### 1.1 SigningSheet — layout skeleton (`signing/SigningSheet.tsx`)

Container: `flex:1; padding: space.3xl (24)`. Vertical structure inside a ScrollView, top→bottom:

1. **DAppBanner** (always).
2. **History note** (read-only replay only, no pending hash): row `bg.sunken`, radius.lg, pad v8/h12, gap 4, Pen icon 15px `fg.muted` + text sm/medium `fg.muted`. Copy: `componentsUi.signing.historicalNote`.
3. **Body view** — one of 9 mutually-exclusive views chosen in priority order:
   1. `PermitSignView` — approval detected at a typed-data path (off-chain permit).
   2. `ApprovalView` — editable on-chain approval (the never-unlimited editor).
   3. Loading fallback while descriptor resolves (prevents blind→clear flash): centered, padV 48, text lg regular `fg.muted`, copy `componentsUi.signing.loading`.
   4. `ClearSignView` — descriptor found.
   5. `BatchCallsView` — EIP-5792 `wallet_sendCalls`.
   6. `EthSignDangerView` — `eth_sign` opaque hash.
   7. `MessageSignView` — `personal_sign` (incl. SIWE).
   8. `BlindTypedDataView` — EIP-712 without descriptor.
   9. `BlindTransactionView` — tx without descriptor. Final fallback: centered Shield 28 `fg.muted` + "Signature request".
4. **BalanceChangePreview** (tx/batch only) with `hideReassurance` — only LOUD states render here (revert / underfunded / unexpected changes); the quiet "sim ok" fact moves into the Advanced panel.
5. **AdvancedPanel** ("技术细节" expert drawer, collapsed by default).
6. **GasFeeCard** (tx/batch, live only, account present, pubkey loaded).
7. **Gas-estimate-failed WarningBanner** (caution) when estimation failed and not signing/read-only. Copy `componentsUi.signing.gasEstimateFailed`. Blocks confirm.
8. **SigningAccountRow** (live only) — see §2.1.
9. **Pending card** (submitted, awaiting receipt): row `info.soft` bg, radius.lg, padV12 padH16, gap 8, small ActivityIndicator `info.base` + mono sm text `info.base`: `{submitted} · 0x1234567890…abcdef` (hash 10+6 mid-ellipsis).
10. **Error card**: row `error.soft` bg, radius.lg, padV12/padH16, gap 8, AlertTriangle 16 `error.base` + text sm regular `error.base` (raw error string).

**Footer** (outside scroll): `buttonRow` — hairline top border `border.base`, paddingTop 16, marginTop 4, gap 12. Exactly ONE control:
- read-only → secondary VelaButton "Close" (`componentsUi.signing.close`);
- signError → secondary VelaButton "Dismiss" (`componentsUi.signing.dismiss`);
- otherwise → **SlideToConfirmButton** (uniform for EVERY request, benign or dangerous; there is deliberately **no Reject button** — closing the sheet rejects). Track 60px h, 52px accent knob, white ArrowRight, quiet raised track w/ hairline, settles soft green on commit; hint copy `componentsUi.signing.slideToConfirm` ("Slide to confirm").

**Confirm label logic** (`buttonLabel()`, ≤ ~15 chars): signing → "Signing…"; editable approval → "Revoke"/"Approve" verbs (`componentsUi.signingApprove.verbRevoke/verbApprove`); clear-signed signature → "Sign"; clear-signed tx → "Confirm {localized intent}" if intent ≤12 chars else plain "Confirm"; personal_sign/typedData → "Sign"; batch → "Confirm"; plain native send → "Confirm Send"; catch-all → "Confirm" (never "Approve" for a non-approval).

**Confirm disabled when**: resolving descriptor; tx & (estimating OR estimate failed); (tx|batch) & fee re-quote busy; editable approval with no choice made; batch with any granting leg lacking a deliberate choice.

**Haptics** (design behavior): warning buzz on open for danger sheets (eth_sign, unbounded non-reducing approval, SIWE domain mismatch); light tap on slide commit; success buzz when opHash lands; error buzz on signError.

**States to draw per request type**: default / resolving / gas-estimating / fee-busy / estimate-failed / signing / submitted-pending / error / read-only-replay / funding-swap.

### 1.2 SigningSheetProps (data contract)

`request` (method+params+origin+id), `chainId`, `account {id,address,name}`, `dappInfo {name,url,icon}`, `isSigning`, `signError`, `pendingOpHash`, `onApprove(opts)`, `onReject`, `onDismiss`, `readOnly`, `replaySim`, plus harness-only `simFromOverride`/`simOverride`. `onApprove` carries: maxFeePerGas, bundlerCostWei, gasFeeToken, quotedFee (displayed = signed), paramsOverride (rewritten approval), assetSim (persisted for replay), intent (persisted label for Connections).

---

## 2. Signing components (shared styles live in `signing-core.tsx`)

### 2.1 DAppBanner + SigningAccountRow (`signing/DAppBanner.tsx`)

**DAppBanner** — "who's asking" header. De-containered: padTop 4, padBottom 16, **1px bottom hairline `border.base`**, marginBottom 16, internal gap 8. Row (gap 12):
- Logo 36×36, radius 10. Source: explicit `icon` → site's own `https://{host}/favicon.ico` (privacy: never a third-party favicon service; non-registrable hosts skip) → fallback monogram: `accent.soft` bg, first letter uppercase in text.lg bold `accent.base`.
- Name column (flex, gap 1): name text.base bold `fg.base` (1 line); domain text.xs mono medium `fg.muted` (1 line).
- Chain cluster right (`marginLeft:auto`, gap 4): ChainLogo 16px + chain name text.xs semibold `fg.base`.

**SigningAccountRow** — the FROM wallet, a quiet bottom row above the confirm: row space-between, padV 12, **top hairline** `border.base`. Left label "Signing account" (`componentsUi.signing.signingAccount`) sm medium `fg.muted`. Right cluster (gap 4): ContactAvatar 18px + account name sm semibold `fg.base` + ChevronDown 13 `fg.subtle` (rotates 180° when open). Tap toggles a revealed full address line: xs mono `fg.muted`, right-aligned, marginTop 2, paddingRight 16, selectable. Hidden entirely if no account name.

### 2.2 IntentHeader (`signing/IntentHeader.tsx`)

The action word. Two variants:
- **`eyebrow`** (the current default everywhere): uppercase kicker, self-start, padTop 8 padBottom 2; text sm semibold, letterSpacing 1.4, `fg.subtle` by default; `colorEyebrow` tints it with the passed color (red danger / green revoke) — hue without size.
- **`hero`** (legacy, currently unused by views): left-aligned text.5xl (40) bold, letterSpacing −1, colored by risk; container padV 12.

### 2.3 SummaryLine (`signing/SummaryLine.tsx`)

The novice's one-sentence plain-language read, under the hero. Text: `scaleFont(15)`, lineHeight 23, medium, `fg.base` (ink — deliberately not muted), padTop 4 padBottom 12. `tone`: caution→`warning.base`, danger→`error.base` full-sentence tint. `emphasize`: verbatim substrings (amount, counterparty) rendered semibold ink — language-agnostic bolding.
Copy patterns (`componentsUi.signing.*`): `summarySwap` {pay, receive}; `summarySwapTo` {pay, receive, to}; `summarySend` {amount, to}; `summaryTransferNft` {id, to}; `summaryDeploy`; `summaryReceive` {amount}; `summaryRevoke` {spender, token}; `summaryApprove` {spender, amount}; `summaryApproveUnlimited` {spender, token}; `summaryApproveNft` {operator}; `summaryPermit` {spender, amount}; `summaryPermitUnlimited` {spender, token}.
Includes `useResolvedName(address, descriptorName)` — name priority: descriptor → saved contact → own account name → ENS/Basename → short address; never hex-only for long.

### 2.4 TokenCard + FlowArrow (signing) (`signing/TokenCard.tsx`)

The asset-amount hero. Variants: `send` | `receive` | `caution` | `danger`; modifiers `hero`, `hideSign`, `heroLabel`.

- **Hero (benign) layout** (`hero` and not tinted): logo-less, left-aligned, one clean left edge. Row padTop 2 padBottom 4, gap 8. Amount line: number text.5xl (40) bold letterSpacing −1.2, ink (`fg.base`) for outgoing, `success.base` for incoming; auto-shrinks (`adjustsFontSizeToFit`, min 0.5). Trailing unit group bottom-aligned: TokenLogo 24 + ticker text.2xl bold `fg.muted` (logo LEFT of ticker, reads like a currency mark). Optional sub-row (`heroLabel`, used by swap legs): localized field label sm medium `fg.muted` + `≈ {fiat}` sm medium `fg.subtle`. Field warning → AlertTriangle 16 `error.base` at right.
- **Open row** (non-hero, non-tinted): row gap 16, padV 12; TokenLogo 44; amount text.3xl (26) bold letterSpacing −0.6 (+green if receive), sign prefix `−`/`+` unless `hideSign`; label + ≈fiat sub-row as above.
- **Tinted card** (caution/danger only — "a filled card always means attention"): same row but padV/padH 20, radius.2xl (20), marginV 4; bg `warning.soft` (caution) or `error.soft` (danger); trailing 28×28 circle `error.soft` with AlertTriangle 14 `error.base`.
- Sign convention (MetaMask/Rainbow "estimated changes"): `+` green for inbound, `−` neutral ink for outbound.
- Native coin (no tokenAddress, format amount) shows real native symbol + native coin logo.

**FlowArrow (signing)**: swap connector — centered 24×24 circle `bg.sunken` (no border/shadow), ArrowDown 14 `fg.subtle` strokeWidth 2.5, marginV −4, zIndex 1. Danger variant: `error.soft` circle + `error.base` arrow.

### 2.5 ContractBar (`signing/ContractBar.tsx`)

The counterparty row ("who / what"). Identity kinds: `auto` (recipient — probed on-chain wallet vs contract), `contract`, `asset`.
- Base: row gap 8, padV 12, **top hairline** `border.base`.
- **Warning variant** (e.g. sending a token to its own contract): drops the hairline, becomes a contained red card — `error.soft` bg, 1px `error.base` border, radius.xl, padH 16, marginV 8; trailing ShieldAlert 14 `error.base`.
- Avatar (36 footprint): contract → rounded-square glyph 36×36 radius.lg `bg.sunken` with FileText 17 `fg.subtle` (NEVER an identicon for a contract); wallet/unknown recipient → `ContactAvatar` 36; asset → none.
- Label (skipped for `auto` recipients): `scaleFont(10)` semibold uppercase `fg.subtle` letterSpacing 0.3. Labels used: "Spender" (`spenderLabel`), "Recipient" (`recipientLabel`), "Interacting with" (`interactingLabel`), "Signing for" (`signingFor`), "Unverified contract" (`unverifiedLabel`).
- Name: sm semibold; **green `success.base` ONLY when descriptor-verified**; resolved-ENS/plain name neutral ink (color always means "verified"). No name → short address sm mono medium ink.
- First-time note (poisoning defense): text.xs medium `fg.muted` — grey, deliberately NOT amber ("information, not alarm"). Copy: `firstTimeTag` / inflow variant `firstTimeTagNeutral` ("First time using this address").
- `RecipientTrust` compact pill under the name (see §5.6).
- Trailing identity chips (max-width 128, gap 6, radius.full, padH 8 padV 3, text `scaleFont(10)` semibold ls 0.2): 「Wallet」 `info.soft`/`info.base`; 「Contract」 `bg.sunken`/`fg.muted`; 「Verified」 `success.soft`/`success.base` with ShieldCheck 11.
- **Compact mode**: when the summary already names the recipient (and no warning) the entire row is dropped.

### 2.6 WarningBanner + GenericFieldRow (`signing/WarningBanner.tsx`)

**WarningBanner** — the one shared caution/danger surface. Row gap 8, padV 12 padH 16, radius.xl, marginV 8. Caution: `warning.soft` bg + 1px `warning.border`; Danger: `error.soft` bg + 1px `error.base`. AlertTriangle 14 in severity color + text sm semibold lineHeight 18 in severity color.
Copy inventory (`componentsUi.signing.*`): `unlimitedWarning`, `tokenToContractWarning`, `expiredWarning`, `bestEffortWarning`, `bestEffortSimulated`, `partialWarning`, `unverifiedWarning`, `blindTypedWarning`, `blindDecodeWarning` {bytes}, `blindButSimulated`, `hexMessageWarning`, `siweMismatch` {domain, origin}, `ethSignWarning`, `gasEstimateFailed`; plus `componentsUi.signingApprove.expired`, `.decimalsUnverified`.

**GenericFieldRow** — decoded param row: space-between, align-start, padV 8, **top hairline**, gap 12. Label sm medium `fg.muted` (no shrink); value sm mono medium ink, right-aligned, flex, ≤2 lines. Warning field: value turns `error.base` and the row gets `warning.soft` bg, radius.lg, bleeds −16 horizontal. Expired value carries an inline amber `Expired · ` prefix tag (`expiredTag`) in `warning.base` — the date itself stays ink.

### 2.7 AdvancedPanel — "技术细节" (`signing/AdvancedPanel.tsx`)

Collapsed toggle row: space-between, padV 12; label sm medium `fg.muted` (`advancedToggle`); ChevronDown 16 `fg.subtle`, rotates 180° open. Opens ONE grey card (`drawerCard`): `bg.sunken`, radius.xl, padH 12; rows padV 8 with top hairlines (first row none), gap 8.
Row types, in order:
1. **Simulation result** (factual, non-promissory): label "Simulation result" (`simResultLabel`) + mono value ≤2 lines, e.g. `−1,000 USDC · no other changes` (`simResultNoOther`) or "No asset changes" (`simResultNoChange`). Label style: `scaleFont(10.5)` semibold `fg.subtle` ls 0.3 mb 3; value `scaleFont(12.5)` mono ink.
2. **Address rows** (every involved address, deduped; token contracts first): role label; identity line (gap 4) with avatar 18 — token → TokenLogo, wallet → Identicon, contract → 18×18 radius.sm `bg.raised` glyph w/ FileText 11; resolved name `scaleFont(13)` semibold ink OR mid-truncated address (12+8) mono. When named, the raw hex ALWAYS still shows underneath: `scaleFont(11.5)` mono `fg.muted`, indented 18+4 (additive naming — a spoofed label can never hide the bytes). Trailing: ExternalLink 14 explorer button (when chain has explorer) + copy button.
3. **Other rows**: detail fields (wrap, full multiline), `Function` signature (known-selector instant fill, else async 4byte lookup; unknown → `0x… · unrecognized`), `CALLDATA · N BYTES` (mid-truncated 18+6, copy gives exact bytes).
4. **Raw payload** (typed-data JSON / message / batch calls JSON): label "JSON" or "Sign message"; scrollable block maxHeight 300, selectable, with copy.
Copy button: Copy 14 `fg.muted` → Check 14 `success.base` for 1.5s.
Identity resolution behavior (`use-address-identity.ts`): sync pass (known token symbol → descriptor/known-contract name → own account) then async upgrade (saved contact → ENS/Basename for wallets; on-chain `symbol()` for unknown contracts). Resolved kind drives the avatar.

### 2.8 EditableApproveCard (`signing/EditableApproveCard.tsx`) — the never-unlimited mandate

Two shapes:

**A. AmountCard** (ERC-20 approve / increaseAllowance / permit-single):
- **De-containered when routine**: `card` = padV 8, gap 8, NO box. Only the dangerous boolean-grant gets a red box (below).
- Header row (gap 4): TokenLogo 28 + symbol text.base bold ink + right-aligned cap label `scaleFont(10)` semibold uppercase `fg.subtle` ls 0.4 — "Spending cap" (`spendingCap`) or "Reduce by" (`reduceBy`).
- Value: display mode — amount text.3xl bold ls −0.5 (green "Revoked"/0 when revoke) + Pencil 15 `fg.subtle`; tap → custom input mode: bare TextInput text.3xl bold, decimal-pad, no padding, error state colors the digits `error.base`, selectionColor = success green when reducing else accent.
- ≈ fiat line: sm medium `fg.muted`, marginTop −2 (hidden in revoke/error).
- Preset chips row (gap 4, marginTop 2): pills radius.full, padH 12 padV 4, `bg.raised` + 1px `border.base`, text sm semibold `fg.muted`. Active: `fg.base` bg + inverse text. Active-safe (Revoke chip): `success.base` bg + inverse text. Chips: `Requested` (only if finite request) · `Balance` (one-tap finite cap at wallet balance; issue #86) · `Custom` · `Revoke`.
- Inline error row: AlertTriangle 13 `error.base` + sm medium `error.base`. Errors: `invalidAmount`, `unlimitedDisabled` (typing an unbounded value is refused — there is NO unlimited path).
- Summary line: sm regular `fg.muted` lh 18 — `capSummary` {spender, amount} / `revokeSummary` {spender} / `choosePrompt`.
- Unverified decimals footnote: xs regular `warning.base` (`decimalsUnverified`).
- Initial state: finite request → pre-accepted (`requested` mode); unbounded request → forced `custom` with autofocus and confirm disabled until a finite choice exists.

**B. BooleanGrantCard** (setApprovalForAll / DAI permit) — contained danger box: `error.soft` bg, 1px `error.base`@25% (`+'40'` alpha suffix), radius.2xl, pad 20, marginV 4. Header: AlertTriangle 18 + "All NFTs"/"Entire balance" text.base bold `error.base`. Body warning sm medium **ink** lh 19 (restraint: red heading carries the alarm, body stays ink). Two stacked option buttons (row, centered, gap 4, padV 12, radius.lg, 1px border):
- Revoke: `success.soft` bg, border success@25%; selected → 2px solid `success.base`. ShieldCheck 16 + "Revoke access" text.base semibold green.
- Grant anyway: `bg.raised`, `border.base`; selected → 2px `error.base` + `error.soft` bg; label `grantAllAnyway` semibold (`error.base` when selected, `fg.muted` idle).
- Incoming grant request pre-selects NOTHING (deliberate tap required); incoming revoke pre-selects revoke.

### 2.9 BalanceChangePreview (`signing/BalanceChangePreview.tsx`)

Single render path for tx-simulation summaries (shared with Send confirm + connection detail). States:
1. **Expected to fail** (loud): `failCard` — row, `error.soft` bg + 1px `error.base`, radius.xl, padV 12 padH 16, marginV 8; AlertTriangle 16 + sm semibold `error.base` lh 18. Copy `simWillFail` / `simWillFailReason` {reason}.
2. **Underfunded native** (loud, same failCard): `balanceUnderfundedNative` {symbol}.
3. **Quiet ok row** (`okRow`, suppressed on the signing sheet via `hideReassurance` — it moves into 技术细节): ShieldCheck 13 `success.base` + xs medium green. Copy: `balanceSelfTransfer` / `balanceNoAssetsMove` / `simWillSucceed` / `balanceMatchesHero`.
4. **Changes list** (`card`): open block, **top hairline**, padV 12, marginTop 8, gap 4. Title `scaleFont(10)` semibold uppercase `fg.subtle` ls 0.3 (`balanceChangesTitle`). Rows (gap 12, padV 4): TokenLogo 28 + amount text.base semibold ls −0.3, `+` green / `−` ink. **Unverified token** (decimals unconfirmed): NEVER a scaled amount — direction arrow 13 (`ArrowDownLeft`/`ArrowUpRight` in `warning.base`) + "Unverified token" tag sm semibold amber + short address xs medium `fg.muted`. Received-first ordering.
- Corroboration rule (safety invariant): collapses to the quiet ✓ ONLY when every simulated change matches a declared hero flow (same token, same direction) and none is unverified; any unmatched movement expands the full list. Outflow-only wording ("received side is spoofable").
- `summariseSimResult()` also feeds the AdvancedPanel row (§2.7.1).

### 2.10 Views (per-request-type compositions)

**ClearSignView** — the 5-zone descriptor layout:
Zone 1: eyebrow intent (localized; red only if danger) + ONE hero — swap: send TokenCard(s, hero+heroLabel) → FlowArrow → receive TokenCard(s) → SummaryLine; send: hero TokenCard (hideSign) + SummaryLine; pure inflow (withdraw/redeem): receive hero (+"You'll receive {amount}"); NFT: token-id hero (heroAmount style + collection name as tokenLabel) + summary; deploy: summary only.
Hero risk tinting (invariant A3/A5 — a below-fold banner is never the sole signal): field-warning → danger variant; bestEffort/partial/unverified without a confident sim → caution variant.
Zone 2: counterparties — spender rows (ContractBar contract identity, verified from descriptor); recipient rows (auto identity, compact when named in summary; red warning row when sending a token to its own contract; swap-to-self renders NO row); fallback "Interacting with {contract}".
Zone 3: stacked warnings, danger→caution, never most-severe-only: token-to-contract; unlimited; expired (deduped vs field tag); best-effort (calmer copy when sim-confident); partial; unverified.
Detail: remaining generic field rows (address-valued & detail-flagged ones live in 技术细节 instead).

**ApprovalView** — eyebrow verb (Approve ink / Approve red if unbounded / Approve-all red / Revoke green) → SummaryLine (danger tone only for unbounded grant) → **EditableApproveCard** → increaseAllowance "resulting total" row (`allowanceTotalRow`: `bg.sunken` radius.lg padV8/padH16; label `scaleFont(10)` uppercase subtle; value sm semibold mono ink `current + increment = total SYM`; unknown-current fallback sm medium amber) → expired caution banner. Deliberately NO boxed spender/token identity rows (summary + 技术细节 carry them).

**PermitSignView** — off-chain permit (can't be capped; sign verbatim under deliberate consent): eyebrow verb (red if unlimited / green revoke) → SummaryLine → tokenCard-style row (TokenLogo 40 + amount text ("Unlimited"/"Entire balance"/"Multiple tokens"/finite amount) + tag "Spending permit (signature)"; `error.soft` bg when dangerous + AlertTriangle 14) → expired banner → decimals-unverified banner → danger hint paragraph (`permitHint` style: sm regular `fg.muted` lh 18): "A permit is a signature — its amount can't be capped here…" (`permitCantCap`). No cap editor by design.

**MessageSignView** — SIWE: eyebrow "Sign in" (red on domain mismatch) → genRows: Domain (value red on mismatch) + Statement (≤3 lines) → mismatch = danger banner {domain, origin}; ok = quiet `siweOkRow` (ShieldCheck 13 green + xs medium green `siweOk` {domain}). Plain message: eyebrow "Sign message" → `msgBubble` — open block framed by top+bottom hairlines, padV 16, marginV 8; message text.base regular ink lh 22 **centered**. Non-printable hex payload → caution banner (`hexMessageWarning`).

**EthSignDangerView** — eyebrow red "eth_sign" → danger card `ethSignCard`: `error.soft` bg, radius.2xl, pad 20, 1px `error.base`@25%, gap 8; header ShieldAlert 16 + title text.base bold `error.base`; body sm regular **ink** lh 19; opaque hash block `scaleFont(11)` mono `fg.muted` on `bg.sunken` pad 8 radius.md, ≤2 lines → danger banner.

**BlindTypedDataView** — eyebrow neutral "Sign typed data" → genRows: `Type` (primaryType) + first 5 message fields, values one-line mid-truncated (0x…) honest-raw (no decimal/timestamp guessing) → ContractBar "Signing for" (domain name + verifyingContract) → caution banner `blindTypedWarning`.

**BlindTransactionView** — eyebrow: plain send → "Send" ink; calm simulated call → "Contract interaction" ink; else "Unknown" RED. Value TokenCard (hero for plain send; danger variant for un-simulated call with value; `≈fiat` from native price) → SummaryLine (plain send) → ContractBar (recipient auto/compact for send; "Unverified contract" + warning for blind call) → banner: calm caution `blindButSimulated` vs danger `blindDecodeWarning` {bytes}.

**BatchCallsView** — eyebrow "Batch" + subtitle sm regular `fg.muted` (`batchSubtitle` {count}). Per leg:
- Unbounded/grant-all approval leg → open editor block: numbered head (24×24 circle `bg.raised`, index text.xs bold `fg.muted`; title text.base semibold, 1 line) + full EditableApproveCard.
- Every other leg → compact row `batchRow`: `bg.sunken`, radius.xl, padV12/padH16, marginV 4, gap 12; number chip; title (localized intent / "Approve" / "Contract call"); detail line sm medium `fg.muted` ("Spending cap · 500 USDC" or first meaningful amount); counterparty xs mono `fg.subtle`. Still-broad leg → 1px `error.base` border + ShieldAlert 14.
- Footer banners: any leg sending a token to its own contract → danger `tokenToContractWarning`; any still-uncapped grant → danger `unlimitedWarning`.
- `legNeedsChoice` gates the sheet's confirm until every granting leg is capped/revoked/deliberately chosen.

### 2.11 Intent/label localization (`signing-core.tsx`)

ERC-7730 English intents/labels map to i18n keys (`componentsUi.signing.intent*` / `.label*`); unknown values fall through to the raw string. Intent set: send/transfer, transfer-nft, approve/set-allowance/increase-allowance, swap/exchange/trade, deposit/supply, withdraw/redeem, mint, burn, stake, unstake, claim, bridge, wrap, unwrap, borrow, repay, revoke. Label set: amount/value/assets, to/recipient/receiver/beneficiary/destination, from/sender, owner, spender/operator, token, token-id, deadline, min-received (5 spellings), pay, received, shares, deposit/withdraw asset, mint/redeem shares, chain, nonce.

---

## 3. GasFeeCard + FeeTokenSelector (`ui/`, shared Send ↔ signing)

### 3.1 GasFeeCard

Collapsed row (`toggleRow`: space-between, padV 12, **no horizontal inset** — shares the sheet's left edge, marginBottom 4):
- Left column (gap 2): "Est. fee" (`componentsUi.gas.estFee`) sm medium `fg.muted`; when selectable, sub-line "Paid with {symbol}" (`gas.paidWith`) xs regular `fg.subtle`.
- Right cluster (gap 4): value column right-aligned — primary `~0.0012 POL` sm semibold ink (token-first); `≈ {fiat}` xs regular `fg.subtle` only when fiat ≥ $0.005. Refresh button (RefreshCw 14 `fg.muted`, pad 2; spinner while re-quoting). Chevron up/down 16 `fg.subtle` when a fee-asset choice exists.
- **States**: estimating → "Estimating…" (`gas.estimating`); failed → "Estimate failed" (`gas.estimateFailed`) in `warning.base` + RefreshCw 16 amber, tap row = retry; refreshing → per-row spinner + confirm gated via `onBusyChange`.
- Behavior encoded in design: auto-expands ONCE per (chain,account) when >1 fee asset exists; auto-defaults the selection to the first AFFORDABLE asset (a 0-native-balance account never strands on native); fee shown = fee signed (quotedFee invariant); speed tiers deliberately absent (always 'fast'); Tempo chains default to their ERC-20 fee token.

### 3.2 FeeTokenSelector

Expanded picker under the fee row — de-boxed: container has **top hairline** `border.base`, marginBottom 12. Header "Fee token" (`gas.feeToken`) xs semibold uppercase `fg.muted` ls 0.8, marginTop 12. One ROW per option (native + held whitelisted stables): row gap 8, padV 8 —
- TokenLogo 32; left column (flex): symbol text.base semibold ink; "Balance {n}" xs regular numeric `fg.subtle` (`gas.rowBalance`).
- Right column (the emphasis, per founder IA): `~0.42 USDT` text.base semibold numeric ink; caption "This tx" xs regular `fg.subtle` (`gas.rowSpend`); dust reads `< 0.0001`; unavailable → `—`.
- Trailing 22px slot: accent Check 18 (selected; the app's picker convention — accent check only, no filled tint) or ActivityIndicator 16 accent (pending).
- **Insufficient** rows (balance < fee): opacity 0.4, non-selectable but SHOWN for context. While busy all other rows dim + block taps.
- A11y: role button, `selected`/`disabled` states.

---

## 4. Send components (`src/components/send/`)

### 4.1 BatchImportSheet — payroll importer ("表格批量发薪")

Full-height AppModal content: container padH 20 padTop 12. Header: title text.2xl bold + X 22 close.
Body (scroll):
1. **Unit SegmentedToggle**: `In {fiatCode}` | `In {tokenSym}` (fiat default when priced).
2. **Paste area**: TextInput multiline, minH 84 maxH 140, `bg.sunken`, radius.xl, pad 12, text sm mono ink; placeholder `0xabc… , 5000\n0xdef… , 8000`.
3. **Source row** (gap 20): two plain text-buttons (no boxes; minHeight 44): FileUp 16 + "Import file"/"Reading…"; Download 16 → Check 16 + "Get template"/"Template saved". File name echo xs mono `fg.muted`.
4. **Rate section** (fiat mode; SectionLabel "Rate", de-containered): "Priced in" row (minH 44, label text.base medium muted, value code text.base semibold ink + ChevronRight 16) opening the shared CurrencySheet (title distinct from the global currency picker — issue #80); hairline Divider; **rate sentence row** (minH 44): `1 USDT = [ 7.16 ] CNY` — the editable span is a content-sized underlined input (border-bottom 1px `border.strong`, text.base semibold, centered; hidden absolute mirror sizes it) with an "Auto" reset text-button pushed to row end when edited. Hints xs regular `fg.muted`: no-price / fetching / failed.
5. **Preview rows**: gap 2; each row padV4/padH4 radius.md: ContactAvatar 32 + name line (name or shortAddr, sm semibold + RecipientTypeBadge 12) + conditional second line xs mono `fg.muted` ("Invalid address" / "Duplicate — skipped" / address-under-name); right column: fiat xs regular muted, then `→ 692.3 USDT` (ArrowRight 11 subtle + sm semibold ink) or `—` sm `fg.subtle`. Bad rows: whole row opacity 0.5.
6. **Notices** (both can show at once): AlertCircle 13 amber + xs medium `warning.base` — over-cap ("Only the first {n}…") and rejected-count.
Footer (top hairline, padTop 8, gap 4): totals row — "{n} recipients" sm medium muted; right: total `{token} {SYM}` text.lg bold ink (→`error.base` when over balance) + `≈ ¥{fiat} {code}` xs muted. Over-balance warning xs medium `error.base`. Apply VelaButton: accent "Import {n} recipients" when valid; disabled state = **quiet sunken slab** (`bg.sunken`, borderless secondary — never a washed-out accent); empty state label is count-free ("Import recipients", never "Import 0").
Rate invariant (behavioral spec): the displayed rate string IS the applied rate — display and conversion can never diverge.

### 4.2 ConfirmAssets — "what you're sending" block (Send confirm)

- **Single asset**: one quiet pill (`chip`): self-start row, `bg.sunken`, radius.full, padV 4 padL 4 padR 12, marginTop 12, gap 4 — TokenLogo 20 (with chain badge) + `USDT · Polygon` sm semibold `fg.muted`. No amount here (it lives on the From/To rows).
- **Multi (sweep)**: same pill but with an overlapping logo cluster (≤4 logos 22px, each ringed 2px in the pill's own sunken color, overlap −8; `+N` extra disc 26px `bg.raised`, xs bold muted) + `3 tokens · ≈ $248.37` + chevron. Tap expands (fadeInDown 200ms) a de-boxed detail list: rows gap 8 padV 8 — TokenLogo 36 + symbol text.base bold / networkText xs medium subtle + right amount text.base bold numeric / usd xs medium subtle.

### 4.3 FlowArrow (send) — sender→recipient connector

38px-wide column (matches the 38 avatar column, centered under it), padV 2: a 1.5×16 hairline shaft in `border.base` flowing into MoveDown 20 `border.base` strokeWidth 1.5 (head pulled up −4 so the shafts join). Shared by single/split/sweep so the flow always reads identically.

### 4.4 MultiRecipientEditor — split ("一币多人") editor

Wrap gap 8. **Per-recipient card** (one of the few legitimate cards — a repeated compound form unit): `bg.sunken`, radius.xl, 1px `border.base`, pad 12, gap 4:
- Head: `Recipient {n}` sm semibold muted + remove button 28×28 radius.md `bg.base` w/ X 16 (hidden when only 1 row).
- Address: AutoGrowTextInput (minH 44 maxH 96) on `bg.base` radius.lg padH12/padV8 sm regular + trailing 40×40 `bg.base` radius.md address-book button (BookUser 20 muted).
- Under the address: invalid → xs medium `error.base` error; valid → identity row: ContactAvatar 20 + RecipientTrust (prominent, nameOnly) + RecipientTypeBadge — identical identity treatment to single-send.
- Amount: row on `bg.base` radius.lg padH 12 — input text.lg semibold + symbol text.base semibold muted; `≈ fiat` xs muted below.
- Add/import row (gap 8): two flex **dashed-border** buttons (1px dashed `border.base`, `bg.raised`, radius.lg, padV 12): Plus 18 accent + "Add recipient" text.base semibold `accent.base`; FileUp 18 + "Import list". Disabled (cap reached): opacity 0.4.
- Totals row (as in importer) + over-balance warning sm medium `error.base`.

---

## 5. Contacts components (`src/components/contacts/`)

### 5.1 ContactAvatar

Deterministic identity avatar. Two render modes (user preference `avatarStyle`):
- **Tinted initial** (default / non-address seeds): circle size N, bg `hsl(H,32%,91%)` light / `hsl(H,24%,22%)` dark; initial letter bold ls −0.5, fontSize 0.42×N, color `hsl(H,40%,36%)` light / `hsl(H,38%,74%)` dark. H drawn from a curated 8-hue set {18 terracotta, 210 slate, 150 sage, 340 dusty rose, 42 ochre, 268 soft violet, 122 muted green, 190 dusty cyan} hashed from address (falls back to name).
- **Identicon** (preference + valid address only — partial input keeps the tinted initial to avoid per-keystroke churn): nimiq-style `Identicon` sized N; `enlargeable` wraps in a Pressable (stopPropagation, no nested button role) opening the large identicon viewer with a selection haptic.
- `kind === 'account'` badge: 16×16 circle `info.base`, 1.5px ring `bg.raised`, Wallet 9 white — bottom-right (−1,−1).

### 5.2 ContactPicker — unified recipient chooser (AppModal sheet)

Container padH 20 padTop 12. Header: "Choose recipient" text.2xl bold + X 22. Search field: `bg.sunken` radius.xl padH16/padV12 gap 8 — Search 16 subtle + input text.lg regular + clear X 15. Rows are ALL plain de-boxed rows (minHeight 56, padV 8 padH 4, gap 12, avatar 40) with hairline dividers **inset past the avatar** (marginLeft 4+40+12 = 56).
Row inventory: Scan row (40 circle `bg.sunken` + ScanLine 19 muted + label text.lg semibold); "Use typed address" row (avatar + label + shortAddr + trailing "Save" text-button text.base semibold muted); Group rows (Users 19 icon circle + name + "{n} members" + ChevronRight 18); Contact rows (avatar 40 enlargeable + name text.lg semibold (+ filled Star 12 `warning.base` if favorite) + sub-line sm mono muted: shortAddr / kind / `· {n} sends`). Sections via SectionLabel (uppercase subtle): Groups / Favorites / Recent (or "Contacts").
States: loading spinner (padV 32); empty — centered title text.lg semibold + hint text.base regular muted lh 20 + "Add contact" text-button `accent.base` (one of the few accent uses; the picker is otherwise accent-free by design).

### 5.3 ContactsManager — address book (Settings sheet)

Three views in one AppModal: list / contact form / group editor.
**List**: header title text.2xl bold + icon buttons 32×32 (Search 20, Plus 22, X 22 — plain, no boxes). Search replaces the header (fadeIn 160ms) as a sunken pill w/ autofocus. `[All {n} | ★ Favorites {n}]` SegmentedToggle (star icon fills `warning.base` when active; shown only when favorites exist). Groups section with "New group" text action (sm semibold muted). Contact rows: avatar 42, minHeight 60, pressed state = `bg.sunken` fill (radius.lg); trailing star toggle 36×36 (Star 18, filled amber when favorite). Divider inset 4+42+12. Import/Export row: centered quiet text-buttons (Upload/Download 15 + sm semibold ink, minHeight 44) under a top hairline, gap 24. Empty state: title + hint + accent "Add contact" text-button. Export flow = 2-option alert (JSON/CSV).
**ContactForm**: header with ChevronLeft back + centered title + 22px spacer. Centered live avatar 64 (updates with name/address). Field pattern: label `scaleFont(10)` semibold uppercase `fg.subtle` ls 0.3, mL 4; input `bg.sunken` radius.xl padH16/padV12 text.lg regular (address variant: AutoGrow minH 52, mono medium text.base; disabled/edit = `fg.muted` text, address immutable). Name placeholder auto-fills with the resolved ENS/passkey identity. Invalid address error sm medium `error.base`. Actions: accent VelaButton "Save" (loading state) + centered destructive text-row (Trash2 16 + "Delete" text.base semibold `error.base`). Delete = confirm alert.

### 5.4 GroupEditor

Header (back / "New group"·"Edit group" / spacer). Name field (same field pattern). "Members" head + selected-count sm bold `accent.base`. Compact search (sunken, radius.lg, padH12/padV8, text.base). Member rows: padV 4, gap 12 — avatar 38 + name text.base semibold / shortAddr xs mono muted + trailing **check disc**: 24×24 circle, idle 2px `border.strong` ring; selected fill+border `accent.base` w/ Check 14 inverse. Empty copy: "Save some contacts first, then group them here." Footer: accent Save + destructive "Delete group" text-row.

### 5.5 RecipientName

Text-only resolver: saved contact → live identity (Vela passkey → ENS/name-service) → stored name → shortAddress. One line. Pairs with RecipientTypeBadge so name and badge derive from the SAME cached identity.

### 5.6 RecipientTrust

One deduplicated identity line; leading icon encodes trust: **saved+starred → BadgeCheck green** (the "you vouched" anti-poisoning signal); any other resolvable identity → UserRound in `accent.base`. Renders nothing without a name. Variants:
- `default` (Send address entry): row space-between padL 4 — icon 14 + name sm semibold (`accent.base`, green when favorite) + right source tag xs medium `fg.subtle` ("Vela User" / "ens" / …).
- `compact` (dense rows, ContractBar): self-start pill radius.full padV 2 padH 4 gap 2 — favorite: `success.soft` bg + green sm semibold; plain: `bg.sunken` + `fg.muted`. Icon 12.
- `prominent` (confirm "To"): icon 16 + name text.base bold ink (green when favorite); `nameOnly` drops the icon (trust shown by a trailing badge instead).

### 5.7 RecipientTypeBadge

Small trailing marker (default 15px) after a recipient name. Priority: saved contact → **BadgeCheck `success.base`**; Vela passkey user → **Vela app-icon image** (size+1, circular); named via name-service → **Globe `info.base`** (calm blue, deliberately not accent); unknown → HelpCircle `fg.subtle` + kind glyph (FileText contract / Wallet EOA). Renders nothing until the contact lookup resolves (a contact never flashes "unknown").

---

## 6. Dev (`src/components/dev/ParallelSpaceBadge.tsx`)

App-wide floating pill marking the parallel-space test env. Absolute, top = safeTop+6, centered, zIndex 9999, wrapper `pointerEvents:box-none`. Pill: row gap 6, padH 12 padV 5, radius 999, **hardcoded violet `#7c3aed`** (deliberately off-brand), shadow y2 blur8 op.25. Content: FlaskConical 12 white + "PARALLEL SPACE" 11px w800 ls 0.6 white + "mock passkey · test" 10px w600 white@80%. Tap → `/parallel` hub. Renders null unless the global flag is set. (Intentionally NOT tokenized — must look identical and alien in both themes.)

---

## 7. Root-level components

### 7.1 ConnectionFlowStates (WalletPair pairing lifecycle)

Rendered inline by Connect screen + Home Connections panel. Three states (hosts own `disconnected`/`connected`):
1. **Fingerprint verification** (security gate → a LIGHT contained surface): card `bg.sunken`, radius.xl, 1px `border.base`, pad 20, centered, gap 12; entering fadeInDown 300ms delay 50. Header: Fingerprint 28 `accent.base` + title text.xl bold. Hint text.base regular muted centered lh 20. **Digit boxes**: row gap 12, marginV 16 — each 52×64, radius.lg, `bg.raised`, 1px `border.strong`, digit `scaleFont(28)` bold mono ink. dApp identity line (icon 14 radius 3 or Globe 14 + name sm mono `fg.subtle`). Encrypted badge: pill `success.soft` radius.full padH8/padV4 — Lock 12 + xs semibold `success.base`. Actions full-width: accent "Confirm" + secondary "Cancel".
2. **Waiting** (open, no card): centered padV 48 gap 12 — 64 circle `accent.base`+'12' (7% alpha tint) w/ Radio 32 accent; status text.lg semibold `accent.base`; hint text.base muted centered; compact secondary Cancel.
3. **Error** (open typographic state, matching waiting): centered padV 32 gap 8 — 64 circle `error.soft` w/ AlertTriangle 28 `error.base`; title text.xl bold ink; message text.base muted centered lh 20; full-width accent "Scan again" + (if session) secondary "Retry". Entering fadeInDown 300.
Copy: `connect.list.*` (verifyTitle, verifyHint, encryptedBadge, confirm, cancel, waitingStatus, waitingHint, connFailed, connError, scanAgain, retry).

### 7.2 QRCode + qr-path

QR rendered as a **single SVG path** (all dark modules merged into h-runs) over a background Rect — avoids per-cell rounding gridlines at any scale. Props: value, size (default 200), color `#000000`, backgroundColor `#FFFFFF` (defaults hardcoded — QR must stay black-on-white for scanability; hosts put it on a white box). Error correction level M.

### 7.3 QRScanner — full-screen scanner modal

Full-screen Modal (slide-up), black bg. Camera fills; overlays:
- **Scan frame**: centered 240×240; 4 white corner brackets 28×28, 3px stroke, 12px corner radius; native-only animated scan line (2px white@60%, inset 8, 2s ease-in-out ping-pong).
- **Header overlay** (absolute top, padH 16): X close 22 white (44×44 buttons, radius 22) · title text.lg bold white · right cluster: torch (Flashlight 20; ACTIVE state = white filled disc + black icon), image-pick (ImagePlus 20 white), camera-flip (SwitchCamera 20 white, native only).
- **Footer overlay**: native-only **zoom slider** — ZoomIn 16 white@75% + 3px track white@28% / white fill / 20px white thumb (shadow), maxWidth 320; hint sm medium white@70%.
- **Permission state** (native): centered — Camera 40 `fg.subtle`, text.lg regular subtle centered lh 22, accent button (padH 24 padV 16 radius.xl) "Grant permission" or "Open Settings" (after permanent denial).
Behaviors that are design-relevant: auto-hunt zoom triangle-sweep (native) until manual interaction; success haptic + 2s re-arm on decode; torch off when flipping to front camera; web decodes with an invisible center-crop "digital zoom" (no zoom UI on web by design). Copy: `componentsUi.scanner.*` (title, hint, torchLabel, permissionText, grantPermission, noQrFound, noQrFoundMsg, error, errorImage, errorPicker).

### 7.4 ReceiveShareCard — branded share/screenshot card

Fixed-styling card (screenshotted; **always light**, hardcoded): width 360, white bg, radius 28, padH 28 padTop 24 padBottom 22, centered. Brand header: app icon 24 (radius 6) + "Vela Wallet" text.base bold `#16161A`. QR box: 1px `#ECEBE4` border, radius.xl, pad 18, white; QR 196. Name text.2xl bold `#16161A`. Variants: `request` → summary line text.base semibold `accent.base` (e.g. "Request 12 ETH · Ethereum") + short address; `address` → short address (10…8, sm mono medium `#8A8A96`) + "N supported networks" label (xs medium `#B0ADA5`) + 2-col wrap grid of network chips (48.5% w, `#F5F3EF`, radius.full, padH 10 padV 7 — ChainLogo 18 + name xs semibold `#16161A`). Footer "getvela.app" sm semibold `#B5B5BE` marginTop 18. (Web draws the equivalent on canvas — keep in sync.)

### 7.5 ReceiveRequestControls — EIP-681 request form

De-containered form: SectionLabel "Token" → **open asset row** (padV 8, gap 8): TokenLogo 32 w/ chain badge + symbol text.base semibold / network sm regular muted + ChevronDown 18 muted → Divider → SectionLabel "Amount" → amount chip: `bg.sunken` radius.lg padH 12 — input text.lg semibold (decimal-pad, locale decimal mark) + symbol text.base semibold muted → hint xs regular `fg.subtle`. Asset picker = AppModal wrapping the shared TokenSelector (title text.xl bold centered), fed with ALL tokens incl. zero-balance/custom so you can request what you don't hold.

### 7.6 TokenLogo

Circular token image with ordered fallback URLs; on all failures → letter disc: bg `hsl(H,30%,93%)`, letter `hsl(H,45%,55%)` bold at 0.42×size (hash of symbol; NOTE: not dark-mode-aware — flagged in open questions). Image placeholder bg `bg.sunken`. Optional `chain` badge: ChainLogo at 45% of size, bottom-right (−2,−2), radius.full, **2px ring in `bg.base`** so it reads as a separate disc.

### 7.7 ChainLogo

Remote network logo (circular, size default 32, transparent bg); on failure → colored disc using the network's `iconBg`/`iconColor` + label text at 0.3×size bold. Always circular.

### 7.8 ExtensionSignController — Safari-extension hand-off confirmation

Headless while idle/connecting/signing (offscreen machine-status line only). When settled → **custom bottom sheet overlay** (deliberately not an RN Modal — avoids modal-over-modal): full-screen dim `rgba(0,0,0,0.4)`, tap-outside dismisses. Sheet: `bg.raised`, top radius 24, hairline top `border.base`, padTop 8 padH 32, shadow y−8 blur24 op.14, centered; grab handle 36×5 radius 3 `border.strong`@80%. Glyph disc 56 radius 28 + Check/X/AlertTriangle 26 strokeWidth 2.75. Title text.xl bold ink; hint text.base regular muted centered lh 20 maxW 300. Done button: stretch, padV 16, radius 15 — **accent** bg + white label only for positive outcomes (signed / one-tap-enabled); neutral `bg.sunken` + ink label for reject/expired/ambiguous (color never overstates the result); pressed opacity 0.92.
Outcome color grammar: submitted → success glyph (green on `success.soft`); rejected → neutral X (subtle on sunken); expired/missing → neutral AlertTriangle; unknown/"check Vela" → amber AlertTriangle on `warning.soft`. Success auto-dismisses after 2.6s; others persist. Haptics matched per outcome. Copy: `signHandoff.*` (signed, rejected, pending, expired, returnHint, oneTapTitle, oneTapHint, done).

### 7.9 AccountFileWriter

Headless (`returns null`). Syncs the active-account cache (+theme, +locale) to the Safari-extension App Group file; routes `https://getvela.app/sign?rid` Universal Links into the extension-sign bus. No visual spec; document only as a system behavior.

### 7.10 external-link.tsx

`ExternalLink` — expo-router `Link` with `target="_blank"`; on native it preventDefaults and opens the in-app browser (`openBrowser`). No styling of its own.

### 7.11 animated-icon (.tsx / .web.tsx / .module.css) — Expo template leftovers

Splash overlay + animated Expo logo (blue gradient `#3C9FFE→#0274DF`, solid `#208AEF`, 128 tile, rotating glow). **Not part of the Vela design language** (Expo demo assets); exclude from the Penpot library unless the real splash is rebuilt separately.

### 7.12 themed-text / themed-view — legacy primitives

`ThemedText` (type variants default/title/small/smallBold/subtitle/link/linkPrimary `#3c87f7`/code) and `ThemedView` use the legacy `getThemeColors()` accessor, NOT the current token system or Plus Jakarta. Legacy Expo-template remnants; do not carry into the design system (flagged).

---

## 8. Cross-cutting copy & behavior patterns worth encoding in Penpot

1. **Fiat approximations** always read `≈ {formatted}` in the user's display currency, one size smaller and one shade quieter than the token amount.
2. **Mid-ellipsis addresses**: 12+8 chars in technical panels; 10+6 for op hashes; `shortAddr` elsewhere. Full 0x is always reachable (Advanced drawer / tap-to-reveal), never destroyed by naming.
3. **Hairline inset rule** (Apple-Wallet style): list dividers inset past the leading avatar/icon (`marginLeft = rowPad + avatar + gap`), seen in ContactPicker (56) and ContactsManager (58).
4. **Disabled CTA** = quiet sunken slab (`bg.sunken`, no border), never a faded accent (BatchImportSheet); standard VelaButton disabled elsewhere = 0.45 opacity.
5. **Numbers**: locale-aware separators everywhere (decimal mark swapped in inputs; grouping in display); dust renders `< 0.0001`; rates keep 4 significant digits and never mirror as "0".
6. **Entrances**: fadeIn/fadeInDown 160–300ms, played once (hasEntered gating per design language rule 10).
7. **A11y invariants**: every pressable has role button + translated label; selected controls expose `accessibilityState.selected`; ≥44×44 targets (or hitSlop); avatars inside rows intentionally have NO button role (no nested buttons on web).

## 9. Component → primitive dependency map (composition)

- SigningSheet → DAppBanner, IntentHeader, SummaryLine, TokenCard, FlowArrow(signing), ContractBar, WarningBanner, GenericFieldRow, EditableApproveCard, BalanceChangePreview, AdvancedPanel, GasFeeCard→FeeTokenSelector, SigningAccountRow, SlideToConfirmButton, VelaButton, ContactAvatar, RecipientTrust, TokenLogo, ChainLogo, Identicon.
- SigningRequestModal(prod) → AppModal, SigningSheet, BundlerFundingView.
- BatchImportSheet → AppModal, SegmentedToggle, SectionLabel, Divider, CurrencySheet, VelaButton, ContactAvatar, RecipientTypeBadge.
- MultiRecipientEditor → AutoGrowTextInput, ContactAvatar, RecipientTrust, RecipientTypeBadge.
- ConfirmAssets/FlowArrow(send) → TokenLogo.
- ContactPicker/ContactsManager/GroupEditor → AppModal, SectionLabel, Divider, SegmentedToggle, VelaButton, AutoGrowTextInput, ContactAvatar, IdenticonViewerProvider.
- ReceiveShareCard → QRCode, ChainLogo. ReceiveRequestControls → AppModal, SectionLabel, Divider, TokenLogo, TokenSelector.
- ConnectionFlowStates → VelaButton. ExtensionSignController → (self-contained overlay).
