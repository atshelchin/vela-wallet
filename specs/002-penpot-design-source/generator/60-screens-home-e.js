if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
// 60-screens-home-e.js — S/home/{rate-limited, rpc-trouble, refreshing}
// Page '05 Screens · Wallet', screen row 0, state cols 12..14 (manifest screens[] order).
// The two degraded-data states are deliberately NOT the same picture: a 429 is transient and
// gets NO banner (cached balance, quiet notice), a dead endpoint gets the warning banner with a
// Fix affordance. That asymmetry is the confirmed rate-limit UX rule — inv:05 §2.1, §10 · inv:08 §11.
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
const notice = (b, y) => {                                     // stale-balance notice — inv:05 §2.1, inv:08 §10.2
  IC(b, 'AlertTriangle', 12, 2.5, GUT, y + 1, WARN);
  T(b, 'estimate-notice-copy', { text: 'Some balances are still updating.', size: 11, weight: 500, color: WARN, x: 40, y });
  IC(b, 'ChevronRight', 14, 2.2, 232, y - 1, WARN);
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
const feed = (b, top, v) => {
  T(b, 'day-header-today', { text: 'Today', size: 11, weight: 600, color: SUBTLE, x: GUT, y: top + 16 });
  const r1 = top + 34, r2 = r1 + 79;
  INST(b, 'act-row-1', 'C/Rows/ActivityRow', v[0], GUT, r1, 342, 78);
  RC(b, 'sep-1', { x: 82, y: r1 + 78, w: 284, h: 1, fill: BORDER });
  INST(b, 'act-row-2', 'C/Rows/ActivityRow', v[1], GUT, r2, 342, 78);
  if (v.length > 2) {
    T(b, 'day-header-yesterday', { text: 'Yesterday', size: 11, weight: 600, color: SUBTLE, x: GUT, y: r2 + 94 });
    const r3 = top + 225;
    INST(b, 'act-row-3', 'C/Rows/ActivityRow', v[2], GUT, r3, 342, 78);
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

// ═══════════════ state 12 — rate-limited (429: cached balance, NO banner)
{
  const b = await chrome('rate-limited', 12);
  heroLabel(b, HERO_Y);
  heroValue(b, HERO_Y);
  notice(b, 214);
  navRow(b, NAV_Y + 24, 'first', false);
  feed(b, FEED_Y + 24, [{ direction: 'in', detail: 'default' }, { direction: 'out', detail: 'no-time' },
    { direction: 'out', detail: 'default' }]);

  baseChips(b);
  lib.chip(b, 'note', 'THE RULE: rate-limited chains are filtered OUT of the RpcTroubleBanner (failedChainIds minus rateLimitedChainIds). A 429 lifts in seconds — never nag the user to swap an RPC for it'); // inv:08 §11.1, inv:05 §10
  lib.chip(b, 'note', 'this board is deliberately almost identical to S/home/estimate-notice: the ONLY visible difference from a healthy Home is the quiet notice. Compare against S/home/rpc-trouble, which is what a real breakage looks like'); // inv:05 §2.1, §10
  lib.chip(b, 'note', 'balance quietly falls back to cache: hero = max(liveTotal, cachedTotal); a complete clean fetch becomes the new "last known good"'); // inv:08 §11.2
  lib.chip(b, 'note', 'rate-limited chains DO count toward balancePartial (so the notice can appear); they are distinguishable only inside the balance sheet, labelled "Rate-limited · retrying automatically" and given NO Fix action'); // inv:08 §11.4, inv:05 §2.11
  lib.chip(b, 'note', 'dev fault injection for this exact board: vela.rateLimitRpc(chain|"all") in the web console'); // inv:08 §11
  lib.chip(b, 'edge', 'notice tapped -> O/balance-detail-sheet/rate-limited-row');
  lib.chip(b, 'edge', 'the 429 window closes and the chain answers -> S/home/default');
  lib.chip(b, 'edge', 'the same chain then fails outright (non-429) -> S/home/rpc-trouble');
}

// ═════════════════ state 13 — rpc-trouble (every endpoint of a chain is down)
{
  const b = await chrome('rpc-trouble', 13);
  heroLabel(b, HERO_Y);
  heroValue(b, HERO_Y);
  notice(b, 214);
  // RpcTroubleBanner: warning.soft, radius 12, 1px warning.border, padding 12, marginBottom 12 — inv:05 §8.14
  RC(b, 'RpcTroubleBanner', { x: GUT, y: 238, w: 342, h: 86, radius: 12, fill: WARN_SOFT, stroke: WARN_BORDER, strokeWidth: 1 });
  IC(b, 'AlertTriangle', 14, 2.2, 36, 250, WARN_ICON);         // hardcoded #C07A0A — token deviation, inv:08 §10.1
  T(b, 'banner-title', { text: '2 networks RPC unavailable', size: 11, weight: 600, color: WARN, x: 56, y: 251 });
  EL(b, 'ChainLogo 16 Gnosis', 16, 36, 272, { fill: '#04795B' });
  T(b, 'banner-chain-1', { text: 'Gnosis', size: 11, weight: 500, color: INK, x: 58, y: 273 });
  T(b, 'banner-fix-1', { text: 'Fix', size: 11, weight: 600, color: ACCENT, x: 336, y: 273 });
  EL(b, 'ChainLogo 16 Celo', 16, 36, 296, { fill: '#FCFF52' });
  T(b, 'banner-chain-2', { text: 'Celo', size: 11, weight: 500, color: INK, x: 58, y: 297 });
  T(b, 'banner-fix-2', { text: 'Fix', size: 11, weight: 600, color: ACCENT, x: 336, y: 297 });
  navRow(b, 336, 'first', false);
  feed(b, 392, [{ direction: 'in', detail: 'default' }, { direction: 'out', detail: 'no-time' }]);

  baseChips(b);
  lib.chip(b, 'note', 'banner lists ONLY chains whose every endpoint failed and that are not merely rate-limited; single-chain copy is "{Name} RPC unavailable", plural is the count variant'); // inv:05 §8.14, inv:08 §11.1
  lib.chip(b, 'note', 'AlertTriangle here is hardcoded #C07A0A (NOT color.warning.base) — a real token deviation in the source, carried through deliberately so a rebuild reproduces it knowingly'); // inv:08 §10.1
  lib.chip(b, 'note', 'the banner is warning, never error: the wallet still works, only one network is dark. No red anywhere on Home'); // inv:05 §8.14, docs/DESIGN-LANGUAGE.md §8
  lib.chip(b, 'note', 'the standalone banner also exists as O/rpc-trouble-banner/default; RpcFixModal is a SINGLE shared instance serving both these chips and the balance sheet Fix rows'); // inv:05 §2.8, §8.14
  lib.chip(b, 'motion', 'banner enters fadeInDown 0/300, hasEntered-gated (iOS only)'); // inv:08 §10.1
  lib.chip(b, 'edge', 'Fix tapped on a chain chip -> O/rpc-fix-form/prefilled');
  lib.chip(b, 'edge', 'notice tapped -> O/balance-detail-sheet/networks-only');
  lib.chip(b, 'edge', 'a working endpoint is saved or the chain recovers -> S/home/default');
}

// ═══════════════════════════ state 14 — refreshing (VelaRefresh held open)
{
  const b = await chrome('refreshing', 14);
  // finger-tracked pull: content is translated down by the 72px trigger distance and rests there
  // while the fetch runs (held >=650ms so the spinner is never a flicker) — inv:05 §2.2
  INST(b, 'VelaRefresh', 'C/Controls/VelaRefresh', { state: 'refreshing', caption: 'status' }, 159, 119, 72, 92);
  heroLabel(b, HERO_Y + 72);
  heroValue(b, HERO_Y + 72);
  navRow(b, NAV_Y + 72, 'first', false);
  feed(b, FEED_Y + 72, [{ direction: 'in', detail: 'glow' }, { direction: 'out', detail: 'no-time' },
    { direction: 'out', detail: 'default' }]);

  baseChips(b);
  lib.chip(b, 'note', 'native RefreshControl is NOT used — VelaRefresh is the branded indicator; the caption "Updated {relative time}" is the payoff of the pull (freshness is the thing the user came for)'); // inv:05 §2.2
  lib.chip(b, 'note', 'a pull forces a real RPC re-fetch, bypassing the 5-minute token cache, on all three tabs'); // inv:05 §2.2
  lib.chip(b, 'note', 'the whole scroll content is translated +72; the WaveDock does not move (it is absolute chrome, outside the scroll view)'); // inv:05 §2.1, §8.1
  lib.chip(b, 'note', 'the newest incoming row here carries the success.soft isNew wash — a pull that lands money shows it immediately'); // inv:05 §2.4
  lib.chip(b, 'motion', 'trigger 72px: 1:1 finger tracking then 0.4 resistance (the resistance change IS the threshold), one crisp haptic on crossing, arc draws 8%->70% with the pull then spins 360deg/750ms; spring-back below threshold'); // inv:05 §2.2, inv:02 B3
  lib.chip(b, 'platform', 'native indicator sits on a bg.raised plate with a raw 0,2/0.08/6 shadow; on web the plate is transparent'); // inv:02 B3
  lib.chip(b, 'edge', 'fetch resolves clean (min 650ms hold) -> S/home/default');
  lib.chip(b, 'edge', 'fetch resolves incomplete -> S/home/estimate-notice');
  lib.chip(b, 'edge', 'a chain 429s during the forced fetch -> S/home/rate-limited');
}

const missTotal = Object.values(miss).reduce((a, n) => a + n, 0);
return lib.done('60-screens-home-e', {
  boards: ['S/home/rate-limited', 'S/home/rpc-trouble', 'S/home/refreshing'],
  missingPlaceholders: missTotal, missingByFamily: miss,
});
