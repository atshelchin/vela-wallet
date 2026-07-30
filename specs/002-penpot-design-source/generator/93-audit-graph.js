// 93-audit-graph.js — SC-007: the interaction graph is traversable from the home board.
// Follows native prototype interactions AND the `vela.edge` plugin data that carries every
// transition Penpot cannot express as a pointer interaction (non-pointer conditions, and the
// cross-page hops it accepts and then silently drops). Read-only.
//
// Two corrections over the first version:
//  · it scanned for on-canvas `edge:` TEXT shapes, which were deleted when annotations moved into
//    plugin data — so it saw only the pointer half of the graph and would have called correctly
//    wired journeys broken;
//  · it made two passes over all 13 pages and then called penpotUtils.findShapeById per board — a
//    GLOBAL search each time, i.e. ~89 boards × every shape in the file. It never finished. Now:
//    one pass, page-scoped, every board handled while its own page is open.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;

const SURFACE_PAGES = lib.PAGES.filter((p) => /Screens|Overlays/.test(p));
const boards = {};      // name -> page
const edges = {};       // name -> Set(dest name)
const byId = {};        // board id -> name
const pending = [];     // [fromName, destId] — resolved once every board id is known
const textEdges = [];   // [fromName, rawEntry]

for (const pageName of SURFACE_PAGES) {
  if (!penpotUtils.getPageByName(pageName)) continue;
  await lib.open(pageName);
  for (const b of (penpot.currentPage.root.children || [])) {
    if (b.type !== 'board') continue;
    const name = lib.norm(b.name || '');
    if (!/^(S|O) \/ /.test(name)) continue;
    boards[name] = pageName;
    byId[b.id] = name;
    edges[name] = edges[name] || new Set();

    // pointer interactions, on the board and anything inside it
    const inside = penpotUtils.findShapes(() => true, b) || [];
    for (const sh of [b].concat(inside)) {
      let its = null;
      try { its = sh.interactions; } catch (e) { continue; }
      for (const it of (its || [])) {
        const dest = it.action && it.action.destination;
        // a cross-page destination reads back EMPTY (platform rule) — that is not an edge
        if (dest && dest.id) pending.push([name, dest.id]);
      }
    }
    // the machine-readable half: non-pointer conditions and cross-page hops
    let raw = '';
    try { raw = b.getPluginData('vela.edge') || ''; } catch (e) {}
    if (raw) for (const entry of raw.split(' | ')) textEdges.push([name, entry]);
  }
}

for (const [from, destId] of pending) {
  const to = byId[destId];
  if (to) edges[from].add(to);
}
let edgeParsed = 0;
const edgeUnresolved = [];
for (const [from, entry] of textEdges) {
  const parts = entry.split(/->|→/);
  if (parts.length < 2) continue;
  const target = lib.norm(parts[parts.length - 1].trim());
  if (boards[target]) { edges[from].add(target); edgeParsed++; }
  else if (target !== '—') edgeUnresolved.push(from + ' → ' + target);
}

// ROOTS, not a single root. Onboarding precedes home, a pay link and a dApp request arrive from
// outside the app, and the spec's own wording allows a board to be "recorded as its own entry
// point". The declared flow entries in edges.json ARE that record, so the traversal seeds from all
// of them; anything still unreached is genuinely orphaned.
const G = storage.edgesJson ||
  (storage.edgesJson = await (await fetch('/plugins/mcp/gen/edges.json?v=' + Date.now(), { cache: 'reload' })).json());
const START = lib.norm('S/home/activity');   // 'S/home/default' never existed; activity is the default tab
// a board can also declare itself an entry: a dApp popup and a deep link arrive from OUTSIDE the
// app, so demanding an in-app path to them would be demanding a fiction
const declared = (G.entries || []).map((n) => lib.norm(n));
const roots = [START].concat((G.flows || []).map((f) => lib.norm(f.entry)), declared)
  .filter((n, i, a) => boards[n] && a.indexOf(n) === i);
const seen = new Set();
const queue = roots.slice();
for (const r of roots) seen.add(r);
while (queue.length) {
  const cur = queue.shift();
  for (const next of (edges[cur] || [])) if (!seen.has(next)) { seen.add(next); queue.push(next); }
}

const all = Object.keys(boards);
const unreachable = all.filter((n) => !seen.has(n));
const deadEnds = all.filter((n) => !(edges[n] || new Set()).size);

return lib.done('93-audit-graph', {
  roots,
  startExists: !!boards[START],
  totalBoards: all.length,
  reachable: seen.size,
  unreachableCount: unreachable.length,
  unreachableSample: unreachable.slice(0, 40),
  deadEndCount: deadEnds.length,
  deadEndSample: deadEnds.slice(0, 16),
  pluginDataEdges: edgeParsed,
  pluginDataUnresolved: edgeUnresolved.slice(0, 12),
  totalEdges: Object.values(edges).reduce((a, s) => a + s.size, 0),
  verdict: unreachable.length === 0 ? 'PASS'
    : 'INCOMPLETE — ' + unreachable.length + ' of ' + all.length + ' boards are unreachable from any declared entry point',
});
