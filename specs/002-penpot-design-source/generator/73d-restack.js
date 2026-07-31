// 73d-restack.js — put every region's children back in painting order.
//
// Input: storage.wallPage = the page to restack. One page per call. Idempotent.
//
// A shape's z-order in Penpot is its `parentIndex`: 0 is the BACK, the last index is the FRONT. The
// fidelity layer's correct order is therefore DOM order — a node is painted before its descendants,
// so a card's background must sit at a lower index than the rows inside it.
//
// That order is not guaranteed to survive. `S/home/rpc-trouble` came out of a rebuild with its
// content region exactly inverted: the deepest leaves at index 0 and the painted parents in front,
// so the RPC warning card covered its own twelve network rows and the board exported as an empty
// beige rectangle with the text sitting invisibly behind it. Every text shape was present and
// correctly positioned; only the stacking was wrong, which is the kind of defect a shape-count or
// text-count check passes with full marks.
//
// The order is recomputed rather than repaired: the shape names carry the DOM path they came from
// (`r / 0.0.0.0.1.0.2 …`), so "what should be behind what" is derivable, not guesswork. Shapes with
// no path — component instances, region groups — keep their relative order and go last.
//
// Note on the API: `sendToBack()` / `bringToFront()` exist on every shape, are accepted, and do
// nothing; `parentIndex` is a getter and assigning to it throws; `penpot.ungroup()` restores
// children in REVERSE order. `setParentIndex()` is the one that moves a shape.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const page = storage.wallPage;
if (!page) throw new Error('set storage.wallPage first');

const pathOf = (name) => {
  const m = String(name).match(/^r \/ ([0-9]+(?:\.[0-9]+)*)/);
  return m ? m[1].split('.').map(Number) : null;
};
// parent before child, earlier sibling before later — i.e. plain DOM order
const cmp = (a, b) => {
  const pa = pathOf(a.name), pb = pathOf(b.name);
  if (!pa && !pb) return 0;
  if (!pa) return 1;
  if (!pb) return -1;
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return pa.length - pb.length;
};

await lib.open(page);
const out = { chunk: '73d-restack:' + page, boards: 0, groupsFixed: [], movesApplied: 0, failed: [] };
const boards = penpot.currentPage.findShapes().filter((s) => s.type === 'board' && /^[SO] \/ /.test(s.name));

for (const b of boards) {
  out.boards++;
  try {
    // the backdrop first, so the screen's own background never covers the screen
    const surface = b.children.find((c) => /^region \/ surface$/.test(c.name));
    if (surface && surface.parentIndex !== 0) { surface.setParentIndex(0); out.movesApplied++; }

    for (const reg of b.children.filter((c) => /^region \/ /.test(c.name) && c.children && c.children.length > 1)) {
      const want = reg.children.slice().sort(cmp);
      const now = reg.children.map((c) => c.id);
      if (want.every((s, i) => s.id === now[i])) continue;
      // assign ascending: each setParentIndex shifts the rest, so applying the target order from
      // front of the list backwards leaves the whole permutation correct
      want.forEach((s, i) => { if (s.parentIndex !== i) { s.setParentIndex(i); out.movesApplied++; } });
      out.groupsFixed.push(b.name + ' › ' + reg.name + ' (' + want.length + ')');
    }
  } catch (e) {
    out.failed.push(b.name + ': ' + String((e && e.message) || e));
  }
}
return out;
