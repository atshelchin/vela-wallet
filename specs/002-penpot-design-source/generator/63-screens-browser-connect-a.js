if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
// 63-screens-browser-connect-a.js — page '06 Screens · Browser & Connect', screen row 0 = S/browser.
// States in this chunk: default (col 0) · loading (col 1) · connected (col 2).
// Chrome spec is inv:05 §11 (top bar §11.1, loading strip §11.2, bottom bar + account pill §11.3,
// switcher payload §11.4, center states §11.5, invariants §11.6). Copy = connect.browser.* / connect.list.* (en).
// The web area is a DEPICTION of the live dApp page (named web:*) — never a Vela surface.
// Idempotent: every shape is upserted by name; instances are reused by name.
const lib = storage.lib;
const PAGE = '06 Screens · Browser & Connect';
const ROW = 0; // S/browser = first route of this page in the manifest

// ---- tokens (inv:01 §2 / inv:06 §0.1) --------------------------------------
const BG = '#FAFAF8', RAISED = '#FFFFFF', SUNKEN = '#F5F3EF';
const INK = '#1A1A18', MUTED = '#6E6B62', SUBTLE = '#8C887E';
const BORDER = '#ECEBE4';
const ACCENT = '#E8572A', SUCCESS = '#2D8E5F', WARN = '#92600A';

// ---- shared helpers (duplicated per chunk so each file runs standalone) -----
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

// iOS 390×844 safe areas — the browser route is a SafeAreaView with edges top+bottom (inv:05 §11)
const SAFE_TOP = 47, TOPBAR_END = 85, BAR_TOP = 774, SAFE_BOT = 810;
const statusBar = (b) => {
  T(b, 'deco:status-time', { text: '9:41', size: 13, weight: 600, color: INK, x: 28, y: 17 });
  const s = R(b, 'deco:status-indicators (cellular · wifi · battery)', { x: 302, y: 18, w: 64, h: 12, radius: 2, fill: INK });
  s.opacity = 0.35;
};
const homeIndicator = (b) => {
  const h = R(b, 'deco:home-indicator', { x: 127, y: 830, w: 136, h: 5, radius: 3, fill: INK });
  h.opacity = 0.25;
};

// ---- browser chrome (inv:05 §11.1 / §11.2 / §11.3) --------------------------
// topBar: row, gap 4 (space.sm), padH 12 (space.lg), padV 4 (space.sm), bottom hairline border.base.
const topBar = (b, o) => {
  if (o.secure === false) {
    // not https:// → TriangleAlert 14 warning.base; a11y role image, label connect.browser.a11yInsecure
    ICON(b, 'TriangleAlert', 14, 2, WARN, 13, 58, 'security-indicator');
  } else if (o.favicon) {
    // captured page favicon 16×16 radius 4; onError flips to the Lock fallback and the broken flag
    // resets whenever the favicon URL changes (page B never inherits page A's broken icon)
    R(b, 'image:favicon ' + o.host + ' 16', { x: 12, y: 57, w: 16, h: 16, radius: 4, fill: o.favicon });
  } else {
    ICON(b, 'Lock', 14, 2, MUTED, 13, 58, 'security-indicator'); // secure, no favicon (or broken)
  }
  // hostWrap flex 1 — host text.sm(11) semibold fg.base over an 11px LITERAL page title fg.subtle
  // (the title line does NOT follow the user text scale — inv:05 §11.1)
  T(b, 'host', { text: o.host, size: 11, weight: 600, color: INK, x: 32, y: o.title ? 52 : 59 });
  if (o.title) T(b, 'page-title 11px literal', { text: o.title, size: 11, weight: 400, color: SUBTLE, x: 32, y: 68 });
  HAIR(b, 'hairline:top-bar', 0, TOPBAR_END, 390);
  if (o.loading) R(b, 'loading-strip 2px accent (presence, not progress)', { x: 0, y: 86, w: 390, h: 2, fill: ACCENT });
};
// bottomBar: row, gap 16 (space.xl), padH 12, padV 4, top hairline. iconBtn = padding 2, hitSlop 8.
const bottomBar = (b, o) => {
  HAIR(b, 'hairline:bottom-bar', 0, BAR_TOP, 390);
  ICON(b, 'ArrowLeft', 22, 2, o.canGoBack ? INK : SUBTLE, 14, 781, o.canGoBack ? 'back-enabled' : 'back-disabled');
  ICON(b, 'RotateCw', 20, 2, MUTED, 56, 782, 'reload');
  if (o.pill) {
    const w = o.pill === 'connected' ? 130 : 119;
    R(b, 'acct-pill (bg.sunken, radius.full, padL 4 / padR 8 / padV 4)', { x: 94, y: 778, w, h: 28, radius: 14, fill: SUNKEN });
    INST(b, 'C/Media/WalletAvatar', { style: 'initial', size: '20' }, 98, 782,
      { w: 20, h: 20, name: 'i:WalletAvatar initial 20' });
    // shows the CONNECTED/granted address when the site holds a grant, else the active account's
    T(b, 'acct-pill-address 13px tabular-nums', { text: o.addr, size: 13, weight: 600, color: INK, x: 122, y: 785 });
    if (o.pill === 'connected') E(b, 'acct-pill-dot 7 success.base', 7, 209, 793, { fill: SUCCESS });
  }
  ICON(b, 'ExternalLink', 20, 2, MUTED, 356, 782, 'open-in-system-browser');
};

