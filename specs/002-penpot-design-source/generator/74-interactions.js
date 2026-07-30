// 74-interactions.js — wire the boards into a traversable state machine (FR-005a, SC-007).
//
// Until now the file was a pile of correct pictures with no edges: the consumption contract told a
// rebuild agent that "what happens when I tap X" is answerable mechanically, and it was not.
//
// Each edge names the SOURCE board, the label a person taps, and the DESTINATION board. The trigger
// element is found by its rendered text — the boards are DOM-derived, so the label a user reads is
// also the only stable handle the shape has. Where no single element owns the transition (an
// automatic redirect, a background event), the edge is recorded as `vela.edge` plugin data instead,
// which is exactly the split the contract describes.
//
// Idempotent: interactions are cleared from a source shape before being re-added.
//
// RESTRUCTURE-2026-07-30 §7: the tables below moved to generator/edges.json — the ONE committed
// source for the UI graph, shared with the journey-wall visible edge layer (75-walls.js). This
// chunk is now pure executor; edit edges.json, never this file. It is also the mandatory TAIL of
// every regen run (72 → 70/73 → swap pass → 74 → audits): board rebuilds destroy interactions,
// and this re-applies them; edges.json being repo data is what makes that idempotent.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;

const GRAPH = storage.edgesJson ||
  (storage.edgesJson = await (await fetch('/plugins/mcp/gen/edges.json?v=' + Date.now(), { cache: 'reload' })).json());
const EDGES = GRAPH.edges.map((e) => [e.from, e.label, e.to, e.kind]);
const NON_POINTER = GRAPH.nonPointer.map((e) => [e.from, e.condition, e.to]);
const FLOWS = GRAPH.flows.map((f) => [f.name, f.page, f.entry]);

const stats = { wired: 0, edges: 0, flows: 0, missingSource: [], missingTarget: [], missingLabel: [] };

// Boards live on several pages and mutations only apply to the current page (lib rule 2), so
// resolve every board once, page by page, before touching anything.
const boards = {};
for (const p of lib.PAGES) {
  if (!penpotUtils.getPageByName(p)) continue;
  await lib.open(p);
  for (const b of penpot.currentPage.root.children) {
    if (b.type === 'board') boards[lib.norm(b.name)] = { board: b, page: p };
  }
}

// The tappable element for a label: prefer the exact text, else a text that starts with it.
const findLabel = (board, label) => {
  const want = label.toLowerCase();
  const texts = penpotUtils.findShapes((s) => s.type === 'text', board) || [];
  return texts.find((t) => (t.characters || '').trim().toLowerCase() === want)
      || texts.find((t) => (t.characters || '').trim().toLowerCase().startsWith(want));
};

for (const [from, label, to, kind] of EDGES) {
  const src = boards[lib.norm(from)];
  const dst = boards[lib.norm(to)];
  if (!src) { stats.missingSource.push(from); continue; }
  if (!dst) { stats.missingTarget.push(to); continue; }
  await lib.open(src.page);
  const el = findLabel(src.board, label);
  if (!el) { stats.missingLabel.push(from + ' → ' + label); continue; }
  for (const i of (el.interactions || [])) { try { el.removeInteraction(i); } catch (e) {} }
  try {
    el.addInteraction('click', {
      type: kind === 'overlay' ? 'open-overlay' : 'navigate-to',
      destination: dst.board,
      ...(kind === 'overlay' ? { overlayPositionType: 'manual', closeWhenClickOutside: true } : {}),
    });
    // VERIFY THE READ-BACK. A cross-page `navigate-to` does NOT throw: Penpot accepts the call and
    // stores an interaction whose destination is EMPTY (probed 2026-07-30 — cross-page *overlay*
    // throws, cross-page *navigate* does not). Counting addInteraction's silence as success made
    // every cross-page edge a dead click that still incremented `wired` and still satisfied a
    // connectivity audit. Nothing but the read-back can tell the two apart.
    const landed = (el.interactions || []).some((i) =>
      i.action && i.action.destination && i.action.destination.id === dst.board.id);
    if (!landed) {
      for (const i of (el.interactions || [])) { try { el.removeInteraction(i); } catch (e2) {} }
      throw new Error('cross-page destination not accepted (empty read-back)');
    }
    stats.wired++;
  } catch (e) {
    // Penpot can only open an overlay that lives on the SAME page as its trigger, and every overlay
    // in this file lives on `08 Overlays` by the naming grammar. Those transitions are real but not
    // expressible as a pointer interaction here, so they are recorded as edges — which is the case
    // the contract's `vela.edge` key exists for. Duplicating 46 overlays onto five screen pages to
    // satisfy the API would break the one-board-per-state rule the whole file rests on.
    lib.chip(src.board, 'edge', 'tap "' + label + '" → ' + to);
    stats.edges++;
    stats.crossPage = (stats.crossPage || 0) + 1;
  }
}

for (const [from, cond, to] of NON_POINTER) {
  const src = boards[lib.norm(from)];
  if (!src) { stats.missingSource.push(from); continue; }
  await lib.open(src.page);
  lib.chip(src.board, 'edge', cond + ' → ' + to);
  stats.edges++;
}

for (const [name, page, entry] of FLOWS) {
  const b = boards[lib.norm(entry)];
  if (!b) { stats.missingTarget.push(entry); continue; }
  await lib.open(page);
  try {
    const existing = (penpot.currentPage.flows || []).find((f) => f.name === name);
    if (existing) penpot.currentPage.removeFlow(existing);
    penpot.currentPage.createFlow(name, b.board);
    stats.flows++;
  } catch (e) { stats.missingTarget.push(name + ': ' + (e && e.message)); }
}

return lib.done('74-interactions', stats);
