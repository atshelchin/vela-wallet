// 90-audit-idempotency.js — SC-005 + the name-uniqueness assertion (duplicate-flush guard).
// Read-only. Returns a report; writes nothing.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;

const report = { pages: {}, duplicates: [], stray: [], componentFamilies: {}, totals: { boards: 0, shapes: 0 } };

for (const pageName of lib.PAGES) {
  const pg = penpotUtils.getPageByName(pageName);
  if (!pg) { report.pages[pageName] = 'MISSING PAGE'; continue; }
  await lib.open(pageName);
  const root = penpot.currentPage.root;
  const all = penpotUtils.findShapes(() => true, root);
  const boards = all.filter(s => s.type === 'board' && s.name !== 'Root Frame');
  // top-level boards only (variant members live inside containers)
  const top = boards.filter(b => b.parent && b.parent.name === 'Root Frame');
  const names = top.map(b => b.name);
  const seen = new Set();
  for (const n of names) {
    if (seen.has(n)) { if (!report.duplicates.some(d => d.page === pageName && d.name === n)) report.duplicates.push({ page: pageName, name: n }); }
    seen.add(n);
  }
  // stray = a top-level board that follows none of the naming classes
  const strays = names.filter(n => !/^(S|O|C|D) \/ /.test(n));
  if (strays.length) report.stray.push({ page: pageName, names: strays });
  report.pages[pageName] = { topBoards: top.length, allBoards: boards.length, shapes: all.length };
  report.totals.boards += top.length;
  report.totals.shapes += all.length;
}

// component families: every library component name should map to exactly one variant container
const comps = penpot.library.local.components.map(c => c.name);
for (const n of comps) report.componentFamilies[n] = (report.componentFamilies[n] || 0) + 1;

report.verdict = (report.duplicates.length === 0 && report.stray.length === 0)
  ? 'PASS — no duplicate top-level board names, no unclassified boards'
  : 'FAIL — see duplicates / stray';
return report;
