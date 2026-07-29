if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
// 63-screens-browser-connect-d.js — page '06 Screens · Browser & Connect'.
// Row 1 = S/connect: connected (col 5) · reconnecting (col 6)        — inv:06 §3.1
// Row 3 = S/safari-extension: default (col 0)                        — inv:06 §1.3
// Copy = connect.list.* / safariExt.* (en).
// The Safari board depicts the NORMATIVE de-containered target (open step rows + inset hairlines +
// VelaButton CTA); the shipped screen is still a VelaCard pile with a bespoke radius-15 CTA — that
// drift is recorded on note chips (inv:06 §1.3 flag, §5.2, §5.4) rather than drawn.
const lib = storage.lib;
const PAGE = '06 Screens · Browser & Connect';

const BG = '#FAFAF8', RAISED = '#FFFFFF', SUNKEN = '#F5F3EF';
const INK = '#1A1A18', MUTED = '#6E6B62', SUBTLE = '#8C887E';
const BORDER = '#ECEBE4', STRONG = '#D8D6CE';
const ACCENT = '#E8572A', ACCENT_SOFT = '#FFF0EB';
const SUCCESS = '#2D8E5F', SUCCESS_SOFT = '#EDFAF2', WARN = '#92600A';

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
const screen = async (name, col, row) =>
  (await lib.upsertBoard(PAGE, name, { x: col * 450, y: row * 950, w: 390, h: 844, fill: BG })).board;

const statusBar = (b) => {
  T(b, 'deco:status-time', { text: '9:41', size: 13, weight: 600, color: INK, x: 28, y: 17 });
  const s = R(b, 'deco:status-indicators (cellular · wifi · battery)', { x: 302, y: 18, w: 64, h: 12, radius: 2, fill: INK });
  s.opacity = 0.35;
};
const homeIndicator = (b) => {
  const h = R(b, 'deco:home-indicator', { x: 127, y: 830, w: 136, h: 5, radius: 3, fill: INK });
  h.opacity = 0.25;
};
const connectHeader = (b) => {
  statusBar(b);
  const h = T(b, 'page-title connect.list.pageTitle', { text: 'Connect', size: 26, weight: 700, color: INK, x: 24, y: 63 });
  try { h.letterSpacing = '-0.5'; } catch (e) {}
  ICON(b, 'X', 22, 2, INK, 335, 69, 'close → /wallet (40×40 target)');
  homeIndicator(b);
};

// Shared body for the live-session states: open section, no card (inv:06 §3.1).
const sessionBody = (b, live) => {
  // header row (gap 8): 10×10 status dot · title text.xl bold · right-aligned E2E pill
  const dot = E(b, live ? 'status-dot success.base' : 'status-dot warning.base @0.7', 10, 24, 124,
    { fill: live ? SUCCESS : WARN });
  if (!live) dot.opacity = 0.7;
  T(b, 'session-title', { text: live ? 'Connected' : 'Reconnecting...', size: 17, weight: 700, color: INK, x: 42, y: 117 });
  R(b, 'e2e-pill', { x: 314, y: 117, w: 52, h: 20, radius: 10, fill: SUCCESS_SOFT });
  ICON(b, 'Lock', 10, 2, SUCCESS, 321, 122, 'e2e');
  T(b, 'e2e-label', { text: 'E2E', size: 10, weight: 600, color: SUCCESS, x: 335, y: 122 });
  // info group — three DE-BOXED rows, paddingV 12, hairline separators inset marginLeft 22
  R(b, 'image:dapp-favicon uniswap 14', { x: 24, y: 169, w: 14, h: 14, radius: 3, fill: '#FF007A' });
  T(b, 'info-dapp', { text: 'Uniswap (app.uniswap.org)', size: 11, weight: 500, zone: 'mono', color: SUBTLE, x: 46, y: 170 });
  HAIR(b, 'info-sep-1 (inset 22 = icon 14 + gap 8)', 46, 195, 320);
  ICON(b, 'Smartphone', 14, 2, MUTED, 24, 208, 'wallet-row');
  T(b, 'info-wallet', { text: 'Main (0x7a2E…9f31)', size: 11, weight: 500, zone: 'mono', color: SUBTLE, x: 46, y: 209 });
  HAIR(b, 'info-sep-2 (inset 22)', 46, 234, 320);
  ICON(b, 'Link', 14, 2, MUTED, 24, 247, 'chain-row');
  T(b, 'info-chain', { text: 'Base', size: 11, weight: 500, zone: 'mono', color: SUBTLE, x: 46, y: 248 });
  T(b, 'hint-line-1 connect.list.signingHint', { text: 'Signing requests from dApps will appear', size: 13, weight: 400, color: MUTED, x: 24, y: 289 });
  T(b, 'hint-line-2', { text: 'automatically.', size: 13, weight: 400, color: MUTED, x: 24, y: 307 });
  INST(b, 'C/Primitives/VelaButton', { variant: 'secondary', size: 'default', state: 'default' }, 24, 347,
    { w: 342, h: 53, name: 'i:VelaButton secondary "Disconnect"', label: 'Disconnect' });
};

