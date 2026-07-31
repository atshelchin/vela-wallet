# Module batches — closing SC-003

Written 2026-07-31. The work is batched by BUSINESS MODULE, not by page or by technical grouping:
a reader opens this file asking "how does onboarding work", not "which cells share a generator chunk".

Source of the per-cell verdicts: `generator/reconciliation.json` (15 agents, every EXCLUDE independently
challenged — 38 of 63 were overturned). Runnable specs: `generator/recipes-2026-07-31.json`.

| # | Module | To board | Renames | Exclusions | Status |
|---|---|---|---|---|---|
| 1 | settings | 3 | 1 | 0 | batch 1 IN PROGRESS — 15 overlay cells captured (overlay-scoped) and building |
| 2 | onboarding | 6 | 1 | 0 | pending |
| 3 | home | 17 | 6 | 9 | pending |
| 4 | receive | 1 | 0 | 0 | pending |
| 5 | token | 9 | 3 | 0 | pending |
| 6 | send | 23 | 8 | 1 | pending |
| 7 | dapp | 28 | 15 | 9 | pending |
| 8 | pay | 2 | 0 | 0 | pending |
| 9 | system | 6 | 6 | 6 | pending |

Totals: **95 cells to board**, 40 renames, 25 upheld exclusions.

Batch 1 is `settings` because its 15 overlay recipes were already authored AND verified against the
running app — the whole chain (capture → region maps → board → restack → wire → audit) gets proven
on a real module before any authoring effort is spent on the rest.

## settings

**To board**

