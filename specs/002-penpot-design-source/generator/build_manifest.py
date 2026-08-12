#!/usr/bin/env python3
# Builds specs/002-penpot-design-source/generator/manifest.json + coverage.md
# from inventory 02-08 facts (T005). Single data source -> both artifacts.
import json, math, os
from functools import reduce

GIT_REV = "ffe7209"
DATE = "2026-07-29"
OUT_DIR = "/Volumes/data/production/vela-wallet/specs/002-penpot-design-source/generator"

P_WALLET = "05 Screens · Wallet"
P_BROWSER = "06 Screens · Browser & Connect"
P_SETTINGS = "07 Screens · Settings & Onboarding"
P_OVERLAYS = "08 Overlays"
P_DEV = "10 Dev & Parallel Space"

screens = [
  {
    "route": "home", "page": P_WALLET, "boardBase": "S/home",
    "states": ["default", "activity-empty", "assets", "assets-empty",
               "connections-empty", "connections-connecting", "connections-error",
               "connections-connected", "connections-reconnecting",
               "balance-loading", "hidden-balance", "estimate-notice",
               "rate-limited", "rpc-trouble", "refreshing"],
    "sourceRef": "src/screens/wallet/HomeScreen.tsx", "invRef": "05 §2", "entry": False,
    "drift": None
  },
  {
    "route": "send", "page": P_WALLET, "boardBase": "S/send",
    "states": ["select-token", "select-token/sweep", "select-token/empty",
               "details", "details/split", "details/sweep",
               "details/error-insufficient", "details/estimating",
               "confirm", "confirm/split", "confirm/sweep", "confirm/fee-blocker",
               "confirm/submitting", "confirm/error",
               "receipt/submitted", "receipt/confirmed", "receipt/failed",
               "locked/resolving", "locked/network-not-supported", "locked/unknown-token"],
    "sourceRef": "src/screens/wallet/SendScreen.tsx", "invRef": "05 §3", "entry": False,
    "drift": None
  },
  {
    "route": "receive", "page": P_WALLET, "boardBase": "S/receive",
    "states": ["address", "request", "copied", "deposit-detected"],
    "sourceRef": "src/screens/wallet/ReceiveScreen.tsx", "invRef": "05 §4", "entry": False,
    "drift": "first-visit warning gate boarded separately as O/receive-gate (07 §9.5 / §12)"
  },
  {
    "route": "token-detail", "page": P_WALLET, "boardBase": "S/token-detail",
    "states": ["default"],
    "sourceRef": "src/screens/wallet/TokenDetailScreen.tsx", "invRef": "05 §5", "entry": False,
    "drift": None
  },
  {
    "route": "add-token", "page": P_WALLET, "boardBase": "S/add-token",
    "states": ["erc20-form", "erc20-resolving", "erc20-resolved", "erc20-error",
               "network-search", "network-checking", "network-compatible", "network-incompatible"],
    "sourceRef": "src/screens/wallet/AddTokenScreen.tsx", "invRef": "05 §7 + 07 §5.4", "entry": False,
    "drift": "same AddTokenPanel also presented as O/add-token-sheet — boards share component instances"
  },
  {
    "route": "pay", "page": P_WALLET, "boardBase": "S/pay",
    "states": ["default", "other-wallet-request", "other-wallet-address", "invalid-link"],
    "sourceRef": "src/screens/wallet/PayScreen.tsx", "invRef": "05 §6", "entry": True,
    "drift": "deliberately card-heavy — public-web surface exception to de-containering (05 §6 note)"
  },
  {
    "route": "browser", "page": P_BROWSER, "boardBase": "S/browser",
    "states": ["default", "loading", "connected", "insecure-origin",
               "preparing-wallet", "no-wallet", "unsupported", "no-url"],
    "sourceRef": "src/app/browser.tsx", "invRef": "05 §11", "entry": False,
    "drift": "load-error state boarded as O/browser-error (07 §8.2); consent as O/browser-consent (07 §8.1)"
  },
  {
    "route": "connect", "page": P_BROWSER, "boardBase": "S/connect",
    "states": ["no-wallet", "disconnected", "connecting-verify", "connecting-waiting",
               "error", "connected", "reconnecting"],
    "sourceRef": "src/screens/connect/ConnectScreen.tsx", "invRef": "06 §3.1", "entry": True,
    "drift": "zero in-app entry points — kept as deep-link/e2e surface (04 §8.2)"
  },
  {
    "route": "web-request", "page": P_BROWSER, "boardBase": "S/web-request",
    "states": ["waiting", "onboarding", "consent", "unsupported-chain",
               "processing", "done", "error"],
    "sourceRef": "src/app/web-request.tsx", "invRef": "06 §3.2 + 07 §3.6", "entry": True,
    "drift": "shell copy hardcoded English around the localized embedded OnboardingScreen (06 §3.2)"
  },
  {
    "route": "safari-extension", "page": P_BROWSER, "boardBase": "S/safari-extension",
    "states": ["default"],
    "sourceRef": "src/screens/settings/SafariExtensionScreen.tsx", "invRef": "06 §1.3", "entry": False,
    "drift": "iOS-only entry; bespoke CTA (radius 15, opacity press) violates the VelaButton-only mandate (06 §1.3 flag)"
  },
  {
    "route": "settings", "page": P_SETTINGS, "boardBase": "S/settings",
    "states": ["default", "advanced-expanded", "developer-unlocked"],
    "sourceRef": "src/screens/settings/SettingsScreen.tsx", "invRef": "06 §1.1", "entry": False,
    "drift": None
  },
  {
    "route": "about", "page": P_SETTINGS, "boardBase": "S/about",
    "states": ["default"],
    "sourceRef": "src/screens/settings/AboutScreen.tsx", "invRef": "06 §1.2", "entry": False,
    "drift": "still card-heavy legacy styling, not yet migrated to de-containered language (06 §1.2 flag)"
  },
  {
    "route": "onboarding", "page": P_SETTINGS, "boardBase": "S/onboarding",
    "states": ["welcome", "welcome-signin-loading", "create-form", "create-ceremony",
               "create-resume", "create-success", "sync-failure"],
    "sourceRef": "src/screens/onboarding/OnboardingScreen.tsx", "invRef": "06 §2", "entry": False,
    "drift": "WelcomeScreen is the deliberate fixed-dark brand exception (hardcoded #1A1A18, never follows theme)"
  },
  {
    "route": "index", "page": P_SETTINGS, "boardBase": "S/index",
    "states": ["loading"],
    "sourceRef": "src/app/index.tsx", "invRef": "06 §2.1 + 04 §1", "entry": True,
    "drift": "redirect-only boot route — the effective splash (accent spinner on bg.base), then redirects to /wallet or /onboarding"
  },
  {
    "route": "clear-signing-test", "page": P_DEV, "boardBase": "S/clear-signing-test",
    "states": ["default"],
    "sourceRef": "src/screens/settings/ClearSigningTestScreen.tsx", "invRef": "06 §1.4", "entry": True,
    "drift": "scenario icon tints are hardcoded light-mode hexes (06 §5.4 flag)"
  },
  {
    "route": "receipt-harness", "page": P_DEV, "boardBase": "S/receipt-harness",
    "states": ["default"],
    "sourceRef": "src/screens/dev/ReceiptHarnessScreen.tsx", "invRef": "06 §4.1", "entry": True,
    "drift": None
  },
  {
    "route": "parallel", "page": P_DEV, "boardBase": "S/parallel",
    "states": ["loading"],
    "sourceRef": "src/app/parallel/index.tsx", "invRef": "04 §1/§6", "entry": True,
    "drift": "transient loader then redirect — the parallel space reuses every real screen; only the badge differs (04 §6)"
  },
  {
    "route": "parallel/connect", "page": P_DEV, "boardBase": "S/parallel/connect",
    "states": ["default"],
    "sourceRef": "src/app/parallel/connect.tsx", "invRef": "04 §1/§6", "entry": True,
    "drift": "re-export of the real ConnectScreen — draw as instance of S/connect states + PARALLEL SPACE badge"
  }
]

