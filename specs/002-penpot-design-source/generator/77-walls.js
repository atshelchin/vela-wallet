// 77-walls.js — the human half of the UI graph (RESTRUCTURE-2026-07-30 §5, W2/W3b).
//
// Penpot's prototype interactions are invisible on canvas and its cross-page links do not work at
// all, so a person opening a screens page saw boards side by side with no way to tell that
// `details → confirm` happens on Continue while `confirm → sign` happens on a slide. That was the
// founder's "没有 UI 转化流转" in one sentence.
//
// So every transition gets TWO projections from ONE source (generator/edges.json):
//   · machine — prototype interaction where the platform allows, else `vela.edge` plugin data (74)
//   · human   — a labelled arrow drawn in the gap between the steps, named `e / <from> / <to>`
//               so machine consumers can skip it
// Plus a band header per journey, so a page reads as "here is the send journey" rather than as a
// grid of pictures.
//
// Input: storage.wallPage = the page to draw ('05 Screens · Wallet' …). One page per call.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const page = storage.wallPage;
if (!page) throw new Error('set storage.wallPage first');

const J = storage.journeysJson ||
  (storage.journeysJson = await (await fetch('/plugins/mcp/gen/journeys.json?v=' + Date.now(), { cache: 'reload' })).json());
const G = storage.edgesJson ||
  (storage.edgesJson = await (await fetch('/plugins/mcp/gen/edges.json?v=' + Date.now(), { cache: 'reload' })).json());
const L = J.layout;
const C = { ink: '#1A1A18', muted: '#6E6B62', subtle: '#8C887E', line: '#D8D6CE', accent: '#E8572A', base: '#FAFAF8' };
const stats = { page, walls: 0, arrows: 0, stubs: 0, labels: 0, missingBoards: [], stateTicks: 0 };

await lib.open(page);
const root = penpot.currentPage.root;

// wipe what this chunk owns
for (let g = 0; g < 600; g++) {
  const old = penpotUtils.findShape((s) => {
    const n = lib.norm(s.name || '');
    return n.startsWith('e / ') || n.startsWith('W / ');
  }, root);
  if (!old) break;
  old.remove();
}

// trigger lookup: pointer edges first, then the non-pointer conditions
const trigger = (from, to) => {
  const e = G.edges.find((x) => x.from === from && x.to === to);
  if (e) return { text: 'tap ' + e.label, kind: e.kind };
  const n = G.nonPointer.find((x) => x.from === from && x.to === to);
  if (n) return { text: n.condition, kind: 'condition' };
  return null;
};

const seg = (nm, x1, y1, x2, y2, col) => {
  const x = Math.round(Math.min(x1, x2)), y = Math.round(Math.min(y1, y2));
  lib.upsertRect(root, nm, { x, y, w: Math.max(2, Math.round(Math.abs(x2 - x1))), h: Math.max(2, Math.round(Math.abs(y2 - y1))), radius: 1, fill: col || C.line });
};
const headSvg = (dir) => dir === 'r'
  ? '<svg viewBox="0 0 11 11"><path d="M0 0 L11 5.5 L0 11 Z" fill="#6E6B62"/></svg>'
  : '<svg viewBox="0 0 11 11"><path d="M0 0 L5.5 11 L11 0 Z" fill="#6E6B62"/></svg>';
const head = (nm, dir, x, y) => {
  const g = penpot.createShapeFromSvg(headSvg(dir));
  if (!g) return;
  g.name = nm;
  root.appendChild(g);
  g.resize(11, 11);
  penpotUtils.setParentXY(g, Math.round(x), Math.round(y));
};

const boardAt = (name) => lib.byName(name, root);

