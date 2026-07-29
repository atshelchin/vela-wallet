if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
// 60-screens-home-c.js — S/home/{connections-connected, connections-reconnecting}
// Page '05 Screens · Wallet', screen row 0, state cols 7..8 (manifest screens[] order).
// The connected-dApp card is one of the VERY few real cards left in the app (inv:05 §9.1) —
// everything around it stays de-containered. Signing history is de-boxed rows + full-width hairlines.
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
// `tag` disambiguates repeats of the same glyph+size on one board (names are the upsert key)
const IC = (p, name, size, sw, x, y, color, tag) => {
  const r = RC(p, 'icon:' + name + ' ' + size + '/' + sw + (tag ? ' ' + tag : ''), { x, y, w: size, h: size });
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
  const off = (active === 'third') ? -60 : 0;
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
  lib.chip(b, 'note', 'gutters 24 (space.3xl); hero label ls 0.6 and hero number ls -1.2 / tail -0.5 are NOT expressible on these text shapes — read them here');
  lib.chip(b, 'note', 'hero = C/Primitives/AmountText mode=fiat symbol=subordinated(0.58x) tail=0.56x; drawn at Home ideal 54 (family main instance is baked at text.5xl 40) — inv:05 §2.1 vs inv:02 A6');
  lib.chip(b, 'platform', 'safe-area top only (47 here); WaveDock bar = 86 + bottom inset (34 here); entrances fadeIn/fadeInDown are iOS-ONLY — Android and web paint the settled state');
  lib.chip(b, 'note', 'Connections tab badge = 1 while a session is connected/reconnecting; the SegmentedToggle badge sample reads "2" (single session is the Vela invariant)'); // inv:05 §2.1, §2.6
};

// shared: the dApp session card body, drawn OVER the VelaCard instance (never inside it —
// injecting children into an instance would create overrides). inv:05 §2.6 state 3.
const sessionCard = (b, cardH, statusColor, statusText, noteLines, reconnect) => {
  const card = INST(b, 'SessionCard', 'C/Primitives/VelaCard', { elevation: 'elevated' }, GUT, FEED_Y, 342, cardH);
  if (card) { try { card.resize(342, cardH); penpotUtils.setParentXY(card, GUT, FEED_Y); } catch (e) {} }
  RC(b, 'dapp-monogram-tile', { x: 40, y: 298, w: 44, h: 44, radius: 13, fill: SUNKEN }); // 44 tile, radius 13 — inv:05 §2.6
  T(b, 'dapp-monogram-letter', { text: 'U', size: 17, weight: 700, color: INK, x: 57, y: 308 });
  T(b, 'dapp-name', { text: 'Uniswap', size: 15, weight: 600, color: INK, x: 96, y: 300 });
  T(b, 'dapp-url', { text: 'app.uniswap.org', size: 11, weight: 400, color: MUTED, x: 96, y: 322 });
  EL(b, 'status-dot 7', 7, reconnect ? 256 : 296, 308, { fill: statusColor, op: reconnect ? 0.8 : 1 });
  T(b, 'status-label', { text: statusText, size: 11, weight: 600, color: statusColor, x: reconnect ? 268 : 308, y: 304 });
  noteLines.forEach((line, i) =>
    T(b, 'session-note-l' + (i + 1), { text: line, size: 11, weight: 500, color: reconnect ? WARN : MUTED, x: 40, y: 356 + i * 18 }));
  if (reconnect) {
    // accent fill, radius 12, padV 12; RefreshCw spins 900ms/turn linear while reconnecting — inv:05 §2.6
    RC(b, 'btn-reconnect', { x: 40, y: 400, w: 310, h: 44, radius: 12, fill: ACCENT });
    IC(b, 'RefreshCw', 16, 2.2, 136, 414, INVERSE);
    T(b, 'btn-reconnect-label', { text: 'Reconnect now', size: 13, weight: 600, color: INVERSE, x: 160, y: 414 });
  }
  const dy = reconnect ? 452 : 382;
  // outline: bg.raised + 1px border.base + radius 12 + padV 12 — inv:05 §2.6
  RC(b, 'btn-disconnect', { x: 40, y: dy, w: 310, h: 44, radius: 12, fill: RAISED, stroke: BORDER, strokeWidth: 1 });
  T(b, 'btn-disconnect-label', { text: 'Disconnect', size: 13, weight: 600, color: INK, x: 159, y: dy + 14 });
};

