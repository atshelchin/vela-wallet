if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
// 63-screens-browser-connect-c.js — page '06 Screens · Browser & Connect', screen row 1 = S/connect.
// States in this chunk: no-wallet (col 0) · disconnected (col 1) · connecting-verify (col 2) ·
// connecting-waiting (col 3) · error (col 4).   Spec: inv:06 §3.1. Copy = connect.list.* (en).
// ConnectionFlowStates is INSTANCED (the same component is inlined on Home → Connections, which is
// why pairing never yanks the user to another screen).
const lib = storage.lib;
const PAGE = '06 Screens · Browser & Connect';
const ROW = 1;

const BG = '#FAFAF8', RAISED = '#FFFFFF', SUNKEN = '#F5F3EF';
const INK = '#1A1A18', MUTED = '#6E6B62', SUBTLE = '#8C887E';
const BORDER = '#ECEBE4', STRONG = '#D8D6CE';
const ACCENT = '#E8572A', ACCENT_SOFT = '#FFF0EB';

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

const statusBar = (b) => {
  T(b, 'deco:status-time', { text: '9:41', size: 13, weight: 600, color: INK, x: 28, y: 17 });
  const s = R(b, 'deco:status-indicators (cellular · wifi · battery)', { x: 302, y: 18, w: 64, h: 12, radius: 2, fill: INK });
  s.opacity = 0.35;
};
const homeIndicator = (b) => {
  const h = R(b, 'deco:home-indicator', { x: 127, y: 830, w: 136, h: 5, radius: 3, fill: INK });
  h.opacity = 0.25;
};
// ScreenContainer: bg.base, top safe area, paddingHorizontal 24 (inv:06 §0.3).
// Page header: marginTop 16 / marginBottom 20 — "Connect" text.3xl bold letterSpacing −0.5 + plain X 22 in 40×40.
const connectHeader = (b) => {
  statusBar(b);
  const h = T(b, 'page-title connect.list.pageTitle', { text: 'Connect', size: 26, weight: 700, color: INK, x: 24, y: 63 });
  try { h.letterSpacing = '-0.5'; } catch (e) {}
  ICON(b, 'X', 22, 2, INK, 335, 69, 'close → /wallet (40×40 target)');
  homeIndicator(b);
};

// ============================================================================
// S/connect/no-wallet
// ============================================================================
{
  const b = await screen('S/connect/no-wallet', 0);
  connectHeader(b);
  ICON(b, 'Shield', 32, 2, SUBTLE, 179, 449, 'no-wallet');
  const s = 'Create a wallet first';
  T(b, 'empty-label connect.list.noWallet', { text: s, size: 15, weight: 400, color: MUTED, x: cx(s, 15, false, 0, 390), y: 493 });
  lib.chip(b, 'note', 'centred column, paddingVertical 48, gap 12 — the page header stays; only the guide/actions block is replaced'); // inv:06 §3.1
  lib.chip(b, 'note', 'ZERO in-app entry points reach this route — it survives as the deep-link + e2e surface (inv:04 §8.2); the manifest marks it entry:true for that reason');
  lib.chip(b, 'edge', 'tap X -> S/home/default');
  lib.chip(b, 'edge', 'user creates a wallet -> S/onboarding/welcome');
}

// ============================================================================
// S/connect/disconnected — guide + actions, both OPEN sections (no cards)
// ============================================================================
{
  const b = await screen('S/connect/disconnected', 1);
  connectHeader(b);
  INST(b, 'C/Primitives/SectionLabel', null, 24, 117, { w: 342, h: 24, name: 'i:SectionLabel CONNECT TO DAPPS', label: 'CONNECT TO DAPPS' });
  // 3 StepRows: leading 40×40 accent.soft circle + accent icon (stroke 2) · title text.lg semibold · subtitle text.sm fg.muted
  const steps = [
    ['QrCode', 18, 'Get a pairing URI', 'From a WalletPair dApp or the browser extension'],
    ['Lock', 12, 'Verify the 4-digit code', 'Make sure it matches on both sides'],
    ['Zap', 18, 'Done', 'Requests appear here automatically'],
  ];
  steps.forEach(([ic, isz, title, sub], i) => {
    const y = 153 + i * 72;
    E(b, 'step-disc-' + (i + 1), 40, 24, y, { fill: ACCENT_SOFT });
    ICON(b, ic, isz, 2, ACCENT, 24 + (40 - isz) / 2, y + (40 - isz) / 2, 'step' + (i + 1));
    T(b, 'step-title-' + (i + 1), { text: title, size: 15, weight: 600, color: INK, x: 76, y: y + 2 });
    T(b, 'step-sub-' + (i + 1), { text: sub, size: 11, weight: 400, color: MUTED, x: 76, y: y + 22 });
    // vertical connector 2×16 border.base at marginLeft 19 (centred under the 40px circles)
    if (i < 2) R(b, 'step-connector-' + (i + 1), { x: 43, y: y + 44, w: 2, h: 16, fill: BORDER });
  });
  // Actions block (marginTop 20 after the guide ends at 337, gap 16)
  INST(b, 'C/Primitives/VelaButton', { variant: 'accent', size: 'default', state: 'default' }, 24, 357,
    { w: 342, h: 53, name: 'i:VelaButton accent "Scan QR Code"', label: 'Scan QR Code' });
  HAIR(b, 'or-rule-left', 24, 434, 158);
  T(b, 'or-label connect.list.orDivider', { text: 'or', size: 11, weight: 400, color: MUTED, x: 190, y: 428 });
  HAIR(b, 'or-rule-right', 208, 434, 158);
  const hint = 'Connect a dApp, or open any website';
  T(b, 'paste-hint connect.list.pasteHint', { text: hint, size: 11, weight: 400, color: SUBTLE, x: cx(hint, 11, false, 0, 390), y: 454 });
  // input row (gap 8): mono text.sm input flex 1 + plain 44×44 ArrowRight button
  INST(b, 'C/Primitives/Input', { kind: 'single', state: 'empty' }, 24, 482,
    { w: 290, h: 44, name: 'i:Input single empty (paste, mono, return-key "go")', label: 'walletpair link or web address' });
  ICON(b, 'ArrowRight', 20, 2, SUBTLE, 334, 494, 'go — fg.subtle disabled / accent.base enabled');
  lib.chip(b, 'note', 'input routing: WalletPair URI → E2E pairing · Remote-Inject URL → bridge pairing · anything URL-ish (even a bare host like app.uniswap.org) → pushes /browser?url=… · otherwise alert "Invalid Link"'); // inv:06 §3.1
  lib.chip(b, 'note', 'no cards anywhere: SectionLabel + open StepRows + open actions; the 44×44 go-button is a PLAIN icon button (no bg/border), fg.subtle until the field parses'); // inv:06 §3.1 + DESIGN-LANGUAGE 1/7
  lib.chip(b, 'motion', 'header fadeIn 0/300; actions fadeInDown 150/300 — iOS ONLY (entering helpers return undefined on Android/web, which render the settled state instantly)'); // inv:06 §0.2
  lib.chip(b, 'edge', 'tap Scan QR Code -> O/qr-scanner/scanning-native');
  lib.chip(b, 'edge', 'paste a web address + go -> S/browser/default');
  lib.chip(b, 'edge', 'paste a WalletPair URI -> S/connect/connecting-verify');
}

