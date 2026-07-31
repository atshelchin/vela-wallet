if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
// 60-screens-home-b.js — S/home/{connections-empty, connections-connecting, connections-error}
// Page '05 Screens · Wallet', screen row 0, state cols 4..6 (manifest screens[] order).
// Connections tab = ONE active dApp session + its signing history; the user never leaves the tab
// while pairing — inv:05 §2.6.
const lib = storage.lib;
const PAGE = '05 Screens · Wallet';
const ROW_Y = 0;
const COL = (i) => i * 450;

// ── light-theme palette — inv:05 §1.1 ───────────────────────────────────────
const INK = '#1A1A18', MUTED = '#6E6B62', SUBTLE = '#8C887E', INVERSE = '#FFFFFF';
const BG = '#FAFAF8', RAISED = '#FFFFFF', SUNKEN = '#F5F3EF';
const ACCENT = '#E8572A', ACCENT_SOFT = '#FFF0EB';
const SUCCESS = '#2D8E5F', SUCCESS_SOFT = '#EDFAF2';
const WARN = '#92600A', WARN_SOFT = '#FFF8F0', WARN_BORDER = '#F0DCC8', WARN_ICON = '#C07A0A';
const ERR = '#C62828', ERR_SOFT = '#FEF2F2', INFO = '#4267F4', INFO_SOFT = '#EDF0FF';
const BORDER = '#ECEBE4', STRONG = '#D8D6CE';

const miss = {};
const T = (p, n, s) => lib.upsertText(p, n, s).text;
const RC = (p, n, s) => lib.upsertRect(p, n, s).rect;
const IC = (p, name, size, sw, x, y, color) => {
  const r = RC(p, 'icon:' + name + ' ' + size + '/' + sw, { x, y, w: size, h: size });
  r.fills = []; r.strokes = [{ strokeColor: color || INK, strokeWidth: sw, strokeAlignment: 'inner' }];
  return r;
};
const EL = (p, n, d, x, y, o) => {
  const nm = lib.norm(n);
  let e = penpotUtils.findShape(sh => sh.name === nm && sh.type === 'ellipse', p);
  if (!e) { e = penpot.createEllipse(); e.name = n; p.appendChild(e); }
  if (Math.round(e.width) !== d || Math.round(e.height) !== d) e.resize(d, d);
  penpotUtils.setParentXY(e, x, y);
  e.fills = (o && o.fill) ? [{ fillColor: o.fill, fillOpacity: (o.op === undefined ? 1 : o.op) }] : [];
  e.strokes = (o && o.stroke) ? [{ strokeColor: o.stroke, strokeWidth: o.sw || 1, strokeAlignment: 'inner' }] : [];
  return e;
};
const SB = (p, n, g) => {
  const nm = lib.norm(n);
  let b = penpotUtils.findShape(sh => sh.name === nm && sh.type === 'board', p);
  if (!b) { b = penpot.createBoard(); b.name = n; p.appendChild(b); }
  if (Math.round(b.width) !== g.w || Math.round(b.height) !== g.h) b.resize(g.w, g.h);
  penpotUtils.setParentXY(b, g.x, g.y);
  b.fills = g.fill ? [{ fillColor: g.fill, fillOpacity: 1 }] : [];
  try { b.clipContent = true; } catch (e) {}
  return b;
};
const famOK = (f) => penpot.library.local.components.some(c => c.name === lib.norm(f));
const INST = (p, slot, fam, props, x, y, w, h) => {
  const phName = 'MISSING:' + fam + ' ' + slot;
  const cur = penpotUtils.findShape(sh => sh.name === lib.norm(slot) || sh.name === lib.norm(phName), p);
  if (cur) {
    if (cur.name !== lib.norm(phName)) { penpotUtils.setParentXY(cur, x, y); return cur; }
    if (!famOK(fam)) { penpotUtils.setParentXY(cur, x, y); miss[fam] = (miss[fam] || 0) + 1; return null; }
    cur.remove();
    const lbl = penpotUtils.findShape(sh => sh.name === lib.norm('missing-label ' + slot), p);
    if (lbl) lbl.remove();
  }
  const inst = lib.instance(fam, props, p, x, y);
  if (inst) { inst.name = slot; return inst; }
  miss[fam] = (miss[fam] || 0) + 1;
  RC(p, phName, { x, y, w: w || 342, h: h || 44, fill: ERR_SOFT, stroke: ERR, strokeWidth: 1, radius: 8 });
  T(p, 'missing-label ' + slot, { text: 'MISSING ' + fam, size: 9, weight: 600, color: ERR, x: x + 8, y: y + 8 });
  return null;
};

