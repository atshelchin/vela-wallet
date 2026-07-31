// 73b-reposition.js — move a page's boards onto their journey-derived positions, without redrawing.
//
// Input: storage.wallPage = the page to reposition. One page per call.
//
// WHY THIS EXISTS. Board (x,y) belongs to the manifest: `generator/journeys.json` is the single
// source of the wall layout and 73 derives every position from it (RESTRUCTURE §7 — walls are a
// generated output, never hand-arranged). But 73 derives positions as a SIDE EFFECT of rebuilding
// the board from its DOM dump, so the only way to apply a layout edit used to be a full redraw of
// every board on the page. Two costs made that the wrong tool:
//   - it needs the whole uploaded asset library in session memory, which dies with the session, so
//     a redraw in a fresh session silently swaps every icon for a red placeholder;
//   - a 23-board page takes tens of minutes and blocks the plugin bridge throughout.
// Retiring ONE state board shifts every band below it up by exactly one row — a pure layout edit
// with nothing to redraw. This chunk applies that edit and nothing else.
//
// The position formula is COPIED VERBATIM from 73 (the `journey-derived positions` block) and must
// stay that way: 96-audit-semantic-floor recomputes expected positions from the same manifest and
// will report any drift between the two as a position mismatch.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const page = storage.wallPage;
if (!page) throw new Error('set storage.wallPage first');

const J = storage.journeysJson ||
  (storage.journeysJson = await (await fetch('/plugins/mcp/gen/journeys.json?v=' + Date.now(), { cache: 'reload' })).json());
const L = J.layout;
const pos = {};
let bandY = 0;
for (const wall of ((J.pages[page] || {}).walls || [])) {
  const cols = wall.kind === 'hub' ? [wall.hub].concat(wall.spokes || []) : wall.steps;
  let maxStack = 0;
  cols.forEach((b, ci) => {
    pos[lib.norm(b)] = { x: L.originX + ci * L.colW, y: bandY + L.headerH, wall: wall.journey };
    const st = (wall.states || {})[b] || [];
    st.forEach((s, si) => { pos[lib.norm(s)] = { x: L.originX + ci * L.colW, y: bandY + L.headerH + (si + 1) * L.rowH, wall: wall.journey }; });
    maxStack = Math.max(maxStack, st.length);
  });
  bandY += L.headerH + (1 + maxStack) * L.rowH + L.bandGap;
}

await lib.open(page);
const out = { chunk: '73b-reposition:' + page, moved: [], alreadyRight: 0, unwalled: [], missing: [] };
const boards = penpot.currentPage.findShapes().filter((s) => s.type === 'board' && /^[SO] \/ /.test(s.name));
for (const b of boards) {
  const p = pos[lib.norm(b.name)];
  if (!p) { out.unwalled.push(b.name); continue; }
  const dx = Math.round(b.x) - p.x, dy = Math.round(b.y) - p.y;
  if (dx === 0 && dy === 0) { out.alreadyRight++; continue; }
  b.x = p.x; b.y = p.y;
  out.moved.push(b.name + ': ' + dx + ',' + dy);
}
for (const k of Object.keys(pos)) if (!boards.some((b) => lib.norm(b.name) === k)) out.missing.push(k);
return out;