// ============================================================================
// S/connect/connecting-verify — WalletPair fingerprint gate (shared ConnectionFlowStates)
// ============================================================================
{
  const b = await screen('S/connect/connecting-verify', 2);
  connectHeader(b);
  INST(b, 'C/Controls/ConnectionFlowStates', { state: 'verify' }, 24, 117,
    { w: 342, h: 386, name: 'i:ConnectionFlowStates verify' });
  lib.chip(b, 'note', 'a deliberate security gate kept LIGHT: soft bg.sunken surface (radius 16, 1px border.base, padding 20) — the one place a contained surface is correct on this screen'); // inv:06 §3.1
  lib.chip(b, 'note', 'the SAME component is inlined on Home → Connections, so pairing never yanks the user to another screen -> S/home/connections-connecting'); // inv:06 §3.1
  lib.chip(b, 'edge', 'tap Confirm (code matches) -> S/connect/connected');
  lib.chip(b, 'edge', 'tap Cancel -> S/connect/disconnected');
  lib.chip(b, 'edge', 'fingerprint mismatch / pairing fails -> S/connect/error');
}

// ============================================================================
// S/connect/connecting-waiting — remote bridge, waiting for the dApp to accept
// ============================================================================
{
  const b = await screen('S/connect/connecting-waiting', 3);
  connectHeader(b);
  INST(b, 'C/Controls/ConnectionFlowStates', { state: 'waiting' }, 24, 117,
    { w: 342, h: 260, name: 'i:ConnectionFlowStates waiting' });
  lib.chip(b, 'note', 'open state, no card: 64×64 accent.base-at-12%-alpha disc + Radio 32, status text.lg semibold in ACCENT (the only accent text on the screen), hint text.base fg.muted, compact secondary Cancel'); // inv:06 §3.1
  lib.chip(b, 'note', 'reached by a Remote-Inject URL (bridge), not a WalletPair URI — no fingerprint step exists on this path'); // inv:06 §3.1
  lib.chip(b, 'edge', 'dApp accepts -> S/connect/connected');
  lib.chip(b, 'edge', 'tap Cancel -> S/connect/disconnected');
  lib.chip(b, 'edge', 'bridge refuses / times out -> S/connect/error');
}

// ============================================================================
// S/connect/error — open typographic failure state
// ============================================================================
{
  const b = await screen('S/connect/error', 4);
  connectHeader(b);
  INST(b, 'C/Controls/ConnectionFlowStates', { state: 'error' }, 24, 117,
    { w: 342, h: 330, name: 'i:ConnectionFlowStates error' });
  lib.chip(b, 'note', 'open typographic state (no card, paddingV 32, gap 8): error.soft disc + AlertTriangle 28 error.base, title text.xl bold, message = the server error or "Unable to connect to the bridge."'); // inv:06 §3.1
  lib.chip(b, 'note', 'the secondary Retry row exists ONLY when a session object survives; a cold failure shows Scan Again alone'); // inv:06 §3.1
  lib.chip(b, 'edge', 'tap Scan Again -> O/qr-scanner/scanning-native');
  lib.chip(b, 'edge', 'tap Retry (session survives) -> S/connect/connecting-waiting');
  lib.chip(b, 'edge', 'tap X -> S/home/default');
}

return lib.done('63-screens-browser-connect-c', {
  boards: ['S/connect/no-wallet', 'S/connect/disconnected', 'S/connect/connecting-verify', 'S/connect/connecting-waiting', 'S/connect/error'],
  missingFamilies: missing,
});
