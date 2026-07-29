if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
// 60-screens-home-a.js — S/home/{default, activity-empty, assets, assets-empty}
// Page '05 Screens · Wallet', screen row 0 (route "home"), state cols 0..3 (manifest screens[] order).
// HomeScreen is THE reference screen for the whole design language — inv:05 §2, docs/DESIGN-LANGUAGE.md.
// Everything sits open on bg.base: no cards, hairline dividers inset past the leading icon,
// SectionLabel + whitespace instead of containers, single accent (Send pill only).
const lib = storage.lib;
const PAGE = '05 Screens · Wallet';
const ROW_Y = 0;                 // screen index 0 → y = 0
const COL = (i) => i * 450;      // state index → x

// ── light-theme palette — inv:05 §1.1 ───────────────────────────────────────
const INK = '#1A1A18', MUTED = '#6E6B62', SUBTLE = '#8C887E', INVERSE = '#FFFFFF';
const BG = '#FAFAF8', RAISED = '#FFFFFF', SUNKEN = '#F5F3EF';
const ACCENT = '#E8572A', ACCENT_SOFT = '#FFF0EB';
const SUCCESS = '#2D8E5F', SUCCESS_SOFT = '#EDFAF2';
const WARN = '#92600A', WARN_SOFT = '#FFF8F0', WARN_BORDER = '#F0DCC8', WARN_ICON = '#C07A0A';
const ERR = '#C62828', ERR_SOFT = '#FEF2F2', INFO = '#4267F4', INFO_SOFT = '#EDF0FF';
const BORDER = '#ECEBE4', STRONG = '#D8D6CE';

