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
  ['home',        'Home /wallet',        'anchor', 2, 1, 'S/home/activity-empty'],
  ['onboarding',  'Onboarding',          'plain',  0, 1, 'S/onboarding/welcome'],
  ['settings',    'Settings',            'tab',    4, 0, 'S/settings/default'],
  ['connect',     'Connect',             'tab',    0, 3, 'S/connect/disconnected'],
  ['send',        'Send',                'modal',  1, 3, 'S/send/select-token'],
  ['sendDetails', 'Send · details',      'modal',  2, 3, 'S/send/enter-details'],
  ['sendConfirm', 'Send · confirm',      'modal',  3, 3, 'S/send/confirm'],
  ['receive',     'Receive',             'modal',  1, 0, 'S/receive/address'],
  ['tokenDetail', 'Token detail',        'modal',  3, 1, 'S/token-detail/default'],
  ['addToken',    'Add token',           'modal',  4, 1, 'S/add-token/erc20'],
  ['about',       'About',               'modal',  5, 0, 'S/about/default'],
  ['pay',         'Pay link',            'push',   0, 0, 'S/pay/default'],
  ['browser',     'dApp browser',        'push',   4, 3, null],
  ['signing',     'Signing sheet',       'overlay',3, 2, 'O/signing-sheet/erc20-transfer'],
];
const COL0 = 60, ROW0 = 150, DX = 230, DY = 168;
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

const edge = (from, to, trigger, i) => {
  const a = pos[from], b = pos[to];
  if (!a || !b) return;
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2, by = b.y + b.h / 2;
  const horizontal = Math.abs(bx - ax) >= Math.abs(by - ay);
  const nm = 'e/' + i + '/' + from + '→' + to;
  if (horizontal) {
    const x1 = ax < bx ? a.x + a.w : b.x + b.w;
    const x2 = ax < bx ? b.x : a.x;
    const y = Math.round((ay + by) / 2);
    lib.upsertRect(root, nm, { x: Math.round(x1), y: y - 1, w: Math.max(4, Math.round(x2 - x1)), h: 2, radius: 1, fill: C.line });
    // arrow head
    const hx = ax < bx ? x2 - 7 : x1 + 1;
    lib.upsertRect(root, nm + '/head', { x: Math.round(hx), y: y - 4, w: 7, h: 7, radius: 2, fill: C.muted });
    lib.upsertText(root, nm + '/lbl', { text: trigger, size: 9, weight: 600, color: C.muted, x: Math.round(x1 + 8), y: y - 18 });
  } else {
    const y1 = ay < by ? a.y + a.h : b.y + b.h;
    const y2 = ay < by ? b.y : a.y;
    const x = Math.round((ax + bx) / 2);
    lib.upsertRect(root, nm, { x: x - 1, y: Math.round(y1), w: 2, h: Math.max(4, Math.round(y2 - y1)), radius: 1, fill: C.line });
    const hy = ay < by ? y2 - 7 : y1 + 1;
    lib.upsertRect(root, nm + '/head', { x: x - 4, y: Math.round(hy), w: 7, h: 7, radius: 2, fill: C.muted });
    lib.upsertText(root, nm + '/lbl', { text: trigger, size: 9, weight: 600, color: C.muted, x: x + 10, y: Math.round((y1 + y2) / 2) - 6 });
  }
  stats.edges++;
};
EDGES.forEach(([f, t, trig], i) => edge(f, t, trig, i));

lib.chip(root, 'note', 'diagram is generated: node cards reference real board names, so a renamed or missing board shows as ⚠ here');
return lib.done('44-ia-flow-diagram', stats);
