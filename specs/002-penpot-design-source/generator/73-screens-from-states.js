// 73-screens-from-states.js — build the screen-state boards for ONE page from captured states.
//
// Input: storage.screenIndex = dom-dumps/screens/_index.json (slug, board, page, note, w, h)
//        storage.screenPage  = the page to build, e.g. '05 Screens · Wallet'
//        storage.screenSkip  = optional array of slugs to leave out
// Dumps are fetched from /plugins/mcp/screens/<slug>.json.
//
// Every board is a state the app was actually driven into (see generator/state-specs*.json for the
// steps that produced it), so a board carries provenance twice: `vela.source` names the route and
// `vela.note` says what was done to reach it.
//
// POSITIONS (RESTRUCTURE-2026-07-30 §7): board (x,y) derives from generator/journeys.json — walls
// are a generated output, so a re-run REPRODUCES the journey layout instead of resetting it to a
// grid (the old `i%5` grid destroyed the walls on every regen). Boards in no wall fall into a
// 'misc' band below the last wall, on the legacy grid. A wall step naming an absent board is
// skipped but keeps its column reserved.
//
// SEMANTIC OVERLAY (same §): if generator/region-maps/<slug>.json exists it is passed to 70 as
// spec.regionMap (+ spec.swapMap), so region grouping and instance swaps are re-applied from
// committed data on every rebuild. Interactions are NOT preserved here — the mandatory regen
// ordering re-runs 74-interactions.js after any 70/73 run.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const index = storage.screenIndex;
const page = storage.screenPage;
if (!index || !page) throw new Error('set storage.screenIndex and storage.screenPage first');
const skip = new Set(storage.screenSkip || []);

// ── journey-derived positions ──────────────────────────────────────────────────────────────────
const J = storage.journeysJson ||
  (storage.journeysJson = await (await fetch('/plugins/mcp/gen/journeys.json?v=' + Date.now(), { cache: 'reload' })).json());
const L = J.layout;
const pos = {};            // norm(board name) -> { x, y, wall }
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
const miscY = bandY;       // legacy grid for boards no wall claims

const mine = index.filter((e) => e.page === page && !skip.has(e.slug));
const stats = { page, boards: 0, shapes: 0, icons: 0, images: 0, missing: 0, bound: 0, literal: 0,
  stuck: 0, walled: 0, misc: [], regions: 0, regionUnmatched: 0, regionMapMissing: [],
  swapped: 0, swapMissing: 0, built: [], failed: [] };

await lib.open(page);
let miscI = 0;
for (let i = 0; i < mine.length; i++) {
  const e = mine[i];
  try {
    // cache-bust: without it the browser serves the dump it fetched EARLIER IN THIS SESSION, so a
    // recapture deployed mid-session rebuilds from the stale copy — silently. That produced five
    // Home boards built from the pre-recapture dumps while every log line said they had been
    // rebuilt: wrong frame height, region paths that no longer matched (the committed map is
    // generated from the NEW dump), and 75 unmatched shapes swept into the backdrop group.
    storage.domDump = await (await fetch('/plugins/mcp/' + (storage.screenDir || 'screens') + '/' + e.slug +
      '.json?v=' + Date.now(), { cache: 'reload' })).json();
    // a freshly captured dump carries its raster bytes inline; upload them before drawing or every
    // logo becomes a red placeholder (pruned dumps skip this — they have no inline dataUri)
    const inline = await storage.runChunk('71b-upload-inline-assets.js');
    stats.inlineAssets = (stats.inlineAssets || 0) + (inline.uploaded || 0);
    // committed semantic overlay for this screen, if authored (region-maps are optional per board)
    // A missing or failed region map must be LOUD. The first version swallowed both cases, and one
    // transient fetch left S/send/select-token rebuilt with 58 loose shapes and no regions while the
    // run still reported `regionUnmatched: 0` — a board silently demoted below the semantic floor,
    // found only because the idempotency snapshot noticed its child count had changed.
    let overlay = null;
    try {
      const r = await fetch('/plugins/mcp/gen/region-maps/' + e.slug + '.json?v=' + Date.now(), { cache: 'reload' });
      if (r.ok) overlay = await r.json();
      else stats.regionMapMissing.push(e.slug + ' (HTTP ' + r.status + ')');
    } catch (err2) {
      stats.regionMapMissing.push(e.slug + ' (' + String((err2 && err2.message) || err2) + ')');
    }
    if (overlay && !(overlay.regions || []).length) stats.regionMapMissing.push(e.slug + ' (map has no regions)');
    const p = pos[lib.norm(e.board)];
    if (p) stats.walled++; else stats.misc.push(e.board);
    const at = p || { x: (miscI % 5) * L.colW, y: miscY + Math.floor(miscI / 5) * L.rowH };
    if (!p) miscI++;
    // a dark capture must resolve its hexes against `color-dark`, and its page ground is the dark
    // base — matching against the light set would leave the whole board in literal hex
    const dark = !!storage.screenColorSet && storage.screenColorSet !== 'color-light';
    storage.boardSpec = { page, name: e.board, x: at.x, y: at.y,
      fill: dark ? '#010101' : '#FAFAF8', colorSet: storage.screenColorSet || 'color-light',
      regionMap: overlay && overlay.regions, swapMap: overlay && overlay.swaps };
    const r = await storage.runChunk('70-board-from-dom.js');
    const b = lib.byName(e.board);
    if (b && e.note) lib.chip(b, 'note', e.note);
    stats.shapes += (r.rects || 0) + (r.texts || 0);
    stats.icons += r.icons || 0; stats.images += r.images || 0;
    stats.missing += (r.iconMissing || 0) + (r.imageMissing || 0);
    stats.bound += r.colorBound || 0; stats.literal += r.colorLiteral || 0;
    stats.stuck += (r.reflowStuck || []).length;
    stats.regions += r.regions || 0; stats.regionUnmatched += (r.regionUnmatched || []).length;
    stats.swapped += r.swapped || 0; stats.swapMissing += (r.swapMissing || []).length;
    stats.boards++;
    stats.built.push(e.board);
  } catch (err) {
    stats.failed.push(e.board + ': ' + String((err && err.message) || err));
  }
}
return lib.done('73-screens-from-states:' + page, stats);
