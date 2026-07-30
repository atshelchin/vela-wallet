# state-specs-5.json — work order

Merged 2026-07-30 from five recon spec files (web-request, funding, pickers, settings-modals,
native-transient) plus one component-gap report. **7 groups · 58 states · 58 unique boards**, no
slug and no board collides with `state-specs.json`, `-2`, `-3`, `-4` or `-dark`.

Run order is significant. Groups are cumulative internally; `captureStates` clears injected faults
at the end of every group (`capture-states.js:131`), so faults never leak between groups. The
`/connect` group is **last on purpose** — it ends with a live `getUserMedia` camera mounted and
`DAppConnection.status === 'error'`; reload the page before capturing anything else.

## 1 · What state-specs-5.json will capture

### group `/wallet` (7)
| slug | depicts | driver |
|---|---|---|
| account-switcher-loading | switcher header spinner while every account balance re-fetches | `useHomeController.ts:454-468`, `:470-479` |
| account-switcher-privacy-masked | every fiat figure in the switcher masked to `••••` | `AccountSwitcherModal.tsx:73-74` |
| balance-detail-tokens-only | balance sheet with ONLY the "Tokens without a price" section | `useHomeController.ts:172-179`, gate `:349-366` |
| balance-detail-networks-only | ONLY "Networks still updating", every row hard-failed + Fix | `rpc-pool.ts:727-732`, `BalanceDetailSheet.tsx:131-135` |
| home-estimate-notice | tappable "Some balances are still updating." over a CACHED total, no RPC banner | `HomeScreen.tsx:110-129`, `:136-139` |
| extension-sign-one-tap | Safari-extension UL self-test sheet: success check + "One-tap signing enabled" | `ExtensionSignController.tsx:95`, `:189-191` |
| extension-sign-expired | "This signing request expired" + Return to Safari, muted Done | `ExtensionSignController.tsx:135-138`, `:192-194` |

### group `/receive` (3)
| slug | depicts | driver |
|---|---|---|
| token-selector-default | TokenSelector as a real presented SHEET (its only such host) | `ReceiveRequestControls.tsx:132-143`, `:63-73` |
| token-selector-searching | search field filled, list filtered on symbol/name/network | `TokenSelector.tsx:136-144`, `:91-97` |
| token-selector-category-filtered | "Stablecoins" quick-filter chip active | `TokenSelector.tsx:113-118`, `:33-41` |

### group `/design-gallery` (18)
| slug | depicts | driver |
|---|---|---|
| treasury-bootstrap-open | treasury-low sheet (re-capture; also the `__ASSETMAP` warm-up) | `design-gallery.tsx:1437`, `:1515` |
| treasury-bootstrap-copied | copy-confirmed beat: green check + "Copied" (lives 1500 ms) | `TreasuryBootstrapSheet.tsx:71-76`, `:115-133` |
| currency-sheet-searching | currency list narrowed by the always-visible search box + clear ✕ | `CurrencySheet.tsx:75-92`, `:64-68` |
| currency-sheet-empty | `No currency matches "zzz".` | `CurrencySheet.tsx:101-102` |
| network-filter-sheet-searching | optional search row revealed, "All Networks" row withdrawn | `NetworkFilterSheet.tsx:122-133`, `:137` |
| add-token-sheet-resolving | "Searching all networks..." with the button in loading state | `AddTokenPanel.tsx:407-414`, `:159-185` |
| add-token-sheet-resolved | one result card for real BNB-chain USDC (Name/Symbol/Decimals/Network) | `AddTokenPanel.tsx:417-456` |
| contact-picker-searching | live search over the address book, Scan row withdrawn | `ContactPicker.tsx:107-123`, `:68-71` |
| contact-picker-typed-address | pasted unknown address offered as "Use this address" + quiet Save | `ContactPicker.tsx:145-166`, `:76-77` |
| contact-picker-empty | `No matches for "zzzz"` empty branch | `ContactPicker.tsx:170-186` |
| batch-import-parsed-preview | pasted table → per-recipient fiat→token preview, CTA turned accent | `BatchImportSheet.tsx:329-363`, `:382-404` |
| batch-import-row-errors | Duplicate—skipped / Invalid address rows + "2 rows skipped" notice | `BatchImportSheet.tsx:332-359`, `:372-377` |
| batch-import-rate-editing | hand-overridden `1 USDC = <rate> USD` with the "Auto" reset | `BatchImportSheet.tsx:306-316`, `:114` |
| batch-import-nested-currency-picker | modal-over-modal: scoped "Priced in" CurrencySheet | `BatchImportSheet.tsx:409-418`, `:269-281` |
| balance-detail-fix-form-swap | balance sheet body REPLACED in place by the RPC-fix form (not a 2nd modal) | `BalanceDetailSheet.tsx:83-88`, `:64-66` |
| identicon-viewer-copied | copy row confirmed: check + "Copied" in success ink (2 s window) | `IdenticonViewerSheet.tsx:74-88`, `:128-129` |
| rpc-fix-prefilled | recovery form with a URL typed, "Save & Retry" out of disabled | `RpcTroubleBanner.tsx:181-200`, `:112-117` |
| rpc-fix-saving | submit button mid-validation (spinner) against a non-routable host | `RpcTroubleBanner.tsx:192-200`, `:119-126` |