overlays = [
  {
    "name": "app-modal", "page": P_OVERLAYS, "boardBase": "O/app-modal",
    "states": ["ios-pagesheet", "android-rest", "android-dragged", "fit", "web-rest", "web-backdrop"],
    "sourceRef": "src/components/ui/AppModal.tsx", "invRef": "07 §1 / §12"
  },
  {
    "name": "app-alert", "page": P_OVERLAYS, "boardBase": "O/app-alert",
    "states": ["one-button", "two-button", "destructive", "native-placeholder"],
    "sourceRef": "src/components/ui/AppAlert.tsx", "invRef": "07 §2 / §12",
    "drift": "styled dialog is web-only; native shows the OS alert (07 §11.3)"
  },
  {
    "name": "signing-sheet", "page": P_OVERLAYS, "boardBase": "O/signing-sheet",
    "states": ["loading", "clear-signed", "approval-unchosen", "approval-chosen", "approval-revoke",
               "permit", "batch-needs-choice", "batch-ready", "personal-sign", "siwe-mismatch",
               "eth-sign-danger", "blind-typed", "blind-tx", "sim-fail", "gas-estimate-failed",
               "signing", "submitted-pending", "error", "replay-settled", "replay-in-flight"],
    "sourceRef": "src/components/signing/SigningSheet.tsx", "invRef": "07 §3.2 / §12"
  },
  {
    "name": "bundler-funding", "page": P_OVERLAYS, "boardBase": "O/bundler-funding",
    "states": ["topup", "topup-denial-retryable", "topup-denial-non-retryable", "topup-denial-pending-unknown",
               "topup-qr-expanded", "topup-details-expanded", "confirming", "funded", "dapp-variant"],
    "sourceRef": "src/components/ui/BundlerFundingModal.tsx", "invRef": "07 §4.1 / §12",
    "drift": "content-swap inside SigningRequestModal only — standalone wrapper is dead code (07 §11.2)"
  },
  {
    "name": "treasury-bootstrap", "page": P_OVERLAYS, "boardBase": "O/treasury-bootstrap",
    "states": ["default", "copied", "no-retry"],
    "sourceRef": "src/components/ui/TreasuryBootstrapSheet.tsx", "invRef": "07 §4.2 / §12"
  },
  {
    "name": "extension-sign-controller", "page": P_OVERLAYS, "boardBase": "O/extension-sign-controller",
    "states": ["signed", "rejected", "pending-unknown", "expired", "one-tap-enabled"],
    "sourceRef": "src/components/ExtensionSignController.tsx", "invRef": "07 §3.5 / §12",
    "drift": "second bottom-sheet recipe (bg.raised, radius 24, heavy shadow) — intentional system-sheet variant (07 §11.7)"
  },
  {
    "name": "currency-sheet", "page": P_OVERLAYS, "boardBase": "O/currency-sheet",
    "states": ["default", "searching", "empty"],
    "sourceRef": "src/components/ui/CurrencySheet.tsx", "invRef": "07 §5.1 / §12",
    "drift": "legacy card-row selection style — pending ruling vs de-boxed convention (07 §11.1)"
  },
  {
    "name": "network-filter-sheet", "page": P_OVERLAYS, "boardBase": "O/network-filter-sheet",
    "states": ["default", "searching", "with-subtitles", "trigger-all", "trigger-selected"],
    "sourceRef": "src/components/ui/NetworkFilterSheet.tsx", "invRef": "07 §5.2 / §12",
    "drift": "legacy card-row selection style — pending ruling vs de-boxed convention (07 §11.1)"
  },
  {
    "name": "token-selector-sheet", "page": P_OVERLAYS, "boardBase": "O/token-selector-sheet",
    "states": ["default", "searching", "category-filtered", "multi-select", "empty"],
    "sourceRef": "src/components/ui/TokenSelector.tsx", "invRef": "07 §5.3 / §12"
  },
  {
    "name": "add-token-sheet", "page": P_OVERLAYS, "boardBase": "O/add-token-sheet",
    "states": ["form", "resolving", "resolved", "error"],
    "sourceRef": "src/components/ui/AddTokenSheet.tsx", "invRef": "07 §5.4 / §12"
  },
  {
    "name": "contact-picker", "page": P_OVERLAYS, "boardBase": "O/contact-picker",
    "states": ["default", "searching", "typed-address", "groups", "empty"],
    "sourceRef": "src/components/contacts/ContactPicker.tsx", "invRef": "07 §5.5 / §12"
  },
  {
    "name": "contacts-manager", "page": P_OVERLAYS, "boardBase": "O/contacts-manager",
    "states": ["list", "list-searching", "favorites", "form-add", "form-edit", "group-editor"],
    "sourceRef": "src/components/contacts/ContactsManager.tsx", "invRef": "07 §5.6 / §12"
  },
  {
    "name": "batch-import-sheet", "page": P_OVERLAYS, "boardBase": "O/batch-import-sheet",
    "states": ["paste", "parsed-preview", "row-errors", "rate-editing", "nested-currency-picker"],
    "sourceRef": "src/components/send/BatchImportSheet.tsx", "invRef": "07 §5.7 / §12"
  },
  {
    "name": "account-switcher", "page": P_OVERLAYS, "boardBase": "O/account-switcher",
    "states": ["loading", "loaded", "active-row", "privacy-masked", "create-actions", "browser-footer"],
    "sourceRef": "src/components/ui/AccountSwitcherModal.tsx", "invRef": "07 §5.8 / §12"
  },
  {
    "name": "browser-history-sheet", "page": P_OVERLAYS, "boardBase": "O/browser-history-sheet",
    "states": ["empty", "populated", "clear-all-alert"],
    "sourceRef": "src/components/ui/BrowserHistorySheet.tsx", "invRef": "07 §5.9 / §12"
  },
  {
    "name": "transaction-detail-sheet", "page": P_OVERLAYS, "boardBase": "O/transaction-detail-sheet",
    "states": ["pending", "confirmed", "failed", "batch-breakdown"],
    "sourceRef": "src/components/ui/TransactionDetailSheet.tsx", "invRef": "07 §6.1 / §12"
  },
  {
    "name": "connection-event-detail-sheet", "page": P_OVERLAYS, "boardBase": "O/connection-event-detail-sheet",
    "states": ["connect", "message", "typed", "tx", "content-missing"],
    "sourceRef": "src/components/ui/ConnectionEventDetailSheet.tsx", "invRef": "07 §6.2 / §12"
  },
  {
    "name": "balance-detail-sheet", "page": P_OVERLAYS, "boardBase": "O/balance-detail-sheet",
    "states": ["networks-only", "tokens-only", "both", "rate-limited-row", "fix-form-swap", "empty"],
    "sourceRef": "src/components/ui/BalanceDetailSheet.tsx", "invRef": "07 §6.3 / §12"
  },
  {
    "name": "rpc-fix-form", "page": P_OVERLAYS, "boardBase": "O/rpc-fix-form",
    "states": ["empty", "prefilled", "saving", "error"],
    "sourceRef": "src/components/ui/RpcTroubleBanner.tsx", "invRef": "07 §6.4 / §12",
    "drift": "raw #C07A0A amber icon + bespoke accent save button (02 §Z-7)"
  },
  {
    "name": "identicon-viewer", "page": P_OVERLAYS, "boardBase": "O/identicon-viewer",
    "states": ["default", "copied"],
    "sourceRef": "src/components/ui/IdenticonViewerSheet.tsx", "invRef": "07 §6.5 / §12"
  },
  {
    "name": "network-editor", "page": P_OVERLAYS, "boardBase": "O/network-editor",
    "states": ["collapsed", "card-expanded"],
    "sourceRef": "src/screens/settings/SettingsScreen.tsx", "invRef": "07 §7.1 + 06 §1.1",
    "drift": "HealthBadge states (checking/ok/error) drawn inside the expanded board, not separate boards"
  },
  {
    "name": "endpoint-editor", "page": P_OVERLAYS, "boardBase": "O/endpoint-editor",
    "states": ["default", "health-error-states"],
    "sourceRef": "src/screens/settings/SettingsScreen.tsx", "invRef": "07 §7.1 + 06 §1.1",
    "drift": "ServiceHealthBadge has 5 states (checking/ok/not_https/unreachable/invalid_response) — collapsed onto 2 boards"
  },
  {
    "name": "format-picker", "page": P_OVERLAYS, "boardBase": "O/format-picker",
    "states": ["number", "date", "time"],
    "sourceRef": "src/screens/settings/SettingsScreen.tsx", "invRef": "07 §7.1 + 06 §1.1"
  },
  {
    "name": "language-picker", "page": P_OVERLAYS, "boardBase": "O/language-picker",
    "states": ["default"],
    "sourceRef": "src/screens/settings/SettingsScreen.tsx", "invRef": "06 §1.1 (LanguagePickerModal)",
    "drift": "absent from the 07 overlay catalog — added from 06; the natural 15-script i18n stress board; mono-font endonym labels flagged for a ruling"
  },
  {
    "name": "add-network", "page": P_OVERLAYS, "boardBase": "O/add-network",
    "states": ["searching", "checking-compatibility", "result", "error"],
    "sourceRef": "src/screens/settings/SettingsScreen.tsx", "invRef": "07 §7.1 + 06 §1.1",
    "drift": "incompatible-with-deploy-CTA variant drawn inside the result board"
  },
  {
    "name": "rpc-providers", "page": P_OVERLAYS, "boardBase": "O/rpc-providers",
    "states": ["idle", "testing", "results"],
    "sourceRef": "src/screens/settings/RpcProvidersModal.tsx", "invRef": "07 §7.1 + 06 §1.5"
  },
  {
    "name": "onboarding-settings", "page": P_OVERLAYS, "boardBase": "O/onboarding-settings",
    "states": ["normal", "unreachable-warning", "dev"],
    "sourceRef": "src/screens/onboarding/WelcomeScreen.tsx", "invRef": "07 §7.3 / §12",
    "drift": "bespoke 3-button theme picker with accent selection — diverges from SegmentedToggle mandate (06 §5.3)"
  },
  {
    "name": "bug-report", "page": P_OVERLAYS, "boardBase": "O/bug-report",
    "states": ["compose", "compose-steps", "compose-preview", "sending",
               "success-new", "success-deduped", "fallback"],
    "sourceRef": "src/components/ui/BugReportModal.tsx", "invRef": "07 §7.2 / §12"
  },
  {
    "name": "browser-consent", "page": P_OVERLAYS, "boardBase": "O/browser-consent",
    "states": ["favicon", "fallback-logo"],
    "sourceRef": "src/app/browser.tsx", "invRef": "07 §8.1 / §12"
  },
  {
    "name": "browser-error", "page": P_OVERLAYS, "boardBase": "O/browser-error",
    "states": ["default"],
    "sourceRef": "src/app/browser.tsx", "invRef": "07 §8.2 / §12"
  },
  {
    "name": "qr-scanner", "page": P_OVERLAYS, "boardBase": "O/qr-scanner",
    "states": ["scanning-native", "scanning-web", "torch-on", "permission"],
    "sourceRef": "src/components/QRScanner.tsx", "invRef": "07 §10 / §12"
  },
  {
    "name": "receipt-toast", "page": P_OVERLAYS, "boardBase": "O/receipt-toast",
    "states": ["default"],
    "sourceRef": "src/screens/wallet/ReceiptToast.tsx", "invRef": "07 §9.1 / §12"
  },
  {
    "name": "rpc-trouble-banner", "page": P_OVERLAYS, "boardBase": "O/rpc-trouble-banner",
    "states": ["default"],
    "sourceRef": "src/components/ui/RpcTroubleBanner.tsx", "invRef": "07 §9.2 / §12",
    "drift": "single-chain vs N-chain wording carried by the component chains axis"
  },
  {
    "name": "receive-gate", "page": P_OVERLAYS, "boardBase": "O/receive-gate",
    "states": ["default"],
    "sourceRef": "src/screens/wallet/ReceiveScreen.tsx", "invRef": "07 §9.5 / §12"
  },
  {
    "name": "splash", "page": P_OVERLAYS, "boardBase": "O/splash",
    "states": ["default"],
    "sourceRef": "src/components/animated-icon.tsx", "invRef": "07 §9.6 / §12",
    "drift": "Expo-branded placeholder (blue gradient, Expo logo) — record only; must be replaced before store launch (02 F4)"
  },
  {
    "name": "treasury-modal", "page": P_DEV, "boardBase": "O/treasury-modal",
    "states": ["loading", "loaded", "underfunded-rows", "unreachable"],
    "sourceRef": "src/screens/settings/SettingsScreen.tsx", "invRef": "06 §1.1 (TreasuryModal)",
    "drift": "dev-gated (Developer section); absent from the 07 overlay catalog — added from 06"
  },
  {
    "name": "parallel-space-badge", "page": P_DEV, "boardBase": "O/parallel-space-badge",
    "states": ["default"],
    "sourceRef": "src/components/dev/ParallelSpaceBadge.tsx", "invRef": "07 §9.3 / §12",
    "drift": "hardcoded violet #7c3aed — deliberately off-brand and un-themed (03 §6)"
  }
]

