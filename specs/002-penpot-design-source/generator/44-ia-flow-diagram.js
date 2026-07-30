// 44-ia-flow-diagram.js — replace the text dump on `04 IA & Flows` with an actual DIAGRAM:
// screen nodes laid out by their real navigation relationship, connected by labelled arrows.
// A wall of monospace text belongs in Markdown; the reason to hold IA in a design tool is to SEE it.
//
// Nodes are live thumbnails: each references the real screen board by name, so the map and the
// screens can never drift. Arrows carry the concrete trigger ("tap Send pill"), matching FR-005a.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const PAGE = '04 IA & Flows';
await lib.open(PAGE);

const C = {
  ink: '#1A1A18', muted: '#6E6B62', subtle: '#8C887E', line: '#D8D6CE',
  accent: '#E8572A', raised: '#FFFFFF', sunken: '#F5F3EF', base: '#FAFAF8',
  modal: '#4267F4', push: '#2D8E5F', overlay: '#7C3AED',
};
// presentation → colour, so the diagram encodes HOW a screen appears, not just that it exists
const KIND = {
  anchor:  { c: C.accent,  label: 'ANCHOR' },
  tab:     { c: C.ink,     label: 'TAB' },
  modal:   { c: C.modal,   label: 'MODAL' },
  push:    { c: C.push,    label: 'PUSH' },
  overlay: { c: C.overlay, label: 'GLOBAL OVERLAY' },
  plain:   { c: C.muted,   label: 'PLAIN' },
};

const W = 168, H = 104;   // node card
const stats = { nodes: 0, edges: 0, missingBoards: [] };

const root = (await lib.upsertBoard(PAGE, 'D/ia/map', { x: 0, y: 0, w: 2100, h: 1500, fill: C.base })).board;
// generated content is replaced wholesale
let guard = 0;
while (guard++ < 900) {
  const old = penpotUtils.findShape((s) => s.name && (s.name.startsWith('n/') || s.name.startsWith('e/') || s.name.startsWith('lg/')), root);
  if (!old) break;
  old.remove();
}

lib.upsertText(root, 'n/title', { text: 'Vela Wallet — information architecture', size: 26, weight: 700, color: C.ink, x: 40, y: 32 });
lib.upsertText(root, 'n/sub', { text: 'Colour = how the screen presents · arrows carry the concrete trigger · every node names a real board', size: 11, weight: 500, color: C.subtle, x: 40, y: 68 });

// ---- legend
{
  let lx = 40;
  for (const [k, v] of Object.entries(KIND)) {
    const sw = lib.upsertRect(root, 'lg/sw-' + k, { x: lx, y: 96, w: 10, h: 10, radius: 5, fill: v.c }).rect;
    lib.upsertText(root, 'lg/tx-' + k, { text: v.label, size: 9, weight: 600, color: C.muted, x: lx + 16, y: 96 });
    lx += 22 + v.label.length * 5.6 + 22;
  }
}

