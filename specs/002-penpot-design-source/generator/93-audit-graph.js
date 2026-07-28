// 93-audit-graph.js — SC-007: the interaction graph is traversable from S/home/default.
// Follows native prototype interactions AND `edge:<condition> -> <board name>` chips.
// Read-only.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;

// 1. index all S/ and O/ boards + collect their outbound edges
const boards = {};      // name -> { page, id }
const edges = {};       // name -> [dest names]
const byId = {};        // id -> name (interaction destinations resolve by id)
for (const pageName of lib.PAGES) {
  const pg = penpotUtils.getPageByName(pageName);
  if (!pg) continue;
  await lib.open(pageName);
  for (const b of penpotUtils.findShapes(s => s.type === 'board' && /^(S|O) \/ /.test(s.name), penpot.currentPage.root)) {
    boards[b.name] = { page: pageName, id: b.id };
    byId[b.id] = b.name;
  }
}
for (const pageName of lib.PAGES) {
  const pg = penpotUtils.getPageByName(pageName);
  if (!pg) continue;
  await lib.open(pageName);
  for (const [name, meta] of Object.entries(boards)) {
    if (meta.page !== pageName) continue;
    const board = penpotUtils.findShapeById(meta.id);
    if (!board) continue;
    const outs = new Set();
    // native interactions on the board and everything inside it
    for (const sh of [board, ...penpotUtils.findShapes(() => true, board)]) {
      for (const it of (sh.interactions || [])) {
        const dest = it.action && it.action.destination;
        if (dest && byId[dest.id]) outs.add(byId[dest.id]);
      }
    }
    // edge: chips — "edge:<condition> -> <destination board name>"
    for (const chip of penpotUtils.findShapes(s => s.type === 'text' && s.name.startsWith('edge:'), board)) {
      const m = chip.name.split(/->|→/);
      if (m.length > 1) {
        const target = lib.norm(m[m.length - 1].trim());
        if (boards[target]) outs.add(target);
      }
    }
    edges[name] = [...outs];
  }
}

// 2. BFS from the home board
const START = lib.norm('S/home/default');
const seen = new Set();
if (boards[START]) {
  const queue = [START];
  seen.add(START);
  while (queue.length) {
    const cur = queue.shift();
    for (const next of (edges[cur] || [])) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
}
const all = Object.keys(boards);
const unreachable = all.filter(n => !seen.has(n));
const deadEnds = all.filter(n => (edges[n] || []).length === 0);

return {
  start: START,
  startExists: !!boards[START],
  totalBoards: all.length,
  reachable: seen.size,
  unreachableCount: unreachable.length,
  unreachableSample: unreachable.slice(0, 40),
  deadEndCount: deadEnds.length,
  deadEndSample: deadEnds.slice(0, 20),
  totalEdges: Object.values(edges).reduce((a, e) => a + e.length, 0),
  verdict: unreachable.length === 0 ? 'PASS' : 'INCOMPLETE — unreachable boards must be wired or listed as entry: in the manifest',
};