let bandY = 0;
for (const wall of ((J.pages[page] || {}).walls || [])) {
  const cols = wall.kind === 'hub' ? [wall.hub].concat(wall.spokes || []) : wall.steps;
  let maxStack = 0;
  for (const b of cols) maxStack = Math.max(maxStack, ((wall.states || {})[b] || []).length);

  // ---- band header
  const { board: hdr } = await lib.upsertBoard(page, 'W / ' + wall.journey,
    { x: L.originX, y: bandY, w: Math.max(900, cols.length * L.colW), h: L.headerH - 20, fill: C.base });
  try { lib.bindToken(hdr, 'color.bg.base', ['fill']); } catch (e) {}
  lib.upsertText(hdr, 'W / ' + wall.journey + ' / kicker',
    { text: (wall.kind === 'hub' ? 'HUB' : 'JOURNEY'), size: 10, weight: 700, color: C.accent, x: 0, y: 4 }).text.letterSpacing = '0.6';
  lib.upsertText(hdr, 'W / ' + wall.journey + ' / title',
    { text: wall.journey, size: 34, weight: 700, color: C.ink, x: 0, y: 22 });
  const sub = wall.kind === 'hub'
    ? 'Hub on the left, its destinations to the right. States stack below their screen.'
    : 'Left to right in the order a user walks it. States stack below their step. Arrows carry the real trigger.';
  lib.upsertText(hdr, 'W / ' + wall.journey + ' / sub', { text: sub, size: 12, weight: 400, color: C.muted, x: 0, y: 74 });
  stats.walls++;

  const rowY = bandY + L.headerH;

  // ---- arrows between adjacent columns
  for (let i = 0; i < cols.length - 1; i++) {
    const a = boardAt(cols[i]), b = boardAt(cols[i + 1]);
    if (!a) { stats.missingBoards.push(cols[i]); continue; }
    if (!b) { stats.missingBoards.push(cols[i + 1]); continue; }
    const t = trigger(cols[i], cols[i + 1]);
    const x1 = a.x + a.width, x2 = b.x;
    const midY = rowY + Math.round(a.height / 2);
    const nm = 'e / ' + cols[i] + ' → ' + cols[i + 1];
    seg(nm, x1 + 14, midY - 1, x2 - 16, midY + 1);
    head(nm + ' / head', 'r', x2 - 16, midY - 5.5);
    if (t) {
      const label = lib.upsertText(root, nm + ' / lbl',
        { text: t.text, size: 10, weight: 600, color: t.kind === 'condition' ? C.subtle : C.muted,
          x: x1 + 18, y: midY - 34, growType: 'auto-height' });
      label.text.resize(Math.max(60, x2 - x1 - 40), 30);
      stats.labels++;
    }
    stats.arrows++;
  }

  // ---- state stacks: a tick + condition in the GAP above each state board.
  // Board k in a column sits at rowY + k*rowH (k=0 is the step itself), so state `si` is board
  // k=si+1 and the gap that belongs to it runs from the previous board's bottom to its own top.
  // An earlier version only offset the parent's height for si===0, which printed the labels of the
  // lower states straight onto the board above them.
  cols.forEach((b, ci) => {
    const parent = boardAt(b);
    const H = parent ? parent.height : 806;
    const states = (wall.states || {})[b] || [];
    states.forEach((s, si) => {
      const sb = boardAt(s);
      if (!sb) { stats.missingBoards.push(s); return; }
      const t = trigger(b, s);
      const x = L.originX + ci * L.colW + 30;
      const gapTop = rowY + si * L.rowH + H;          // bottom edge of the board above
      const gapBottom = rowY + (si + 1) * L.rowH;     // top edge of this state's board
      const nm = 'e / ' + b + ' ↓ ' + s;
      seg(nm, x, gapTop + 12, x + 2, gapBottom - 14);
      head(nm + ' / head', 'd', x - 4.5, gapBottom - 15);
      lib.upsertText(root, nm + ' / lbl',
        { text: t ? t.text : 'state: ' + s.split('/').pop(), size: 10, weight: 500, color: C.subtle,
          x: x + 14, y: Math.round((gapTop + gapBottom) / 2) - 6 });
      stats.stateTicks++;
    });
  });

  // ---- stubs for steps the wall names but the file does not board yet (e.g. receipts)
  cols.forEach((b, ci) => {
    if (boardAt(b)) return;
    const x = L.originX + ci * L.colW, y = rowY;
    const { rect } = lib.upsertRect(root, 'e / stub / ' + b, { x, y, w: 390, h: 200, radius: 16 });
    rect.fills = [];
    rect.strokes = [{ strokeColor: C.line, strokeWidth: 1, strokeAlignment: 'inner', strokeStyle: 'dotted' }];
    lib.upsertText(root, 'e / stub / ' + b + ' / lbl',
      { text: 'NOT BOARDED YET\n' + b, size: 11, weight: 600, color: C.subtle, x: x + 24, y: y + 24, growType: 'auto-height' }).text.resize(330, 40);
    stats.stubs++;
  });

  bandY += L.headerH + (1 + maxStack) * L.rowH + L.bandGap;
}

return lib.done('77-walls:' + page, stats);
