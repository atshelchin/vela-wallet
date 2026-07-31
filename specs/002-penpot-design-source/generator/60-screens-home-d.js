if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
// 60-screens-home-d.js — S/home/{balance-loading, hidden-balance, estimate-notice}
// Page '05 Screens · Wallet', screen row 0, state cols 9..11 (manifest screens[] order).
// The three honesty states of the hero: "we don't know yet" (skeleton, never a fake 0),
// "you asked us not to say" (privacy mask), "we know but not all of it" (estimate notice).
// inv:05 §2.1, §2.9, §10 · inv:08 §10.2, §11.
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
// Activity feed: date groups, hairline inset 58 ONLY between consecutive item rows — inv:05 §2.4
const feed = (b, top, v) => {
  T(b, 'day-header-today', { text: 'Today', size: 11, weight: 600, color: SUBTLE, x: GUT, y: top + 16 });
  const r1 = top + 34, r2 = r1 + 79;
  INST(b, 'act-row-1', 'C/Rows/ActivityRow', v[0], GUT, r1, 342, 78);
  RC(b, 'sep-1', { x: 82, y: r1 + 78, w: 284, h: 1, fill: BORDER });
  INST(b, 'act-row-2', 'C/Rows/ActivityRow', v[1], GUT, r2, 342, 78);
  if (v.length > 2) {
    T(b, 'day-header-yesterday', { text: 'Yesterday', size: 11, weight: 600, color: SUBTLE, x: GUT, y: r2 + 94 });
    const r3 = top + 225, r4 = r3 + 79;
    INST(b, 'act-row-3', 'C/Rows/ActivityRow', v[2], GUT, r3, 342, 78);
    RC(b, 'sep-2', { x: 82, y: r3 + 78, w: 284, h: 1, fill: BORDER });
    if (v.length > 3) INST(b, 'act-row-4', 'C/Rows/ActivityRow', v[3], GUT, r4, 342, 78);
  }
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
};

// ═══════════════════════ state 9 — balance-loading (BalanceSkeleton)
{
  const b = await chrome('balance-loading', 9);
  heroLabel(b, HERO_Y);
  // 208×46 bar, radius 8, bg.sunken, centred in the 63px line box; a 96px bg.raised band at 85%
  // sweeps left→right, 1150ms in-out-quad, infinite — inv:05 §2.1
  RC(b, 'BalanceSkeleton 208x46', { x: GUT, y: 151, w: 208, h: 46, radius: 8, fill: SUNKEN });
  const sweep = RC(b, 'deco:skeleton-sweep 96 @85% 1150ms', { x: 60, y: 151, w: 96, h: 46, fill: RAISED });
  sweep.opacity = 0.85;
  navRow(b, NAV_Y, 'first', false);
  feed(b, FEED_Y, [{ direction: 'in', detail: 'default' }, { direction: 'out', detail: 'no-time' },
    { direction: 'out', detail: 'default' }, { direction: 'in', detail: 'default' }]);

  baseChips(b);
  lib.chip(b, 'note', 'shown ONLY when: no live tokens AND no cached total AND the first fetch has not settled. "Never show a fake 0" — a cached total always beats a skeleton'); // inv:05 §2.1, §10
  lib.chip(b, 'note', 'balance-privacy tap is DISABLED while the skeleton is up (there is nothing to hide yet)'); // inv:05 §2.9
  lib.chip(b, 'note', 'the Activity feed is sourced independently of the balance scan, so it can already be painted while the hero is still unknown'); // inv:05 §2.3
  lib.chip(b, 'motion', 'sweep band 1150ms in-out-quad infinite; the hero does NOT pulse until a real value exists'); // inv:05 §2.1
  lib.chip(b, 'edge', 'first chain responds with a live total -> S/home/default');
  lib.chip(b, 'edge', 'account switched (cached total exists) -> S/home/default (paints instantly from cache, no $0 flash)');
  lib.chip(b, 'edge', 'fetch settles incomplete after 3 silent retries -> S/home/estimate-notice');
}