components = [
  # --- Primitives ---
  {"name": "C/Primitives/VelaButton",
   "axes": {"variant": ["primary", "secondary", "accent", "destructive"],
            "size": ["default", "compact"],
            "state": ["default", "pressed", "disabled", "loading"]},
   "sourceRef": "src/components/ui/VelaButton.tsx", "invRef": "02 A1",
   "note": "destructive added per 06 §5.5 correction (code overrides accent bg with error.base for Sign Out)"},
  {"name": "C/Primitives/VelaCard",
   "axes": {"elevation": ["default", "elevated"]},
   "sourceRef": "src/components/ui/VelaCard.tsx", "invRef": "02 A2"},
  {"name": "C/Primitives/SectionLabel",
   "axes": {"spacing": ["standalone", "inline", "first-in-sheet"]},
   "sourceRef": "src/components/ui/SectionLabel.tsx", "invRef": "02 A3"},
  {"name": "C/Primitives/TxStatusBadge",
   "axes": {"status": ["pending", "confirmed", "failed"]},
   "sourceRef": "src/components/ui/TxStatusBadge.tsx", "invRef": "02 A5"},
  {"name": "C/Primitives/AmountText",
   "axes": {"mode": ["fiat", "preformatted"],
            "symbol": ["full", "subordinated", "none"],
            "decimals": ["shown", "hidden"],
            "representation": ["full", "compact"]},
   "sourceRef": "src/components/ui/AmountText.tsx", "invRef": "02 A6",
   "note": "text-style recipe, not a frame; tail = 0.56×, hero symbol = 0.58×"},
  {"name": "C/Primitives/Input",
   "axes": {"kind": ["single", "multiline"], "state": ["empty", "filled", "error"]},
   "sourceRef": "src/components/ui/AutoGrowTextInput.tsx", "invRef": "02 A7 + appendix",
   "note": "the shared input recipe (bg.sunken, radius 12, 1px border.base)"},
  {"name": "C/Primitives/ScreenContainer",
   "axes": {},
   "sourceRef": "src/components/ui/ScreenContainer.tsx", "invRef": "02 A10",
   "note": "page template: 24px gutters on bg.base, top safe-area"},
  {"name": "C/Primitives/RpcTroubleBanner",
   "axes": {"chains": ["one", "many"]},
   "sourceRef": "src/components/ui/RpcTroubleBanner.tsx", "invRef": "02 D15"},
  {"name": "C/Primitives/TransactionReceipt",
   "axes": {"status": ["submitted", "confirmed", "failed"],
            "kind": ["single", "split", "multiSelect"],
            "saveContact": ["none", "available", "saved"]},
   "sourceRef": "src/components/ui/TransactionReceipt.tsx", "invRef": "02 E1"},
  {"name": "C/Primitives/RecipientName",
   "axes": {},
   "sourceRef": "src/components/contacts/RecipientName.tsx", "invRef": "03 §5.5"},
  {"name": "C/Primitives/RecipientTrust",
   "axes": {"variant": ["default", "compact", "prominent"], "trust": ["favorite", "resolved"]},
   "sourceRef": "src/components/contacts/RecipientTrust.tsx", "invRef": "03 §5.6"},
  {"name": "C/Primitives/RecipientTypeBadge",
   "axes": {"kind": ["contact", "vela-user", "name-service", "unknown-contract", "unknown-eoa"]},
   "sourceRef": "src/components/contacts/RecipientTypeBadge.tsx", "invRef": "03 §5.7"},
  # --- Controls ---
  {"name": "C/Controls/SegmentedToggle",
   "axes": {"segment": ["active", "inactive"], "badge": ["none", "count"], "icon": ["none", "leading"]},
   "sourceRef": "src/components/ui/SegmentedToggle.tsx", "invRef": "02 B1"},
  {"name": "C/Controls/SlideToConfirmButton",
   "axes": {"state": ["idle", "dragging", "committed", "disabled", "loading"]},
   "sourceRef": "src/components/ui/SlideToConfirmButton.tsx", "invRef": "02 B2"},
  {"name": "C/Controls/VelaRefresh",
   "axes": {"state": ["idle", "pulling", "armed", "refreshing"], "caption": ["none", "status"]},
   "sourceRef": "src/components/ui/VelaRefresh.tsx", "invRef": "02 B3"},
  {"name": "C/Controls/WaveDock",
   "axes": {"element": ["bar", "send", "receive", "fab"], "state": ["default", "pressed"]},
   "sourceRef": "src/components/ui/WaveDock.tsx", "invRef": "02 B4"},
  {"name": "C/Controls/NetworkFilterButton",
   "axes": {"selection": ["all", "chain-selected"]},
   "sourceRef": "src/components/ui/NetworkFilterSheet.tsx", "invRef": "02 B5"},
  {"name": "C/Controls/ConnectionFlowStates",
   "axes": {"state": ["verify", "waiting", "error"]},
   "sourceRef": "src/components/ConnectionFlowStates.tsx", "invRef": "03 §7.1"},
  {"name": "C/Controls/QRScanner",
   "axes": {"state": ["scanning", "torch-on", "permission"], "platform": ["native", "web"]},
   "sourceRef": "src/components/QRScanner.tsx", "invRef": "03 §7.3"},
  {"name": "C/Controls/ReceiveRequestControls",
   "axes": {},
   "sourceRef": "src/components/ReceiveRequestControls.tsx", "invRef": "03 §7.5"},
  # --- Rows ---
  {"name": "C/Rows/TokenRow",
   "axes": {"mode": ["plain", "checkbox-off", "checkbox-on"],
            "masked": ["no", "yes"],
            "contract-chip": ["none", "default", "copied"],
            "fiat": ["yes", "no"],
            "state": ["default", "pressed", "selected"]},
   "sourceRef": "src/components/ui/TokenRow.tsx", "invRef": "02 C1"},
  {"name": "C/Rows/ActivityRow",
   "axes": {"direction": ["in", "out"], "masked": ["no", "yes"], "new": ["none", "glow"],
            "time": ["no", "yes"], "chain-badge": ["yes", "no"]},
   "sourceRef": "src/components/ui/ActivityRow.tsx", "invRef": "02 C2"},
  {"name": "C/Rows/HoldingsList",
   "axes": {"state": ["list", "empty", "no-match", "loading"], "search": ["closed", "open"]},
   "sourceRef": "src/components/ui/HoldingsList.tsx", "invRef": "02 C3"},
  {"name": "C/Rows/TokenSelector",
   "axes": {"mode": ["single", "sweep"], "chip": ["active", "inactive"],
            "list": ["loading", "empty", "results"]},
   "sourceRef": "src/components/ui/TokenSelector.tsx", "invRef": "02 C4"},
  {"name": "C/Rows/FeeTokenSelector",
   "axes": {"row": ["default", "selected", "pending", "insufficient"]},
   "sourceRef": "src/components/ui/FeeTokenSelector.tsx", "invRef": "02 C5"},
  {"name": "C/Rows/GasFeeCard",
   "axes": {"state": ["estimating", "ready", "failed", "refreshing"],
            "expandable": ["yes", "no"], "expanded": ["no", "yes"]},
   "sourceRef": "src/components/ui/GasFeeCard.tsx", "invRef": "02 C6"},
  {"name": "C/Rows/DetailRow",
   "axes": {"trailing": ["none", "copy", "copied", "open"], "face": ["sans", "mono", "custom"]},
   "sourceRef": "src/components/ui/DetailRow.tsx", "invRef": "02 A4"},
  {"name": "C/Rows/ConfirmAssets",
   "axes": {"variant": ["single", "multi-collapsed", "multi-expanded"]},
   "sourceRef": "src/components/send/ConfirmAssets.tsx", "invRef": "03 §4.2"},
  {"name": "C/Rows/FlowArrowSend",
   "axes": {},
   "sourceRef": "src/components/send/FlowArrow.tsx", "invRef": "03 §4.3"},
  {"name": "C/Rows/MultiRecipientEditor",
   "axes": {"recipient-card": ["valid", "invalid"], "footer": ["add-enabled", "cap-reached"]},
   "sourceRef": "src/components/send/MultiRecipientEditor.tsx", "invRef": "03 §4.4"},
  # --- Sheets ---
  {"name": "C/Sheets/AppModal",
   "axes": {"mode": ["pageSheet", "fit"], "platform": ["ios", "android", "web"]},
   "sourceRef": "src/components/ui/AppModal.tsx", "invRef": "02 D1"},
  {"name": "C/Sheets/SheetHeader",
   "axes": {"variant": ["centered", "left-aligned", "text-action"]},
   "sourceRef": "src/components/ui/AppModal.tsx", "invRef": "02 D1b + 07 §1.8"},
  {"name": "C/Sheets/AppAlert",
   "axes": {"buttons": ["one", "two", "three"], "role": ["default", "cancel", "primary", "destructive"]},
   "sourceRef": "src/components/ui/AppAlert.tsx", "invRef": "02 D2"},
  {"name": "C/Sheets/AccountSwitcherModal",
   "axes": {"row": ["active", "inactive"], "balance": ["value", "loading", "masked"],
            "actions": ["none", "create"]},
   "sourceRef": "src/components/ui/AccountSwitcherModal.tsx", "invRef": "02 D3"},
  {"name": "C/Sheets/AddTokenPanel",
   "axes": {"tab": ["erc20", "network"], "result": ["none", "found", "added", "error"],
            "compat": ["pass", "fail"]},
   "sourceRef": "src/components/ui/AddTokenPanel.tsx", "invRef": "02 D5"},
  {"name": "C/Sheets/BalanceDetailSheet",
   "axes": {"sections": ["networks", "tokens", "both", "empty"], "net-row": ["failed", "retrying"]},
   "sourceRef": "src/components/ui/BalanceDetailSheet.tsx", "invRef": "02 D6"},
  {"name": "C/Sheets/BrowserHistorySheet",
   "axes": {"state": ["list", "empty"]},
   "sourceRef": "src/components/ui/BrowserHistorySheet.tsx", "invRef": "02 D7"},
  {"name": "C/Sheets/BugReportModal",
   "axes": {"state": ["compose", "steps-open", "preview-open", "sending", "success", "fallback"]},
   "sourceRef": "src/components/ui/BugReportModal.tsx", "invRef": "02 D8"},
  {"name": "C/Sheets/BundlerFundingView",
   "axes": {"mode": ["topup", "confirming", "funded"], "qr": ["collapsed", "open"],
            "retry": ["none", "available", "retrying"]},
   "sourceRef": "src/components/ui/BundlerFundingModal.tsx", "invRef": "02 D9",
   "note": "surface axis removed — standalone wrapper is dead code; dApp content-swap only"},
  {"name": "C/Sheets/ConnectionEventDetailSheet",
   "axes": {"kind": ["connect", "message", "typed", "tx"], "content": ["present", "missing"],
            "copied": ["no", "yes"]},
   "sourceRef": "src/components/ui/ConnectionEventDetailSheet.tsx", "invRef": "02 D10"},
  {"name": "C/Sheets/CurrencySheet",
   "axes": {"row": ["default", "selected"], "search": ["empty", "active", "no-match"]},
   "sourceRef": "src/components/ui/CurrencySheet.tsx", "invRef": "02 D11"},
  {"name": "C/Sheets/IdenticonViewerSheet",
   "axes": {"copy": ["default", "copied"]},
   "sourceRef": "src/components/ui/IdenticonViewerSheet.tsx", "invRef": "02 D13"},
  {"name": "C/Sheets/NetworkFilterSheet",
   "axes": {"row": ["all", "chain"], "selected": ["no", "yes"], "search": ["closed", "open"]},
   "sourceRef": "src/components/ui/NetworkFilterSheet.tsx", "invRef": "02 D14"},
  {"name": "C/Sheets/RpcFixForm",
   "axes": {"state": ["default", "saving", "disabled"]},
   "sourceRef": "src/components/ui/RpcTroubleBanner.tsx", "invRef": "02 D15"},
  {"name": "C/Sheets/TransactionDetailSheet",
   "axes": {"kind": ["single-out", "single-in", "split", "multiSelect"],
            "status": ["pending", "confirmed", "failed"],
            "counterparty": ["named", "address-only"]},
   "sourceRef": "src/components/ui/TransactionDetailSheet.tsx", "invRef": "02 D17"},
  {"name": "C/Sheets/TreasuryBootstrapSheet",
   "axes": {"footer": ["retry", "close"], "copied": ["no", "yes"]},
   "sourceRef": "src/components/ui/TreasuryBootstrapSheet.tsx", "invRef": "02 D18"},
  {"name": "C/Sheets/BatchImportSheet",
   "axes": {"unit": ["fiat", "token"], "state": ["paste", "preview", "row-errors", "over-cap"]},
   "sourceRef": "src/components/send/BatchImportSheet.tsx", "invRef": "03 §4.1"},
  {"name": "C/Sheets/ContactPicker",
   "axes": {"state": ["default", "searching", "typed-address", "groups", "empty", "loading"]},
   "sourceRef": "src/components/contacts/ContactPicker.tsx", "invRef": "03 §5.2"},
  {"name": "C/Sheets/ContactsManager",
   "axes": {"view": ["list", "form", "group-editor"], "search": ["closed", "open"],
            "segmented": ["all", "favorites"]},
   "sourceRef": "src/components/contacts/ContactsManager.tsx", "invRef": "03 §5.3/§5.4"},
  {"name": "C/Sheets/ExtensionSignSheet",
   "axes": {"outcome": ["signed", "rejected", "expired", "unknown", "one-tap-enabled"]},
   "sourceRef": "src/components/ExtensionSignController.tsx", "invRef": "03 §7.8"},
  # --- Signing ---
  {"name": "C/Signing/SigningSheet",
   "axes": {"view": ["loading", "clear-sign", "approval", "permit", "message",
                     "eth-sign", "blind-typed", "blind-tx", "batch"],
            "phase": ["default", "resolving", "gas-estimating", "fee-busy", "estimate-failed",
                      "signing", "submitted-pending", "error", "read-only-replay", "funding-swap"]},
   "sourceRef": "src/components/signing/SigningSheet.tsx", "invRef": "03 §1.1",
   "note": "composition root; boards live under O/signing-sheet — not every axis cross-product is a board"},
  {"name": "C/Signing/DAppBanner",
   "axes": {"icon": ["image", "monogram"]},
   "sourceRef": "src/components/signing/DAppBanner.tsx", "invRef": "03 §2.1"},
  {"name": "C/Signing/SigningAccountRow",
   "axes": {"state": ["collapsed", "expanded"]},
   "sourceRef": "src/components/signing/DAppBanner.tsx", "invRef": "03 §2.1"},
  {"name": "C/Signing/IntentHeader",
   "axes": {"variant": ["eyebrow", "hero"], "tone": ["neutral", "danger", "revoke"]},
   "sourceRef": "src/components/signing/IntentHeader.tsx", "invRef": "03 §2.2"},
  {"name": "C/Signing/SummaryLine",
   "axes": {"tone": ["default", "caution", "danger"]},
   "sourceRef": "src/components/signing/SummaryLine.tsx", "invRef": "03 §2.3"},
  {"name": "C/Signing/TokenCard",
   "axes": {"variant": ["send", "receive", "caution", "danger"],
            "layout": ["hero", "row", "tinted-card"]},
   "sourceRef": "src/components/signing/TokenCard.tsx", "invRef": "03 §2.4"},
  {"name": "C/Signing/FlowArrow",
   "axes": {"variant": ["default", "danger"]},
   "sourceRef": "src/components/signing/TokenCard.tsx", "invRef": "03 §2.4"},
  {"name": "C/Signing/ContractBar",
   "axes": {"kind": ["auto", "contract", "asset"], "variant": ["default", "warning"],
            "badge": ["none", "wallet", "contract", "verified"]},
   "sourceRef": "src/components/signing/ContractBar.tsx", "invRef": "03 §2.5"},
  {"name": "C/Signing/WarningBanner",
   "axes": {"severity": ["caution", "danger"]},
   "sourceRef": "src/components/signing/WarningBanner.tsx", "invRef": "03 §2.6"},
  {"name": "C/Signing/GenericFieldRow",
   "axes": {"state": ["default", "warning", "expired"]},
   "sourceRef": "src/components/signing/WarningBanner.tsx", "invRef": "03 §2.6"},
  {"name": "C/Signing/AdvancedPanel",
   "axes": {"state": ["collapsed", "expanded"]},
   "sourceRef": "src/components/signing/AdvancedPanel.tsx", "invRef": "03 §2.7"},
  {"name": "C/Signing/EditableApproveCard",
   "axes": {"shape": ["amount", "boolean-grant"],
            "choice": ["requested", "balance", "custom", "revoke", "grant-anyway"],
            "state": ["default", "editing", "error"]},
   "sourceRef": "src/components/signing/EditableApproveCard.tsx", "invRef": "03 §2.8"},
  {"name": "C/Signing/BalanceChangePreview",
   "axes": {"state": ["expected-fail", "underfunded", "quiet-ok", "changes-list"],
            "unverified-row": ["no", "yes"]},
   "sourceRef": "src/components/signing/BalanceChangePreview.tsx", "invRef": "03 §2.9"},
  # --- Media ---
  {"name": "C/Media/Identicon",
   "axes": {"size": ["18", "32", "40", "44", "220"]},
   "sourceRef": "src/components/ui/Identicon.tsx", "invRef": "02 A8"},
  {"name": "C/Media/WalletAvatar",
   "axes": {"style": ["initial", "identicon"], "size": ["20", "32", "38", "40", "44"]},
   "sourceRef": "src/components/ui/WalletAvatar.tsx", "invRef": "02 A9",
   "note": "size 20 added per 05 §11.3 correction (browser account pill, letterSize 11)"},
  {"name": "C/Media/ContactAvatar",
   "axes": {"mode": ["tinted-initial", "identicon"],
            "size": ["18", "20", "28", "32", "36", "38", "40", "42", "64"],
            "badge": ["none", "account"]},
   "sourceRef": "src/components/contacts/ContactAvatar.tsx", "invRef": "03 §5.1"},
  {"name": "C/Media/TokenLogo",
   "axes": {"badge": ["none", "chain"], "fallback": ["image", "letter-disc"],
            "size": ["20", "24", "28", "30", "32", "36", "40", "44", "46", "52"]},
   "sourceRef": "src/components/TokenLogo.tsx", "invRef": "03 §7.6"},
  {"name": "C/Media/ChainLogo",
   "axes": {"fallback": ["image", "colored-disc"]},
   "sourceRef": "src/components/ChainLogo.tsx", "invRef": "03 §7.7"},
  {"name": "C/Media/QRCode",
   "axes": {"size": ["72", "120", "132", "140", "180", "196", "200"]},
   "sourceRef": "src/components/QRCode.tsx", "invRef": "03 §7.2",
   "note": "always black-on-white; hosts pin a #FFFFFF plate in both themes"},
  {"name": "C/Media/ReceiveShareCard",
   "axes": {"variant": ["request", "address"]},
   "sourceRef": "src/components/ReceiveShareCard.tsx", "invRef": "03 §7.4",
   "note": "always-light hardcoded share card; web canvas twin must stay in sync"},
  {"name": "C/Media/ParallelSpaceBadge",
   "axes": {},
   "sourceRef": "src/components/dev/ParallelSpaceBadge.tsx", "invRef": "03 §6"}
]