// ============================================================================
// S/connect/connected
// ============================================================================
{
  const b = await screen('S/connect/connected', 5, 1);
  connectHeader(b);
  sessionBody(b, true);
  lib.chip(b, 'note', 'open section, no card: dot + title + E2E pill, then three de-boxed rows (paddingV 12, gap 8) with hairlines inset 22; row text is text.sm weight 500 MONO fg.subtle, single line'); // inv:06 §3.1
  lib.chip(b, 'note', 'ONE remote session at a time (WalletPair E2E channel or Remote-Inject bridge) — this screen manages that single session, it is not a list'); // inv:06 §3.1
  lib.chip(b, 'note', 'the E2E pill (Lock 10 + text.xs semibold on success.soft) appears only for WalletPair sessions; a bridge session shows the same layout without it'); // inv:06 §3.1
  lib.chip(b, 'motion', 'fadeInDown 50/300 — iOS only');
  lib.chip(b, 'edge', 'tap Disconnect -> O/app-alert/destructive');
  lib.chip(b, 'edge', 'dApp sends a signing request -> O/signing-sheet/clear-signed');
  lib.chip(b, 'edge', 'transport drops -> S/connect/reconnecting');
}

// ============================================================================
// S/connect/reconnecting
// ============================================================================
{
  const b = await screen('S/connect/reconnecting', 6, 1);
  connectHeader(b);
  sessionBody(b, false);
  lib.chip(b, 'note', 'IDENTICAL layout to connected — only the dot (warning.base at 0.7 opacity) and the title string change; no spinner, no skeleton, no layout shift'); // inv:06 §3.1
  lib.chip(b, 'note', 'the session rows keep showing the last-known dApp/wallet/chain: reconnecting is a transport state, not a loss of identity'); // inv:06 §3.1
  lib.chip(b, 'edge', 'transport restored -> S/connect/connected');
  lib.chip(b, 'edge', 'retries exhausted -> S/connect/error');
  lib.chip(b, 'edge', 'tap Disconnect -> O/app-alert/destructive');
}