// ---- dApp page depiction ----------------------------------------------------
const dappPage = (b, top, mode) => {
  R(b, 'web:viewport', { x: 0, y: top, w: 390, h: BAR_TOP - top, fill: RAISED });
  E(b, 'web:brand-mark', 24, 20, top + 16, { fill: '#FF007A' });
  T(b, 'web:brand', { text: 'Uniswap', size: 15, weight: 700, color: '#131313', x: 52, y: top + 20 });
  if (mode === 'connected') {
    R(b, 'web:account-chip', { x: 246, y: top + 14, w: 124, h: 30, radius: 15, fill: '#FDF0F6' });
    E(b, 'web:account-dot', 7, 258, top + 25, { fill: '#21C55D' });
    T(b, 'web:account-addr', { text: '0x7a2E…9f31', size: 11, weight: 600, color: '#131313', x: 270, y: top + 22 });
  } else {
    R(b, 'web:connect-btn', { x: 262, y: top + 14, w: 108, h: 30, radius: 15, fill: '#FDEBF4' });
    T(b, 'web:connect-label', { text: 'Connect', size: 12, weight: 600, color: '#FF007A', x: 288, y: top + 23 });
  }
  const cy = top + 76;
  R(b, 'web:swap-card', { x: 24, y: cy, w: 342, h: 250, radius: 20, fill: '#FAFAFA', stroke: '#EDEDED', strokeWidth: 1 });
  T(b, 'web:sell-label', { text: 'Sell', size: 11, weight: 500, color: '#7D7D7D', x: 42, y: cy + 16 });
  T(b, 'web:sell-amount', { text: '1.5', size: 26, weight: 600, color: '#131313', x: 42, y: cy + 32 });
  R(b, 'web:token-in', { x: 258, y: cy + 30, w: 90, h: 34, radius: 17, fill: RAISED, stroke: '#EDEDED', strokeWidth: 1 });
  E(b, 'web:token-in-mark', 20, 266, cy + 37, { fill: '#627EEA' });
  T(b, 'web:token-in-label', { text: 'ETH', size: 13, weight: 600, color: '#131313', x: 292, y: cy + 39 });
  T(b, 'web:sell-fiat', { text: '$4,192.60', size: 11, weight: 400, color: '#7D7D7D', x: 42, y: cy + 70 });
  E(b, 'web:swap-toggle', 30, 180, cy + 92, { fill: RAISED, stroke: '#EDEDED', sw: 1 });
  ICON(b, 'ArrowDownUp', 12, 1.6, '#131313', 189, cy + 101, 'web');
  T(b, 'web:buy-label', { text: 'Buy', size: 11, weight: 500, color: '#7D7D7D', x: 42, y: cy + 128 });
  T(b, 'web:buy-amount', { text: '4,187.20', size: 26, weight: 600, color: '#131313', x: 42, y: cy + 144 });
  R(b, 'web:token-out', { x: 252, y: cy + 142, w: 96, h: 34, radius: 17, fill: RAISED, stroke: '#EDEDED', strokeWidth: 1 });
  E(b, 'web:token-out-mark', 20, 260, cy + 149, { fill: '#2775CA' });
  T(b, 'web:token-out-label', { text: 'USDC', size: 13, weight: 600, color: '#131313', x: 286, y: cy + 151 });
  const swapping = mode === 'connected';
  R(b, 'web:cta', { x: 42, y: cy + 188, w: 306, h: 48, radius: 16, fill: swapping ? '#FF007A' : '#FDEBF4' });
  const label = swapping ? 'Swap' : 'Connect wallet';
  T(b, 'web:cta-label', { text: label, size: 15, weight: 600, color: swapping ? RAISED : '#FF007A', x: cx(label, 15, true, 42, 306), y: cy + 203 });
  T(b, 'web:footnote', { text: 'Best price routed via Uniswap v3 · 0.05% fee', size: 10, weight: 400, color: '#9E9E9E', x: 98, y: cy + 266 });
  T(b, 'web:list-heading', { text: 'Popular tokens', size: 13, weight: 600, color: '#131313', x: 24, y: cy + 300 });
  const rows = [['Ethereum', 'ETH', '$2,795.07', '#627EEA'], ['USD Coin', 'USDC', '$1.00', '#2775CA'], ['Wrapped BTC', 'WBTC', '$67,412.30', '#F09242']];
  rows.forEach((r, i) => {
    const y = cy + 330 + i * 34;
    E(b, 'web:row-mark-' + i, 22, 24, y, { fill: r[3] });
    T(b, 'web:row-name-' + i, { text: r[0], size: 12, weight: 500, color: '#131313', x: 54, y: y + 4 });
    T(b, 'web:row-price-' + i, { text: r[2], size: 12, weight: 500, color: '#7D7D7D', x: 300, y: y + 4 });
  });
};