// ── Home chrome — inv:05 §2.1 ───────────────────────────────────────────────
const GUT = 24, RIGHT = 366, DOCK_Y = 696, HERO_Y = 143, NAV_Y = 226, FEED_Y = 282;
const statusBar = (b) => {
  T(b, 'status-time', { text: '9:41', size: 13, weight: 600, color: INK, x: 31, y: 15 });
  RC(b, 'deco:status-signal', { x: 300, y: 17, w: 17, h: 11, fill: INK, radius: 2 });
  RC(b, 'deco:status-wifi', { x: 321, y: 17, w: 15, h: 11, fill: INK, radius: 2 });
  RC(b, 'deco:status-battery', { x: 340, y: 17, w: 24, h: 12, fill: INK, radius: 3 });
};
const header = (b) => {
  INST(b, 'WalletAvatar-44', 'C/Media/WalletAvatar', { style: 'identicon', size: 44 }, GUT, 55, 44, 44);
  T(b, 'account-name', { text: 'Main Account', size: 15, weight: 700, color: INK, x: 76, y: 57 });
  IC(b, 'ChevronDown', 15, 2.4, 180, 61, SUBTLE);
  T(b, 'account-address', { text: '0x8Ba1…BA72', size: 11, weight: 500, zone: 'mono', color: SUBTLE, x: 76, y: 80 });
  IC(b, 'Settings', 22, 2, 333, 66, INK);
};
const heroLabel = (b, y) =>
  T(b, 'hero-label', { text: 'TOTAL BALANCE · USD', size: 11, weight: 600, color: SUBTLE, x: GUT, y: y - 20 });