// ============================================================================
// S/safari-extension/default — iOS-only onboarding guide for the Safari Web Extension
// ============================================================================
{
  const b = await screen('S/safari-extension/default', 0, 3);
  statusBar(b);
  // nav header height 44: ArrowLeft 22 left-aligned in 40×40 · centred title text.lg semibold · 40 spacer
  ICON(b, 'ArrowLeft', 22, 2, INK, 33, 56, 'back (40×40 target)');
  T(b, 'nav-title safariExt.navTitle', { text: 'Safari Extension', size: 15, weight: 600, color: INK, x: cx('Safari Extension', 15, true, 0, 390), y: 61 });
  // hero — open, no card
  const hero = T(b, 'hero-title safariExt.heroTitle', { text: 'Use Vela in Safari', size: 26, weight: 700, color: INK, x: 44, y: 115 });
  try { hero.letterSpacing = '-0.5'; } catch (e) {}
  ['Almost any dApp can connect to Vela', 'right in Safari — only signing hops to Vela', 'for a quick Face ID.'].forEach((ln, i) => {
    T(b, 'hero-body-' + (i + 1), { text: ln, size: 13, weight: 400, color: MUTED, x: 44, y: 155 + i * 22 });
  });
  INST(b, 'C/Primitives/SectionLabel', null, 44, 227, { w: 302, h: 24, name: 'i:SectionLabel ENABLE IT ONCE', label: 'ENABLE IT ONCE' });
  // 4 numbered steps — NORMATIVE de-containered rows with hairlines inset to the copy column
  const steps = [
    ['Compass', ['Open a dApp site in Safari.'], 259, 52],
    ['Puzzle', ['Tap “Aa” → Manage Extensions → turn on', 'Vela Wallet.'], 312, 72],
    ['ShieldCheck', ['Tap “Aa” → Vela Wallet → Allow.'], 385, 52],
    ['Wallet', ['In the site’s Connect Wallet list, pick Vela', 'Wallet.'], 438, 72],
  ];
  steps.forEach(([ic, lines, y, h], i) => {
    E(b, 'step-badge-' + (i + 1), 22, 44, y + 14, { fill: ACCENT_SOFT });
    T(b, 'step-number-' + (i + 1), { text: String(i + 1), size: 11, weight: 700, color: ACCENT, x: 51, y: y + 19 });
    ICON(b, ic, 17, 2, ACCENT, 76, y + 16, 'step' + (i + 1));
    lines.forEach((ln, j) => T(b, 'step-copy-' + (i + 1) + '-' + (j + 1), { text: ln, size: 13, weight: 400, color: INK, x: 101, y: y + 15 + j * 21 }));
    if (i < 3) HAIR(b, 'step-sep-' + (i + 1) + ' (inset to the copy column)', 101, y + h, 245);
  });
  // one-tap aside — a tinted callout is a legitimate distinct surface (DESIGN-LANGUAGE 1)
  R(b, 'one-tap-panel (accent.soft, radius.xl, NO border)', { x: 44, y: 534, w: 302, h: 133, radius: 16, fill: ACCENT_SOFT });
  ICON(b, 'Zap', 16, 2, ACCENT, 60, 550, 'one-tap');
  T(b, 'one-tap-title safariExt.oneTapTitle', { text: 'One-tap signing', size: 13, weight: 600, color: INK, x: 84, y: 549 });
  ['Face ID confirms, then you’re back on the', 'page. Tap “Test one-tap signing” in the', 'extension popup once and even the “Open in', 'Vela?” prompt goes away.'].forEach((ln, i) => {
    T(b, 'one-tap-body-' + (i + 1), { text: ln, size: 11, weight: 400, color: MUTED, x: 60, y: 575 + i * 20 });
  });
  INST(b, 'C/Primitives/VelaButton', { variant: 'accent', size: 'default', state: 'default' }, 44, 691,
    { w: 302, h: 53, name: 'i:VelaButton accent "Open getvela.app in Safari"', label: 'Open getvela.app in Safari' });
  const hint = 'That’s where the “Aa” menu is.';
  T(b, 'cta-hint safariExt.ctaHint', { text: hint, size: 11, weight: 400, color: SUBTLE, x: cx(hint, 11, false, 0, 390), y: 756 });
  homeIndicator(b);
  lib.chip(b, 'platform', 'iOS-ONLY entry (Settings → Browser row); Android and web never surface this route — the extension only exists in Safari');
  lib.chip(b, 'note', 'CODE DRIFT (depicted normative): ships as a VelaCard step pile + a BESPOKE accent CTA (radius 15 hardcoded, opacity-0.92 press, hardcoded #fff label) — violates the VelaButton-only mandate; board shows open rows + hairlines + VelaButton'); // inv:06 §1.3 flag, §5.2, §5.4
  lib.chip(b, 'note', 'ScrollView adds paddingH 20 ON TOP of ScreenContainer 24 → the body gutter is 44, while the nav header sits at the 24 gutter (kept as drawn — it is the shipped rhythm)'); // inv:06 §1.3
  lib.chip(b, 'note', 'CTA opens the REAL default browser via Linking.openURL(https://getvela.app) — deliberately NOT an in-app SFSafariViewController, because extensions only live in Safari proper'); // inv:06 §1.3
  lib.chip(b, 'motion', 'hero fadeIn 0/400 · steps fadeInDown 120/400 · one-tap 220/400 · CTA 300/400 — iOS only, never load-bearing');
  lib.chip(b, 'edge', 'tap back -> S/settings/default');
  lib.chip(b, 'edge', 'extension signs in Safari -> O/extension-sign-controller/signed');
  lib.chip(b, 'edge', 'user taps "Test one-tap signing" in the popup -> O/extension-sign-controller/one-tap-enabled');
}

return lib.done('63-screens-browser-connect-d', {
  boards: ['S/connect/connected', 'S/connect/reconnecting', 'S/safari-extension/default'],
  missingFamilies: missing,
});
