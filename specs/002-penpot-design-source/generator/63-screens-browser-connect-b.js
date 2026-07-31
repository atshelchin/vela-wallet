if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
// 63-screens-browser-connect-b.js — page '06 Screens · Browser & Connect', screen row 0 = S/browser.
// States in this chunk: insecure-origin (col 3) · preparing-wallet (col 4) · no-wallet (col 5) ·
// unsupported (col 6) · no-url (col 7).  Spec: inv:05 §11.1 (security indicator), §11.5 (centre
// states + chrome-less fallbacks), §11.6 (per-origin invariants). Copy = connect.browser.* / connect.list.noWallet.
const lib = storage.lib;
const PAGE = '06 Screens · Browser & Connect';
const ROW = 0;

const BG = '#FAFAF8', RAISED = '#FFFFFF', SUNKEN = '#F5F3EF';
const INK = '#1A1A18', MUTED = '#6E6B62', SUBTLE = '#8C887E';
const BORDER = '#ECEBE4';
const ACCENT = '#E8572A', SUCCESS = '#2D8E5F', WARN = '#92600A';

const missing = [];
const T = (b, n, s) => lib.upsertText(b, n, s).text;
const R = (b, n, s) => lib.upsertRect(b, n, s).rect;
const E = (b, name, d, x, y, o) => {
  const n = lib.norm(name);
  let e = penpotUtils.findShape(s => s.name === n && s.type === 'ellipse', b);
  if (!e) { e = penpot.createEllipse(); e.name = name; b.appendChild(e); }
  if (Math.round(e.width) !== d || Math.round(e.height) !== d) e.resize(d, d);
  penpotUtils.setParentXY(e, x, y);
  e.fills = (o && o.fill) ? [{ fillColor: o.fill, fillOpacity: o.fillOpacity != null ? o.fillOpacity : 1 }] : [];
  e.strokes = (o && o.stroke) ? [{ strokeColor: o.stroke, strokeWidth: o.sw || 2 }] : [];
  if (o && o.opacity != null) e.opacity = o.opacity;
  return e;
};
const ICON = (b, lucide, size, sw, col, x, y, sfx) => {
  const { rect } = lib.upsertRect(b, 'icon:' + lucide + ' ' + size + '/' + sw + (sfx ? ' ' + sfx : ''),
    { x, y, w: size, h: size, stroke: col, strokeWidth: sw });
  rect.fills = [];
  return rect;
};
const HAIR = (b, n, x, y, w) => R(b, n, { x, y, w, h: 1, fill: BORDER });
const tw = (s, size, bold) => Math.round(s.length * size * (bold ? 0.58 : 0.53));
const cx = (s, size, bold, left, width) => Math.round(left + (width - tw(s, size, bold)) / 2);
const INST = (b, family, props, x, y, o) => {
  o = o || {};
  const nm = o.name || ('i:' + family.split('/').pop() + (props ? ' ' + Object.values(props).join(' ') : ''));
  const ph = 'MISSING:' + family;
  let inst = penpotUtils.findShape(s => s.name === lib.norm(nm), b);
  if (inst) { penpotUtils.setParentXY(inst, x, y); }
  else {
    inst = lib.instance(family, props, b, x, y);
    if (inst) { try { inst.name = nm; } catch (e) {} }
  }
  if (!inst) {
    missing.push(family);
    R(b, ph, { x, y, w: o.w || 342, h: o.h || 53, radius: 8, fill: '#FEF2F2', stroke: '#C62828', strokeWidth: 1 });
    T(b, ph + ' label', { text: 'MISSING ' + family, size: 9, weight: 600, color: '#C62828', x: x + 8, y: y + 8 });
    return null;
  }
  const st1 = penpotUtils.findShape(s => s.name === lib.norm(ph), b); if (st1) st1.remove();
  const st2 = penpotUtils.findShape(s => s.name === lib.norm(ph + ' label'), b); if (st2) st2.remove();
  if (o.w) { try { inst.resize(o.w, o.h || Math.round(inst.height)); } catch (e) {} }
  if (o.label) { try { const ts = penpotUtils.findShapes(s => s.type === 'text', inst); if (ts && ts.length) ts[0].characters = o.label; } catch (e) {} }
  return inst;
};
const screen = async (name, col) =>
  (await lib.upsertBoard(PAGE, name, { x: col * 450, y: ROW * 950, w: 390, h: 844, fill: BG })).board;