const heroValue = (b, y) => {
  T(b, 'AmountText hero symbol 0.58x', { text: '$', size: 31, weight: 700, color: INK, x: GUT, y: y + 18 });
  T(b, 'AmountText hero integer', { text: '12,847', size: 54, weight: 700, color: INK, x: 45, y: y });
  T(b, 'AmountText hero decimals 0.56x', { text: '.32', size: 30, weight: 700, color: SUBTLE, x: 218, y: y + 19 });
};
const navRow = (b, y, active, badge) => {
  const vp = SB(b, 'segmented-scroll-viewport', { x: GUT, y, w: 215, h: 44 });
  const off = (active === 'third') ? -60 : 0;                  // active auto-scrolls into view (−24) — inv:02 B1
  INST(vp, 'SegmentedToggle', 'C/Controls/SegmentedToggle',
    { segments: 'three', active, adorn: badge ? 'badge' : 'none' }, off, 0, 275, 44);
  const x = RIGHT - 119;
  RC(b, 'network-filter chip', { x, y: y + 4, w: 119, h: 36, radius: 18, fill: SUNKEN });
  EL(b, 'ChainLogo 20 Ethereum', 20, x + 12, y + 12, { fill: '#627EEA', stroke: RAISED, sw: 2 });
  EL(b, 'ChainLogo 20 Base', 20, x + 24, y + 12, { fill: '#0052FF', stroke: RAISED, sw: 2 });
  EL(b, 'ChainLogo 20 Arbitrum', 20, x + 36, y + 12, { fill: '#12AAFF', stroke: RAISED, sw: 2 });
  T(b, 'network-filter label', { text: 'All', size: 13, weight: 600, color: INK, x: x + 64, y: y + 15 });
  IC(b, 'ChevronDown', 13, 2.4, x + 94, y + 16, MUTED);
};
const dock = (b) => {
  INST(b, 'WaveDock', 'C/Controls/WaveDock', { element: 'bar' }, 0, DOCK_Y, 390, 114);
  RC(b, 'deco:dock-safe-inset-fill 34', { x: 0, y: 810, w: 390, h: 34, fill: RAISED });
};
const chrome = async (state, idx) => {
  const { board: b } = await lib.upsertBoard(PAGE, 'S/home/' + state, { x: COL(idx), y: ROW_Y, w: 390, h: 844, fill: BG });
  statusBar(b); header(b); dock(b);
  return b;
};
const baseChips = (b) => {
  lib.chip(b, 'note', 'gutters 24 (space.3xl); hero label ls 0.6 and hero number ls -1.2 / tail -0.5 are NOT expressible on these text shapes — read them here'); // inv:05 §1.3, §2.1
  lib.chip(b, 'note', 'hero = C/Primitives/AmountText mode=fiat symbol=subordinated(0.58x) tail=0.56x; drawn at Home ideal 54 (family main instance is baked at text.5xl 40) — inv:05 §2.1 vs inv:02 A6');
  lib.chip(b, 'platform', 'safe-area top only (47 here); WaveDock bar = 86 + bottom inset (34 here); entrances fadeIn/fadeInDown are iOS-ONLY — Android and web paint the settled state'); // inv:05 §1.3, §8.1
  lib.chip(b, 'note', 'Connections badge on the tab appears ONLY while a session is connected/reconnecting; the C/Controls/SegmentedToggle badge sample reads "2", Home always shows "1" (single session)'); // inv:05 §2.1, §2.6
};

// ═══════════════════════════ state 4 — connections-empty (disconnected)
{
  const b = await chrome('connections-empty', 4);
  heroLabel(b, HERO_Y);
  heroValue(b, HERO_Y);
  navRow(b, NAV_Y, 'third', false);

  // centered empty state, padTop 32, gap 8 — inv:05 §2.6 state 2
  EL(b, 'empty-disc 56', 56, 167, 314, { fill: SUNKEN });
  IC(b, 'Plug', 26, 2, 182, 329, SUBTLE);
  T(b, 'empty-title', { text: 'No active connection', size: 17, weight: 600, color: INK, x: 110, y: 378 });
  T(b, 'empty-sub', { text: 'Scan, or enter a link / URL', size: 13, weight: 400, color: MUTED, x: 111, y: 408 });

  // paste row: multiline mono input + 56×56 accent submit square — inv:05 §2.6
  RC(b, 'paste-input', { x: GUT, y: 440, w: 274, h: 56, radius: 12, fill: SUNKEN, stroke: BORDER, strokeWidth: 1 });
  T(b, 'paste-placeholder', { text: 'Paste a link or URL', size: 13, weight: 400, zone: 'mono', color: SUBTLE, x: 36, y: 452 });
  RC(b, 'paste-submit', { x: 310, y: 440, w: 56, h: 56, radius: 12, fill: ACCENT });
  IC(b, 'ArrowRight', 18, 2.2, 329, 459, INVERSE);

  // history text-button — rendered only when browser history exists — inv:05 §2.6
  IC(b, 'History', 15, 2, GUT, 513, MUTED);
  T(b, 'history-label', { text: 'History', size: 13, weight: 600, color: MUTED, x: 46, y: 513 });
  T(b, 'history-hint', { text: 'recently opened', size: 11, weight: 400, color: SUBTLE, x: 98, y: 515 });

  baseChips(b);
  lib.chip(b, 'note', 'paste input accepts three payload kinds: WalletPair URI -> pairing · remote-inject bridge URL -> bridge · any web URL/host -> S/browser/loaded'); // inv:05 §2.6
  lib.chip(b, 'note', 'submit square disabled state = bg.sunken fill + fg.subtle icon (accent only once the field parses)'); // inv:05 §2.6
  lib.chip(b, 'note', 'paste-row placeholder string is not quoted in the inventory (comes from the connect ns) — the copy shown here is representative, not verbatim'); // inv:05 §2.6 gap
  lib.chip(b, 'note', 'the signing-history list still renders BELOW this empty state whenever events exist — browser/extension-signed txs arrive with no live session and must stay reviewable'); // inv:05 §2.6
  lib.chip(b, 'note', 'pointer targets: History -> O/browser-history-sheet/populated · dock Scan -> O/qr-scanner/scanning-native'); // inv:05 §2.6, §2.7
  lib.chip(b, 'edge', 'WalletPair URI pasted or scanned -> S/home/connections-connecting');
  lib.chip(b, 'edge', 'web URL pasted -> S/browser/loaded');
}