// ---- nodes: [id, label, kind, col, row, boardName]
const NODES = [
  // the anchor must name the DEFAULT home, not the empty state — edges.json enters the home flow
  // at S/home/activity and a reader following this map to activity-empty lands on a corner case
  ['home',        'Home /wallet',        'anchor', 2, 1, 'S/home/activity'],
  ['onboarding',  'Onboarding',          'plain',  0, 1, 'S/onboarding/welcome'],
  ['settings',    'Settings',            'tab',    4, 0, 'S/settings/default'],
  ['connect',     'Connect',             'tab',    0, 3, 'S/connect/disconnected'],
  ['send',        'Send',                'modal',  1, 3, 'S/send/select-token'],
  ['sendDetails', 'Send · details',      'modal',  2, 3, 'S/send/details'],
  ['sendConfirm', 'Send · confirm',      'modal',  3, 3, 'S/send/confirm'],
  ['receive',     'Receive',             'modal',  1, 0, 'S/receive/address'],
  ['tokenDetail', 'Token detail',        'modal',  3, 1, 'S/token-detail/default'],
  ['addToken',    'Add token',           'modal',  4, 1, 'S/add-token/erc20'],
  ['about',       'About',               'modal',  5, 0, 'S/about/default'],
  ['pay',         'Pay link',            'push',   0, 0, 'S/pay/default'],
  ['browser',     'dApp browser',        'push',   4, 3, null],
  ['signing',     'Signing sheet',       'overlay',3, 2, 'O/signing-sheet/erc-20-transfer'],
];
// DX must leave room for the arrow LABEL, not just the arrow: at 230 the gap between cards was
// 62px while the triggers ("scan / paste WalletPair URI") run to ~125px, so every label crawled
// across the card it pointed at. 300 gives a 132px gap, which clears the longest trigger.
const COL0 = 60, ROW0 = 150, DX = 300, DY = 168;
const pos = {};
for (const [id, label, kind, col, row, boardName] of NODES) {
  const x = COL0 + col * DX, y = ROW0 + row * DY;
  pos[id] = { x, y, w: W, h: H, kind };
  const k = KIND[kind];
  const card = lib.upsertRect(root, 'n/' + id, { x, y, w: W, h: H, radius: 12, fill: C.raised, stroke: k.c, strokeWidth: kind === 'anchor' ? 2 : 1 }).rect;
  try { lib.bindToken(card, 'color.bg.raised', ['fill']); } catch (e) {}
  lib.upsertRect(root, 'n/' + id + '/tag', { x: x + 12, y: y + 12, w: 8, h: 8, radius: 4, fill: k.c });
  lib.upsertText(root, 'n/' + id + '/kind', { text: k.label, size: 8, weight: 700, color: k.c, x: x + 26, y: y + 11 });
  lib.upsertText(root, 'n/' + id + '/label', { text: label, size: 14, weight: 700, color: C.ink, x: x + 12, y: y + 32 });
  if (boardName) {
    const exists = !!lib.byName(boardName);
    if (!exists) stats.missingBoards.push(boardName);
    lib.upsertText(root, 'n/' + id + '/board', { text: (exists ? '▸ ' : '⚠ ') + boardName, size: 8.5, weight: 500, zone: 'mono', color: exists ? C.muted : C.accent, x: x + 12, y: y + 56 });
  } else {
    lib.upsertText(root, 'n/' + id + '/board', { text: '⚠ native only — no web board', size: 8.5, weight: 500, zone: 'mono', color: C.subtle, x: x + 12, y: y + 56 });
  }
  stats.nodes++;
}

// ---- edges: [from, to, trigger, side]  side: 'r'|'l'|'d'|'u'
const EDGES = [
  ['onboarding', 'home',      'passkey created / signed in', 'r'],
  ['home', 'settings',        'tap gear',                    'r'],
  ['home', 'receive',         'tap Receive pill',            'u'],
  ['home', 'send',            'tap Send pill',               'd'],
  ['send', 'sendDetails',     'tap token row',               'r'],
  ['sendDetails', 'sendConfirm','amount + recipient valid',   'r'],
  ['sendConfirm', 'home',     'slide to confirm → receipt',  'u'],
  ['home', 'tokenDetail',     'tap token row (Assets)',      'r'],
  ['tokenDetail', 'addToken', 'tap + Add token',             'r'],
  ['settings', 'about',       'tap About',                   'r'],
  ['home', 'connect',         'scan / paste WalletPair URI', 'd'],
  ['connect', 'browser',      'paste web URL',               'r'],
  ['pay', 'send',             'tap Open in Vela',            'd'],
  ['browser', 'signing',      'dApp requests a signature',   'l'],
  ['signing', 'home',         'dismiss = reject',            'u'],
];

// ---- orthogonal routing in the CORRIDORS between cards.
// The first version drew one straight line between card centres. Any pair that was neither in the
// same row nor the same column therefore had its line — and its label — laid across whatever cards
// sat in between: "paste web URL" printed through the Send · details card, "tap Send pill" and
// "dismiss = reject" were struck through by their own connectors. The grid leaves a 132px gap
// between columns and a 64px gap between rows; every segment below runs inside one of those gaps,
// so a connector can never cross a card. Coincident runs are separated into lanes.
const COLW_GAP = DX - W, ROWH_GAP = DY - H;
const colOf = (n) => Math.round((n.x - COL0) / DX);
const rowOf = (n) => Math.round((n.y - ROW0) / DY);
const maxRow = Math.max(...Object.values(pos).map(rowOf));
const corridorX = (col, lane) => COL0 + col * DX + W + COLW_GAP / 2 + lane;       // right of `col`
const corridorY = (row, lane) => ROW0 + row * DY + H + ROWH_GAP / 2 + lane;       // below `row`

// arrowheads: one imported triangle per direction, cloned per edge (15 SVG imports would blow the
// chunk's time budget; 4 imports + clones do not)
const HEAD_SVG = {
  r: '<svg viewBox="0 0 9 9"><path d="M0 0 L9 4.5 L0 9 Z" fill="#6E6B62"/></svg>',
  l: '<svg viewBox="0 0 9 9"><path d="M9 0 L0 4.5 L9 9 Z" fill="#6E6B62"/></svg>',
  d: '<svg viewBox="0 0 9 9"><path d="M0 0 L4.5 9 L9 0 Z" fill="#6E6B62"/></svg>',
  u: '<svg viewBox="0 0 9 9"><path d="M0 9 L4.5 0 L9 9 Z" fill="#6E6B62"/></svg>',
};
const headTpl = {};
for (const [dir, svg] of Object.entries(HEAD_SVG)) {
  const g = penpot.createShapeFromSvg(svg);
  if (g) { g.name = 'e/head-tpl-' + dir; root.appendChild(g); g.resize(9, 9); penpotUtils.setParentXY(g, -400, -400); headTpl[dir] = g; }
}

