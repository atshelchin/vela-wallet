// 40-ia-route-tree.js — T021: route tree + route table + deep links on `04 IA & Flows`. inv:04 §1-§4.
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
  const { board: b } = await lib.upsertBoard(PAGE, 'D/ia/route-tree', lib.docGeom(0, 0, 1000));
  title(b, 'IA/tree-title', 24, 'Navigation topology (expo-router; anchor = wallet home)');
  blob(b, 'IA/tree', 64, [
'ROOT STACK (headerless; anchor = (tabs); remounts on theme/language change)',
'│',
'├── (tabs) — Tabs navigator, BAR HIDDEN (no bottom tab bar exists)',
'│   ├── /wallet ◄ HOME & universal anchor',
'│   │     in-screen SegmentedToggle: Activity | Assets | Connections',
'│   │     bottom WaveDock: Receive · Scan(FAB) · Send',
'│   ├── /connect (deep-link/URL only; X → /wallet)',
'│   └── /settings (from Home gear; X → /wallet)',
'│',
'├── /onboarding (plain full-screen; welcome ⇄ create steps)',
'│',
'├── MODALS (slide-up card over anchor)',
'│   ├── /send (select-token → details → confirm → receipt)',
'│   ├── /receive (Address | Payment-request toggle)',
'│   ├── /token-detail   ├── /add-token',
'│   ├── /about (6-tap logo → dev_unlocked)',
'│   └── /safari-extension (iOS only)',
'│',
'├── PUSH (default card, auto-registered)',
'│   ├── /browser?url= (in-app dApp browser; non-modal so global sheet overlays it)',
'│   ├── /pay?to&chain… (payment-link bridge)',
'│   └── /clear-signing-test · /receipt-harness (dev-gated)',
'│',
'├── TRAMPOLINES: /sign?rid= (→ ExtensionSignController overlay, then back)',
'│               /web-request?session= (web popup; self-closing)',
'│',
'├── /parallel (dev group) → arms fixture wallet → Redirect /wallet',
'│   └── /parallel/connect (real ConnectScreen, fixture signer)',
'│',
'└── ALWAYS-MOUNTED GLOBAL OVERLAYS (above every route):',
'    SigningRequestModal · ExtensionSignController · ParallelSpaceBadge',
'    AlertProvider (AppAlert) · IdenticonViewer · AccountFileWriter (headless)',
  ].join('\n'));
  lib.chip(b, 'note', 'dead registration: /history modal registered with NO route file — do not draw (Activity tab replaced it)');
  lib.chip(b, 'note', 'invariant: anchor-behind-everything — dismissing any overlay lands on /wallet, never a dead end');
}

{
  const { board: b } = await lib.upsertBoard(PAGE, 'D/ia/routes', lib.docGeom(0, 1, 1000));
  title(b, 'IA/routes-title', 24, 'Route table — presentation & gates');
  blob(b, 'IA/routes', 64, [
'ROUTE                 PRESENTATION      GATE            SCREEN',
'/                     redirect+spinner  —               → /wallet | /onboarding',
'/wallet               tab (hidden bar)  —               HomeScreen',
'/connect              tab               wallet exists   ConnectScreen (deep-link only)',
'/settings             tab               —               SettingsScreen',
'/onboarding           plain full-screen —               OnboardingScreen',
'/send                 MODAL             —               SendScreen (4-step state machine)',
'/receive              MODAL             —               ReceiveScreen',
'/token-detail         MODAL             —               TokenDetailScreen (query params)',
'/add-token            MODAL             —               AddTokenScreen',
'/about                MODAL             —               AboutScreen',
'/safari-extension     MODAL (iOS row)   —               SafariExtensionScreen',
'/sign                 trampoline        —               (headless → sign overlay)',
'/web-request          plain, web-only   —               WebRequestScreen (7 phases)',
'/browser              PUSH              —               BrowserScreen (native only)',
'/pay                  PUSH              —               PayScreen (invalid-link state)',
'/clear-signing-test   PUSH              __DEV__|unlock  ClearSigningTestScreen',
'/receipt-harness      PUSH (URL only)   __DEV__|unlock  ReceiptHarnessScreen',
'/parallel             dev group         __DEV__|unlock  fixture loader → /wallet',
'/parallel/connect     dev               __DEV__|unlock  ConnectScreen (fixture)',
  ].join('\n'));
  lib.chip(b, 'note', 'all headers screen-owned (headerShown:false everywhere); X closes surface root, ArrowLeft steps back within a flow');
}

{
  const { board: b } = await lib.upsertBoard(PAGE, 'D/ia/deep-links', lib.docGeom(1100, 0, 560));
  title(b, 'IA/dl-title', 24, 'Inbound URLs & deep links (scheme velawallet://)');
  blob(b, 'IA/dl', 64, [
'1. velawallet://sign?rid=<uuid>            Safari-extension sign hand-off → /sign trampoline',
'2. https://getvela.app/sign?rid=<uuid>     iOS Universal Link (NOT expo-router; AccountFileWriter listens);',
'                                           rid=ul-selftest = attestation probe',
'3. velawallet://browser?url=<https-url>    opens dApp browser (http(s) re-validated; never file:/javascript:)',
'4. https://wallet.getvela.app/pay?to&…     payment links (native base) / <origin>/pay on web',
'5. velawallet://onboarding?mode=create     jump straight to create-wallet form',
'6. ethereum:… (EIP-681)                    NOT OS-registered; consumed via QR scanner/paste → /send prefilled+locked',
'7. velawallet://parallel/connect           e2e/dev entry to parallel-space Connect',
'8. velawallet://expo-development-client/…  dev builds only',
'9. /web-request?session=<id>               web popup from Vela SDK (MessageChannel handshake)',
'',
'Android gap: scheme only, NO App Links configured (iOS-only UL parity) — flagged inv:04 §8.4',
  ].join('\n'));
}
return lib.done('40-ia-route-tree', { created });