### group `/settings` (20)
| slug | depicts | driver |
|---|---|---|
| network-editor-collapsed | one collapsed NetworkConfigCard per network | `SettingsScreen.tsx:275-328`, `:227-239` |
| network-editor-card-expanded | Ethereum card expanded: RPC URL + EXPLORER with live HealthBadges | `SettingsScreen.tsx:240-259`, `:95-176` |
| endpoint-editor-default | four service cards + ServiceHealthBadges + Reset to Defaults | `SettingsScreen.tsx:432-516`, `:441-451` |
| rpc-providers-idle | Alchemy/dRPC/Ankr all "Not set", empty masked key fields | `RpcProvidersModal.tsx:125-177`, `:227-229` |
| rpc-providers-testing | ProviderStatus replaced by a spinner while 13 probes run | `RpcProvidersModal.tsx:230-232`, `:72-80` |
| rpc-providers-results | "Check key" warning pill + "Supports 0 of 13 networks" collapsed | `RpcProvidersModal.tsx:233-241`, `:187-198` |
| add-network-searching | query + suggestions card (name, `Chain {id} · {sym}`, capped at 10) | `SettingsScreen.tsx:689-720`, `chain-registry.ts:110-140` |
| add-network-checking-compatibility | "Checking compatibility..." spinner row | `SettingsScreen.tsx:610-647`, `:729-734` |
| add-network-result | chain-info + custom RPC + best-RPC + P256/contract checklist (Celo = incompatible) | `SettingsScreen.tsx:739-848` |
| add-network-error | already-added chain → the hardcoded-English error line | `SettingsScreen.tsx:620-626`, `:736` |
| language-picker-default | Follow System + every endonym + accent check + GitHub contribute footer (15-script stress) | `SettingsScreen.tsx:951-1005` |
| format-picker-number | five numberFormatOptions rows with mono live examples | `SettingsScreen.tsx:523-562`, `locale-format.ts:290-297` |
| format-picker-date | six dateFormatOptions rows | `locale-format.ts:299-302` |
| format-picker-time | three timeFormatOptions rows (shortest selection list) | `locale-format.ts:304-311` |
| contacts-manager-list-searching | search header swapped in for the title row, groups/segment/import suppressed | `ContactsManager.tsx:143-168` |
| contacts-manager-form-edit | Edit contact: name pre-filled, address non-editable, destructive Delete row | `ContactsManager.tsx:426-447`, `:340-342` |
| account-switcher-create-actions | switcher WITH Create New / Sign In With Existing (Settings-only variant) | `AccountSwitcherModal.tsx:138-143`, `SettingsScreen.tsx:1598-1604` |
| dev-treasury-loading | address+QR painted while every balance row still spins | `SettingsScreen.tsx:1272-1273`, `:1337-1340` |
| dev-treasury-loaded | QR + total USD + per-network balance/fiat rows (honest reading) | `SettingsScreen.tsx:1212-1299` |
| dev-treasury-rows-need-funding | the warning-row TREATMENT on every network (AlertTriangle + warning ink) | `SettingsScreen.tsx:1253`, `:1277-1286` |

### group `/pay?to=…` (2)
| slug | depicts | driver |
|---|---|---|
| pay-other-request | "Pay with another wallet" expanded, EIP-681 QR + "Open in wallet app" | `PayScreen.tsx:135-157` |
| pay-other-address | same panel switched to the plain-address QR (openApp button gone) | `PayScreen.tsx:143-163` |

### group `/add-token` (5)
| slug | depicts | driver |
|---|---|---|
| addtoken-erc20-resolving | in-flight multi-chain lookup, button disabled + spinner | `AddTokenPanel.tsx:159-185`, `:407-414` |
| addtoken-erc20-resolved | resolved USDT card (Ethereum only) + "Add to Wallet" | `AddTokenPanel.tsx:417-456` |
| addtoken-erc20-error | "Could not find this token on any network." alert over the form | `AddTokenPanel.tsx:180-182`, `AppAlert.tsx:85-127` |
| addtoken-network-checking | chain-info card already painted while compatibility is still probing | `AddTokenPanel.tsx:114-138`, `:313` |
| addtoken-network-incompatible | per-contract checklist + P256 (RIP-7212) + Deploy missing contracts | `AddTokenPanel.tsx:314-356` |