exclusions = [
  {"surface": "route /history",
   "reason": "Dead registration — <Stack.Screen name=\"history\"> in src/app/_layout.tsx has no route file; History merged into Home's Activity tab (04 §8.1). Do not draw."},
  {"surface": "route /sign (src/app/sign.tsx)",
   "reason": "Headless trampoline — renders one frame of app background and hands rid to ExtensionSignController; its UX is O/signing-sheet + O/extension-sign-controller (04 §1)."},
  {"surface": "src/app/_layout.tsx, src/app/(tabs)/_layout.tsx, src/app/parallel/_layout.tsx",
   "reason": "Navigator layouts — no visual surface of their own (headers hidden app-wide, tab bar hidden; 04 §1/§2)."},
  {"surface": "src/app/+html.tsx",
   "reason": "Web HTML shell wrapper, not a route (04 §1)."},
  {"surface": "BundlerFundingModal standalone wrapper",
   "reason": "Dead code — zero imports of the AppModal wrapper; only the BundlerFundingView content-swap inside SigningRequestModal is live (02 D9 ⚠, 07 §11.2). Boarded as O/bundler-funding."},
  {"surface": "Safari Web Extension UI (targets/safari, packages/safari-extension)",
   "reason": "Separate extension target outside the RN app; not covered by inventory 02–08. The in-app halves (S/safari-extension guide, O/extension-sign-controller) ARE boarded."},
  {"surface": "safe-recovery-extension (packages/safe-recovery-extension)",
   "reason": "Separate recovery-extension surface outside the app; out of scope for this design source."},
  {"surface": "app-browser-extension/chrome-ext-webauthn-proxy",
   "reason": "Dev-tooling browser extension living in the repo; not an app surface."},
  {"surface": "MockSigningModal (ClearSigningTestScreen harness modal)",
   "reason": "Hosts the production SigningSheet with mock data — identical to O/signing-sheet by mandate (07 §3.4); the scenario list itself is S/clear-signing-test/default."},
  {"surface": "SigningReplaySheet",
   "reason": "Thin AppModal wrapper — boarded as O/signing-sheet/replay-settled and /replay-in-flight (07 §3.3, 02 D16)."},
  {"surface": "IdenticonViewerProvider",
   "reason": "Behavioral host only, no visuals (02 D12); the sheet is boarded as O/identicon-viewer."},
  {"surface": "Copy-feedback pattern (hooks/use-copy-feedback)",
   "reason": "In-place icon/label swap, not an overlay surface (07 §9.4); documented on the 09 Patterns page instead."},
  {"surface": "Legacy components: ThemedText / ThemedView / Collapsible",
   "reason": "Expo-template leftovers on the legacy palette — excluded from the library (02 F1–F3)."},
  {"surface": "AnimatedIcon / AnimatedSplashOverlay as a library component",
   "reason": "Expo-branded placeholder splash — recorded once as O/splash for the audit trail, excluded from the component library; must be replaced before store launch (02 F4)."},
  {"surface": "vela.* console fault-injection / metrics consoles",
   "reason": "Console-only dev surfaces, no UI to board (04 §6)."}
]