// ── tiny shape helpers (chunk-local by convention: every chunk is a standalone body) ──
const miss = {};
const T = (p, n, s) => lib.upsertText(p, n, s).text;
const RC = (p, n, s) => lib.upsertRect(p, n, s).rect;
const IC = (p, name, size, sw, x, y, color) => {              // icon placeholder grammar: icon:<Lucide> <size>/<stroke>
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
const SB = (p, n, g) => {                                      // nested board (used as a scroll viewport that clips)
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
// Compose from the library FIRST (FR-005). Instances are not name-unique, so each usage gets a
// board-local slot name and is upserted under it; a missing family degrades to a labelled placeholder.
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

// ── Home chrome (identical across every S/home/* board) — inv:05 §2.1 ───────
const GUT = 24;            // ScreenContainer padH = space.3xl — inv:05 §1.3
const RIGHT = 366;         // 390 − 24
const DOCK_Y = 696;        // 844 − 34 home-inset − 86 bar − 28 FAB overhang — inv:05 §8.1
const HERO_Y = 143;        // balance line box top (63 px tall, pinned) — inv:05 §2.1
const NAV_Y = 226;         // tab row top — inv:05 §2.1
const FEED_Y = 282;        // tab content top (nav 44 + marginBottom 12) — inv:05 §2.1

const statusBar = (b) => {                                     // deco: consumers ignore deco:* — consumption contract
  T(b, 'status-time', { text: '9:41', size: 13, weight: 600, color: INK, x: 31, y: 15 });
  RC(b, 'deco:status-signal', { x: 300, y: 17, w: 17, h: 11, fill: INK, radius: 2 });
  RC(b, 'deco:status-wifi', { x: 321, y: 17, w: 15, h: 11, fill: INK, radius: 2 });
  RC(b, 'deco:status-battery', { x: 340, y: 17, w: 24, h: 12, fill: INK, radius: 3 });
};
const header = (b) => {                                        // padH 24, padT 8, padB 12, gap 8 — inv:05 §2.1
  INST(b, 'WalletAvatar-44', 'C/Media/WalletAvatar', { style: 'identicon', size: 44 }, GUT, 55, 44, 44);
  T(b, 'account-name', { text: 'Main Account', size: 15, weight: 700, color: INK, x: 76, y: 57 });   // text.lg bold, 1 line
  IC(b, 'ChevronDown', 15, 2.4, 180, 61, SUBTLE);              // only when >1 account — inv:05 §2.1
  T(b, 'account-address', { text: '0x8Ba1…BA72', size: 11, weight: 500, zone: 'mono', color: SUBTLE, x: 76, y: 80 });
  IC(b, 'Settings', 22, 2, 333, 66, INK);                      // plain 44×44 target, no bg/border/shadow — inv:05 §2.1
};
const heroLabel = (b, y) =>                                    // "Total balance · {code}" uppercase — inv:05 §2.1
  T(b, 'hero-label', { text: 'TOTAL BALANCE · USD', size: 11, weight: 600, color: SUBTLE, x: GUT, y: y - 20 });
const heroValue = (b, y) => {                                  // AmountText: symbol 0.58× · integer · tail 0.56× — inv:05 §2.1, §8.19
  T(b, 'AmountText hero symbol 0.58x', { text: '$', size: 31, weight: 700, color: INK, x: GUT, y: y + 18 });
  T(b, 'AmountText hero integer', { text: '12,847', size: 54, weight: 700, color: INK, x: 45, y: y });
  T(b, 'AmountText hero decimals 0.56x', { text: '.32', size: 30, weight: 700, color: SUBTLE, x: 218, y: y + 19 });
};
const navRow = (b, y, active, badge) => {                      // row, space-between, gap 8 — inv:05 §2.1
  // labels never truncate: the track h-scrolls inside the space the filter chip leaves (342 − 8 − 119)
  const vp = SB(b, 'segmented-scroll-viewport', { x: GUT, y, w: 215, h: 44 });
  const off = (active === 'third') ? -60 : 0;                  // active segment auto-scrolls into view (−24) — inv:02 B1
  INST(vp, 'SegmentedToggle', 'C/Controls/SegmentedToggle',
    { segments: 'three', active, adorn: badge ? 'badge' : 'none' }, off, 0, 275, 44);
  // NetworkFilterButton, soft bg.sunken full-radius chip, maxWidth 150 — inv:02 B5
  const x = RIGHT - 119;
  RC(b, 'network-filter chip', { x, y: y + 4, w: 119, h: 36, radius: 18, fill: SUNKEN });
  EL(b, 'ChainLogo 20 Ethereum', 20, x + 12, y + 12, { fill: '#627EEA', stroke: RAISED, sw: 2 }); // overlap −8, 2px bg.raised ring
  EL(b, 'ChainLogo 20 Base', 20, x + 24, y + 12, { fill: '#0052FF', stroke: RAISED, sw: 2 });
  EL(b, 'ChainLogo 20 Arbitrum', 20, x + 36, y + 12, { fill: '#12AAFF', stroke: RAISED, sw: 2 });
  T(b, 'network-filter label', { text: 'All', size: 13, weight: 600, color: INK, x: x + 64, y: y + 15 });
  IC(b, 'ChevronDown', 13, 2.4, x + 94, y + 16, MUTED);
};
const dock = (b) => {                                          // WaveDock IS the bottom bar (system tab bar hidden) — inv:05 §8.1
  INST(b, 'WaveDock', 'C/Controls/WaveDock', { element: 'bar' }, 0, DOCK_Y, 390, 114);
  RC(b, 'deco:dock-safe-inset-fill 34', { x: 0, y: 810, w: 390, h: 34, fill: RAISED }); // bar height = 86 + bottom inset
};
const hairline58 = (b, n, y) =>                                // activity: 2 padH + 44 avatar + 12 gap — inv:05 §2.4
  RC(b, n, { x: 82, y, w: 284, h: 1, fill: BORDER });

const chrome = async (state, idx) => {
  const { board: b } = await lib.upsertBoard(PAGE, 'S/home/' + state, { x: COL(idx), y: ROW_Y, w: 390, h: 844, fill: BG });
  statusBar(b);
  header(b);
  dock(b);
  return b;
};
const baseChips = (b) => {
  lib.chip(b, 'note', 'gutters 24 (space.3xl); hero label ls 0.6 and hero number ls -1.2 / tail -0.5 are NOT expressible on these text shapes — read them here'); // inv:05 §1.3, §2.1
  lib.chip(b, 'note', 'hero = C/Primitives/AmountText mode=fiat symbol=subordinated(0.58x) tail=0.56x; drawn at Home ideal 54 (family main instance is baked at text.5xl 40) — inv:05 §2.1 vs inv:02 A6'); // inv:05 §2.1
  lib.chip(b, 'platform', 'safe-area top only (47 here); WaveDock bar = 86 + bottom inset (34 here); entrances fadeIn/fadeInDown are iOS-ONLY — Android and web paint the settled state'); // inv:05 §1.3, §8.1
  lib.chip(b, 'motion', 'header fadeIn 0/400 once; hero fadeInDown 60/400 once; rows fadeInDown index*40/300 once (hasEntered-gated, never replays)'); // inv:05 §2.1, §8.3
};

// ═══════════════════════════════════════════════ state 0 — default (Activity)
{
  const b = await chrome('default', 0);
  heroLabel(b, HERO_Y);
  heroValue(b, HERO_Y);
  navRow(b, NAV_Y, 'first', false);

  // Activity feed = FlatList of date groups; hairline ONLY between consecutive item rows — inv:05 §2.4
  T(b, 'day-header-today', { text: 'Today', size: 11, weight: 600, color: SUBTLE, x: GUT, y: FEED_Y + 16 });
  INST(b, 'act-row-1', 'C/Rows/ActivityRow', { direction: 'in', detail: 'default' }, GUT, 316, 342, 78);
  hairline58(b, 'sep-1', 394);
  INST(b, 'act-row-2', 'C/Rows/ActivityRow', { direction: 'out', detail: 'no-time' }, GUT, 395, 342, 78);
  T(b, 'day-header-yesterday', { text: 'Yesterday', size: 11, weight: 600, color: SUBTLE, x: GUT, y: 489 });
  INST(b, 'act-row-3', 'C/Rows/ActivityRow', { direction: 'out', detail: 'default' }, GUT, 507, 342, 78);
  hairline58(b, 'sep-2', 585);
  INST(b, 'act-row-4', 'C/Rows/ActivityRow', { direction: 'in', detail: 'default' }, GUT, 586, 342, 78);

  baseChips(b);
  lib.chip(b, 'note', 'reference board for the whole language: de-containered feed, hairline inset 58, open hero, single accent = the Send pill'); // docs/DESIGN-LANGUAGE.md
  lib.chip(b, 'note', 'ActivityRow instance copy is the family sample (Received/Sent · 0x…/0x… · USDC/ETH); real rows resolve the counterparty live (own account -> ENS/.bnb/Vela index -> stored name -> short address)'); // inv:05 §2.4
  lib.chip(b, 'note', 'pointer targets: account row -> O/account-switcher/loaded (1 account = copy address instead) · Settings -> S/settings/default · filter chip -> O/network-filter-sheet/default · row -> O/transaction-detail-sheet/confirmed · dock Send -> S/send/step1 · Receive -> S/receive/default · Scan -> O/qr-scanner/scanning-native'); // inv:05 §2.1, §2.4, §2.8
  lib.chip(b, 'motion', 'balance pulse: whole hero scales 1->1.03->1 on incoming money (220ms out-quad up, 1000ms back); newest incoming row washes success.soft fading 1600ms + success haptic'); // inv:05 §2.1, §2.4
  lib.chip(b, 'edge', 'incoming transfer confirms -> O/receipt-toast/default');
  lib.chip(b, 'edge', 'balance line tapped -> S/home/hidden-balance');
  lib.chip(b, 'edge', 'pull crosses 72px trigger -> S/home/refreshing');
  lib.chip(b, 'edge', 'balance still partial after 3 silent retries (1.5s/4s/8s) -> S/home/estimate-notice');
  lib.chip(b, 'edge', 'every RPC of a chain fails and it is NOT 429 -> S/home/rpc-trouble');
  lib.chip(b, 'edge', 'chain returns 429 -> S/home/rate-limited');
  lib.chip(b, 'edge', 'no transfers match the network filter -> S/home/activity-empty');
  lib.chip(b, 'edge', 'no live tokens AND no cached total AND first fetch unsettled -> S/home/balance-loading');
}

// ═════════════════════════════════════ state 1 — activity-empty (per filter)
{
  const b = await chrome('activity-empty', 1);
  heroLabel(b, HERO_Y);
  heroValue(b, HERO_Y);
  navRow(b, NAV_Y, 'first', false);

  // centered, padTop 48, gap 8 — inv:05 §2.4
  EL(b, 'empty-disc 64', 64, 163, 330, { fill: SUNKEN });
  IC(b, 'Inbox', 28, 2, 181, 348, SUBTLE);
  T(b, 'empty-title', { text: 'No activity yet', size: 17, weight: 700, color: INK, x: 128, y: 402 });
  T(b, 'empty-sub-l1', { text: 'Incoming payments will appear', size: 13, weight: 400, color: SUBTLE, x: 99, y: 432 });
  T(b, 'empty-sub-l2', { text: 'here in real time.', size: 13, weight: 400, color: SUBTLE, x: 138, y: 452 });

  baseChips(b);
  lib.chip(b, 'note', 'title swaps to "No activity on this network" when a chain filter is applied; empty-state disc is 64 here (Connections 56, Assets 48 — per-screen, not one token)'); // inv:05 §2.4, §9.6
  lib.chip(b, 'note', 'hero still shows the real total — an empty FEED never implies an empty WALLET'); // inv:05 §2.4
  lib.chip(b, 'edge', 'first transfer lands (10s Activity poll) -> S/home/default');
  lib.chip(b, 'edge', 'network filter cleared and transfers exist -> S/home/default');
}

// ═════════════════════════════════════════ state 2 — assets (HoldingsList)
{
  const b = await chrome('assets', 2);
  heroLabel(b, HERO_Y);
  heroValue(b, HERO_Y);
  navRow(b, NAV_Y, 'second', false);

  // header row: SectionLabel left, search toggle + "+ Add" right — inv:05 §2.5
  T(b, 'SectionLabel ASSETS', { text: 'ASSETS', size: 11, weight: 600, color: SUBTLE, x: GUT, y: 288 });
  IC(b, 'Search', 15, 2, 294, 290, MUTED);                     // plain 32px icon btn; turns accent when open
  IC(b, 'Plus', 13, 2.5, 330, 290, ACCENT);
  T(b, 'add-token-label', { text: 'Add', size: 11, weight: 600, color: ACCENT, x: 346, y: 291 });

  // rows: TokenRow 40px logo, hairline inset 8 + 40 + 12 = 60 — inv:05 §2.5, §8.5
  INST(b, 'tok-row-1', 'C/Rows/TokenRow', { mode: 'plain', detail: 'default' }, GUT, 322, 342, 64);
  INST(b, 'div-1', 'C/Rows/Divider', { inset: 'inset-60' }, GUT, 386, 342, 8);
  INST(b, 'tok-row-2', 'C/Rows/TokenRow', { mode: 'plain', detail: 'chip' }, GUT, 394, 342, 64);
  INST(b, 'div-2', 'C/Rows/Divider', { inset: 'inset-60' }, GUT, 458, 342, 8);
  INST(b, 'tok-row-3', 'C/Rows/TokenRow', { mode: 'plain', detail: 'no-fiat' }, GUT, 466, 342, 64);
  INST(b, 'div-3', 'C/Rows/Divider', { inset: 'inset-60' }, GUT, 530, 342, 8);
  INST(b, 'tok-row-4', 'C/Rows/TokenRow', { mode: 'plain', detail: 'default' }, GUT, 538, 342, 64);

  baseChips(b);
  lib.chip(b, 'note', 'search field appears on demand: bg.sunken, radius 12, NO border, 16px input (web anti-zoom floor); "no matches" = plain centered fg.subtle "No matching tokens", never the deposit card'); // inv:05 §2.5
  lib.chip(b, 'note', 'row tap -> S/token-detail/default with the token params; "+ Add" -> S/add-token/form; list is virtualized'); // inv:05 §2.5, §8.4
  lib.chip(b, 'note', 'funded wallet whose scan has not painted shows a BLANK list, never an empty state'); // inv:05 §2.5
  lib.chip(b, 'edge', 'holdings scan returns zero balances (unfiltered) -> S/home/assets-empty');
  lib.chip(b, 'edge', 'balance privacy toggled -> S/home/hidden-balance (holdings balances mask to 4 dots too)');
}

// ══════════════════════════ state 3 — assets-empty (tappable deposit state)
{
  const b = await chrome('assets-empty', 3);
  heroLabel(b, HERO_Y);
  heroValue(b, HERO_Y);
  navRow(b, NAV_Y, 'second', false);

  T(b, 'SectionLabel ASSETS', { text: 'ASSETS', size: 11, weight: 600, color: SUBTLE, x: GUT, y: 288 });
  IC(b, 'Search', 15, 2, 294, 290, MUTED);
  IC(b, 'Plus', 13, 2.5, 330, 290, ACCENT);
  T(b, 'add-token-label', { text: 'Add', size: 11, weight: 600, color: ACCENT, x: 346, y: 291 });

  // open state, padding 32, centered, whole block is the tap target — inv:05 §2.5
  EL(b, 'deposit-disc 48', 48, 171, 346, { fill: ACCENT_SOFT });
  IC(b, 'ArrowDown', 22, 2.2, 184, 359, ACCENT);
  T(b, 'deposit-title', { text: 'Deposit your first asset', size: 17, weight: 600, color: MUTED, x: 92, y: 402 });
  T(b, 'deposit-sub-l1', { text: 'Tap here to see your address', size: 13, weight: 400, color: SUBTLE, x: 104, y: 432 });
  T(b, 'deposit-sub-l2', { text: 'and receive tokens', size: 13, weight: 400, color: SUBTLE, x: 136, y: 452 });

  baseChips(b);
  lib.chip(b, 'note', 'the whole block is one pressable -> S/receive/default (this is the only empty state in the app that is itself the CTA — no button)'); // inv:05 §2.5
  lib.chip(b, 'note', 'shown ONLY when unfiltered and unsearched; a filter/search miss shows the plain "No matching tokens" line instead'); // inv:05 §2.5
  lib.chip(b, 'edge', 'first deposit confirms -> S/home/assets');
}

const missTotal = Object.values(miss).reduce((a, n) => a + n, 0);
return lib.done('60-screens-home-a', {
  boards: ['S/home/default', 'S/home/activity-empty', 'S/home/assets', 'S/home/assets-empty'],
  missingPlaceholders: missTotal, missingByFamily: miss,
});