const TOPBAR_END = 85, BAR_TOP = 774;
const statusBar = (b) => {
  T(b, 'deco:status-time', { text: '9:41', size: 13, weight: 600, color: INK, x: 28, y: 17 });
  const s = R(b, 'deco:status-indicators (cellular · wifi · battery)', { x: 302, y: 18, w: 64, h: 12, radius: 2, fill: INK });
  s.opacity = 0.35;
};
const homeIndicator = (b) => {
  const h = R(b, 'deco:home-indicator', { x: 127, y: 830, w: 136, h: 5, radius: 3, fill: INK });
  h.opacity = 0.25;
};
const topBar = (b, o) => {
  if (o.secure === false) ICON(b, 'TriangleAlert', 14, 2, WARN, 13, 58, 'security-indicator');
  else if (o.favicon) R(b, 'image:favicon ' + o.host + ' 16', { x: 12, y: 57, w: 16, h: 16, radius: 4, fill: o.favicon });
  else ICON(b, 'Lock', 14, 2, MUTED, 13, 58, 'security-indicator');
  T(b, 'host', { text: o.host, size: 11, weight: 600, color: INK, x: 32, y: o.title ? 52 : 59 });
  if (o.title) T(b, 'page-title 11px literal', { text: o.title, size: 11, weight: 400, color: SUBTLE, x: 32, y: 68 });
  HAIR(b, 'hairline:top-bar', 0, TOPBAR_END, 390);
};
const bottomBar = (b, o) => {
  HAIR(b, 'hairline:bottom-bar', 0, BAR_TOP, 390);
  ICON(b, 'ArrowLeft', 22, 2, o.canGoBack ? INK : SUBTLE, 14, 781, o.canGoBack ? 'back-enabled' : 'back-disabled');
  ICON(b, 'RotateCw', 20, 2, MUTED, 56, 782, 'reload');
  if (o.pill) {
    const w = o.pill === 'connected' ? 130 : 119;
    R(b, 'acct-pill (bg.sunken, radius.full, padL 4 / padR 8 / padV 4)', { x: 94, y: 778, w, h: 28, radius: 14, fill: SUNKEN });
    INST(b, 'C/Media/WalletAvatar', { style: 'initial', size: '20' }, 98, 782, { w: 20, h: 20, name: 'i:WalletAvatar initial 20' });
    T(b, 'acct-pill-address 13px tabular-nums', { text: o.addr, size: 13, weight: 600, color: INK, x: 122, y: 785 });
    if (o.pill === 'connected') E(b, 'acct-pill-dot 7 success.base', 7, 209, 793, { fill: SUCCESS });
  }
  ICON(b, 'ExternalLink', 20, 2, MUTED, 356, 782, 'open-in-system-browser');
};

// ============================================================================
// S/browser/insecure-origin — origin is not https:// → TriangleAlert wins the indicator slot
// ============================================================================
{
  const b = await screen('S/browser/insecure-origin', 3);
  statusBar(b);
  topBar(b, { host: '192.168.1.24:5173', title: 'Vela Test dApp', secure: false });
  const top = 86;
  R(b, 'web:viewport', { x: 0, y: top, w: 390, h: BAR_TOP - top, fill: RAISED });
  T(b, 'web:heading', { text: 'Vela Test dApp', size: 20, weight: 700, color: '#131313', x: 24, y: top + 32 });
  T(b, 'web:origin', { text: 'http://192.168.1.24:5173', size: 11, weight: 400, zone: 'mono', color: '#7D7D7D', x: 24, y: top + 62 });
  ['eth_requestAccounts', 'personal_sign', 'eth_signTypedData_v4', 'eth_sendTransaction'].forEach((m, i) => {
    const y = top + 96 + i * 56;
    R(b, 'web:method-btn-' + i, { x: 24, y, w: 342, h: 44, radius: 10, fill: '#F7F7F7', stroke: '#E5E5E5', strokeWidth: 1 });
    T(b, 'web:method-label-' + i, { text: m, size: 12, weight: 500, zone: 'mono', color: '#131313', x: 40, y: y + 15 });
  });
  R(b, 'web:console', { x: 24, y: top + 336, w: 342, h: 108, radius: 10, fill: '#111111' });
  T(b, 'web:console-line-1', { text: '> provider detected: Vela (EIP-6963)', size: 10, weight: 400, zone: 'mono', color: '#7CE38B', x: 38, y: top + 352 });
  T(b, 'web:console-line-2', { text: '> chainId 0x2105  ·  accounts []', size: 10, weight: 400, zone: 'mono', color: '#7CE38B', x: 38, y: top + 370 });
  T(b, 'web:console-line-3', { text: '> waiting for eth_requestAccounts…', size: 10, weight: 400, zone: 'mono', color: '#6E6B62', x: 38, y: top + 388 });
  bottomBar(b, { canGoBack: false, pill: 'plain', addr: '0x7a2E…9f31' });
  homeIndicator(b);
  lib.chip(b, 'note', 'not https:// → the leading slot is TriangleAlert 14 warning.base and the favicon is skipped entirely; a11y role "image" labelled connect.browser.a11yInsecure ("Insecure site — not encrypted")'); // inv:05 §11.1
  lib.chip(b, 'note', 'the pill carries NO dot here — the site holds no grant yet; connected state is per-ORIGIN and is refreshed only when navigation actually changes origin'); // inv:05 §11.3 / §11.6
  lib.chip(b, 'platform', 'a plain-http origin is still allowed into the WebView (only file: and javascript: are rejected by the url re-validation) — the warning is informational, not a block'); // inv:05 §11.5
  lib.chip(b, 'edge', 'page calls eth_requestAccounts (no favicon captured) -> O/browser-consent/fallback-logo');
  lib.chip(b, 'edge', 'tap account pill -> O/account-switcher/browser-footer');
  lib.chip(b, 'edge', 'eth_sendTransaction from the page -> O/signing-sheet/blind-tx');
}

