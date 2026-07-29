// 73-screens-from-states.js — build the screen-state boards for ONE page from captured states.
//
// Input: storage.screenIndex = dom-dumps/screens/_index.json (slug, board, page, note, w, h)
//        storage.screenPage  = the page to build, e.g. '05 Screens · Wallet'
//        storage.screenSkip  = optional array of slugs to leave out
// Dumps are fetched from /plugins/mcp/screens/<slug>.json.
//
// Every board is a state the app was actually driven into (see generator/state-specs*.json for the
// steps that produced it), so a board carries provenance twice: `vela.source` names the route and
// `vela.note` says what was done to reach it. Boards are laid out in a fixed grid per page, five to
// a row, so a re-run puts everything back where it was.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const index = storage.screenIndex;
const page = storage.screenPage;
if (!index || !page) throw new Error('set storage.screenIndex and storage.screenPage first');
const skip = new Set(storage.screenSkip || []);

const mine = index.filter((e) => e.page === page && !skip.has(e.slug));
const stats = { page, boards: 0, shapes: 0, icons: 0, images: 0, missing: 0, bound: 0, literal: 0,
  stuck: 0, built: [], failed: [] };

await lib.open(page);
for (let i = 0; i < mine.length; i++) {
  const e = mine[i];
  try {
    storage.domDump = await (await fetch('/plugins/mcp/screens/' + e.slug + '.json')).json();
    storage.boardSpec = { page, name: e.board, x: (i % 5) * 450, y: Math.floor(i / 5) * 950, fill: '#FAFAF8' };
    const r = await storage.runChunk('70-board-from-dom.js');
    const b = lib.byName(e.board);
    if (b && e.note) lib.chip(b, 'note', e.note);
    stats.shapes += (r.rects || 0) + (r.texts || 0);
    stats.icons += r.icons || 0; stats.images += r.images || 0;
    stats.missing += (r.iconMissing || 0) + (r.imageMissing || 0);
    stats.bound += r.colorBound || 0; stats.literal += r.colorLiteral || 0;
    stats.stuck += (r.reflowStuck || []).length;
    stats.boards++;
    stats.built.push(e.board);
  } catch (err) {
    stats.failed.push(e.board + ': ' + String((err && err.message) || err));
  }
}
return lib.done('73-screens-from-states:' + page, stats);