// shared: CONNECTION ACTIVITY list — de-boxed rows on the page bg, full-width hairlines — inv:05 §2.6 state 4
const activityList = (b, y) => {
  T(b, 'SectionLabel CONNECTION ACTIVITY', { text: 'CONNECTION ACTIVITY · 2', size: 11, weight: 600, color: SUBTLE, x: GUT, y });
  IC(b, 'Trash2', 13, 2, 322, y, SUBTLE);
  T(b, 'clear-label', { text: 'Clear', size: 11, weight: 600, color: SUBTLE, x: 340, y: y + 1 });
  const r1 = y + 28, r2 = r1 + 56;
  // row 1 — confirmed: no status pill (silence IS the confirmed state) — inv:05 §2.6
  T(b, 'evt-1-label', { text: 'Swap tokens', size: 13, weight: 600, color: INK, x: GUT, y: r1 + 11 });
  T(b, 'evt-1-sub', { text: 'app.uniswap.org', size: 11, weight: 400, color: MUTED, x: GUT, y: r1 + 32 });
  T(b, 'evt-1-time', { text: '2m', size: 11, weight: 400, color: SUBTLE, x: 328, y: r1 + 22 });
  IC(b, 'ChevronRight', 16, 2, 348, r1 + 20, SUBTLE, 'evt-1');
  RC(b, 'evt-sep-1', { x: GUT, y: r2, w: 342, h: 1, fill: BORDER });
  // row 2 — not yet confirmed: info.soft / info.base "Processing" pill — inv:05 §2.6
  T(b, 'evt-2-label', { text: 'Approve USDC', size: 13, weight: 600, color: INK, x: GUT, y: r2 + 11 });
  T(b, 'evt-2-sub', { text: 'app.uniswap.org', size: 11, weight: 400, color: MUTED, x: GUT, y: r2 + 32 });
  RC(b, 'evt-2-status-pill', { x: 257, y: r2 + 19, w: 63, h: 18, radius: 9, fill: INFO_SOFT });
  T(b, 'evt-2-status-label', { text: 'Processing', size: 10, weight: 600, color: INFO, x: 262, y: r2 + 23 });
  T(b, 'evt-2-time', { text: '5m', size: 11, weight: 400, color: SUBTLE, x: 328, y: r2 + 22 });
  IC(b, 'ChevronRight', 16, 2, 348, r2 + 20, SUBTLE, 'evt-2');
  RC(b, 'evt-sep-2', { x: GUT, y: r2 + 56, w: 342, h: 1, fill: BORDER });
};
const listChips = (b) => {
  lib.chip(b, 'note', 'signing-activity row: label + subtitle | status pill ONLY when not confirmed (info.soft "Processing" / error.soft "Failed") | relative time | ChevronRight 16'); // inv:05 §2.6
  lib.chip(b, 'note', 'row tap -> O/signing-sheet replay when the record captured its request, else O/connection-event-detail-sheet/tx; swipe-left reveals a full-height error.base Delete action'); // inv:05 §2.6
  lib.chip(b, 'note', '"Clear" opens a destructive confirm dialog (O/app-alert/destructive) before wiping the list'); // inv:05 §2.6
};

// ═══════════════════════════ state 7 — connections-connected
{
  const b = await chrome('connections-connected', 7);
  heroLabel(b, HERO_Y);
  heroValue(b, HERO_Y);
  navRow(b, NAV_Y, 'third', true);
  sessionCard(b, 160, SUCCESS, 'Active', ['Only one active connection at a time'], false);
  activityList(b, 458);

  baseChips(b);
  listChips(b);
  lib.chip(b, 'note', 'C/Primitives/VelaCard elevation=elevated — one of the few surfaces where a card survives the de-container rule (padding 16, marginBottom 16); its children are drawn on the screen board above it, not injected into the instance'); // inv:05 §2.6, §9.1
  lib.chip(b, 'note', 'card height 160 = pad 16 + identity row 44 + note line + Disconnect 44 + pad 16 (the VelaCard family main instance is baked at 140 and is resized per usage — height is content-driven, never fixed)'); // inv:05 §2.6, inv:02 A2
  lib.chip(b, 'note', 'ONE active session by design: a second pairing replaces this one; that invariant is the note line under the identity row'); // inv:05 §2.6
  lib.chip(b, 'edge', 'bridge socket drops -> S/home/connections-reconnecting');
  lib.chip(b, 'edge', 'Disconnect confirmed -> S/home/connections-empty');
  lib.chip(b, 'edge', 'dApp sends a signing request -> O/signing-sheet/clear-signed');
  lib.chip(b, 'edge', 'a new pairing is scanned -> S/home/connections-connecting (replaces this session)');
}

// ═══════════════════════ state 8 — connections-reconnecting (stuck copy)
{
  const b = await chrome('connections-reconnecting', 8);
  heroLabel(b, HERO_Y);
  heroValue(b, HERO_Y);
  navRow(b, NAV_Y, 'third', true);
  sessionCard(b, 230, WARN, 'Reconnecting…', ["Couldn't reconnect. Try again, or", 'disconnect and re-pair.'], true);
  activityList(b, 528);

  baseChips(b);
  listChips(b);
  lib.chip(b, 'note', 'card height 230 = pad 16 + identity row 44 + 2-line note + Reconnect 44 + gap 8 + Disconnect 44 + pad 16 (VelaCard family main instance is baked at 140 and resized per usage)'); // inv:05 §2.6, inv:02 A2
  lib.chip(b, 'note', 'status dot renders at 0.8 opacity while reconnecting; the note line flips from the neutral "Only one active connection at a time" to this warning.base recovery copy only once retries are exhausted'); // inv:05 §2.6
  lib.chip(b, 'note', 'the session card and its history stay fully readable while reconnecting — a dropped socket never blanks the tab'); // inv:05 §2.6
  lib.chip(b, 'motion', 'RefreshCw spins continuously 900ms/turn linear; press = haptic + opacity 0.82 + scale 0.985, and the label holds "Reconnecting…" for 1.4s after a tap'); // inv:05 §2.6
  lib.chip(b, 'edge', 'socket re-establishes -> S/home/connections-connected');
  lib.chip(b, 'edge', 'Disconnect confirmed -> S/home/connections-empty');
}

const missTotal = Object.values(miss).reduce((a, n) => a + n, 0);
return lib.done('60-screens-home-c', {
  boards: ['S/home/connections-connected', 'S/home/connections-reconnecting'],
  missingPlaceholders: missTotal, missingByFamily: miss,
});