### group `/connect` (3, run LAST)
| slug | depicts | driver |
|---|---|---|
| home-connections-connecting | Home Connections tab hosting the 4-digit pairing gate inline | `ConnectionsView.tsx:159-161` → `ConnectionFlowStates.tsx:28-80` |
| home-connections-error | error medallion, "Connection Failed", parse error, Scan Again | `ConnectionFlowStates.tsx:103-127` |
| qr-scanner-web | the only scanner state that exists on web: chrome + 240 px frame, no scan line/flip/zoom | `QRScanner.tsx:576-644`, web branch `:578-586` |

**One accepted persisted write, disclosed:** `account-switcher-privacy-masked` taps the hero, which
persists `vela.balanceHidden` (`use-balance-privacy.ts:35-39`). It is a display preference, it is
already precedented by the shipped board `S/home/hidden-balance`, and the next state's second step
re-taps the hero so the group ends unmasked. Everything else in this file is read-only.

## 2 · DO-NOT-ATTEMPT (excluded; each would mutate)

| would-be state | mutation | file:line |
|---|---|---|
| `S/web-request/consent` **approved** | `setGrant` writes `vela.perm.<origin>` to AsyncStorage/localStorage | `web-request.tsx:216-229` → `dapp-permissions.ts:37-43` |
| add-token / add-token-sheet "Add to Wallet" | `saveCustomToken` persists a custom token | `AddTokenPanel.tsx:187-218` |
| add-network "Add Network" pressed | `saveCustomNetwork` persists a network | `SettingsScreen.tsx:668` |
| network-editor field typed/blurred | `saveNetworkConfig` persists an RPC/explorer override | `SettingsScreen.tsx:254` → `:288` |
| rpc-fix "Save & Retry" **succeeding** | `saveNetworkConfig` persists the override (avoided by probing 10.255.255.1, which can never return chainId 100) | `RpcTroubleBanner.tsx:140-145` |
| endpoint-editor field blur / Reset to Defaults | `handleSave` persists a service endpoint | `SettingsScreen.tsx:453-460`, `:509` |
| rpc-providers key field blur | `onKeyBlur` persists a provider API key | `RpcProvidersModal.tsx:104-109` |
| language / format picker row tapped | `setLangPref` / `saveLocalePrefs` persist locale prefs | `i18n/language.tsx:46-52` → `i18n/index.ts:160`; `SettingsScreen.tsx:544`, `:1393-1397` → `storage.ts:256` |
| contacts Save / Delete, ContactPicker Save | writes the address book | `ContactsManager.tsx:441`, `:121-131`; `ContactPicker.tsx:159` |
| receive "I Understand" | per-account acknowledge flag persisted (NOT needed — verified the toggle is reachable without it) | `ReceiveScreen.tsx:67-70` |
| `O/onboarding-settings/*` interactions | theme chips persist, endpoint field blur persists, DEBUG button writes a broken endpoint | `OnboardingSettingsModal.tsx:148`→`color-scheme.ts:121`, `:170`→`:108-114`, `:190-197` |
| onboarding "Create Wallet" ceremony | mints a passkey + writes `vela.accounts` | (already excluded by `state-specs-4.json:86-118`) |
| `BundlerFundingView` cell w/ an AUTO_RETRYABLE denialReason | real free-grant sponsorship **POST** 30 s after mount | `BundlerFundingModal.tsx:209`, `:229-241`, sets `:90-95` |
| `O/extension-sign/signed` \| `/rejected` | needs a real sign-req file + passkey + a sign-result write | `ExtensionSignController.tsx:152-156` |
| gallery mounting its own `<ExtensionSignController/>` | double-mounts the root controller (`_layout.tsx`) — drive it through `requestExtensionSign` / `/sign?rid=` instead | `dapp-connection.tsx:605-620` |

## 3 · UNREACHABLE (needs a device, a live peer, or a harness capability)