// every segment is recorded so labels can be placed AROUND the wiring afterwards: a label put at a
// fixed offset from its own line still gets struck through by a NEIGHBOURING lane's line, which is
// what happened to "passkey created / signed in" and "dismiss = reject"
const drawn = [];
const seg = (nm, x1, y1, x2, y2) => {
  const x = Math.round(Math.min(x1, x2)), y = Math.round(Math.min(y1, y2));
  const w = Math.max(2, Math.round(Math.abs(x2 - x1))), h = Math.max(2, Math.round(Math.abs(y2 - y1)));
  lib.upsertRect(root, nm, { x, y, w, h, radius: 1, fill: C.line });
  drawn.push({ x, y, w, h });
};
const head = (nm, dir, x, y) => {
  const tpl = headTpl[dir];
  if (!tpl) return;
  const c = tpl.clone();
  c.name = nm;
  root.appendChild(c);
  penpotUtils.setParentXY(c, Math.round(x), Math.round(y));
};
// labels are queued, then placed in a second pass once all wiring is known
const labelQueue = [];
const lbl = (nm, text, x, y, axis) => labelQueue.push({ nm, text, x, y, axis: axis || 'h' });

const edge = (from, to, trigger, i) => {
  const a = pos[from], b = pos[to];
  if (!a || !b) return;
  const ac = colOf(a), ar = rowOf(a), bc = colOf(b), br = rowOf(b);
  const acx = a.x + a.w / 2, acy = a.y + a.h / 2, bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
  const nm = 'e/' + i + '/' + from + '→' + to;
  const lane = ((i % 3) - 1) * 13;                  // keeps two edges off the same corridor line
  const halfLbl = (s) => s.length * 2.3;            // ~4.6px per char at 9px semibold

  if (ar === br && Math.abs(ac - bc) === 1) {       // neighbours in a row: straight across the gap
    const right = ac < bc;
    const x1 = right ? a.x + a.w : b.x + b.w, x2 = right ? b.x : a.x;
    seg(nm, x1, acy - 1, x2, acy + 1);
    head(nm + '/head', right ? 'r' : 'l', right ? x2 - 9 : x1, acy - 4.5);
    lbl(nm + '/lbl', trigger, (x1 + x2) / 2 - halfLbl(trigger), acy - 18);
  } else if (ac === bc && Math.abs(ar - br) === 1) { // neighbours in a column
    const down = ar < br;
    const y1 = down ? a.y + a.h : b.y + b.h, y2 = down ? b.y : a.y;
    seg(nm, acx - 1, y1, acx + 1, y2);
    head(nm + '/head', down ? 'd' : 'u', acx - 4.5, down ? y2 - 9 : y1);
    lbl(nm + '/lbl', trigger, acx + 10, (y1 + y2) / 2 - 6);
  } else if (ar === br) {                            // same row, far apart: use a ROW corridor
    const cy = ar === maxRow ? corridorY(ar, lane) : corridorY(ar - 1, lane);
    const exitDown = ar === maxRow;
    seg(nm + '/v1', acx - 1, exitDown ? a.y + a.h : a.y, acx + 1, cy);
    seg(nm + '/h', Math.min(acx, bcx), cy - 1, Math.max(acx, bcx), cy + 1);
    seg(nm + '/v2', bcx - 1, cy, bcx + 1, exitDown ? b.y + b.h : b.y);
    head(nm + '/head', exitDown ? 'u' : 'd', bcx - 4.5, exitDown ? b.y + b.h : b.y - 9);
    lbl(nm + '/lbl', trigger, (acx + bcx) / 2 - halfLbl(trigger), cy + 6);
  } else {                                           // general case: gap → column corridor → row corridor → gap
    const right = ac < bc;
    const cx = right ? corridorX(ac, lane) : corridorX(bc, lane);
    const down = ar < br;
    const cy = down ? corridorY(br - 1, lane) : corridorY(br, lane);
    const exitX = right ? a.x + a.w : a.x;
    seg(nm + '/h1', exitX, acy - 1, cx, acy + 1);                 // short, inside the column gap
    seg(nm + '/v', cx - 1, acy, cx + 1, cy);                      // down/up the column corridor
    seg(nm + '/h2', cx, cy - 1, bcx, cy + 1);                     // along the row corridor
    seg(nm + '/v2', bcx - 1, cy, bcx + 1, down ? b.y : b.y + b.h); // short, into the card
    head(nm + '/head', down ? 'd' : 'u', bcx - 4.5, down ? b.y - 9 : b.y + b.h);
    // hang the label off the long vertical run, on the side away from the cards it passes
    lbl(nm + '/lbl', trigger, right ? cx + 8 : cx - 8 - halfLbl(trigger) * 2, (acy + cy) / 2 - 6, 'v');
  }
  stats.edges++;
};
EDGES.forEach(([f, t, trig], i) => edge(f, t, trig, i));
for (const g of Object.values(headTpl)) { try { g.remove(); } catch (e) {} }

