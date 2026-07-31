// 80-changelog.js — page 11: what each regeneration changed (RESTRUCTURE-2026-07-30 §5, W4).
//
// A design file with no history forces every reader to ask "is this current?" and gives them no way
// to answer. Penpot's own guidance puts a version on the cover; the cover here answers WHICH
// revision, and this page answers WHAT CHANGED — the two questions a returning reader has.
//
// Entries are committed data (generator/changelog.json), not typed on canvas, so a regeneration
// reproduces the page and nobody has to remember to update a text box.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const PAGE = '11 Changelog';
const data = storage.changelogJson ||
  (storage.changelogJson = await (await fetch('/plugins/mcp/gen/changelog.json?v=' + Date.now(), { cache: 'reload' })).json());
const C = { ink: '#1A1A18', muted: '#6E6B62', subtle: '#8C887E', line: '#ECEBE4', raised: '#FFFFFF', accent: '#E8572A' };
const stats = { entries: 0 };

await lib.open(PAGE);
const H = 200 + data.entries.reduce((a, e) => a + 70 + 20 * e.changes.length, 0);
const { board: b } = await lib.upsertBoard(PAGE, 'D / changelog', { x: 0, y: 0, w: 900, h: H, fill: C.raised });
try { lib.bindToken(b, 'color.bg.raised', ['fill']); } catch (e) {}
for (let g = 0; g < 500; g++) {
  const old = penpotUtils.findShape((s) => lib.norm(s.name || '').startsWith('cl / '), b);
  if (!old) break;
  old.remove();
}
const t = (n, text, o) => lib.upsertText(b, 'cl / ' + n, Object.assign({ text, size: 12, weight: 400, color: C.muted, x: 48, y: 0 }, o)).text;

t('kicker', 'CHANGELOG', { size: 10, weight: 700, color: C.accent, y: 44 }).letterSpacing = '0.6';
t('title', 'What each regeneration changed', { size: 30, weight: 700, color: C.ink, y: 66 });
t('sub', 'Newest first. The cover names the revision this file currently reflects.', { size: 12, weight: 400, color: C.muted, y: 108 });

let y = 156;
for (const e of data.entries) {
  t('d-' + stats.entries, e.date, { size: 13, weight: 700, color: C.ink, x: 48, y });
  t('r-' + stats.entries, e.rev, { size: 10, weight: 500, zone: 'mono', color: C.subtle, x: 148, y: y + 2 });
  t('h-' + stats.entries, e.headline, { size: 13, weight: 500, color: C.ink, x: 240, y, growType: 'auto-height' }).resize(600, 22);
  y += 26;
  for (const c of e.changes) {
    t('c-' + stats.entries + '-' + c.slice(0, 12), '· ' + c, { size: 11, weight: 400, color: C.muted, x: 240, y, growType: 'auto-height' }).resize(600, 18);
    y += 20;
  }
  y += 26;
  lib.upsertRect(b, 'cl / rule-' + stats.entries, { x: 48, y: y - 14, w: 804, h: 1, fill: C.line });
  stats.entries++;
}
b.resize(900, Math.round(y + 40));
lib.chip(b, 'note', 'generated from generator/changelog.json — add an entry there, never on the canvas');
return lib.done('80-changelog', stats);