- `O/currency-sheet/empty` — VERIFIED (dom-dumps/_probe/_probe-currency-empty.json): 'Display currency | No currency matches "zzz".' in fg.subtle, no rows (CurrencySheet.tsx:101-102).<br>_reach:_ same sheet, cumulative: retype the search field with 'zzz'
- `O/currency-sheet/searching` — VERIFIED (dom-dumps/_probe/_probe-currency-searching.json): the list narrowed to the dollar family (US/Hong Kong/Australian/Canadian/Singapore/New Zealand Dollar) with the clear-✕ <br>_reach:_ /design-gallery → click id gallery-open-currencysheet → wait 1200 → type placeholder 'Search currency' with 'dollar' (this placeholder is unique app-w
- `S/settings/developer-unlocked` — Not a duplicate of S/settings/default: the existing boards already show the collapsed DEVELOPER header (all three settings dumps contain 'Developer' because they were captured in t<br>_reach:_ Same browser context, /parallel FIRST (enterParallelSpace writes dev_unlocked='1', parallel-space

**Renames (the plan is stale, the board exists)**

- `O/currency-sheet/default` → `O/currency/default`

## onboarding

**To board**

- `S/index/loading` — Nothing to transcribe, and the harness cannot hold it. src/app/index.tsx is 21 lines: while state.isLoading it renders ONE <ActivityIndicator size="large" color={accent.base}/> cen
- `S/onboarding/create-ceremony` — CreateWalletScreen.tsx:418-423 renders the Loader+status row; the passkey stages (:125 'Setting up secure identity...', :158 'Verifying identity...', :175, :183) flash under the fi<br>_reach:_ generator/capture/_probe-onboarding
- `S/onboarding/create-resume` — Needs a human at a real authenticator. pendingReg is set only when registration SUCCEEDS and the very next verification signature is then CANCELLED (CreateWalletScreen.tsx:127 + :2
- `S/onboarding/create-success` — CreateWalletScreen.tsx:292-326 (success medallion, address box with copy affordance, verifyHint) + :460-465 (Enter Wallet CTA). This is the terminus of the onboarding journey and s<br>_reach:_ generator/capture/_probe-onboarding-success
- `S/onboarding/sync-failure` — CreateWalletScreen.tsx:327-361 (uploadFailed branch: AlertTriangle medallion, Open Settings, Report this error, the quiet technical-details disclosure) + :466-471 (Retry Upload). D<br>_reach:_ generator/capture/_probe-onboarding
- `S/onboarding/welcome-signin-loading` — Cannot be held open, and carries no geometry of its own. The whole delta from S/onboarding/welcome is the second button's label swapping for an ActivityIndicator (WelcomeScreen.tsx

**Renames (the plan is stale, the board exists)**

- `S/onboarding/create-form` → `S/onboarding/create`

## home

**To board**

- `O/account-switcher/create-actions` — VERIFIED 2026-07-31: dom-dumps/_probe/_probe-as-create-actions.json — 'Accounts | Total $3.27 | … | Create New Account | Sign In with Existing' (AccountSwitcherModal.tsx:138-143). <br>_reach:_ /settings (settle 7000) → click aria-label /^Parallel One/ (the Account SettingsRow, SettingsScreen
- `O/account-switcher/loading` — VERIFIED 2026-07-31: dom-dumps/_probe/_probe-as-loading.json shows 'Switch Account | 3 accounts · $0.00 | Parallel One … $0.00 | Parallel Three (no figure) | Parallel Two (no figur<br>_reach:_ /parallel (settle 9000) → vela
- `O/account-switcher/privacy-masked` — VERIFIED 2026-07-31: dom-dumps/_probe/_probe-as-masked.json — every figure masked, including the header subtitle ('3 accounts · ••••') and all three rows (AccountSwitcherModal.tsx:<br>_reach:_ /parallel → click aria-label /^[$€£¥]/ (the balance hero; the same recipe S/home/hidden-balance uses in state-specs-8
- `O/balance-detail-sheet/fix-form-swap` — VERIFIED 2026-07-31: the sheet body was replaced in place by the RPC-fix form — 'Fix RPC | Ethereum | Chain ID: 1 | All RPC endpoints for this network are failing… | RPC URL | Save<br>_reach:_ /design-gallery → click id gallery-open-balancedetailsheet → wait 1000 → click text 'Fix' (only genuinely-failed chains offer it, BalanceDetailSheet
- `O/balance-detail-sheet/tokens-only` — VERIFIED 2026-07-31 by direct probe: the hero notice appeared at ~+18s and the tap opened 'Balance details | TOKENS WITHOUT A PRICE | These balances are correct — there's just no p<br>_reach:_ /parallel → vela
- `O/identicon-viewer/copied` — Same call as treasury-bootstrap/copied: this is the shared copy-feedback micro-state (07 §9.4), here swapping Copy 15 subtle + mono address for Check 15 success + semibold 'Copied'
- `O/network-filter-sheet/searching` — The header's right control toggles Search⇄X and REVEALS a TextInput row above the list (NetworkFilterSheet.tsx:117-125), which then filters the rows. The boarded default shows a ba<br>_reach:_ /design-gallery → 'NetworkFilterSheet · selectedChainId=100' launcher (gallery-open-networkfiltersheet), then tap the 34×34 search toggle at the top-r
- `O/rpc-fix-form/saving` — A one-element swap on a control already boarded at rest: the save button's label is replaced by a 16px inverse ActivityIndicator and the button takes styles.fixBtnDisabled (RpcTrou
- `S/home/assets-empty` — HoldingsList's empty-wallet card (HoldingsList.tsx:144-153) is a completely different content region from the holdings list in S/home/assets: a centred accent ArrowDown medallion o<br>_reach:_ Cold-load http://127
- `S/home/balance-loading` — BalanceSkeleton (HomeScreen.tsx:104-105, gated by balanceUnknown in useHomeController.ts:188) replaces the hero number with a placeholder bar. I measured it in the live DOM: a 208x<br>_reach:_ Cold-load http://127
- `S/home/connections-connected` — The live-session card is a third distinct picture: an elevated VelaCard with the dApp monogram, name and URL, a status dot + 'Active', the 'Only one active connection at a time' li<br>_reach:_ In-process: require('e2e/support/relay
- `S/home/connections-connecting` — The pairing gate renders INLINE inside Home's Connections tab, under the balance hero (ConnectionsView.tsx:159-161 -> ConnectionFlowStates): a 4-digit verification code card, the d<br>_reach:_ goto /parallel, settle, click 'Connections', type the schema-valid fabricated pairing URI (walletpair:?ch=0123456789abcdef…&pubkey=jCYIRGVbVzh1AXEPb9m
- `S/home/connections-error` — The same inline panel after a failed pairing, and a different picture from connecting: error medallion, 'Connection Failed', the parse-error text and a 'Scan Again' action, still f<br>_reach:_ Continue from the connecting recipe: click 'Cancel' (returns the provider to disconnected), then type the malformed URI 'walletpair:?ch=zz' into the s
- `S/home/connections-reconnecting` — Unreachable with any dApp peer this repo can run, and not a distinct screen even if it were. 'reconnecting' is emitted only by WalletPairTransport (walletpair-transport.ts:259, :46
- `S/home/default` — Home's default landing is the Activity tab with a POPULATED value-transfer feed — day header plus one ActivityRow per item (direction, counterparty alias, +amount, fiat subline, ch<br>_reach:_ goto /parallel, settle ~12 s, then in-page window
- `S/home/estimate-notice` — The hero's tappable approximation row — amber AlertTriangle, the sentence, and a ChevronRight into BalanceDetailSheet (HomeScreen.tsx:110-129) — sitting over the CACHED total with <br>_reach:_ goto /parallel, settle ~12 s, window
- `S/home/refreshing` — VelaRefresh's branded pull state is a bespoke component with no still form anywhere in the file. I measured it: at rest the arc indicator is 17x17 at y=15 inside the phone frame; m<br>_reach:_ goto /parallel, settle, then the harness's own `pull` act with a short dwell (ms: 300–600; its default 1200 lands after the snap-back)

**Renames (the plan is stale, the board exists)**

- `O/account-switcher/loaded` → `O/account-switcher/default`
- `O/balance-detail-sheet/both` → `O/balance-detail/degraded-chains`
- `O/network-filter-sheet/default` → `O/network-filter/default`
- `O/rpc-fix-form/empty` → `O/rpc-fix/default`
- `S/home/activity-empty` → `S/home/activity`
- `S/home/connections-empty` → `S/home/connections`

**Exclusions (each survived an adversarial review)**

- `O/account-switcher/active-row` — A row treatment inside the loaded board, not a sheet state: AccountSwitcherModal.tsx:124 (nameActive) + :131 (trailing Check). Verified in the board already on disk — 'Parallel One' is drawn in accent
- `O/account-switcher/browser-footer` — The `footer` prop has exactly one call site in the app: src/app/browser.tsx:532-553 (disconnect + close-page rows). That route is native-only — isWalletWebViewSupported is false on web, which is why t
- `O/balance-detail-sheet/empty` — Unreachable as a resting state by construction: BalanceDetailSheet.tsx:77-79 calls onClose() whenever it is visible with no failed chains and no unpriced tokens, so home.balanceDetailEmpty ('Everythin
- `O/balance-detail-sheet/networks-only` — Covered by O/balance-detail/degraded-chains, which already carries the whole networks vocabulary (Ethereum 'RPC unavailable' + Fix, BNB Chain 'Rate-limited · retrying automatically', 'Retry now'). A n
- `O/balance-detail-sheet/rate-limited-row` — A row treatment inside that same board, not a sheet state: BalanceDetailSheet.tsx:125-135 labels rate-limited chains 'Rate-limited · retrying automatically' in fg.muted and withholds the Fix action. B
- `O/network-filter-sheet/trigger-all` — Not a state of the sheet — it is the NetworkFilterButton trigger chip, and the file already models it as its own family: C/Controls/NetworkFilterButton, variant selected=null, captioned 'All, stacked 
- `O/network-filter-sheet/trigger-selected` — Same reason, same family: C/Controls/NetworkFilterButton variant selected=Gnosis, captioned 'clear control' — the chain-logo + name + separate ✕ form. The variant axis (null | Gnosis) is exactly the t
- `O/rpc-fix-form/error` — There is no in-form error state. All three failure paths call showAlert and leave the form untouched: unreachable (RpcTroubleBanner.tsx:128), wrong-chain (:132) and save failure (:150). showAlert rend
- `O/rpc-fix-form/prefilled` — There is no visual delta beyond the input's own text. The seed only differs when a saved override already exists for that chain (RpcTroubleBanner.tsx:113-116 deliberately seeds the SAVED override, nev

## receive

**To board**

- `S/receive/deposit-detected` — Unreachable without a real inbound on-chain transfer. The state is computed only by DIFFING two live fetchTokens results while the screen is open (ReceiveScreen.tsx:99-143, 3s poll

## token

**To board**

- `O/add-token-sheet/error` — Same as resolving: the 'Could not find this token on any network' path is AddTokenPanel.tsx:180-182 raising an AppAlert over the panel — the alert is boarded as O/app-alert/single-
- `O/add-token-sheet/resolved` — Same as resolving: the resolved result card is AddTokenPanel.tsx:417-456, owned by the S/add-token family (planned as S/add-token/erc20-resolved; probe dump _probe-addtoken-erc20-r
- `O/add-token-sheet/resolving` — AddTokenSheet.tsx is a stateless wrapper — 66 lines, zero useState: it is <AppModal> + a close header + <AddTokenPanel> (:26-38). Every state it can show belongs to AddTokenPanel a
- `S/add-token/erc20-error` — AddTokenPanel.tsx:180-182 (found.length===0 → showAlert) rendered by the in-frame web AppAlert portal, so it captures inside the 390px frame as a screen state, not a separate overl<br>_reach:_ /add-token → vela
- `S/add-token/erc20-resolved` — AddTokenPanel.tsx:417-456 renders one VelaCard per chain where fetchErc20Meta answered; USDT resolves on Ethereum only. Do NOT press 'Add to Wallet' — saveCustomToken persists (Add<br>_reach:_ Continue the erc20-resolving state: vela
- `S/add-token/erc20-resolving` — AddTokenPanel.tsx:407-414 passes title={loading ? t('addToken.searchingNetworks') : …} to VelaButton, but VelaButton.tsx:66-69 renders ONLY <ActivityIndicator> when loading and nev<br>_reach:_ /add-token → vela
- `S/add-token/network-checking` — handleNetSelect (AddTokenPanel.tsx:114-138) sets netChainInfo BEFORE awaiting checkNetworkCompatibility, so the chain-info card is already painted while :313 shows the 'Checking co<br>_reach:_ /add-token → click 'Native Token' → type '42220' into 'Name or chain ID' → wait 3000 → click the '42220' suggestion → wait ~1200ms
- `S/add-token/network-compatible` — AddTokenPanel.tsx:359-382 renders the success VelaCard (Check + t('addToken.compatible') + the Add Network CTA) when netCompat.compatible. Do NOT press 'Add Network' — saveCustomNe<br>_reach:_ Same as network-checking, then wait ~22s
- `S/add-token/network-incompatible` — compatible = allDeployed && p256Available (network-checker.ts:93) over the 11 REQUIRED_CONTRACTS at :20-32; the checklist card is AddTokenPanel.tsx:314-356. The state-specs-5.json <br>_reach:_ USE zkSync 324, NOT Celo 42220

**Renames (the plan is stale, the board exists)**

- `O/add-token-sheet/form` → `O/add-token-sheet/default`
- `S/add-token/erc20-form` → `S/add-token/erc20`
- `S/add-token/network-search` → `S/add-token/native`

## send

**To board**

- `O/batch-import-sheet/nested-currency-picker` — VERIFIED (dom-dumps/_probe/_probe-bi-nested-currency.json): the full currency list renders over the batch sheet — modal-over-modal, the scoped picker titled 'Priced in' rather than<br>_reach:_ same sheet, cumulative: click text 'Priced in' (BatchImportSheet
- `O/batch-import-sheet/parsed-preview` — VERIFIED 2026-07-31 (dom-dumps/_probe/_probe-bi-preview.json): per-recipient rows '0x111111…111111 | $ 500 | 500 USDC', '0x222222…222222 | $ 300 | 300 USDC' and the footer '2 recip<br>_reach:_ /design-gallery → click id gallery-open-batchimportsheet → wait 1800 (the USD rate must land, BatchImportSheet
- `O/batch-import-sheet/rate-editing` — VERIFIED (dom-dumps/_probe/_probe-bi-rate.json): the 'Auto' reset chip appears and every row reconverts at the typed rate ('$ 500 → 69.4444 USDC'), i.e. the displayed string IS the<br>_reach:_ same sheet, cumulative: type into input index 23 (the rate field — its placeholder '0' is shared with gallery cells, so it must be targeted positional
- `O/batch-import-sheet/row-errors` — VERIFIED (dom-dumps/_probe/_probe-bi-errors.json): 'Duplicate — skipped', an em-dash instead of an amount, '2 rows skipped (invalid or duplicate).' and the CTA falling back to 'Imp<br>_reach:_ same sheet, cumulative: retype the paste field with a duplicate address and one invalid line
- `O/contact-picker/empty` — VERIFIED (dom-dumps/_probe/_probe-cp-empty.json): 'No matches for “zzzz”' (ContactPicker.tsx:170-186). Record on the board that this is the no-results branch; the never-had-contact<br>_reach:_ same sheet, cumulative: type index 22 with 'zzzz'
- `O/contact-picker/groups` — Two independent blocks. (1) The section is gated on the onSelectGroup prop, whose only call site in the whole app is SendScreen.tsx:228 — the gallery instance (design-gallery.tsx:1
- `O/contact-picker/searching` — VERIFIED (dom-dumps/_probe/_probe-cp-searching.json): 'Choose recipient | Contacts | Alice Chen | 0x123456…345678' — the Scan row is withdrawn while a query is present (ContactPick<br>_reach:_ /design-gallery → click id gallery-open-contactpicker → wait 1200 → type input index 22 (positional: the placeholder 'Search name or address' is share
- `O/contact-picker/typed-address` — VERIFIED (dom-dumps/_probe/_probe-cp-typed.json): 'Choose recipient | Use this address | 0xd8da6b…a96045 | Save' (ContactPicker.tsx:145-166, gated on isAddress at :76-77).<br>_reach:_ same sheet, cumulative: type index 22 with a valid unknown address (0xd8dA6BF2…96045)
- `O/contacts-manager/favorites` — The [All | Favorites] segment renders only when favorites.length > 0 (ContactsManager.tsx:74). The capture profile's address book is the parallel fixture's single non-favourite con
- `O/contacts-manager/form-add` — VERIFIED 2026-07-31 by live DOM read: 'New contact | NAME | ADDRESS | Save' — the ContactForm add mode with its 64px avatar and empty fields (ContactsManager.tsx:399-448).<br>_reach:_ /design-gallery → click id gallery-open-contactsmanager → wait 1400 → click aria-label /Add contact/ (ContactsManager
- `O/contacts-manager/form-edit` — Not drivable by the capture harness. The only entry is pressing a contact row, and ContactRow's Pressable does not respond to the harness's synthetic MouseEvent sequence — VERIFIED
- `O/contacts-manager/list-searching` — VERIFIED 2026-07-31 by live DOM read: the sheet content became exactly 'Alice Chen | 0x123456…345678' — title row, groups section and the import/export footer all withdrawn (Contac<br>_reach:_ /design-gallery → click id gallery-open-contactsmanager → wait 1400 → click aria-label /Search name or address/ (the header icon does carry a label, C
- `S/send/confirm/error` — txStatus === 'error' (ConfirmStep.tsx:399-414) shows a red AlertCircle plus the calm localized failure sentence and a 'Try Again' action where the slide was. Distinct from confirm/<br>_reach:_ Same setup as confirm/submitting but arm window
- `S/send/confirm/fee-blocker` — When the confirm-time re-quote prices the fee in the SAME asset being sent and leaves no room, the slide-to-confirm is REPLACED by a solid 'Edit amount' VelaButton above a red Aler<br>_reach:_ Deterministic, no fault injection: goto /parallel, /send, click 'XDAI', click 'Max' (fills balance − reserve, e
- `S/send/confirm/split` — ConfirmStep.tsx:228-275 replaces the single To party with a labelled, fixed-height, internally-scrolling recipient list — index number, avatar, trust marker, short address and a pe<br>_reach:_ goto /parallel, /send, click 'XDAI', amount 0
- `S/send/confirm/submitting` — The in-flight confirm (ConfirmStep.tsx:368-398) removes the slide entirely and puts a spinner plus status line in its place, with a cancel X that appears after 3 s (TxCancelButton)<br>_reach:_ Nothing can be broadcast: rpc-pool
- `S/send/confirm/sweep` — ConfirmStep.tsx:171-227 keeps the From->To flow but swaps the single-asset identity pill for a ConfirmAssets cluster carrying a count label and a fiat total, one row per asset, wit<br>_reach:_ Same precondition as S/send/details/sweep — two non-zero balances on ONE chain in the /parallel fixture Safe (today it is one asset per chain)
- `S/send/details/error-insufficient` — The amount warning (computed in useSendController.ts:319-391, rendered at EnterDetailsStep.tsx:193-195) puts a red sentence directly under the amount hero. That is a different pict<br>_reach:_ goto /parallel, /send, click 'XDAI', type 5000 into the amount field (placeholder '0'; the balance is 0
- `S/send/details/estimating` — Covered by the component library, and otherwise a near-duplicate of a board that already exists. I drove it (window.vela.slowRpc(20000) then Continue) and read the DOM: the ONLY ch
- `S/send/details/sweep` — multiSelectMode renders a different amount step (EnterDetailsStep.tsx:286-365): the token hero AND the amount hero are gone, replaced by an 'N tokens · <chain>' summary with a fiat<br>_reach:_ PRECONDITION: the /parallel fixture Safe must hold two non-zero balances on ONE chain
- `S/send/locked/resolving` — The entire state is the nav bar plus one centred ActivityIndicator and nothing else — SendScreen.tsx:142-143, the `locked && resolvingLock && !selectedToken` branch. It carries no 
- `S/send/select-token/empty` — TokenSelector's emptyContainer (TokenSelector.tsx:207-211) replaces the whole list AND the '3 tokens / $3.27' summary row with one centred line plus the Add Token action — a differ<br>_reach:_ goto /parallel, then /send, type 'zzzzzz' into the field placeholdered 'Search tokens
- `S/send/select-token/sweep` — There is no longer a Split/Sweep mode toggle — useSendController.ts:1117-1119 says so outright ('Multi-select is built-in now: filter to a specific network and the picker shows che<br>_reach:_ goto /parallel, then /send, click the button whose aria-label starts 'Select Chain', pick a chain in the sheet (e

**Renames (the plan is stale, the board exists)**

- `O/batch-import-sheet/paste` → `O/batch-import/default`
- `O/contacts-manager/list` → `O/contacts-manager/default`
- `S/send/details/split` → `S/send/details-split`
- `S/send/locked/network-not-supported` → `S/send/locked-network-not-supported`
- `S/send/locked/unknown-token` → `S/send/locked-unknown-token`
- `S/send/receipt/confirmed` → `S/send/receipt-confirmed`
- `S/send/receipt/failed` → `S/send/receipt-failed`
- `S/send/receipt/submitted` → `S/send/receipt-submitted`

**Exclusions (each survived an adversarial review)**

- `O/contacts-manager/group-editor` — Covered by the library: the group view renders <GroupEditor> verbatim with no chrome of its own (ContactsManager.tsx:285-290), and GroupEditor is already a planned+built component family — C/Sheets/Gr

## dapp

**To board**

- `O/browser-history-sheet/clear-all-alert` — Doubly blocked: the 'Clear all' control only renders when entries.length > 0 (BrowserHistorySheet.tsx:76-85), which the web build can never reach (see populated); and the alert its
- `O/browser-history-sheet/populated` — No web path can create history. The store is written by exactly one call site — recordBrowserVisit in src/app/browser.tsx:325 — and that route is native-only (the web build renders
- `O/connection-event-detail-sheet/connect` — Structurally a different sheet, not a different icon. kind==='connect' (ConnectionEventDetailSheet.tsx:40) removes the entire signed-content section — the `kind !== 'connect'` gate<br>_reach:_ design-gallery: clone the txSignature fixture (design-gallery
- `O/connection-event-detail-sheet/tx` — The richest variant and the only one that is more than the sign-message board: kind==='tx' adds a right-aligned amount in the hero (line 85), suppresses the off-chain note, and ren<br>_reach:_ design-gallery: a LocalTransaction fixture with type:'send', a dappOrigin, a txHash and a serialized assetChanges payload (the gallery already carries
- `O/signing-sheet/approval-revoke` — Nothing in the file shows it, and the one artifact that claims to is wrong. C/Signing/EditableApproveCard has a variant captioned 'choice=revoke' (gallery-editableapprovecard-revok<br>_reach:_ /parallel, then /clear-signing-test → 'ERC-20 Approve (Unlimited)' → tap the 'Revoke' preset chip in the cap card
- `O/signing-sheet/error` — The only signing state whose FOOTER is not a slide: signError swaps SlideToConfirmButton for a secondary VelaButton 'Dismiss' (SigningSheet.tsx:715) and adds styles.errorCard (erro<br>_reach:_ Same design-gallery launcher, with signError='…' passed to <SigningSheet>
- `O/signing-sheet/gas-estimate-failed` — The state adds exactly three elements and all three are boarded component variants carrying this state's own copy: C/Rows/GasFeeCard state=failed ('Network fee | Tap to retry', cap
- `O/signing-sheet/loading` — SigningSheet.tsx:441 renders styles.fallback (centred, paddingVertical space['5xl'], text.lg fg.muted 'Loading…') INSTEAD of any body view while resolveTransaction/resolveTypedData<br>_reach:_ /parallel (arms the wallet), then /clear-signing-test → tap 'Blind Transaction' / 'Scam drain' / 'EIP-712 Unknown' (the three that fetch a descriptor)
- `O/signing-sheet/replay-in-flight` — Purely additive from two other cells and nothing else: it is the read-only frame of replay-settled with the history note suppressed (`readOnly && !pendingOpHash`, SigningSheet.tsx:
- `O/signing-sheet/replay-settled` — readOnly=true is a different sheet, not a different badge: it adds the history-note row (bg.sunken, Pen 15, 'A past signature — exactly what you approved.', SigningSheet.tsx:614) a<br>_reach:_ Design-gallery launcher rendering SigningReplaySheet (src/components/ui/SigningReplaySheet
- `O/signing-sheet/signing` — isSigning=true changes only the footer control: the label becomes 'Signing…' (SigningSheet.tsx:491) and SlideToConfirmButton takes loading — boarded as C/Controls/SlideToConfirmBut
- `O/signing-sheet/sim-fail` — The loud BalanceChangePreview states are boarded twice over. As component variants: C/Signing/BalanceChangePreview state=revert ('Expected to fail: ERC20: transfer amount exceeds b
- `O/signing-sheet/submitted-pending` — pendingOpHash adds styles.pendingCard — info.soft background, radius.lg, info.base ActivityIndicator + mono 'Submitted · 0x1234567890…abcdef' (SigningSheet.tsx:688) — which exists <br>_reach:_ Add a design-gallery launcher rendering <SigningSheet request={…} isSigning pendingOpHash='0x…' /> next to the existing gallery-open-* overlay launche
- `S/browser/connected` — Same web short-circuit, plus it needs a granted origin: connectedAddr is set only by approveConsent or refreshGrant, both fed by onProviderRequest, which is a native WalletWebView 
- `S/browser/default` — Not observable in a web capture. src/modules/webview/index.tsx:31 sets isWalletWebViewSupported = Platform.OS==='ios'||'android' -> false on web, and src/app/browser.tsx:364-366 re
- `S/browser/insecure-origin` — Same web short-circuit, plus it is a function of the loaded page's scheme: the TriangleAlert branch at browser.tsx:386-387 fires when (nav?.url ?? initialUrl) does not start with h
- `S/browser/loading` — Same web short-circuit as S/browser/default, plus this state is a property of a native page load: nav.loading comes from the native onNavigationChange event and renders the 2px acc
- `S/browser/no-wallet` — Same web short-circuit (browser.tsx:434-441 sits after the guard at :364). The identical wallet-absent copy IS boardable on the sibling route: RAN a fresh browser profile at /conne
- `S/browser/preparing-wallet` — Same web short-circuit. The 'Preparing…' spinner at browser.tsx:429-433 is the else-branch of `ready`, reached only after the unsupported guard has already returned — so on web con
- `S/connect/connected` — VERIFIED by running it: relay on :8799, /connect showed 'Connected | Vela Test dApp (localhost:8799) | Parallel One (0xD400...130b) | Ethereum | Signing requests from dApps will ap<br>_reach:_ Start the repo's own local relay — `node e2e/support/relay
- `S/connect/connecting-waiting` — VERIFIED by running both paths: each rendered 'Waiting for dApp to accept... | Go back to the dApp and approve the connection. | Cancel' — the Radio-medallion branch at ConnectionF<br>_reach:_ Chain it onto the existing connect-connecting-verify state in the SAME group (cumulative steps): after the fingerprint card renders, click text 'Confi
- `S/connect/no-wallet` — VERIFIED by running it: fresh Playwright context -> http://127.0.0.1:8083/connect -> body text 'Create a wallet first' and the URL stays /connect (no redirect). This is the !state.<br>_reach:_ Run in a browser profile that has NEVER visited /parallel and never onboarded (run-capture
- `S/connect/reconnecting` — No transport this environment can run produces status 'reconnecting'. Only WalletPairTransport emits the 'reconnecting' event (walletpair-transport.ts:259/468/532); RemoteInjectTra
- `S/web-request/consent` — VERIFIED by running it: 'Vela Wallet | Probe dApp | Connect with Vela | 127.0.0.1:8083 | Account | Parallel One | 0xD400866e00B055B20752a826CD5C89b811de130b | This site can view yo<br>_reach:_ Opener/popup handshake with the parallel wallet armed (goto /parallel first, then the opener page), INIT with {method:'eth_requestAccounts',params:[],
- `S/web-request/onboarding` — VERIFIED by running it: 'Vela Wallet | Probe dApp | Set up Vela to continue | Create or recover your wallet. Your connection request from Probe dApp will continue automatically. | <br>_reach:_ Same opener/popup handshake as 'waiting', but in a context with NO wallet (never visited /parallel, never onboarded) and DO send VELA_WEB_INIT with re
- `S/web-request/processing` — VERIFIED by running it: 'Vela Wallet | Confirm in Vela | Review the request in the Vela confirmation sheet. | … | 127.0.0.1:8083 | Gnosis | SIGN MESSAGE | Hello from a probe | Tech<br>_reach:_ Two popups in ONE context: (1) handshake eth_requestAccounts and click 'Connect' so the origin holds a grant; (2) second popup, INIT with {method:'per
- `S/web-request/unsupported-chain` — VERIFIED by running it: 'Vela Wallet | Probe dApp | Network not supported | Probe dApp requested Chain ID 999999. Vela cannot safely process this request. | Networks available in V<br>_reach:_ Same handshake as 'consent' but INIT with chainId: 999999
- `S/web-request/waiting` — VERIFIED by running it: popup showed 'Vela Wallet | Connecting securely… | You can close this window after it finishes.' at +1.5s and +3s and stays there indefinitely (the announce<br>_reach:_ Open an opener page on the same (allowed) origin — any 127

**Renames (the plan is stale, the board exists)**

- `O/browser-history-sheet/empty` → `O/browser-history/default`
- `O/connection-event-detail-sheet/message` → `O/connection-event/sign-message`
- `O/signing-sheet/approval-chosen` → `O/signing-sheet/erc-20-limited-approve`
- `O/signing-sheet/approval-unchosen` → `O/signing-sheet/erc-20-approve-unlimited`
- `O/signing-sheet/batch-ready` → `O/signing-sheet/eip-5792-batch`
- `O/signing-sheet/blind-tx` → `O/signing-sheet/blind-transaction`
- `O/signing-sheet/blind-typed` → `O/signing-sheet/eip-712-unknown`
- `O/signing-sheet/clear-signed` → `O/signing-sheet/erc-20-transfer`
- `O/signing-sheet/eth-sign-danger` → `O/signing-sheet/eth-sign-raw-hash`
- `O/signing-sheet/permit` → `O/signing-sheet/eip-712-permit2`
- `O/signing-sheet/siwe-mismatch` → `O/signing-sheet/siwe-domain-mismatch`
- `O/transaction-detail-sheet/batch-breakdown` → `O/transaction-detail/batch-split`
- `O/transaction-detail-sheet/confirmed` → `O/transaction-detail/single-confirmed`
- `O/treasury-bootstrap/default` → `O/treasury-bootstrap/bootstrap-needed`
- `S/browser/unsupported` → `S/browser/unsupported-on-web`

**Exclusions (each survived an adversarial review)**

- `O/connection-event-detail-sheet/content-missing` — A data-absence variant of the boarded sign-message board with no structural change: when tx.signedContent is falsy the mono contentBlock is replaced by a single text.base fg.subtle line (ConnectionEve
- `O/connection-event-detail-sheet/typed` — Structurally identical to the boarded sign-message board: same hero, same off-chain note (both are in the `offChain` set, line 94), same SectionLabel + mono code block + floating copy button, same met
- `O/signing-sheet/batch-needs-choice` — Boarded as component variant C/Signing/BatchCallsView `editable` — its fixture batchItems[0] is approvalUnlimited (design-gallery.tsx:301), so the cell dump literally reads '1 | Approve | USDC | Spend
- `O/transaction-detail-sheet/failed` — Identical to single-confirmed except the status row's badge (XCircle/error.base 'Failed' instead of CheckCircle2/success.base 'Succeeded') — the sheet surfaces no revert reason and hides no rows (Tran
- `O/transaction-detail-sheet/pending` — The sheet's only structural delta is one row's badge — Row(labelStatus, custom=<TxStatusBadge status/>) at TransactionDetailSheet.tsx:237/316 — and that axis is boarded as its own family: C/Primitives
- `O/treasury-bootstrap/copied` — Not a state of this sheet — it is the app-wide copy-feedback micro-state (inventory 07 §9.4, hooks/use-copy-feedback.ts): the Copy glyph becomes a success Check and the button label flips to 'Copied' 
- `O/treasury-bootstrap/no-retry` — Unreachable in the shipped app. The variant exists only when `onRetry` is undefined (TreasuryBootstrapSheet.tsx:134 → secondary button reads 'Close' instead of 'I've funded · Retry'), and the componen
- `S/browser/no-url` — Unreachable on web for a stronger reason than the rest: the !initialUrl guard (browser.tsx:367-369) sits AFTER the isWalletWebViewSupported guard (:364-366), so the no-url copy can never win on web ev
- `S/web-request/done` — Covered by S/web-request/waiting: both are the SAME JSX branch (web-request.tsx:334-341, the final else) and differ only in the interpolated title string — 'Done' vs 'Connecting securely…' — with iden

## pay

**To board**

- `S/pay/other-wallet-address` — PayScreen.tsx:143-157 SegmentedToggle qrMode='address' swaps the QR payload to the plain address and :159-163 removes the openApp button — the fallback for wallets with no EIP-681 <br>_reach:_ Continue from other-wallet-request: click 'Address' → wait 1500ms
- `S/pay/other-wallet-request` — PayScreen.tsx:135-137 toggles showOther; :140-163 renders the second VelaCard with the EIP-681 QR, scanHint and the 'Open in wallet app' button (qrMode==='eip681').<br>_reach:_ /pay?to=0x7099797f0e6e40d43D8b78ac3F0ac89b0F4F0d8b&chain=100&amount=1&sym=XDAI&dec=18 → click 'Pay with another wallet' → wait 1500ms

## system

**To board**

- `O/bug-report/compose-preview` — VERIFIED (dom-dumps/_probe/_probe-bug-preview.json passed expect ['App version','Platform']): the preview box renders buildReportPreview() — the exact scrubbed payload, which is th<br>_reach:_ same sheet, cumulative: click text 'What will be sent' (BugReportModal
- `O/bug-report/compose-steps` — VERIFIED 2026-07-31 (dom-dumps/_probe/_probe-bug-steps.json): the disclosure row is gone and the second AutoGrowTextInput (minHeight 96, autoFocus) has taken its place (:123-133).<br>_reach:_ /design-gallery → click id gallery-open-bugreportmodal → click text '+ Add steps to reproduce' (BugReportModal
- `O/bug-report/fallback` — Only reachable when that same live POST fails (BugReportModal.tsx:89-100, result.fallbackUrl set by bug-report.ts:143-150). vela.* injects no network fault, so the only in-app rout
- `O/bug-report/sending` — Reaching it performs the real submission: handleSend → submitBugReport POSTs to https://getvela.app/api/bug-report (bug-report.ts:26,115-134), whose server-side token opens or +1s 
- `O/bug-report/success-deduped` — Same as success-new: `deduped` is set by the server when the fingerprint (bug-report.ts:81-88) matches an open issue, i.e. it needs two real submissions of the same failure. Differ
- `O/bug-report/success-new` — Same as sending, and worse: this screen only exists after the backend has actually created issue #N (bug-report.ts:136-139 → BugReportModal.tsx:70-85). Capturing it means filing a 

**Renames (the plan is stale, the board exists)**

- `O/app-alert/one-button` → `O/app-alert/single-action`
- `O/app-alert/two-button` → `O/app-alert/two-actions`
- `O/app-modal/web-rest` → `O/app-modal/page-sheet`
- `O/bug-report/compose` → `O/bug-report/default`
- `S/clear-signing-test/default` → `S/dev/clear-signing-index`
- `S/receipt-harness/default` → `S/dev/receipt-harness`

**Exclusions (each survived an adversarial review)**

- `O/app-alert/native-placeholder` — There is no Vela-drawn artwork to board. On native AppAlert renders nothing — the styled card is gated on `Platform.OS === 'web' && alert.visible` (AppAlert.tsx:85) — and platform.ts:46-49 hands the c
- `O/app-modal/android-dragged` — A mid-gesture frame: the sheet's translateY is an Animated.Value advanced only by a live PanResponder drag (AppModal.tsx:114-146, threshold DISMISS_DY=90 at :38). No prop, dev seam or harness act sets
- `O/app-modal/android-rest` — Native-only branch (AppModal.tsx:58-59 → AndroidSheet at :98-168). Same reason as ios-pagesheet: unreachable from the web build, and its resting picture is the same sheet already boarded as O/app-moda
- `O/app-modal/ios-pagesheet` — Native-only branch (AppModal.tsx:65-91, reached only when Platform.OS !== 'web' && !fit). The whole capture pipeline drives the web build at 127.0.0.1:8083, which never executes it; the visible delta 
- `O/app-modal/web-backdrop` — Not a separate state. WebModal renders backdrop and sheet in one tree (AppModal.tsx:332-341) and the backdrop is at its full rgba(0,0,0,0.35) whenever `show` is true — which the boarded O/app-modal/pa
- `S/parallel/loading` — Same composition as S/index/loading and equally unholdable. src/app/parallel/index.tsx renders one <ActivityIndicator size="small" color={accent.base}/> centred on bg.base until the fixture account ap

