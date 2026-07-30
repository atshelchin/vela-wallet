// 79-send-tail.js — finish the send journey, and stop lying about the boards that cannot be
// reproduced (RESTRUCTURE-2026-07-30 §5, W2).
//
// Two loose ends the wall exposed:
//
// 1. The receipt states WERE captured — from `/receipt-harness`, so they are indexed as
//    `S/dev/receipt-*` on page 10 and the send wall ended at a "NOT BOARDED YET" stub. The harness
//    renders the real component, so the same dumps are boarded here as journey-step proxies
//    (the pattern already used for S/send/sign), annotated with where the capture came from.
//    Without them the app's headline journey stops before it tells the user what happened.
//
// 2. `S/home/activity-empty` and `S/send/confirm` are pixels from a first-generation capture whose
//    dump is NOT in the repo. They cannot be regenerated, so they sit wherever they were left and
//    audit 96 reports them as flat. Deleting them would lose real captured truth; pretending they
//    are current would be worse. They are MOVED into their journey slot so the wall reads, and
//    stamped as recapture debt so the next capture pass knows to replace them.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const PAGE = '05 Screens · Wallet';
const J = storage.journeysJson ||
  (storage.journeysJson = await (await fetch('/plugins/mcp/gen/journeys.json?v=' + Date.now(), { cache: 'reload' })).json());
const L = J.layout;
const stats = { built: [], moved: [], failed: [], skipped: [] };

// the send band's origin on this page, computed the same way 73 does
const walls = (J.pages[PAGE] || {}).walls || [];
let bandY = 0, sendBand = null;
for (const w of walls) {
  const cols = w.kind === 'hub' ? [w.hub].concat(w.spokes || []) : w.steps;
  let maxStack = 0;
  for (const b of cols) maxStack = Math.max(maxStack, ((w.states || {})[b] || []).length);
  if (w.journey === 'send') { sendBand = { y: bandY, wall: w, cols }; break; }
  bandY += L.headerH + (1 + maxStack) * L.rowH + L.bandGap;
}
if (!sendBand) throw new Error('no send wall on ' + PAGE);
const rowY = sendBand.y + L.headerH;
const colX = (i) => L.originX + i * L.colW;

// ---- 1. receipt proxies, from the harness captures
const RECEIPTS = [
  ['receipt-submitted', 'S/send/receipt-submitted', 0],
  ['receipt-confirmed', 'S/send/receipt-confirmed', 1],
  ['receipt-failed', 'S/send/receipt-failed', 2],
];
const stepIndex = sendBand.cols.indexOf('S/send/receipt-submitted');
if (stepIndex < 0) throw new Error('send wall does not list S/send/receipt-submitted');

for (const [slug, board, stack] of RECEIPTS) {
  try {
    storage.domDump = await (await fetch('/plugins/mcp/screens/' + slug + '.json?v=' + Date.now(), { cache: 'reload' })).json();
    // pass the committed region map, exactly as 73 does — a proxy board is still a canon board and
    // still has to meet the semantic floor (the first version of this chunk forgot, and audit 96
    // duly reported four brand-new flat boards)
    let overlay = null;
    try {
      const rr = await fetch('/plugins/mcp/gen/region-maps/' + slug + '.json?v=' + Date.now(), { cache: 'reload' });
      if (rr.ok) overlay = await rr.json();
    } catch (e) { /* none authored */ }
    storage.boardSpec = {
      page: PAGE, name: board,
      x: colX(stepIndex), y: rowY + stack * L.rowH,
      fill: '#FAFAF8', colorSet: 'color-light',
      regionMap: overlay && overlay.regions, swapMap: overlay && overlay.swaps,
    };
    const r = await storage.runChunk('70-board-from-dom.js');
    const b = lib.byName(board);
    if (b) {
      b.setPluginData('vela.source', '/receipt-harness#' + slug);
      lib.chip(b, 'note', 'JOURNEY-STEP PROXY — captured from the dev receipt harness (/receipt-harness), which renders the same TransactionReceipt the send flow shows. The harness board itself is S/dev/' + slug + ' on page 10.');
    }
    stats.built.push(board + ' (' + ((r.rects || 0) + (r.texts || 0)) + ' shapes)');
  } catch (e) {
    stats.failed.push(board + ': ' + String((e && e.message) || e));
  }
}

// ---- 2. legacy boards: move into their slot, mark the debt
const LEGACY = [
  ['S/send/confirm', 'step', 2, 0],
  ['S/home/activity-empty', 'home-state', 0, 1],
];
// home band is the first wall; recompute its origin
const homeWall = walls.find((w) => w.journey === 'home');
const homeRowY = L.headerH;
for (const [name, kind, col, stack] of LEGACY) {
  const b = lib.byName(name);
  if (!b) { stats.skipped.push(name + ' (absent)'); continue; }
  if (kind === 'step') { b.x = colX(col); b.y = rowY + stack * L.rowH; }
  else { b.x = colX(col); b.y = homeRowY + stack * L.rowH; }
  b.setPluginData('vela.debt', 'RECAPTURE — drawn from a first-generation capture whose DOM dump is not in the repo, so this board cannot be regenerated and has no region map. Re-drive the app to this state, dump it, and rebuild via 73.');
  lib.chip(b, 'note', 'recapture debt: no committed dump for this board');
  stats.moved.push(name + ' → (' + Math.round(b.x) + ',' + Math.round(b.y) + ')');
}

return lib.done('79-send-tail', stats);