entries = [
  "S/index", "S/connect", "S/pay", "S/web-request",
  "S/clear-signing-test", "S/receipt-harness", "S/parallel", "S/parallel/connect"
]

manifest = {
  "generatedFrom": {"gitRevision": GIT_REV, "date": DATE},
  "screens": screens,
  "overlays": overlays,
  "components": components,
  "exclusions": exclusions,
  "entries": entries,
}

# --- sanity: entry flags match entries list ---
flagged = {s["boardBase"] for s in screens if s["entry"]}
assert flagged == set(entries), (flagged, set(entries))

# --- counts ---
n_screens = len(screens)
n_screen_boards = sum(len(s["states"]) for s in screens)
n_overlays = len(overlays)
n_overlay_boards = sum(len(o["states"]) for o in overlays)
n_components = len(components)
def variants(c):
    vals = [len(v) for v in c["axes"].values()]
    return reduce(lambda a, b: a * b, vals, 1)
n_variants = sum(variants(c) for c in components)
n_exclusions = len(exclusions)

os.makedirs(OUT_DIR, exist_ok=True)
with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)
    f.write("\n")

# --- coverage.md ---
def axes_str(c):
    return " × ".join(f"{k}({'/'.join(v)})" for k, v in c["axes"].items()) or "— (single main instance)"

