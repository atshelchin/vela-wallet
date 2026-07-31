// 81-reuse-index.js — page 09: which component is used where (RESTRUCTURE-2026-07-30 §5, W4).
//
// "Which components can I reuse?" has two halves. `03 Components` answers the first — what exists
// and when to reach for it. This board answers the second: which of them the app ACTUALLY leans on,
// and where. A component used by four screens is a load-bearing part of the vocabulary; one used by
// a single dev route is not, however nicely it is documented.
//
// The counts come from `usedIn` in _plan.json — real imports resolved from the source tree, not a
// canvas guess — so the index cannot flatter itself.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const PAGE = '09 Patterns';
const plan = storage.reusePlan ||
  (storage.reusePlan = await (await fetch('/plugins/mcp/gen/_plan.json?v=' + Date.now(), { cache: 'reload' })).json());
const C = { ink: '#1A1A18', muted: '#6E6B62', subtle: '#8C887E', line: '#ECEBE4', raised: '#FFFFFF',
  base: '#FAFAF8', accent: '#E8572A' };
const stats = { rows: 0, tier1: 0, surfaces: 0 };

// component → the surfaces that import it, and the reverse index
const rows = plan.families
  .map((f) => ({
    name: f.component,
    leaf: f.component.split('/').pop(),
    group: f.component.split('/')[1],
    tier: f.tier || 2,
    used: (f.usedIn || []).map((p) => p.replace(/^src\//, '').replace(/\.tsx?$/, '')),
  }))
  .sort((a, b) => (b.used.length - a.used.length) || a.name.localeCompare(b.name));

const bySurface = {};
for (const r of rows) for (const s of r.used) (bySurface[s] = bySurface[s] || []).push(r.leaf);
const surfaces = Object.entries(bySurface).sort((a, b) => b[1].length - a[1].length).slice(0, 12);
stats.surfaces = surfaces.length;

await lib.open(PAGE);
let baseY = 0;
for (const b of (penpot.currentPage.root.children || [])) baseY = Math.max(baseY, b.y + b.height);
baseY = Math.round(baseY + 220);

const W = 1500;
const { board } = await lib.upsertBoard(PAGE, 'D / patterns / reuse-index',
  { x: 0, y: baseY, w: W, h: 400, fill: C.raised });
try { lib.bindToken(board, 'color.bg.raised', ['fill']); } catch (e) {}
for (let g = 0; g < 900; g++) {
  const old = penpotUtils.findShape((s) => lib.norm(s.name || '').startsWith('ri / '), board);
  if (!old) break;
  old.remove();
}
const t = (n, text, o) => lib.upsertText(board, 'ri / ' + n, Object.assign({ text, size: 12, weight: 400, color: C.muted, x: 60, y: 0 }, o)).text;

let y = 56;
t('kicker', 'REUSE INDEX', { size: 10, weight: 700, color: C.accent, y }).letterSpacing = '0.6';
y += 22;
t('title', 'What the app actually leans on', { size: 34, weight: 700, color: C.ink, y });
y += 52;
t('lede', 'Ordered by how many surfaces import it, from the real import graph. Reach for the top of this list first: a component with four callers already survived four contexts. The bottom of the list is where a new feature should be suspicious of itself.',
  { size: 13, weight: 400, color: C.muted, y, growType: 'auto-height' }).resize(900, 44);
y += 68;

// ---- component → surfaces
t('h1', 'COMPONENT', { size: 9, weight: 700, color: C.subtle, x: 60, y });
t('h2', 'USED BY', { size: 9, weight: 700, color: C.subtle, x: 300, y });
t('h3', 'SURFACES', { size: 9, weight: 700, color: C.subtle, x: 380, y });
y += 18;
for (const r of rows) {
  const label = (r.tier === 1 ? '★ ' : '   ') + r.group + ' / ' + r.leaf;
  t('c-' + r.name, label, { size: 11.5, weight: r.tier === 1 ? 600 : 400, color: r.tier === 1 ? C.ink : C.muted, x: 60, y });
  t('n-' + r.name, String(r.used.length), { size: 11.5, weight: 600, zone: 'mono', color: r.used.length ? C.ink : C.subtle, x: 316, y });
  t('u-' + r.name, r.used.length ? r.used.join('   ·   ') : 'no importer found in src/ — verify it is still reachable',
    { size: 10, weight: 400, zone: 'mono', color: r.used.length ? C.muted : C.accent, x: 380, y: y + 1, growType: 'auto-height' }).resize(1050, 14);
  if (r.tier === 1) stats.tier1++;
  stats.rows++;
  y += 20;
}
y += 40;

// ---- surface → components (the other direction: what a screen is made of)
t('h4', 'THE OTHER DIRECTION — what a surface is built from', { size: 18, weight: 700, color: C.ink, x: 60, y });
y += 32;
// A fixed 22px row cannot hold SigningSheet's 25 components: the text wrapped to three lines and
// printed straight over the two surfaces below it. Cap the list and say how many were dropped —
// silent truncation would read as "that is all of them".
const CAP = 11;
for (const [surface, comps] of surfaces) {
  t('s-' + surface, surface, { size: 11.5, weight: 600, zone: 'mono', color: C.ink, x: 60, y });
  const shown = comps.slice(0, CAP).join('   ·   ') + (comps.length > CAP ? '   + ' + (comps.length - CAP) + ' more' : '');
  const line = t('sc-' + surface, shown, { size: 10, weight: 400, color: C.muted, x: 380, y: y + 1, growType: 'auto-width' });
  penpotUtils.setParentXY(line, 380, y + 1);
  t('sn-' + surface, String(comps.length), { size: 10, weight: 600, zone: 'mono', color: C.subtle, x: 316, y: y + 1 });
  y += 22;
}

board.resize(W, Math.round(y + 60));
lib.chip(board, 'note', 'generated from the usedIn field of dom-dumps/cells/_plan.json, which is resolved from the source tree — a component with no importer shows up here in accent, not silently');
return lib.done('81-reuse-index', stats);