// ═══════════════════════ state 5 — connections-connecting (inline pairing)
{
  const b = await chrome('connections-connecting', 5);
  heroLabel(b, HERO_Y);
  heroValue(b, HERO_Y);
  navRow(b, NAV_Y, 'third', false);

  // inline ConnectionFlowStates — the user NEVER leaves the tab while pairing — inv:05 §2.6 state 1
  INST(b, 'ConnectionFlowStates', 'C/Controls/ConnectionFlowStates', { state: 'verify' }, GUT, FEED_Y, 342, 386);

  baseChips(b);
  lib.chip(b, 'note', 'pairing sequence in this one slot: verify (4-digit WalletPair fingerprint) -> waiting ("Waiting for dApp to accept...") -> connected | error; all three are variants of C/Controls/ConnectionFlowStates, same position'); // inv:05 §2.6, inv:03 §7.1
  lib.chip(b, 'note', 'the fingerprint must match what the dApp shows — this is the anti-MITM step, never auto-confirmed'); // inv:03 §7.1
  lib.chip(b, 'motion', 'verify enters fadeInDown 300ms delay 50 (iOS only)'); // inv:03 §7.1
  lib.chip(b, 'edge', 'fingerprint confirmed -> ConnectionFlowStates state=waiting (same slot, no board change)');
  lib.chip(b, 'edge', 'dApp accepts -> S/home/connections-connected');
  lib.chip(b, 'edge', 'bridge unreachable or dApp declines -> S/home/connections-error');
  lib.chip(b, 'edge', 'Cancel pressed -> S/home/connections-empty');
}

// ══════════════════════════════ state 6 — connections-error (pairing failed)
{
  const b = await chrome('connections-error', 6);
  heroLabel(b, HERO_Y);
  heroValue(b, HERO_Y);
  navRow(b, NAV_Y, 'third', false);

  INST(b, 'ConnectionFlowStates', 'C/Controls/ConnectionFlowStates', { state: 'error' }, GUT, FEED_Y, 342, 330);

  baseChips(b);
  lib.chip(b, 'note', 'open typographic failure (no card): 64 error.soft disc + AlertTriangle 28, text.xl bold title, muted message, accent "Scan Again" + secondary "Retry" (Retry only when a session still exists)'); // inv:05 §2.6, inv:08 §10.5
  lib.chip(b, 'note', 'failure stays INSIDE the tab — the wallet never bounces the user to a separate error screen for a pairing miss'); // inv:05 §2.6
  lib.chip(b, 'motion', 'error enters fadeInDown 300ms (iOS only)'); // inv:08 §10.5
  lib.chip(b, 'edge', 'Scan Again pressed -> O/qr-scanner/scanning-native');
  lib.chip(b, 'edge', 'Retry succeeds -> S/home/connections-connected');
  lib.chip(b, 'edge', 'dismissed -> S/home/connections-empty');
}

const missTotal = Object.values(miss).reduce((a, n) => a + n, 0);
return lib.done('60-screens-home-b', {
  boards: ['S/home/connections-empty', 'S/home/connections-connecting', 'S/home/connections-error'],
  missingPlaceholders: missTotal, missingByFamily: miss,
});