lines = []
lines.append("# Coverage matrix — Penpot design source (generated with manifest.json)")
lines.append("")
lines.append(f"Pinned to git revision **`{GIT_REV}`** (branch `002-penpot-design-source`), generated {DATE} from inventory 02–08 + the `src/app/` route tree. Data source of truth: `generator/manifest.json` — this file is its human-readable rendering. Zero blank cells: every route, overlay and component is either boarded below or listed under Exclusions.")
lines.append("")
lines.append("## Screens (rows = routes, cells = planned boards, one per required state)")
lines.append("")
lines.append("| Route | Page | Entry | Boards (one per state) | Source | Inv | Drift |")
lines.append("|---|---|---|---|---|---|---|")
for s in screens:
    boards = "<br>".join(f"`{s['boardBase']}/{st}`" for st in s["states"])
    drift = s["drift"] or "—"
    entry = "entry" if s["entry"] else ""
    lines.append(f"| {s['route']} | {s['page']} | {entry} | {boards} | `{s['sourceRef']}` | {s['invRef']} | {drift} |")
lines.append("")
lines.append(f"**{n_screens} screens · {n_screen_boards} screen boards.**")
lines.append("")
lines.append("## Overlays (rows = overlay surfaces, cells = planned boards)")
lines.append("")
lines.append("| Overlay | Page | Boards (one per state) | Source | Inv | Drift |")
lines.append("|---|---|---|---|---|---|")
for o in overlays:
    boards = "<br>".join(f"`{o['boardBase']}/{st}`" for st in o["states"])
    drift = o.get("drift") or "—"
    lines.append(f"| {o['name']} | {o['page']} | {boards} | `{o['sourceRef']}` | {o['invRef']} | {drift} |")