// ============================================================================
// S/browser/default — secure origin, favicon captured, page loaded, NOT connected
// ============================================================================
{
  const b = await screen('S/browser/default', 0);
  statusBar(b);
  topBar(b, { host: 'app.uniswap.org', title: 'Uniswap Interface', secure: true, favicon: '#FF007A' });
  dappPage(b, 86, 'connect');
  // canGoBack false on a fresh entry → ArrowLeft dims to fg.subtle AND is disabled (inv:05 §11.3-1)
  bottomBar(b, { canGoBack: false, pill: 'plain', addr: '0x7a2E…9f31' });
  homeIndicator(b);
  lib.chip(b, 'note', 'NON-modal full-screen route (expo-router header hidden) so the root SigningRequestModal renders ABOVE it; no ScreenContainer and no 24px page gutter — the web view is edge-to-edge between the two chrome bars'); // inv:05 §11
  lib.chip(b, 'note', 'web:* shapes are a DEPICTION of the live dApp page, not a Vela surface — do not tokenize or rebuild them; top bar carries NO actions (disconnect + close live in the switcher footer)'); // inv:05 §11.1
  lib.chip(b, 'platform', 'iOS/Android only — WalletWebView = WKWebView / Android WebView (never react-native-webview); the web build falls through to S/browser/unsupported'); // inv:05 §11
  lib.chip(b, 'edge', 'page calls eth_requestAccounts (tap Connect wallet) -> O/browser-consent/favicon');
  lib.chip(b, 'edge', 'document load starts -> S/browser/loading');
  lib.chip(b, 'edge', 'tap account pill (hitSlop 8) -> O/account-switcher/browser-footer');
}