// ============================================================================
// S/browser/preparing-wallet — wallet state still loading; centre replaces the web view
// ============================================================================
{
  const b = await screen('S/browser/preparing-wallet', 4);
  statusBar(b);
  topBar(b, { host: 'app.uniswap.org', secure: true }); // no nav yet → Lock fallback, no page title
  E(b, 'spinner ActivityIndicator accent.base', 24, 183, 406, { stroke: ACCENT, sw: 2 });
  T(b, 'dim connect.browser.preparing', { text: 'Preparing wallet…', size: 11, weight: 400, color: MUTED, x: cx('Preparing wallet…', 11, false, 0, 390), y: 438 });
  // no account pill: activeAccount does not exist yet
  bottomBar(b, { canGoBack: false });
  homeIndicator(b);
  lib.chip(b, 'note', 'centre = flex-1 centred column, gap 8 (space.md); the dim line is text.sm(11) fg.muted — the same recipe for every centre state'); // inv:05 §11.5
  lib.chip(b, 'note', 'the account pill renders ONLY when a wallet account exists, so the bottom bar is back/reload/spacer/open-in-system-browser here'); // inv:05 §11.3
  lib.chip(b, 'motion', 'ActivityIndicator only — no skeleton, no progress; the chrome bars stay mounted so the route never re-lays-out when the wallet resolves');
  lib.chip(b, 'edge', 'wallet state resolves with an account -> S/browser/default');
  lib.chip(b, 'edge', 'wallet state resolves with NO account -> S/browser/no-wallet');
}

// ============================================================================
// S/browser/no-wallet — state loaded, no wallet exists (e.g. /browser deep link pre-onboarding)
// ============================================================================
{
  const b = await screen('S/browser/no-wallet', 5);
  statusBar(b);
  topBar(b, { host: 'app.uniswap.org', secure: true });
  ICON(b, 'Plug', 26, 2, SUBTLE, 182, 404, 'no-wallet');
  T(b, 'dim connect.list.noWallet', { text: 'Create a wallet first', size: 11, weight: 400, color: MUTED, x: cx('Create a wallet first', 11, false, 0, 390), y: 438 });
  bottomBar(b, { canGoBack: false });
  homeIndicator(b);
  lib.chip(b, 'note', 'DELIBERATE: the route never spins forever pretending to load — once wallet state settles with no account it says so (code comment at browser.tsx:434-441)'); // inv:05 §11.5
  lib.chip(b, 'note', 'reachable by deep link before onboarding; the bars stay so the user can still leave via back / open-in-system-browser'); // inv:05 §11.5
  lib.chip(b, 'edge', 'user leaves to create a wallet -> S/onboarding/welcome');
  lib.chip(b, 'edge', 'Android hardware back (page cannot go back) closes the route -> S/home/default');
}

// ============================================================================
// S/browser/unsupported — chrome-less Fallback (isWalletWebViewSupported false)
// ============================================================================
{
  const b = await screen('S/browser/unsupported', 6);
  statusBar(b);
  const s1 = 'The in-app browser is only available on iOS and Android.';
  T(b, 'dim connect.browser.unsupported', { text: s1, size: 11, weight: 400, color: MUTED, x: cx(s1, 11, false, 0, 390), y: 416 });
  homeIndicator(b);
  lib.chip(b, 'note', 'chrome-less full screen: SafeAreaView + centre, ONE dim line (text.sm fg.muted) — no top bar, no loading strip, no bottom bar, no web view'); // inv:05 §11.5
  lib.chip(b, 'platform', 'this is the web build of the route (and any native host without WalletWebView); iOS/Android never land here'); // inv:05 §11.5
  lib.chip(b, 'edge', 'back / route close -> S/home/default');
  lib.chip(b, 'edge', 'on web, the dApp path is the SDK popup instead -> S/web-request/waiting');
}

// ============================================================================
// S/browser/no-url — chrome-less Fallback (url param missing or not http(s))
// ============================================================================
{
  const b = await screen('S/browser/no-url', 7);
  statusBar(b);
  const s2 = 'No URL to open.';
  T(b, 'dim connect.browser.noUrl', { text: s2, size: 11, weight: 400, color: MUTED, x: cx(s2, 11, false, 0, 390), y: 416 });
  homeIndicator(b);
  lib.chip(b, 'note', 'the url route param is RE-VALIDATED as http(s) — file: and javascript: schemes land here, never in the WebView (browser.tsx:364-369, 559-566)'); // inv:05 §11.5
  lib.chip(b, 'note', 'same Fallback component as S/browser/unsupported — only the string differs; keep them one shared surface'); // inv:05 §11.5
  lib.chip(b, 'edge', 'back / route close -> S/home/default');
  lib.chip(b, 'edge', 'user re-enters a valid address -> S/connect/disconnected');
}

return lib.done('63-screens-browser-connect-b', {
  boards: ['S/browser/insecure-origin', 'S/browser/preparing-wallet', 'S/browser/no-wallet', 'S/browser/unsupported', 'S/browser/no-url'],
  missingFamilies: missing,
});
