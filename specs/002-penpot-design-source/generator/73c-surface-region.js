// 73c-surface-region.js — fold each board's leftover wrapper shapes into `region / surface`.
//
// Input: storage.wallPage = the page to tidy. One page per call. Idempotent.
//
// WHY. A screen's regions live several levels down the DOM (expo-router / react-navigation /
// safe-area wrappers sit above the layout that actually has a header and a dock), so the wrapper
// chain above them is never claimed by a region and stays at the board's top level. Every screen
// board therefore opened like this:
//
//     r / 0            r / 0.0          r / 0.0.0        r / 0.0.0.0
//     region / header  region / hero    region / content region / dock
//
// — four named regions a reader can use, preceded by four DOM paths they cannot. The wrappers are
// real (they paint the screen background), so they cannot just be deleted; they are one thing, so
// they belong in one group. Named `surface` and pushed to the back, the tree now opens with the
// four regions and a backdrop, which is what the screen actually is.
//
// This applies the semantic layer to boards that are ALREADY drawn instead of redrawing them —
// the same reason 73b exists. A full 73 pass would achieve the same grouping, but it needs the
// uploaded asset library in session memory (which dies with the session, silently turning every
// icon into a red placeholder) and it takes tens of minutes per page.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const page = storage.wallPage;
if (!page) throw new Error('set storage.wallPage first');

await lib.open(page);
const out = { chunk: '73c-surface-region:' + page, grouped: [], alreadyDone: 0, nothingToGroup: [], failed: [] };
const boards = penpot.currentPage.findShapes().filter((s) => s.type === 'board' && /^[SO] \/ /.test(s.name));

for (const b of boards) {
  try {
    const kids = b.children;
    if (kids.some((c) => lib.norm(c.name) === 'region/surface')) { out.alreadyDone++; continue; }
    // leftovers are the raw transcribed shapes still sitting beside the named region groups
    const loose = kids.filter((c) => /^r \/ /.test(c.name));
    if (!loose.length) { out.nothingToGroup.push(b.name); continue; }
    const g = penpot.group(loose);
    if (!g) { out.failed.push(b.name + ': group() returned null'); continue; }
    g.name = 'region / surface';
    // the backdrop belongs behind everything it wraps
    if (typeof g.sendToBack === 'function') g.sendToBack();
    out.grouped.push(b.name + ' (' + loose.length + ')');
  } catch (e) {
    out.failed.push(b.name + ': ' + String((e && e.message) || e));
  }
}
return out;
