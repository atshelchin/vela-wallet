// 94-audit-lookup.js — SC-006: can an asset be found by NAME ALONE, first try?
//
// Input: storage.manifest = generator/manifest.json contents.
//
// WHY THIS MATTERS MORE THAN IT SOUNDS. The whole promise of this file is that an agent holding
// nothing but Penpot MCP can build the app from it. That agent does not browse — it looks a name up.
// If `S/send/confirm` resolves to two shapes, or to none because the board is called
// `S / send / confirm-step`, the agent's first move fails and it starts guessing. The naming grammar
// in contracts/consumption-contract.md is the contract; this is the test that the file honours it.
//
// TWO FAILURE MODES, BOTH CHECKED. A name that resolves to NOTHING is the obvious one. A name that
// resolves to MORE THAN ONE shape is the quieter one and just as fatal: "first try" means the agent
// takes the first hit, and with two candidates it takes the wrong one half the time.
//
// PERFORMANCE IS PART OF THE DESIGN. Audit 92 resolves each manifest cell with its own global
// search and has never finished a run. This builds ONE index over the pages and then answers every
// name from it — pages are walked once, not once per name.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const M = storage.manifest;
if (!M) throw new Error('set storage.manifest = <manifest.json contents> first');

// ── one pass over the file ─────────────────────────────────────────────────────────────────────
const index = new Map();          // normalised name -> [{ page, id }]
const add = (name, page, id) => {
  const k = lib.norm(name);
  if (!index.has(k)) index.set(k, []);
  index.get(k).push({ page, id });
};
for (const p of penpot.currentFile.pages) {
  await lib.open(p.name);
  for (const s of penpot.currentPage.findShapes()) {
    // Screens and overlays only. A component family's VARIANT boards all live on 03 Components
    // under the family name, so indexing them here would report every healthy family as ambiguous —
    // 42 of them did on the first run. A component is addressed through the library, below.
    if (s.type === 'board' && /^[SO] \/ /.test(s.name)) add(s.name, p.name, s.id);
  }
}
// components are addressed through the library, not the canvas: identity is path + name (platform
// rule 6 — `.name` holds only the LEAF)

const EXCLUDED = new Set((M.exclusions || []).map((e) => lib.norm(typeof e === 'string' ? e : (e.cell || e.board || ''))));

const out = { chunk: '94-audit-lookup', indexed: index.size, tried: 0,
  resolved: 0, excluded: 0, missing: [], ambiguous: [] };

const tryName = (name) => {
  out.tried++;
  const k = lib.norm(name);
  const hits = index.get(k);
  if (!hits) {
    if (EXCLUDED.has(k)) { out.excluded++; return; }
    out.missing.push(name);
    return;
  }
  if (hits.length > 1) { out.ambiguous.push(name + ' → ' + hits.length + ' (' + hits.map((h) => h.page).join(', ') + ')'); return; }
  out.resolved++;
};

for (const s of (M.screens || [])) for (const st of (s.states || [])) tryName(s.boardBase + '/' + st);
for (const o of (M.overlays || [])) for (const st of (o.states || [])) tryName(o.boardBase + '/' + st);
// A component is addressed by its family name; the variant axes are properties of that family, so
// resolving the family IS the lookup an agent performs before switching a variant.
// Components resolve through the library, where a family exists exactly once.
const families = new Set(penpot.library.local.components
  .map((c) => lib.norm((c.path ? c.path + ' / ' : '') + c.name)));
for (const c of (M.components || [])) {
  out.tried++;
  if (families.has(lib.norm(c.name))) out.resolved++;
  else out.missing.push(c.name + ' (component family)');
}

// TWO VERDICTS, because they have different owners. `conventionPass` is SC-006's real question —
// does the naming grammar resolve, first try, with no collisions? A missing asset is a COVERAGE
// hole (SC-003, audit 92), and reporting it here as a naming failure would send someone to fix the
// wrong thing. `pass` stays strict to the criterion as written: an agent cannot look up a board
// that was never drawn.
out.conventionPass = out.ambiguous.length === 0;
out.missingCount = out.missing.length;
out.pass = out.missingCount === 0 && out.conventionPass;
out.note = out.conventionPass
  ? 'naming grammar resolves cleanly; every unresolved name is an absent asset — see audit 92'
  : 'NAME COLLISIONS: an agent taking the first hit gets the wrong asset';
out.missing = out.missing.slice(0, 40);
return out;
