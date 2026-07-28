// 41-ia-flows.js — T022: labeled flow edges + nav conventions on `04 IA & Flows`. inv:04 §5 §7 §8.
// Every edge names its concrete trigger (US3-AS3). Machine format: <source> —<trigger>→ <destination>.
if (!storage.lib) throw new Error('run 10-lib.js first');
const lib = storage.lib;
const PAGE = '04 IA & Flows';
let created = 0;
const blob = (board, name, y, text, o) => {
  const s = Object.assign({ size: 10, weight: 500, zone: 'mono', color: '#1A1A18', x: 24, y, growType: 'auto-height' }, o || {});
  const r = lib.upsertText(board, name, { ...s, text });
  if (r.created) created++;
  const t = r.text;
  if (Math.round(t.width) !== 752) { t.resize(752, 20); t.growType = 'auto-height'; }
  return r;
};
const title = (b, n, y, t) => blob(b, n, y, t, { size: 20, weight: 700, zone: 'sans' });

{
  const { board: b } = await lib.upsertBoard(PAGE, 'D/ia/flows', lib.docGeom(1100, 1, 1720));
  title(b, 'IA/flows-title', 24, 'Screen flows — every edge names its trigger');
  blob(b, 'IA/flows', 64, [
'BOOT',
'/ —wallet exists→ /wallet    / —no wallet→ /onboarding',
'settings —tap Sign out + confirm→ LOGOUT → /onboarding',
'',
'ONBOARDING',
'welcome —tap Create wallet→ create step (same route, local state)',
'welcome —tap I already have a wallet→ passkey authenticate → /wallet',
'welcome —passkey-index 404→ two-signature recovery offer (AppAlert) → recover → /wallet',
'welcome —gear tap→ OnboardingSettingsModal (auto-opens after 3 failed index health probes)',
'create —passkey created + proof + key upload + tap Enter→ /wallet (upload-failed: retry/start-over/bug-report/enter-anyway)',
'deep link ?mode=create —skips welcome→ create step',
'',
'HOME (/wallet)',
'home —tap account chip→ AccountSwitcherModal (single account: tap = copy address)',
'home —tap avatar→ IdenticonViewer zoom overlay',
'home —tap gear→ /settings        home —tap balance number→ privacy mask toggle (in place)',
'home —tap stale-balance row→ BalanceDetailSheet —row tap→ RpcFixModal',
'home —tap RpcTroubleBanner Fix→ RpcFixModal',
'home —tap network filter→ NetworkFilterSheet',
'home —tap WaveDock Receive→ /receive    —tap WaveDock Send→ /send    —tap Scan FAB→ QRScanner overlay',
'scanner —EIP-681 w/ chain→ /send (prefilled+locked)    —bare address→ /send?prefilledRecipient',
'scanner —WalletPair URI→ connect inline + Connections tab    —web URL→ /browser?url    —else→ invalid-QR alert',
'home activity —row tap→ TransactionDetailSheet | SigningReplaySheet (past dApp sig) | ConnectionEventDetailSheet',
'home assets —token row tap→ /token-detail    —tap + Add token→ /add-token    —empty-state CTA→ /receive',
'home connections —tap Connect→ QRScanner    —history row → BrowserHistorySheet —open→ /browser?url',
'home connections —tap disconnect + confirm→ session closed',
'',
'SEND (/send — single route, 4-step state machine)',
'select-token —tap X→ close    —tap token row→ enter-details',
'enter-details —tap ArrowLeft→ select-token    —tap contact icon→ ContactPicker sheet    —tap row QR→ QRScanner',
'enter-details —split/sweep toggles→ multi-mode    —tap import→ BatchImportSheet',
'enter-details —valid input + tap Continue→ confirm',
'confirm —tap fee row→ FeeTokenSelector sheet    —edge:relayer float depleted→ TreasuryBootstrapSheet',
'confirm —slide to confirm→ receipt (TransactionReceipt replaces screen)',
'receipt —tap Done→ back to home    —tap Save contact→ contact saved',
'',
'RECEIVE (/receive)   —SegmentedToggle→ Address | Payment request',
'address —tap copy→ copied toast    payment —form + generate→ EIP-681 QR + share link/card',
'',
'TOKEN DETAIL —tap Send→ /send (preselected)    —tap Receive→ /receive    —tap ArrowLeft→ back',
'',
'SETTINGS rows: Account→AccountSwitcherModal · Contacts→ContactsManager · Feedback→BugReportModal',
'· [iOS] Safari Extension→/safari-extension · Language→LanguagePickerModal · Currency→CurrencySheet',
'· Number/Date/Time→FormatPickerModal ×3 · Advanced: Networks→NetworkEditorModal, RPC→RpcProvidersModal,',
'  Add Network→AddNetworkModal, Endpoints→EndpointEditorModal · Developer(gated): Treasury→TreasuryModal,',
'  Clear Signing→/clear-signing-test · About→/about · Sign out→confirm→LOGOUT',
'',
'ABOUT —logo ×6 taps in 3s→ dev_unlocked=1 (+success haptic; unlocks dev routes + parallel)',
'',
'CONNECT —tap Scan QR→ QRScanner    —paste link→ URI routing    —tap X→ /wallet',
'',
'BROWSER —tap ArrowLeft→ web history back (Android hardware back same)    —account pill tap→ switcher footer',
'browser —tap Close browser (switcher footer)→ back    —dApp request→ global SigningRequestModal above',
'browser —connect request→ consent fit-sheet (AppModal)',
'',
'PAY —tap Open in Vela→ /send (locked prefill)    —tap Pay another way→ QR/URI/manual expand',
'',
'GLOBAL SIGNING (no route): dApp request from WalletPair/bridge/browser/extension/web popup',
'→ SigningRequestModal sheet over ANY screen —slide to confirm→ result —dismiss→ reject',
  ].join('\n'));
}

{
  const { board: b } = await lib.upsertBoard(PAGE, 'D/ia/conventions', lib.docGeom(1760, 0, 620));
  title(b, 'IA/conv-title', 24, 'Navigation chrome conventions & anomalies');
  blob(b, 'IA/conv', 64, [
'HEADER PATTERN (every modal/pushed screen): [icon button] [title] [spacer], hitSlop 8',
'X  = closes a self-contained surface at its root (Send step 1, Settings, Connect)',
'ArrowLeft = steps back WITHIN a flow (Send steps 2-3, Token-detail, About, Add-token)',
'Full-page peers (Settings/Connect): top-right X → /wallet. Modals: top-left control.',
'Sheets = AppModal (focus-trapped on web, Escape closes). Confirms = AppAlert.',
'',
'ANOMALIES (from inv:04 §8 — a rebuild must know these):',
'1. /history modal registered with NO file — dead; Activity tab replaced History.',
'2. /connect has ZERO in-app entry points — kept as deep-link/e2e surface.',
'3. /browser /pay /clear-signing-test /receipt-harness rely on implicit default-push.',
'4. iOS has Universal Links (getvela.app/sign); Android has NO App Links (parity gap).',
'5. /web-request is web-deployment-only (imports vela-sdk, uses window).',
'6. Back-stack safety: some screens use useSafeRouter (fallback /wallet); raw router.back()',
'   is safe only because those screens are always pushed — preserve the anchor invariant.',
  ].join('\n'));
}
return lib.done('41-ia-flows', { created });