| state | why | unblock |
|---|---|---|
| `S/web-request/waiting`, `/consent`, `/unsupported-chain` | the route needs a live `window.opener`; they live in a SECOND tab. `captureAll`'s pushState would render the no-opener phase and silently dump the already-captured `S/web-request/unavailable` under three wrong slugs | run manually: open `http://localhost:8081/__vela-opener.html?phase=waiting\|consent\|unsupported-chain`, keep the opener tab alive, `select_page` the popup, inject the extractor there and call `window.captureStates({url,states:[{…,steps:[{act:'wait',ms:3000}]}]})` — never `captureAll`. Preconditions: `window.__openerState.selfCheck.ok===true`; for consent, `localStorage.getItem('vela.perm.http://localhost:8081')` MUST be `null` (`web-request.tsx:176-179`). ⚠ `public/__vela-opener.html` is **untracked** (created during recon, 2026-07-30 10:45) — commit or recreate it before relying on this |
| `O/onboarding-settings/normal` | only non-forbidden entry is an 800 ms long-press on the Welcome logo; `capture-states.js` has no long-press act | add a `longPress` act (pointerdown → hold `ms` → pointerup+click). Trigger `WelcomeScreen.tsx:286` (`__DEV__` only, delayLongPress 800 + RNW's 50 ms) |
| `O/receipt-toast/default` | the dev hook is `globalThis.velaSimulateReceipt`, not `window.vela.*`; the `vela` act only resolves `window.vela[fn]` | one line: fall back to `globalThis[s.fn]` at `capture-states.js:63-65`, or expose `simulateReceipt` in `fault-injection.ts:195+`. Source hook: `useHomeController.ts:240`; toast lives 2800 ms (`:233`) and is suppressed while balance privacy is on |
| QRScanner `torch-on`, `permission`, scan line, camera-flip, zoom | native-only surfaces / need a granted camera + a tap | device screenshots + a `vela.platform` annotation. `QRScanner.tsx:507`, `:306`, `:321-336`, `:183-188`, `:614-620` |
| `VelaRefresh` pulling / armed | pull offset is a Reanimated SharedValue only a live gesture advances; no prop or handle sets it | device/gesture capture, or a debug prop. `VelaRefresh.tsx:222-266`, `:151-213`. `refreshing=true` IS gallery-able (2 cells) — see below |
| `HoldingsList` (4 cells), `VelaRefresh` (2), `QRScanner` launcher, `BundlerFundingView` (4), `ExtensionSignSheet` launchers, `FlowArrowSend` rename | the gallery has no cell for them; `spec-component-gaps.json` supplies ready cellSketches but adding them edits `src/app/design-gallery.tsx`, which this pass may not write | apply the cellSketches, then capture via `/design-gallery`. Note `FlowArrowSend` needs no render at all — only a cell-id rename (`design-gallery.tsx:979-981`) + a `'flowarrowsend'` entry in `plan-components.py` GROUPS |
| `BundlerFundingView` `mode=funded`, `qr=open`, `details=open`; `HoldingsList` `search=open` | set only by internal `useState` / a live bundler balance, no prop | a debug prop, or a non-`inert` cell plus a click step. `BundlerFundingModal.tsx:165-173`, `:121`, `:122`; `HoldingsList.tsx:57`, `:120-134` |
| `C/Controls/ConnectionFlowStates` cells | all three states read a module-private context; a cell could only fake internals | none needed — captured in situ as `S/connect/connecting-verify`, `S/connect/error` and (new here) `S/home/connections-connecting` / `-error` |
| `C/Primitives/Input`, `C/Primitives/ScreenContainer`, `C/Media/ParallelSpaceBadge` | not gallery-able (style recipe / paints nothing / self-gated absolute overlay); a cell would invent geometry | slice from existing screen dumps. ⚠ ParallelSpaceBadge uses raw `fontSize` 11/10 with no `scaleFont`, so it is NOT web-boosted — `70-board-from-dom.js`'s ÷1.2 de-boost would wrongly shrink it |
| `ContactPicker` never-had-contacts empty state | needs an empty address book, i.e. deleting the fixture contact | seed a second capture profile with no contacts (never delete from the live one) |

### Verify-on-capture (do not publish blind)
- `contacts-manager-list-searching` and `network-filter-sheet-searching` depend on a synthetic `Enter`
  activating an **icon-only** Pressable (no `innerText`, so it cannot be clicked by text). Both are the
  first focusable inside the dialog, which `use-web-dialog.ts:78-83` focuses on open, and RNW's
  `PressResponder` fires onPress from an Enter keydown/keyup pair. If it no-ops, the dump comes back
  byte-identical to the family's default board — **discard it, do not publish a duplicate**.
- `rpc-providers-testing` (13 probes may already be `done`) and `rpc-fix-saving` (probe may fail
  instantly) are timing races with the same rule: identical to their neighbour ⇒ drop.
- `add-network-result` expects Celo to come back INCOMPATIBLE. If it resolves compatible, the accent
  "Add Network" button appears — **must not be pressed** (`SettingsScreen.tsx:668`).