// ═══════════════════════ state 10 — hidden-balance (privacy mask)
{
  const b = await chrome('hidden-balance', 10);
  heroLabel(b, HERO_Y);
  // six 16px round dots (fg.base, gap 12) + EyeOff 20 fg.subtle — the ONLY chrome the hero ever
  // shows; the line box stays pinned at 63px so toggling never shifts layout — inv:05 §2.1
  for (let i = 0; i < 6; i++) EL(b, 'mask-dot-' + (i + 1), 16, GUT + i * 28, 166, { fill: INK });
  IC(b, 'EyeOff', 20, 2, 196, 164, SUBTLE);
  navRow(b, NAV_Y, 'first', false);
  feed(b, FEED_Y, [{ direction: 'in', detail: 'masked' }, { direction: 'in', detail: 'masked' },
    { direction: 'in', detail: 'masked' }, { direction: 'in', detail: 'masked' }]);

  baseChips(b);
  lib.chip(b, 'note', 'privacy is GLOBAL and persisted: it masks the hero, activity amounts, fiat sublines, holdings balances and the account switcher, and it suppresses O/receipt-toast entirely'); // inv:05 §2.1, §10
  lib.chip(b, 'note', 'mask glyphs are real 16px circles (hero) / 7px circles (rows) — never bullet characters, which drift across fonts and locales'); // inv:02 §0b.4
  lib.chip(b, 'note', 'C/Rows/ActivityRow ships masked only on direction=in (green-tinted dots); an outgoing masked row uses the same 4-dot treatment in fg.base — variant not built, flagged as a family gap'); // inv:02 §C2 gap
  lib.chip(b, 'note', 'tap target is the whole hero line with hitSlop 8; a11y label omits the amount while masked'); // inv:05 §2.1, §8.3
  lib.chip(b, 'edge', 'hero tapped again -> S/home/default');
}

// ═══════════════════════ state 11 — estimate-notice (partial total)
{
  const b = await chrome('estimate-notice', 11);
  heroLabel(b, HERO_Y);
  heroValue(b, HERO_Y);
  // notice row: marginTop 8, self-start, gap 2, pressed opacity 0.6 — inv:05 §2.1, inv:08 §10.2
  IC(b, 'AlertTriangle', 12, 2.5, GUT, 215, WARN);
  T(b, 'estimate-notice-copy', { text: 'Some balances are still updating.', size: 11, weight: 500, color: WARN, x: 40, y: 214 });
  IC(b, 'ChevronRight', 14, 2.2, 232, 213, WARN);
  navRow(b, NAV_Y + 24, 'first', false);
  feed(b, FEED_Y + 24, [{ direction: 'in', detail: 'default' }, { direction: 'out', detail: 'no-time' },
    { direction: 'out', detail: 'default' }]);

  baseChips(b);
  lib.chip(b, 'note', 'grace-gated: an incomplete result gets 3 SILENT forced retries at 1.5s / 4s / 8s before this notice is allowed to appear; a clean result resets the budget'); // inv:08 §11.3, inv:05 §10
  lib.chip(b, 'note', 'while partial the displayed total = max(live, cached) — never a confidently-wrong smaller number, and it never dips to $0 mid-refresh'); // inv:05 §2.3, §10
  lib.chip(b, 'note', 'copy is a precedence, not a choice: failed chains win with "Some balances are still updating." (transient); otherwise unpriced tokens give "Some tokens couldn\'t be priced." (permanent — never promises an update)'); // inv:08 §10.2
  lib.chip(b, 'note', 'the notice is the ONLY warning shown for a partial total — no banner, no modal, no red'); // inv:05 §2.1
  lib.chip(b, 'edge', 'notice tapped -> O/balance-detail-sheet/both');
  lib.chip(b, 'edge', 'all chains return a clean total -> S/home/default');
  lib.chip(b, 'edge', 'a chain is genuinely broken (not 429) -> S/home/rpc-trouble');
}

const missTotal = Object.values(miss).reduce((a, n) => a + n, 0);
return lib.done('60-screens-home-d', {
  boards: ['S/home/balance-loading', 'S/home/hidden-balance', 'S/home/estimate-notice'],
  missingPlaceholders: missTotal, missingByFamily: miss,
});
