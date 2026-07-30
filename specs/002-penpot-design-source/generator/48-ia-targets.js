// 48-ia-targets.js — make the IA map machine-resolvable, and honest about what it cannot do (W3a).
//
// The plan was to turn every route node into a click that jumps to its board. It cannot be done:
// a cross-page `navigate-to` is ACCEPTED by Penpot and then stored with an EMPTY destination
// (probed 2026-07-30 — cross-page overlay throws, cross-page navigate lies), and every board this
// map points at lives on another page. `open-url` would work but only by baking this deployment's
// origin into the file, which dies the moment the file moves.
//
// So the map carries the target as DATA, and says so on the canvas:
//   · machine — `vela.target` on each route node: the exact board name to resolve by name;
//   · human   — the "▸ S/…" line already printed in each node, plus one legend line explaining
//               that names, not clicks, are the handle here. The journey walls on 05–08 are where
//               a person follows the flow by clicking.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const PAGE = '04 IA & Flows';
const stats = { nodes: 0, stamped: 0, noBoard: [], resolved: 0, unresolved: [] };

await lib.open(PAGE);
const map = penpotUtils.findShape((s) => lib.norm(s.name || '') === 'D / ia / map', penpot.currentPage.root);
if (!map) throw new Error('D / ia / map not found');

// collect the board name printed inside each node ("▸ S/home/activity-empty")
const kids = map.children || [];
const boardTextOf = {};
for (const c of kids) {
  const m = lib.norm(c.name || '').match(/^n \/ ([^/]+) \/ board$/);
  if (m && c.type === 'text') boardTextOf[m[1]] = String(c.characters || '').replace(/^[▸»>\s]+/, '').trim();
}

// index the boards a target could name, so a stamped target can be proven to exist. Only the
// surface pages carry `S/…`/`O/…` boards; walking all 13 pages costs an openPage poll each and
// pushed this chunk past the 15 s budget.
const boards = new Set();
const SURFACE_PAGES = lib.PAGES.filter((p) => /Screens|Overlays|Dev/.test(p));
for (const p of SURFACE_PAGES) {
  if (!penpotUtils.getPageByName(p)) continue;
  await lib.open(p);
  for (const b of penpot.currentPage.root.children) if (b.type === 'board') boards.add(lib.norm(b.name || ''));
}
await lib.open(PAGE);

for (const c of kids) {
  const m = lib.norm(c.name || '').match(/^n \/ ([^/]+)$/);
  if (!m) continue;
  const key = m[1];
  // 'title', 'sub' and this chunk's own 'legend-targets' line share the `n / <x>` shape of a node
  // name without being nodes
  if (key === 'title' || key === 'sub' || key.startsWith('legend')) continue;
  stats.nodes++;
  const raw = boardTextOf[key];
  if (!raw) { stats.noBoard.push(key); continue; }
  // a node may legitimately have NO board (native-only surfaces). 44 prints that as prose with a
  // ⚠ marker; stamping it as a target would invent a board name that no lookup can ever resolve.
  if (/^⚠/.test(raw) || !/^[SOCD]\//.test(raw)) {
    c.setPluginData('vela.note', raw.replace(/^⚠\s*/, ''));
    stats.excluded = (stats.excluded || []).concat(key + ': ' + raw);
    continue;
  }
  c.setPluginData('vela.target', raw);
  stats.stamped++;
  if (boards.has(lib.norm(raw))) stats.resolved++;
  else stats.unresolved.push(key + ' → ' + raw);
}

// the legend line: why there is nothing to click here
const legend = lib.upsertText(map, 'n / legend-targets',
  { text: 'Nodes carry their board name (vela.target). Penpot cannot link across pages, so resolve boards BY NAME — or follow the journey walls on pages 05–08, where the steps are wired and labelled.',
    size: 10, weight: 400, color: '#8C887E', x: 40, y: 122, growType: 'auto-height' });
// y=122 sits BELOW 44's kind-swatch legend row (y=96, 10px swatches + 9pt labels); at y=92 this
// line printed straight through it — visible in the first export.
legend.text.resize(880, 26);
try { lib.bindToken(legend.text, 'color.fg.subtle', ['fill']); } catch (e) {}
stats.legend = legend.created ? 'created' : 'present';

lib.chip(map, 'note', 'route nodes carry vela.target (board name); cross-page interactions are impossible in Penpot, so names are the handle');
return lib.done('48-ia-targets', stats);