// ---- label pass: nudge each label until it clears the wiring, the cards and the other labels
const cards = Object.values(pos).map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h }));
const placed = [];
const hits = (r) => [].concat(drawn, cards, placed).some((o) =>
  r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y);
stats.labelsNudged = 0;
for (const L of labelQueue) {
  const w = Math.max(24, L.text.length * 4.7), h = 13;
  // Candidates, nearest first. A single fixed step direction was not enough: nudging horizontally
  // in 10px increments cannot clear a 168px card, so "dApp requests a signature" ended up printed
  // across the Send · confirm card's tag row. The list keeps a label perpendicular-close to the run
  // it annotates, then allows the far side, then a shifted row, before giving up.
  const cand = L.axis === 'v'
    ? [[0, 0], [0, -16], [0, 16], [-w - 18, 0], [-w - 18, -16], [-w - 18, 16], [0, -34], [0, 34], [-w - 18, -34], [-w - 18, 34]]
    : [[0, 0], [0, -11], [0, 11], [0, -24], [0, 24], [-w / 2, -11], [w / 2, -11], [-w / 2, 11], [w / 2, 11], [0, -40]];
  let x = L.x, y = L.y, tries = 0, ok = false;
  for (const [dx, dy] of cand) {
    x = L.x + dx; y = L.y + dy;
    if (x < 32) x = 32;                         // pull inside the margin rather than reject the slot:
                                                // rejecting it left "scan / paste WalletPair URI" with
                                                // nowhere to go at all
    if (!hits({ x: x - 2, y: y - 1, w: w + 4, h: h + 2 })) { ok = true; break; }
    tries++;
  }
  if (tries) stats.labelsNudged++;
  if (!ok) (stats.labelsStuck = stats.labelsStuck || []).push(L.text);
  lib.upsertText(root, L.nm, { text: L.text, size: 9, weight: 600, color: C.muted, x: Math.round(x), y: Math.round(y) });
  placed.push({ x, y, w, h });
}

// Fit the board to what was actually drawn. It used to be a fixed 2100×1500, which was far larger
// than the diagram and swallowed the neighbouring boards on this page — the map's own title
// collided with 'D / ia / route-tree' and covered two more boards underneath.
// Fit to EVERYTHING drawn, not just the cards: routing runs in corridors below the last row, so a
// cards-only bbox clipped the bottom connector and its label off the board.
let maxX = 0, maxY = 0;
for (const p of [].concat(Object.values(pos), drawn, placed)) {
  maxX = Math.max(maxX, p.x + p.w);
  maxY = Math.max(maxY, p.y + p.h);
}
root.resize(Math.round(maxX + 60), Math.round(maxY + 60));

// Retire the monospace text dumps this diagram replaces. Parking them off to the side was not
// enough: five 800×2000 walls of text still dominate the page — fit-all dropped to 22% and the
// diagram became unreadable, which is exactly the complaint this chunk exists to answer. They are
// REMOVED, not archived, because nothing is lost: chunks 40/41 still generate that prose verbatim,
// and the chunks are the source of truth for this file.
stats.removed = [];
for (const dead of ['D/ia/route-tree', 'D/ia/flows', 'D/ia/deep-links', 'D/ia/routes', 'D/ia/conventions',
                    'ARCHIVE D/ia/route-tree', 'ARCHIVE D/ia/flows', 'ARCHIVE D/ia/deep-links',
                    'ARCHIVE D/ia/routes', 'ARCHIVE D/ia/conventions']) {
  const b = lib.byName(dead);
  if (b) { b.remove(); stats.removed.push(dead); }
}
lib.chip(root, 'note', 'diagram is generated: node cards reference real board names, so a renamed or missing board shows as ⚠ here');
return lib.done('44-ia-flow-diagram', stats);