lines.append("")
lines.append(f"**{n_overlays} overlays · {n_overlay_boards} overlay boards.**")
lines.append("")
lines.append("## Components (library, page `03 Components`; axes as Penpot variants)")
lines.append("")
lines.append("| Component | Variant axes | Variants | Source | Inv |")
lines.append("|---|---|---|---|---|")
for c in components:
    note = f" — {c['note']}" if c.get("note") else ""
    lines.append(f"| {c['name']} | {axes_str(c)}{note} | {variants(c)} | `{c['sourceRef']}` | {c['invRef']} |")
lines.append("")
lines.append(f"**{n_components} components · {n_variants} variants** (axis cross-products; composition roots like SigningSheet board only their documented states, not the full product).")
lines.append("")
lines.append("## Exclusions (documented non-boards — the audit treats these cells as `excluded:<reason>`)")
lines.append("")
lines.append("| Surface | Reason |")
lines.append("|---|---|")
for e in exclusions:
    lines.append(f"| {e['surface']} | {e['reason']} |")
lines.append("")
lines.append("## Entry boards (reachable only via deep link / boot / dev entry — excused from the S/home/default BFS, data-model §6)")
lines.append("")
for en in entries:
    lines.append(f"- `{en}`")
lines.append("")
lines.append("## Notes / open judgment calls")
lines.append("")
lines.append("1. **Home tabs modeled as home states** (`S/home/assets`, `S/home/connections-*`): the SegmentedToggle is screen state, not routing (04 §2) — no separate routes exist.")
lines.append("2. **Receive warning gate** and **browser load-error/consent** live as overlay boards (07 §12), not screen states, to avoid double-boarding.")
lines.append("3. **network-editor / endpoint-editor state granularity** is a judgment call — 07 §12 lists them as single cells; health-badge sub-states are drawn inside the boards.")
lines.append("4. **VelaButton `destructive`** variant added per 06 §5.5 proposal (code today overrides accent bg with error.base).")
lines.append("5. **language-picker and treasury-modal** are missing from the 07 catalog and were added from inventory 06 (flagged as drift).")
lines.append("6. **SigningSheet component axes** (view × phase) are derived from 03 §1.1's state list — 03 proposes no explicit axis line; boards follow 07 §12's 20-state checklist instead of the cross-product.")
lines.append("7. **Size axes for ContactAvatar / TokenLogo / QRCode** are derived from documented usage sites, not an explicit inventory proposal.")
lines.append("")

with open(os.path.join(OUT_DIR, "coverage.md"), "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print(json.dumps({
  "screens": n_screens, "screenBoards": n_screen_boards,
  "overlays": n_overlays, "overlayBoards": n_overlay_boards,
  "components": n_components, "variants": n_variants,
  "exclusions": n_exclusions, "entries": len(entries)
}, indent=2))