// ============================================================================
// S/browser/loading — nav.loading true: 2px accent strip, page title not yet reported
// ============================================================================
{
  const b = await screen('S/browser/loading', 1);
  statusBar(b);
  // title renders only once the page reports one → host line alone, vertically centred
  topBar(b, { host: 'app.uniswap.org', secure: true, favicon: '#FF007A', loading: true });
  const top = 88; // web content sits under the 2px strip
  R(b, 'web:viewport', { x: 0, y: top, w: 390, h: BAR_TOP - top, fill: RAISED });
  R(b, 'web:skeleton-header', { x: 20, y: top + 16, w: 120, h: 24, radius: 12, fill: '#F2F2F2' });
  R(b, 'web:skeleton-action', { x: 262, y: top + 14, w: 108, h: 30, radius: 15, fill: '#F2F2F2' });
  R(b, 'web:skeleton-card', { x: 24, y: top + 76, w: 342, h: 250, radius: 20, fill: '#F7F7F7' });
  R(b, 'web:skeleton-line-1', { x: 42, y: top + 108, w: 150, h: 26, radius: 6, fill: '#EDEDED' });
  R(b, 'web:skeleton-line-2', { x: 42, y: top + 220, w: 190, h: 26, radius: 6, fill: '#EDEDED' });
  R(b, 'web:skeleton-cta', { x: 42, y: top + 264, w: 306, h: 48, radius: 16, fill: '#EDEDED' });
  bottomBar(b, { canGoBack: true, pill: 'plain', addr: '0x7a2E…9f31' });
  homeIndicator(b);
  lib.chip(b, 'note', 'the strip is a STATIC presence indicator — 2px accent.base full bleed under the top-bar hairline, no width animation and no progress; it appears at document-load start and vanishes on settle'); // inv:05 §11.2
  lib.chip(b, 'note', 'SPA pushState route changes never set loading, so the strip marks only REAL document loads — the same moments in-flight dApp requests get settled'); // inv:05 §11.2 / §11.6
  lib.chip(b, 'note', 'every fresh document load settles in-flight requests with 4900 "Navigated away — check Vela Activity" (never 4001), rejects+closes a pending consent sheet, and tears down a stale signing modal owned by this tab unless the tx already committed'); // inv:05 §11.6
  lib.chip(b, 'edge', 'load settles -> S/browser/default');
  lib.chip(b, 'edge', 'nav.error set -> O/browser-error/default');
  lib.chip(b, 'edge', 'navigation changes ORIGIN and the new origin holds a grant -> S/browser/connected');
}

// ============================================================================
// S/browser/connected — site holds a resolved grant: green dot + granted address
// ============================================================================
{
  const b = await screen('S/browser/connected', 2);
  statusBar(b);
  topBar(b, { host: 'app.uniswap.org', title: 'Swap · Uniswap Interface', secure: true, favicon: '#FF007A' });
  dappPage(b, 86, 'connected');
  bottomBar(b, { canGoBack: true, pill: 'connected', addr: '0x7a2E…9f31' });
  homeIndicator(b);
  lib.chip(b, 'note', 'the 7×7 success.base dot shows ONLY while the site holds a resolved grant; grants are judged against ALL wallet addresses, so a grant to a non-active account still reads connected — the pill then shows THAT granted address, not the active one'); // inv:05 §11.3 / §11.6
  lib.chip(b, 'note', 'switcher footer (browser-only): Disconnect row = Plug 18 error.base + error label -> destructive confirm BEFORE revoking (the pill is a status badge, a bare tap must never silently revoke); footerSep 1px inset 26; then Close page row = X 18 + ink label'); // inv:05 §11.4
  lib.chip(b, 'note', 'switching account while connected is REAL, not cosmetic: the per-origin grant is re-pointed and the page receives accountsChanged; nothing is emitted for a site that never connected'); // inv:05 §11.4
  lib.chip(b, 'edge', 'tap account pill -> O/account-switcher/browser-footer');
  lib.chip(b, 'edge', 'page requests a signature -> O/signing-sheet/clear-signed');
  lib.chip(b, 'edge', 'switcher footer > Disconnect -> O/app-alert/destructive');
}

return lib.done('63-screens-browser-connect-a', {
  boards: ['S/browser/default', 'S/browser/loading', 'S/browser/connected'],
  missingFamilies: missing,
});
