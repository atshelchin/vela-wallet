// 92-audit-coverage.js — SC-003: every manifest cell has a board (or a recorded exclusion).
// Read-only. Paste manifest.json content into MANIFEST below (the plugin context has no fs);
// the executor injects it by replacing the placeholder line.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const MANIFEST = storage.manifest; // set by the caller: storage.manifest = <parsed manifest.json>
if (!MANIFEST) throw new Error('set storage.manifest = <manifest.json contents> first');

// index every board name per page once
const index = {};
for (const pageName of lib.PAGES) {
  const pg = penpotUtils.getPageByName(pageName);
  if (!pg) continue;
  await lib.open(pageName);
  for (const b of penpotUtils.findShapes(s => s.type === 'board' && s.name !== 'Root Frame', penpot.currentPage.root)) {
    index[b.name] = pageName;
  }
}
const has = (name) => !!index[lib.norm(name)];

const missing = [];
const present = [];
let cells = 0;
for (const s of MANIFEST.screens) {
  for (const st of s.states) {
    cells++;
    const n = s.boardBase + '/' + st;
    (has(n) ? present : missing).push(n);
  }
}
for (const o of MANIFEST.overlays) {
  for (const st of o.states) {
    cells++;
    const n = o.boardBase + '/' + st;
    (has(n) ? present : missing).push(n);
  }
}
const famNames = new Set(penpot.library.local.components.map(c => c.name));
const missingFamilies = MANIFEST.components.filter(c => !famNames.has(lib.norm(c.name))).map(c => c.name);

return {
  cells,
  boardsPresent: present.length,
  boardsMissing: missing.length,
  coveragePct: Math.round((present.length / cells) * 1000) / 10,
  missingSample: missing.slice(0, 40),
  componentsExpected: MANIFEST.components.length,
  componentsMissing: missingFamilies.length,
  missingFamilies: missingFamilies.slice(0, 40),
  verdict: missing.length === 0 && missingFamilies.length === 0 ? 'PASS' : 'INCOMPLETE',
};
