// 92-audit-coverage.js — SC-003: every planned cell is a board, or a recorded exclusion.
//
// Input: storage.manifest = generator/manifest.json contents.
// Output: the counts below plus `cells`, the full per-cell verdict — the machine artifact T031 asks
//         for. `coverage.md` next to it is a hand-rendered PLAN written before the pivot ("cells =
//         planned boards", pinned to ffe7209); it is a statement of intent, not evidence.
//
// REWRITTEN 2026-07-31. The previous version resolved each of the 313 cells with its own recursive
// page search and never finished a run — the same pathology audit 93 had before it was rewritten.
// An audit that does not terminate is indistinguishable from an audit nobody runs, and this one had
// been quietly not-running while the restructure log recorded "W5 audits done" (that line covers
// 96/93/97/26/90; 92 was never in it). The pages are now walked ONCE into an index.
//
// FOUR VERDICTS, NOT TWO. A planned cell with no board is not automatically a hole:
//   board    — the name resolves
//   drift    — the SURFACE exists under different state names. The plan says `S/home/default`; the
//              file has `S/home/activity`, because Home became activity-first after the plan was
//              written. That is a stale plan, not a missing screen, and collapsing the two turns a
//              bookkeeping chore into a fake backlog of two hundred screens.
//   excluded — covered by a recorded exclusion
//   missing  — genuinely absent: no board, no sibling state, no exclusion
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const M = storage.manifest;
if (!M) throw new Error('set storage.manifest = <manifest.json contents> first');

// ── one pass over the file ─────────────────────────────────────────────────────────────────────
const boards = new Set();
const byBase = new Map();          // 'S/home' -> the states actually present
for (const p of penpot.currentFile.pages) {
  await lib.open(p.name);
  for (const s of penpot.currentPage.findShapes()) {
    if (s.type !== 'board' || !/^[SO] \/ /.test(s.name)) continue;
    const n = lib.norm(s.name);
    boards.add(n);
    // lib.norm() yields Penpot's STORED form (`S / home / activity`, spaces around the slash — see
    // platform rule 1), so the base cannot be taken with lastIndexOf('/') or it comes back as
    // "S / home " with a trailing space and never matches the manifest's compact "S/home". Splitting
    // on the separator with its padding is the only form both sides agree on.
    const parts = n.split(/\s*\/\s*/);
    const state = parts.pop();
    const base = parts.join('/');
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push(state);
  }
}
const families = new Set(penpot.library.local.components
  .map((c) => lib.norm((c.path ? c.path + ' / ' : '') + c.name)));

// An exclusion names a SURFACE in prose ("route /history", a file path, a component name), so it is
// matched by containment against the cell's base rather than by equality.
const EX = (M.exclusions || []).map((e) => String((e && e.surface) || e).toLowerCase());
const isExcluded = (base) => {
  const tail = String(base).toLowerCase().split('/').slice(1).join('/');
  return !!tail && EX.some((s) => s.includes(tail));
};

const out = { chunk: '92-audit-coverage', planned: 0, board: 0, excluded: 0,
  drift: [], missing: [], cells: [],
  screens: { planned: 0, board: 0 }, overlays: { planned: 0, board: 0 }, components: { planned: 0, board: 0 } };

const check = (kind, base, state) => {
  const name = base + '/' + state;
  const n = lib.norm(name);
  out.planned++; out[kind].planned++;
  if (boards.has(n)) { out.board++; out[kind].board++; out.cells.push({ name, verdict: 'board' }); return; }
  const present = byBase.get(String(base).split(/\s*\/\s*/).join('/'));
  if (present && present.length) {
    out.drift.push(name + ' → surface exists as: ' + present.join(', '));
    out.cells.push({ name, verdict: 'drift', have: present });
    return;
  }
  if (isExcluded(base)) { out.excluded++; out.cells.push({ name, verdict: 'excluded' }); return; }
  out.missing.push(name);
  out.cells.push({ name, verdict: 'missing' });
};

for (const s of (M.screens || [])) for (const st of (s.states || [])) check('screens', s.boardBase, st);
for (const o of (M.overlays || [])) for (const st of (o.states || [])) check('overlays', o.boardBase, st);
for (const c of (M.components || [])) {
  out.planned++; out.components.planned++;
  if (families.has(lib.norm(c.name))) { out.board++; out.components.board++; out.cells.push({ name: c.name, verdict: 'board' }); }
  else { out.missing.push(c.name); out.cells.push({ name: c.name, verdict: 'missing' }); }
}

out.driftCount = out.drift.length;
out.missingCount = out.missing.length;
out.coveragePct = Math.round((out.board / out.planned) * 1000) / 10;
// SC-003 as written: zero blank cells; ≥95% boards; ≤5% recorded exclusions.
out.pass = out.missingCount === 0 && out.driftCount === 0;
return out;
