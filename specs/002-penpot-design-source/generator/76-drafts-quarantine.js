// 76-drafts-quarantine.js — separate non-canon from canon on `03 Components` (RESTRUCTURE §5, W1).
//
// Nine boards on the components page are pre-pivot DRAFTS: authored by inference from source before
// the render-and-screenshot method, and never captured from the running app. They are not canon,
// but they are not worthless either — each names a REAL shared component that has no
// /design-gallery cell, so the list is exactly the library's capture debt (FR-003 gap).
//
// Two problems they cause today:
//  · one of them is named `C / Primitives / C / Primitives / SectionLabel` — a doubled prefix that
//    collides with the canon `C/Primitives/SectionLabel` and is what audit 97 reports;
//  · they sit at (-6000, -4000), i.e. nowhere, which reads as debris.
//
// They CANNOT be moved to `12 Archive`: cross-page reparenting is silently ignored by the plugin
// API (probed 2026-07-30 — appendChild to another page's root returns without error and the board
// stays put). So they are renamed out of the `C/` namespace into `DRAFT/`, parked in a labelled
// quarantine band far below the canon shelf, and INDEXED on `12 Archive` by name.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const PAGE = '03 Components';
// Fixed, so the quarantine never depends on the canon shelf's height — but it must clear it: the
// shelf's last band (Signing, origin 25000) measured ~8,950 tall, so 30000 would have been printed
// through. 40000 leaves a visible empty gap that reads as "the library ends here".
const BAND_Y = 40000;
const COLW = 760, ROWH = 260, PERROW = 3;
const stats = { renamed: [], parked: 0, orphansRemoved: 0, indexed: 0 };

await lib.open(PAGE);

// `DRAFT (inferred, no gallery cell) C / Primitives / C / Primitives / SectionLabel`
//   → group 'Primitives', name 'SectionLabel'
// The nine drafts and the group each belongs to. This is COMMITTED DATA on purpose: deriving the
// group by parsing the current name is not idempotent (a run parses its own output — one version
// produced `DRAFT/DRAFT/FilterChip`, the next `DRAFT/FilterChip/FilterChip`, and the real group was
// lost). Only the LEAF name is read from the canvas, and the leaf never changes, so repeated runs
// converge on the same result no matter what state they start from.
const GROUP_OF = {
  FilterChip: 'Controls', VelaRefresh: 'Controls',
  Input: 'Primitives', SectionLabel: 'Primitives',
  ContactRow: 'Rows', Divider: 'Rows', SettingsRow: 'Rows',
  AppModal: 'Sheets', SheetHeader: 'Sheets',
};
const parse = (raw) => {
  const parts = lib.norm(raw || '').split(' / ').filter(Boolean);
  const leaf = parts[parts.length - 1] || 'Unnamed';
  return { group: GROUP_OF[leaf] || 'Misc', name: leaf };
};

const drafts = (penpot.currentPage.root.children || []).filter((b) =>
  /^DRAFT \(inferred/.test(lib.norm(b.name || '')) || lib.norm(b.name || '').startsWith('DRAFT / '));

drafts.sort((a, b) => lib.norm(a.name || '').localeCompare(lib.norm(b.name || '')));
// Rename the BOARD only. A LibraryComponent's `name` is just the leaf and its `path` is the group
// prefix; assigning a slash-joined string to `comp.name` PREPENDS to the existing path instead of
// replacing it (probed 2026-07-30 — one attempt produced the path
// `DRAFT / SectionLabel / DRAFT / SectionLabel / DRAFT / Primitives`). The board name is the single
// handle that drives both.
drafts.forEach((b, i) => {
  const { group, name } = parse(b.name);
  const want = 'DRAFT/' + group + '/' + name;
  if (lib.norm(b.name) !== lib.norm(want)) { b.name = want; stats.renamed.push(want); }
  b.x = 40 + (i % PERROW) * COLW;
  b.y = BAND_Y + 90 + Math.floor(i / PERROW) * ROWH;
  b.setPluginData('vela.note', 'NOT CANON — inferred from source before the render-and-screenshot pivot, never captured from the running app. Capture debt: needs a /design-gallery cell, then rebuild via 72-components-from-cells.');
  stats.parked++;
});

// band header, so nobody mistakes the zone for part of the library
const hdr = lib.upsertText(penpot.currentPage.root, 'Z / draft-band / title',
  { text: 'DRAFT — not canon', size: 24, weight: 700, color: '#C62828', x: 40, y: BAND_Y });
const sub = lib.upsertText(penpot.currentPage.root, 'Z / draft-band / sub',
  { text: 'Inferred from source before the render-and-screenshot pivot; never captured from the running app. Machine consumers: ignore DRAFT/*. Each one names a real shared component with no /design-gallery cell — this band IS the capture debt list.',
    size: 11, weight: 400, color: '#6E6B62', x: 40, y: BAND_Y + 36, growType: 'auto-height' });
sub.text.resize(1400, 30);

// The orphan text shape that has sat at the page origin since the first run. TOP LEVEL ONLY:
// penpotUtils.findShape recurses, and an earlier version of this loop swept the whole page — it
// deleted the `txt A/B/C`-named labels inside the pre-pivot DRAFT boards as well (20 shapes,
// non-canon and slated for rebuild-from-cells, but destroyed all the same). Never hand a recursive
// finder a name pattern this generic.
for (const s of (penpot.currentPage.root.children || []).slice()) {
  if (s.type === 'text' && /^txt /.test(s.name || '')) { s.remove(); stats.orphansRemoved++; }
}

// ---- index them on `12 Archive` (the boards themselves cannot travel there) ----
await lib.open('12 Archive');
const { board: idx } = await lib.upsertBoard('12 Archive', 'D / archive / index',
  { x: 0, y: 0, w: 800, h: 120 + drafts.length * 26 + 60, fill: '#FFFFFF' });
for (let g = 0; g < 200; g++) {
  const old = penpotUtils.findShape((s) => lib.norm(s.name || '').startsWith('a / '), idx);
  if (!old) break;
  old.remove();
}
lib.upsertText(idx, 'a / title', { text: 'Archive — non-canon index', size: 22, weight: 700, color: '#1A1A18', x: 32, y: 28 });
lib.upsertText(idx, 'a / sub', { text: 'Machine consumers: ignore everything listed here. Penpot cannot move a board between pages, so the drafts themselves live in the DRAFT band at the bottom of `03 Components` (y≈' + BAND_Y + ') — this page is their index.',
  size: 11, weight: 400, color: '#6E6B62', x: 32, y: 58, growType: 'auto-height' }).text.resize(730, 30);
lib.upsertText(idx, 'a / head', { text: 'DRAFT components (no gallery cell → capture debt)', size: 10, weight: 600, color: '#8C887E', x: 32, y: 104 });
drafts.forEach((b, i) => {
  lib.upsertText(idx, 'a / row-' + i, { text: lib.norm(b.name), size: 11, weight: 500, zone: 'mono', color: '#1A1A18', x: 32, y: 126 + i * 26 });
  stats.indexed++;
});
lib.chip(idx, 'note', 'generated by 76-drafts-quarantine; the DRAFT boards are parked on 03 Components because cross-page reparenting is a no-op in this Penpot deployment');

return lib.done('76-drafts-quarantine', stats);
