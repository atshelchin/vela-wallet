# Coverage matrix — Penpot design source (generated with manifest.json)

Pinned to git revision **`ffe7209`** (branch `002-penpot-design-source`), generated 2026-07-29 from inventory 02–08 + the `src/app/` route tree. Data source of truth: `generator/manifest.json` — this file is its human-readable rendering. Zero blank cells: every route, overlay and component is either boarded below or listed under Exclusions.

## Screens (rows = routes, cells = planned boards, one per required state)

| Route | Page | Entry | Boards (one per state) | Source | Inv | Drift |
|---|---|---|---|---|---|---|
| home | 05 Screens · Wallet |  | `S/home/default`<br>`S/home/activity-empty`<br>`S/home/assets`<br>`S/home/assets-empty`<br>`S/home/connections-empty`<br>`S/home/connections-connecting`<br>`S/home/connections-error`<br>`S/home/connections-connected`<br>`S/home/connections-reconnecting`<br>`S/home/balance-loading`<br>`S/home/hidden-balance`<br>`S/home/estimate-notice`<br>`S/home/rate-limited`<br>`S/home/rpc-trouble`<br>`S/home/refreshing` | `src/screens/wallet/HomeScreen.tsx` | 05 §2 | — |
| send | 05 Screens · Wallet |  | `S/send/select-token`<br>`S/send/select-token/sweep`<br>`S/send/select-token/empty`<br>`S/send/details`<br>`S/send/details/split`<br>`S/send/details/sweep`<br>`S/send/details/error-insufficient`<br>`S/send/details/estimating`<br>`S/send/confirm`<br>`S/send/confirm/split`<br>`S/send/confirm/sweep`<br>`S/send/confirm/fee-blocker`<br>`S/send/confirm/submitting`<br>`S/send/confirm/error`<br>`S/send/receipt/submitted`<br>`S/send/receipt/confirmed`<br>`S/send/receipt/failed`<br>`S/send/locked/resolving`<br>`S/send/locked/network-not-supported`<br>`S/send/locked/unknown-token` | `src/screens/wallet/SendScreen.tsx` | 05 §3 | — |
| receive | 05 Screens · Wallet |  | `S/receive/address`<br>`S/receive/request`<br>`S/receive/copied`<br>`S/receive/deposit-detected` | `src/screens/wallet/ReceiveScreen.tsx` | 05 §4 | first-visit warning gate boarded separately as O/receive-gate (07 §9.5 / §12) |
| token-detail | 05 Screens · Wallet |  | `S/token-detail/default` | `src/screens/wallet/TokenDetailScreen.tsx` | 05 §5 | — |
| add-token | 05 Screens · Wallet |  | `S/add-token/erc20-form`<br>`S/add-token/erc20-resolving`<br>`S/add-token/erc20-resolved`<br>`S/add-token/erc20-error`<br>`S/add-token/network-search`<br>`S/add-token/network-checking`<br>`S/add-token/network-compatible`<br>`S/add-token/network-incompatible` | `src/screens/wallet/AddTokenScreen.tsx` | 05 §7 + 07 §5.4 | same AddTokenPanel also presented as O/add-token-sheet — boards share component instances |
| pay | 05 Screens · Wallet | entry | `S/pay/default`<br>`S/pay/other-wallet-request`<br>`S/pay/other-wallet-address`<br>`S/pay/invalid-link` | `src/screens/wallet/PayScreen.tsx` | 05 §6 | deliberately card-heavy — public-web surface exception to de-containering (05 §6 note) |
| browser | 06 Screens · Browser & Connect |  | `S/browser/default`<br>`S/browser/loading`<br>`S/browser/connected`<br>`S/browser/insecure-origin`<br>`S/browser/preparing-wallet`<br>`S/browser/no-wallet`<br>`S/browser/unsupported`<br>`S/browser/no-url` | `src/app/browser.tsx` | 05 §11 | load-error state boarded as O/browser-error (07 §8.2); consent as O/browser-consent (07 §8.1) |
| connect | 06 Screens · Browser & Connect | entry | `S/connect/no-wallet`<br>`S/connect/disconnected`<br>`S/connect/connecting-verify`<br>`S/connect/connecting-waiting`<br>`S/connect/error`<br>`S/connect/connected`<br>`S/connect/reconnecting` | `src/screens/connect/ConnectScreen.tsx` | 06 §3.1 | zero in-app entry points — kept as deep-link/e2e surface (04 §8.2) |
| web-request | 06 Screens · Browser & Connect | entry | `S/web-request/waiting`<br>`S/web-request/onboarding`<br>`S/web-request/consent`<br>`S/web-request/unsupported-chain`<br>`S/web-request/processing`<br>`S/web-request/done`<br>`S/web-request/error` | `src/app/web-request.tsx` | 06 §3.2 + 07 §3.6 | shell copy hardcoded English around the localized embedded OnboardingScreen (06 §3.2) |
| safari-extension | 06 Screens · Browser & Connect |  | `S/safari-extension/default` | `src/screens/settings/SafariExtensionScreen.tsx` | 06 §1.3 | iOS-only entry; bespoke CTA (radius 15, opacity press) violates the VelaButton-only mandate (06 §1.3 flag) |
| settings | 07 Screens · Settings & Onboarding |  | `S/settings/default`<br>`S/settings/advanced-expanded`<br>`S/settings/developer-unlocked` | `src/screens/settings/SettingsScreen.tsx` | 06 §1.1 | — |
| about | 07 Screens · Settings & Onboarding |  | `S/about/default` | `src/screens/settings/AboutScreen.tsx` | 06 §1.2 | still card-heavy legacy styling, not yet migrated to de-containered language (06 §1.2 flag) |
| onboarding | 07 Screens · Settings & Onboarding |  | `S/onboarding/welcome`<br>`S/onboarding/welcome-signin-loading`<br>`S/onboarding/create-form`<br>`S/onboarding/create-ceremony`<br>`S/onboarding/create-resume`<br>`S/onboarding/create-success`<br>`S/onboarding/sync-failure` | `src/screens/onboarding/OnboardingScreen.tsx` | 06 §2 | WelcomeScreen is the deliberate fixed-dark brand exception (hardcoded #1A1A18, never follows theme) |
| index | 07 Screens · Settings & Onboarding | entry | `S/index/loading` | `src/app/index.tsx` | 06 §2.1 + 04 §1 | redirect-only boot route — the effective splash (accent spinner on bg.base), then redirects to /wallet or /onboarding |
| clear-signing-test | 10 Dev & Parallel Space | entry | `S/clear-signing-test/default` | `src/screens/settings/ClearSigningTestScreen.tsx` | 06 §1.4 | scenario icon tints are hardcoded light-mode hexes (06 §5.4 flag) |
| receipt-harness | 10 Dev & Parallel Space | entry | `S/receipt-harness/default` | `src/screens/dev/ReceiptHarnessScreen.tsx` | 06 §4.1 | — |
| parallel | 10 Dev & Parallel Space | entry | `S/parallel/loading` | `src/app/parallel/index.tsx` | 04 §1/§6 | transient loader then redirect — the parallel space reuses every real screen; only the badge differs (04 §6) |
| parallel/connect | 10 Dev & Parallel Space | entry | `S/parallel/connect/default` | `src/app/parallel/connect.tsx` | 04 §1/§6 | re-export of the real ConnectScreen — draw as instance of S/connect states + PARALLEL SPACE badge |

**18 screens · 91 screen boards.**

## Overlays (rows = overlay surfaces, cells = planned boards)

| Overlay | Page | Boards (one per state) | Source | Inv | Drift |
|---|---|---|---|---|---|
| app-modal | 08 Overlays | `O/app-modal/ios-pagesheet`<br>`O/app-modal/android-rest`<br>`O/app-modal/android-dragged`<br>`O/app-modal/fit`<br>`O/app-modal/web-rest`<br>`O/app-modal/web-backdrop` | `src/components/ui/AppModal.tsx` | 07 §1 / §12 | — |
| app-alert | 08 Overlays | `O/app-alert/one-button`<br>`O/app-alert/two-button`<br>`O/app-alert/destructive`<br>`O/app-alert/native-placeholder` | `src/components/ui/AppAlert.tsx` | 07 §2 / §12 | styled dialog is web-only; native shows the OS alert (07 §11.3) |
| signing-sheet | 08 Overlays | `O/signing-sheet/loading`<br>`O/signing-sheet/clear-signed`<br>`O/signing-sheet/approval-unchosen`<br>`O/signing-sheet/approval-chosen`<br>`O/signing-sheet/approval-revoke`<br>`O/signing-sheet/permit`<br>`O/signing-sheet/batch-needs-choice`<br>`O/signing-sheet/batch-ready`<br>`O/signing-sheet/personal-sign`<br>`O/signing-sheet/siwe-mismatch`<br>`O/signing-sheet/eth-sign-danger`<br>`O/signing-sheet/blind-typed`<br>`O/signing-sheet/blind-tx`<br>`O/signing-sheet/sim-fail`<br>`O/signing-sheet/gas-estimate-failed`<br>`O/signing-sheet/signing`<br>`O/signing-sheet/submitted-pending`<br>`O/signing-sheet/error`<br>`O/signing-sheet/replay-settled`<br>`O/signing-sheet/replay-in-flight` | `src/components/signing/SigningSheet.tsx` | 07 §3.2 / §12 | — |
| bundler-funding | 08 Overlays | `O/bundler-funding/topup`<br>`O/bundler-funding/topup-denial-retryable`<br>`O/bundler-funding/topup-denial-non-retryable`<br>`O/bundler-funding/topup-denial-pending-unknown`<br>`O/bundler-funding/topup-qr-expanded`<br>`O/bundler-funding/topup-details-expanded`<br>`O/bundler-funding/confirming`<br>`O/bundler-funding/funded`<br>`O/bundler-funding/dapp-variant` | `src/components/ui/BundlerFundingModal.tsx` | 07 §4.1 / §12 | content-swap inside SigningRequestModal only — standalone wrapper is dead code (07 §11.2) |
| treasury-bootstrap | 08 Overlays | `O/treasury-bootstrap/default`<br>`O/treasury-bootstrap/copied`<br>`O/treasury-bootstrap/no-retry` | `src/components/ui/TreasuryBootstrapSheet.tsx` | 07 §4.2 / §12 | — |
| extension-sign-controller | 08 Overlays | `O/extension-sign-controller/signed`<br>`O/extension-sign-controller/rejected`<br>`O/extension-sign-controller/pending-unknown`<br>`O/extension-sign-controller/expired`<br>`O/extension-sign-controller/one-tap-enabled` | `src/components/ExtensionSignController.tsx` | 07 §3.5 / §12 | second bottom-sheet recipe (bg.raised, radius 24, heavy shadow) — intentional system-sheet variant (07 §11.7) |
| currency-sheet | 08 Overlays | `O/currency-sheet/default`<br>`O/currency-sheet/searching`<br>`O/currency-sheet/empty` | `src/components/ui/CurrencySheet.tsx` | 07 §5.1 / §12 | legacy card-row selection style — pending ruling vs de-boxed convention (07 §11.1) |
| network-filter-sheet | 08 Overlays | `O/network-filter-sheet/default`<br>`O/network-filter-sheet/searching`<br>`O/network-filter-sheet/with-subtitles`<br>`O/network-filter-sheet/trigger-all`<br>`O/network-filter-sheet/trigger-selected` | `src/components/ui/NetworkFilterSheet.tsx` | 07 §5.2 / §12 | legacy card-row selection style — pending ruling vs de-boxed convention (07 §11.1) |
| token-selector-sheet | 08 Overlays | `O/token-selector-sheet/default`<br>`O/token-selector-sheet/searching`<br>`O/token-selector-sheet/category-filtered`<br>`O/token-selector-sheet/multi-select`<br>`O/token-selector-sheet/empty` | `src/components/ui/TokenSelector.tsx` | 07 §5.3 / §12 | — |
| add-token-sheet | 08 Overlays | `O/add-token-sheet/form`<br>`O/add-token-sheet/resolving`<br>`O/add-token-sheet/resolved`<br>`O/add-token-sheet/error` | `src/components/ui/AddTokenSheet.tsx` | 07 §5.4 / §12 | — |
| contact-picker | 08 Overlays | `O/contact-picker/default`<br>`O/contact-picker/searching`<br>`O/contact-picker/typed-address`<br>`O/contact-picker/groups`<br>`O/contact-picker/empty` | `src/components/contacts/ContactPicker.tsx` | 07 §5.5 / §12 | — |
| contacts-manager | 08 Overlays | `O/contacts-manager/list`<br>`O/contacts-manager/list-searching`<br>`O/contacts-manager/favorites`<br>`O/contacts-manager/form-add`<br>`O/contacts-manager/form-edit`<br>`O/contacts-manager/group-editor` | `src/components/contacts/ContactsManager.tsx` | 07 §5.6 / §12 | — |
| batch-import-sheet | 08 Overlays | `O/batch-import-sheet/paste`<br>`O/batch-import-sheet/parsed-preview`<br>`O/batch-import-sheet/row-errors`<br>`O/batch-import-sheet/rate-editing`<br>`O/batch-import-sheet/nested-currency-picker` | `src/components/send/BatchImportSheet.tsx` | 07 §5.7 / §12 | — |
| account-switcher | 08 Overlays | `O/account-switcher/loading`<br>`O/account-switcher/loaded`<br>`O/account-switcher/active-row`<br>`O/account-switcher/privacy-masked`<br>`O/account-switcher/create-actions`<br>`O/account-switcher/browser-footer` | `src/components/ui/AccountSwitcherModal.tsx` | 07 §5.8 / §12 | — |
| browser-history-sheet | 08 Overlays | `O/browser-history-sheet/empty`<br>`O/browser-history-sheet/populated`<br>`O/browser-history-sheet/clear-all-alert` | `src/components/ui/BrowserHistorySheet.tsx` | 07 §5.9 / §12 | — |
| transaction-detail-sheet | 08 Overlays | `O/transaction-detail-sheet/pending`<br>`O/transaction-detail-sheet/confirmed`<br>`O/transaction-detail-sheet/failed`<br>`O/transaction-detail-sheet/batch-breakdown` | `src/components/ui/TransactionDetailSheet.tsx` | 07 §6.1 / §12 | — |
| connection-event-detail-sheet | 08 Overlays | `O/connection-event-detail-sheet/connect`<br>`O/connection-event-detail-sheet/message`<br>`O/connection-event-detail-sheet/typed`<br>`O/connection-event-detail-sheet/tx`<br>`O/connection-event-detail-sheet/content-missing` | `src/components/ui/ConnectionEventDetailSheet.tsx` | 07 §6.2 / §12 | — |
| balance-detail-sheet | 08 Overlays | `O/balance-detail-sheet/networks-only`<br>`O/balance-detail-sheet/tokens-only`<br>`O/balance-detail-sheet/both`<br>`O/balance-detail-sheet/rate-limited-row`<br>`O/balance-detail-sheet/fix-form-swap`<br>`O/balance-detail-sheet/empty` | `src/components/ui/BalanceDetailSheet.tsx` | 07 §6.3 / §12 | — |
| rpc-fix-form | 08 Overlays | `O/rpc-fix-form/empty`<br>`O/rpc-fix-form/prefilled`<br>`O/rpc-fix-form/saving`<br>`O/rpc-fix-form/error` | `src/components/ui/RpcTroubleBanner.tsx` | 07 §6.4 / §12 | raw #C07A0A amber icon + bespoke accent save button (02 §Z-7) |
| identicon-viewer | 08 Overlays | `O/identicon-viewer/default`<br>`O/identicon-viewer/copied` | `src/components/ui/IdenticonViewerSheet.tsx` | 07 §6.5 / §12 | — |
| network-editor | 08 Overlays | `O/network-editor/collapsed`<br>`O/network-editor/card-expanded` | `src/screens/settings/SettingsScreen.tsx` | 07 §7.1 + 06 §1.1 | HealthBadge states (checking/ok/error) drawn inside the expanded board, not separate boards |
| endpoint-editor | 08 Overlays | `O/endpoint-editor/default`<br>`O/endpoint-editor/health-error-states` | `src/screens/settings/SettingsScreen.tsx` | 07 §7.1 + 06 §1.1 | ServiceHealthBadge has 5 states (checking/ok/not_https/unreachable/invalid_response) — collapsed onto 2 boards |
| format-picker | 08 Overlays | `O/format-picker/number`<br>`O/format-picker/date`<br>`O/format-picker/time` | `src/screens/settings/SettingsScreen.tsx` | 07 §7.1 + 06 §1.1 | — |
| language-picker | 08 Overlays | `O/language-picker/default` | `src/screens/settings/SettingsScreen.tsx` | 06 §1.1 (LanguagePickerModal) | absent from the 07 overlay catalog — added from 06; the natural 15-script i18n stress board; mono-font endonym labels flagged for a ruling |
| add-network | 08 Overlays | `O/add-network/searching`<br>`O/add-network/checking-compatibility`<br>`O/add-network/result`<br>`O/add-network/error` | `src/screens/settings/SettingsScreen.tsx` | 07 §7.1 + 06 §1.1 | incompatible-with-deploy-CTA variant drawn inside the result board |
| rpc-providers | 08 Overlays | `O/rpc-providers/idle`<br>`O/rpc-providers/testing`<br>`O/rpc-providers/results` | `src/screens/settings/RpcProvidersModal.tsx` | 07 §7.1 + 06 §1.5 | — |
| onboarding-settings | 08 Overlays | `O/onboarding-settings/normal`<br>`O/onboarding-settings/unreachable-warning`<br>`O/onboarding-settings/dev` | `src/screens/onboarding/WelcomeScreen.tsx` | 07 §7.3 / §12 | bespoke 3-button theme picker with accent selection — diverges from SegmentedToggle mandate (06 §5.3) |
| bug-report | 08 Overlays | `O/bug-report/compose`<br>`O/bug-report/compose-steps`<br>`O/bug-report/compose-preview`<br>`O/bug-report/sending`<br>`O/bug-report/success-new`<br>`O/bug-report/success-deduped`<br>`O/bug-report/fallback` | `src/components/ui/BugReportModal.tsx` | 07 §7.2 / §12 | — |
| browser-consent | 08 Overlays | `O/browser-consent/favicon`<br>`O/browser-consent/fallback-logo` | `src/app/browser.tsx` | 07 §8.1 / §12 | — |
| browser-error | 08 Overlays | `O/browser-error/default` | `src/app/browser.tsx` | 07 §8.2 / §12 | — |
| qr-scanner | 08 Overlays | `O/qr-scanner/scanning-native`<br>`O/qr-scanner/scanning-web`<br>`O/qr-scanner/torch-on`<br>`O/qr-scanner/permission` | `src/components/QRScanner.tsx` | 07 §10 / §12 | — |
| receipt-toast | 08 Overlays | `O/receipt-toast/default` | `src/screens/wallet/ReceiptToast.tsx` | 07 §9.1 / §12 | — |
| rpc-trouble-banner | 08 Overlays | `O/rpc-trouble-banner/default` | `src/components/ui/RpcTroubleBanner.tsx` | 07 §9.2 / §12 | single-chain vs N-chain wording carried by the component chains axis |
| receive-gate | 08 Overlays | `O/receive-gate/default` | `src/screens/wallet/ReceiveScreen.tsx` | 07 §9.5 / §12 | — |
| splash | 08 Overlays | `O/splash/default` | `src/components/animated-icon.tsx` | 07 §9.6 / §12 | Expo-branded placeholder (blue gradient, Expo logo) — record only; must be replaced before store launch (02 F4) |
| treasury-modal | 10 Dev & Parallel Space | `O/treasury-modal/loading`<br>`O/treasury-modal/loaded`<br>`O/treasury-modal/underfunded-rows`<br>`O/treasury-modal/unreachable` | `src/screens/settings/SettingsScreen.tsx` | 06 §1.1 (TreasuryModal) | dev-gated (Developer section); absent from the 07 overlay catalog — added from 06 |
| parallel-space-badge | 10 Dev & Parallel Space | `O/parallel-space-badge/default` | `src/components/dev/ParallelSpaceBadge.tsx` | 07 §9.3 / §12 | hardcoded violet #7c3aed — deliberately off-brand and un-themed (03 §6) |

**37 overlays · 151 overlay boards.**

## Components (library, page `03 Components`; axes as Penpot variants)

| Component | Variant axes | Variants | Source | Inv |
|---|---|---|---|---|
| C/Primitives/VelaButton | variant(primary/secondary/accent/destructive) × size(default/compact) × state(default/pressed/disabled/loading) — destructive added per 06 §5.5 correction (code overrides accent bg with error.base for Sign Out) | 32 | `src/components/ui/VelaButton.tsx` | 02 A1 |
| C/Primitives/VelaCard | elevation(default/elevated) | 2 | `src/components/ui/VelaCard.tsx` | 02 A2 |
| C/Primitives/SectionLabel | spacing(standalone/inline/first-in-sheet) | 3 | `src/components/ui/SectionLabel.tsx` | 02 A3 |
| C/Primitives/TxStatusBadge | status(pending/confirmed/failed) | 3 | `src/components/ui/TxStatusBadge.tsx` | 02 A5 |
| C/Primitives/AmountText | mode(fiat/preformatted) × symbol(full/subordinated/none) × decimals(shown/hidden) × representation(full/compact) — text-style recipe, not a frame; tail = 0.56×, hero symbol = 0.58× | 24 | `src/components/ui/AmountText.tsx` | 02 A6 |
| C/Primitives/Input | kind(single/multiline) × state(empty/filled/error) — the shared input recipe (bg.sunken, radius 12, 1px border.base) | 6 | `src/components/ui/AutoGrowTextInput.tsx` | 02 A7 + appendix |
| C/Primitives/ScreenContainer | — (single main instance) — page template: 24px gutters on bg.base, top safe-area | 1 | `src/components/ui/ScreenContainer.tsx` | 02 A10 |
| C/Primitives/RpcTroubleBanner | chains(one/many) | 2 | `src/components/ui/RpcTroubleBanner.tsx` | 02 D15 |
| C/Primitives/TransactionReceipt | status(submitted/confirmed/failed) × kind(single/split/multiSelect) × saveContact(none/available/saved) | 27 | `src/components/ui/TransactionReceipt.tsx` | 02 E1 |
| C/Primitives/RecipientName | — (single main instance) | 1 | `src/components/contacts/RecipientName.tsx` | 03 §5.5 |
| C/Primitives/RecipientTrust | variant(default/compact/prominent) × trust(favorite/resolved) | 6 | `src/components/contacts/RecipientTrust.tsx` | 03 §5.6 |
| C/Primitives/RecipientTypeBadge | kind(contact/vela-user/name-service/unknown-contract/unknown-eoa) | 5 | `src/components/contacts/RecipientTypeBadge.tsx` | 03 §5.7 |
| C/Controls/SegmentedToggle | segment(active/inactive) × badge(none/count) × icon(none/leading) | 8 | `src/components/ui/SegmentedToggle.tsx` | 02 B1 |
| C/Controls/SlideToConfirmButton | state(idle/dragging/committed/disabled/loading) | 5 | `src/components/ui/SlideToConfirmButton.tsx` | 02 B2 |
| C/Controls/VelaRefresh | state(idle/pulling/armed/refreshing) × caption(none/status) | 8 | `src/components/ui/VelaRefresh.tsx` | 02 B3 |
| C/Controls/WaveDock | element(bar/send/receive/fab) × state(default/pressed) | 8 | `src/components/ui/WaveDock.tsx` | 02 B4 |
| C/Controls/NetworkFilterButton | selection(all/chain-selected) | 2 | `src/components/ui/NetworkFilterSheet.tsx` | 02 B5 |
| C/Controls/ConnectionFlowStates | state(verify/waiting/error) | 3 | `src/components/ConnectionFlowStates.tsx` | 03 §7.1 |
| C/Controls/QRScanner | state(scanning/torch-on/permission) × platform(native/web) | 6 | `src/components/QRScanner.tsx` | 03 §7.3 |
| C/Controls/ReceiveRequestControls | — (single main instance) | 1 | `src/components/ReceiveRequestControls.tsx` | 03 §7.5 |
| C/Rows/TokenRow | mode(plain/checkbox-off/checkbox-on) × masked(no/yes) × contract-chip(none/default/copied) × fiat(yes/no) × state(default/pressed/selected) | 108 | `src/components/ui/TokenRow.tsx` | 02 C1 |
| C/Rows/ActivityRow | direction(in/out) × masked(no/yes) × new(none/glow) × time(no/yes) × chain-badge(yes/no) | 32 | `src/components/ui/ActivityRow.tsx` | 02 C2 |
| C/Rows/HoldingsList | state(list/empty/no-match/loading) × search(closed/open) | 8 | `src/components/ui/HoldingsList.tsx` | 02 C3 |
| C/Rows/TokenSelector | mode(single/sweep) × chip(active/inactive) × list(loading/empty/results) | 12 | `src/components/ui/TokenSelector.tsx` | 02 C4 |
| C/Rows/FeeTokenSelector | row(default/selected/pending/insufficient) | 4 | `src/components/ui/FeeTokenSelector.tsx` | 02 C5 |
| C/Rows/GasFeeCard | state(estimating/ready/failed/refreshing) × expandable(yes/no) × expanded(no/yes) | 16 | `src/components/ui/GasFeeCard.tsx` | 02 C6 |
| C/Rows/DetailRow | trailing(none/copy/copied/open) × face(sans/mono/custom) | 12 | `src/components/ui/DetailRow.tsx` | 02 A4 |
| C/Rows/ConfirmAssets | variant(single/multi-collapsed/multi-expanded) | 3 | `src/components/send/ConfirmAssets.tsx` | 03 §4.2 |
| C/Rows/FlowArrowSend | — (single main instance) | 1 | `src/components/send/FlowArrow.tsx` | 03 §4.3 |
| C/Rows/MultiRecipientEditor | recipient-card(valid/invalid) × footer(add-enabled/cap-reached) | 4 | `src/components/send/MultiRecipientEditor.tsx` | 03 §4.4 |
| C/Sheets/AppModal | mode(pageSheet/fit) × platform(ios/android/web) | 6 | `src/components/ui/AppModal.tsx` | 02 D1 |
| C/Sheets/SheetHeader | variant(centered/left-aligned/text-action) | 3 | `src/components/ui/AppModal.tsx` | 02 D1b + 07 §1.8 |
| C/Sheets/AppAlert | buttons(one/two/three) × role(default/cancel/primary/destructive) | 12 | `src/components/ui/AppAlert.tsx` | 02 D2 |
| C/Sheets/AccountSwitcherModal | row(active/inactive) × balance(value/loading/masked) × actions(none/create) | 12 | `src/components/ui/AccountSwitcherModal.tsx` | 02 D3 |
| C/Sheets/AddTokenPanel | tab(erc20/network) × result(none/found/added/error) × compat(pass/fail) | 16 | `src/components/ui/AddTokenPanel.tsx` | 02 D5 |
| C/Sheets/BalanceDetailSheet | sections(networks/tokens/both/empty) × net-row(failed/retrying) | 8 | `src/components/ui/BalanceDetailSheet.tsx` | 02 D6 |
| C/Sheets/BrowserHistorySheet | state(list/empty) | 2 | `src/components/ui/BrowserHistorySheet.tsx` | 02 D7 |
| C/Sheets/BugReportModal | state(compose/steps-open/preview-open/sending/success/fallback) | 6 | `src/components/ui/BugReportModal.tsx` | 02 D8 |
| C/Sheets/BundlerFundingView | mode(topup/confirming/funded) × qr(collapsed/open) × retry(none/available/retrying) — surface axis removed — standalone wrapper is dead code; dApp content-swap only | 18 | `src/components/ui/BundlerFundingModal.tsx` | 02 D9 |
| C/Sheets/ConnectionEventDetailSheet | kind(connect/message/typed/tx) × content(present/missing) × copied(no/yes) | 16 | `src/components/ui/ConnectionEventDetailSheet.tsx` | 02 D10 |
| C/Sheets/CurrencySheet | row(default/selected) × search(empty/active/no-match) | 6 | `src/components/ui/CurrencySheet.tsx` | 02 D11 |
| C/Sheets/IdenticonViewerSheet | copy(default/copied) | 2 | `src/components/ui/IdenticonViewerSheet.tsx` | 02 D13 |
| C/Sheets/NetworkFilterSheet | row(all/chain) × selected(no/yes) × search(closed/open) | 8 | `src/components/ui/NetworkFilterSheet.tsx` | 02 D14 |
| C/Sheets/RpcFixForm | state(default/saving/disabled) | 3 | `src/components/ui/RpcTroubleBanner.tsx` | 02 D15 |
| C/Sheets/TransactionDetailSheet | kind(single-out/single-in/split/multiSelect) × status(pending/confirmed/failed) × counterparty(named/address-only) | 24 | `src/components/ui/TransactionDetailSheet.tsx` | 02 D17 |
| C/Sheets/TreasuryBootstrapSheet | footer(retry/close) × copied(no/yes) | 4 | `src/components/ui/TreasuryBootstrapSheet.tsx` | 02 D18 |
| C/Sheets/BatchImportSheet | unit(fiat/token) × state(paste/preview/row-errors/over-cap) | 8 | `src/components/send/BatchImportSheet.tsx` | 03 §4.1 |
| C/Sheets/ContactPicker | state(default/searching/typed-address/groups/empty/loading) | 6 | `src/components/contacts/ContactPicker.tsx` | 03 §5.2 |
| C/Sheets/ContactsManager | view(list/form/group-editor) × search(closed/open) × segmented(all/favorites) | 12 | `src/components/contacts/ContactsManager.tsx` | 03 §5.3/§5.4 |
| C/Sheets/ExtensionSignSheet | outcome(signed/rejected/expired/unknown/one-tap-enabled) | 5 | `src/components/ExtensionSignController.tsx` | 03 §7.8 |
| C/Signing/SigningSheet | view(loading/clear-sign/approval/permit/message/eth-sign/blind-typed/blind-tx/batch) × phase(default/resolving/gas-estimating/fee-busy/estimate-failed/signing/submitted-pending/error/read-only-replay/funding-swap) — composition root; boards live under O/signing-sheet — not every axis cross-product is a board | 90 | `src/components/signing/SigningSheet.tsx` | 03 §1.1 |
| C/Signing/DAppBanner | icon(image/monogram) | 2 | `src/components/signing/DAppBanner.tsx` | 03 §2.1 |
| C/Signing/SigningAccountRow | state(collapsed/expanded) | 2 | `src/components/signing/DAppBanner.tsx` | 03 §2.1 |
| C/Signing/IntentHeader | variant(eyebrow/hero) × tone(neutral/danger/revoke) | 6 | `src/components/signing/IntentHeader.tsx` | 03 §2.2 |
| C/Signing/SummaryLine | tone(default/caution/danger) | 3 | `src/components/signing/SummaryLine.tsx` | 03 §2.3 |
| C/Signing/TokenCard | variant(send/receive/caution/danger) × layout(hero/row/tinted-card) | 12 | `src/components/signing/TokenCard.tsx` | 03 §2.4 |
| C/Signing/FlowArrow | variant(default/danger) | 2 | `src/components/signing/TokenCard.tsx` | 03 §2.4 |
| C/Signing/ContractBar | kind(auto/contract/asset) × variant(default/warning) × badge(none/wallet/contract/verified) | 24 | `src/components/signing/ContractBar.tsx` | 03 §2.5 |
| C/Signing/WarningBanner | severity(caution/danger) | 2 | `src/components/signing/WarningBanner.tsx` | 03 §2.6 |
| C/Signing/GenericFieldRow | state(default/warning/expired) | 3 | `src/components/signing/WarningBanner.tsx` | 03 §2.6 |
| C/Signing/AdvancedPanel | state(collapsed/expanded) | 2 | `src/components/signing/AdvancedPanel.tsx` | 03 §2.7 |
| C/Signing/EditableApproveCard | shape(amount/boolean-grant) × choice(requested/balance/custom/revoke/grant-anyway) × state(default/editing/error) | 30 | `src/components/signing/EditableApproveCard.tsx` | 03 §2.8 |
| C/Signing/BalanceChangePreview | state(expected-fail/underfunded/quiet-ok/changes-list) × unverified-row(no/yes) | 8 | `src/components/signing/BalanceChangePreview.tsx` | 03 §2.9 |
| C/Media/Identicon | size(18/32/40/44/220) | 5 | `src/components/ui/Identicon.tsx` | 02 A8 |
| C/Media/WalletAvatar | style(initial/identicon) × size(20/32/38/40/44) — size 20 added per 05 §11.3 correction (browser account pill, letterSize 11) | 10 | `src/components/ui/WalletAvatar.tsx` | 02 A9 |
| C/Media/ContactAvatar | mode(tinted-initial/identicon) × size(18/20/28/32/36/38/40/42/64) × badge(none/account) | 36 | `src/components/contacts/ContactAvatar.tsx` | 03 §5.1 |
| C/Media/TokenLogo | badge(none/chain) × fallback(image/letter-disc) × size(20/24/28/30/32/36/40/44/46/52) | 40 | `src/components/TokenLogo.tsx` | 03 §7.6 |
| C/Media/ChainLogo | fallback(image/colored-disc) | 2 | `src/components/ChainLogo.tsx` | 03 §7.7 |
| C/Media/QRCode | size(72/120/132/140/180/196/200) — always black-on-white; hosts pin a #FFFFFF plate in both themes | 7 | `src/components/QRCode.tsx` | 03 §7.2 |
| C/Media/ReceiveShareCard | variant(request/address) — always-light hardcoded share card; web canvas twin must stay in sync | 2 | `src/components/ReceiveShareCard.tsx` | 03 §7.4 |
| C/Media/ParallelSpaceBadge | — (single main instance) | 1 | `src/components/dev/ParallelSpaceBadge.tsx` | 03 §6 |

**71 components · 819 variants** (axis cross-products; composition roots like SigningSheet board only their documented states, not the full product).

## Exclusions (documented non-boards — the audit treats these cells as `excluded:<reason>`)

| Surface | Reason |
|---|---|
| route /history | Dead registration — <Stack.Screen name="history"> in src/app/_layout.tsx has no route file; History merged into Home's Activity tab (04 §8.1). Do not draw. |
| route /sign (src/app/sign.tsx) | Headless trampoline — renders one frame of app background and hands rid to ExtensionSignController; its UX is O/signing-sheet + O/extension-sign-controller (04 §1). |
| src/app/_layout.tsx, src/app/(tabs)/_layout.tsx, src/app/parallel/_layout.tsx | Navigator layouts — no visual surface of their own (headers hidden app-wide, tab bar hidden; 04 §1/§2). |
| src/app/+html.tsx | Web HTML shell wrapper, not a route (04 §1). |
| BundlerFundingModal standalone wrapper | Dead code — zero imports of the AppModal wrapper; only the BundlerFundingView content-swap inside SigningRequestModal is live (02 D9 ⚠, 07 §11.2). Boarded as O/bundler-funding. |
| Safari Web Extension UI (targets/safari, packages/safari-extension) | Separate extension target outside the RN app; not covered by inventory 02–08. The in-app halves (S/safari-extension guide, O/extension-sign-controller) ARE boarded. |
| safe-recovery-extension (packages/safe-recovery-extension) | Separate recovery-extension surface outside the app; out of scope for this design source. |
| chrome-ext-webauthn-proxy | Dev-tooling browser extension living in the repo; not an app surface. |
| MockSigningModal (ClearSigningTestScreen harness modal) | Hosts the production SigningSheet with mock data — identical to O/signing-sheet by mandate (07 §3.4); the scenario list itself is S/clear-signing-test/default. |
| SigningReplaySheet | Thin AppModal wrapper — boarded as O/signing-sheet/replay-settled and /replay-in-flight (07 §3.3, 02 D16). |
| IdenticonViewerProvider | Behavioral host only, no visuals (02 D12); the sheet is boarded as O/identicon-viewer. |
| Copy-feedback pattern (hooks/use-copy-feedback) | In-place icon/label swap, not an overlay surface (07 §9.4); documented on the 09 Patterns page instead. |
| Legacy components: ThemedText / ThemedView / Collapsible | Expo-template leftovers on the legacy palette — excluded from the library (02 F1–F3). |
| AnimatedIcon / AnimatedSplashOverlay as a library component | Expo-branded placeholder splash — recorded once as O/splash for the audit trail, excluded from the component library; must be replaced before store launch (02 F4). |
| vela.* console fault-injection / metrics consoles | Console-only dev surfaces, no UI to board (04 §6). |

## Entry boards (reachable only via deep link / boot / dev entry — excused from the S/home/default BFS, data-model §6)

- `S/index`
- `S/connect`
- `S/pay`
- `S/web-request`
- `S/clear-signing-test`
- `S/receipt-harness`
- `S/parallel`
- `S/parallel/connect`

## Notes / open judgment calls

1. **Home tabs modeled as home states** (`S/home/assets`, `S/home/connections-*`): the SegmentedToggle is screen state, not routing (04 §2) — no separate routes exist.
2. **Receive warning gate** and **browser load-error/consent** live as overlay boards (07 §12), not screen states, to avoid double-boarding.
3. **network-editor / endpoint-editor state granularity** is a judgment call — 07 §12 lists them as single cells; health-badge sub-states are drawn inside the boards.
4. **VelaButton `destructive`** variant added per 06 §5.5 proposal (code today overrides accent bg with error.base).
5. **language-picker and treasury-modal** are missing from the 07 catalog and were added from inventory 06 (flagged as drift).
6. **SigningSheet component axes** (view × phase) are derived from 03 §1.1's state list — 03 proposes no explicit axis line; boards follow 07 §12's 20-state checklist instead of the cross-product.
7. **Size axes for ContactAvatar / TokenLogo / QRCode** are derived from documented usage sites, not an explicit inventory proposal.
