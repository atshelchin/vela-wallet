// 75-components-shelf.js — turn `03 Components` from an alphabetical 19,000px strip into a
// browsable shelf: category sections, and a docs block beside every family (RESTRUCTURE §5, W1).
//
// What a reader could not do before: tell a Primitive from a Signing view (categories were
// interleaved), see what a component is FOR, know which code implements it, or know which rule
// applies when reusing it. Flagship kits answer all four next to the sticker sheet — intro, code
// reference, use-when, don't — so that is what a family's row carries here.
//
// Positions are DERIVED, not remembered: category order and family order come from the committed
// plan, and each row's height comes from the family container's rendered height. Same plan + same
// cells → same shelf, so a re-run is a no-op (FR-008).
//
// Input: storage.shelfPlan = dom-dumps/cells/_plan.json (fetched below if absent)
//        storage.shelfCat  = ONE category name to build ('Primitives' … 'Signing'); required.
//
// ONE CATEGORY PER CALL. Building all six in a single call meant ~640 shape operations, which
// blocked the plugin's browser context long past the 30 s bridge timeout and wedged the session —
// the generator contract's <15 s / <200 shapes per chunk is not advice. Section Y origins are fixed
// per category (Y_OF below) so the six calls are independent and any one can be re-run alone.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const PAGE = '03 Components';
const plan = storage.shelfPlan ||
  (storage.shelfPlan = await (await fetch('/plugins/mcp/gen/_plan.json?v=' + Date.now(), { cache: 'reload' })).json());

const CATS = ['Primitives', 'Controls', 'Rows', 'Media', 'Sheets', 'Signing'];
const CAT_BLURB = {
  Primitives: 'The smallest shared pieces: type, money, buttons, badges. Everything else is built from these.',
  Controls: 'Things the user operates. One control per job — a second way to do the same thing is a defect.',
  Rows: 'List and detail rows. The de-containered language means a row, not a card, is the unit of content.',
  Media: 'Artwork and codes: token/chain logos, avatars, identicons, QR. Brand artwork is NOT token-bound.',
  Sheets: 'Overlay containers and the patterns for editing inside them. One overlay at a time, always.',
  Signing: 'The signing sheet vocabulary — the app\'s highest-stakes surface. Clear over blind, always.',
};
const C = { ink: '#1A1A18', muted: '#6E6B62', subtle: '#8C887E', line: '#ECEBE4', raised: '#FFFFFF',
  base: '#FAFAF8', accent: '#E8572A', ok: '#2D8E5F', bad: '#C62828' };

const DOCW = 380, GAP = 56, LEFT = 40, ROWGAP = 90;
// Fixed band origin per category: each call knows where its own section starts without measuring
// the others, so the six calls are order-independent and individually re-runnable. Sized from the
// tallest family in each category with headroom.
const Y_OF = { Primitives: 0, Controls: 9000, Rows: 13000, Media: 19000, Sheets: 23000, Signing: 25000 };
const cat = storage.shelfCat;
if (!cat || !CATS.includes(cat)) throw new Error('set storage.shelfCat to one of: ' + CATS.join(', '));
const stats = { cat, families: 0, missing: [], docBoards: 0, yStart: Y_OF[cat], yEnd: 0, overflow: false };

await lib.open(PAGE);
const page = penpot.currentPage;

// wipe only what this chunk owns FOR THIS CATEGORY
for (let g = 0; g < 400; g++) {
  const old = penpotUtils.findShape((s) => {
    const n = lib.norm(s.name || '');
    return n === 'SEC / ' + cat || n.startsWith('SEC / ' + cat + ' / ') ||
      (n.startsWith('DOC / C / ' + cat + ' / '));
  }, page.root);
  if (!old) break;
  old.remove();
}

const byCat = {};
for (const f of plan.families) {
  const cat = (f.component.split('/')[1] || 'Misc');
  (byCat[cat] = byCat[cat] || []).push(f);
}
for (const cat of Object.keys(byCat)) byCat[cat].sort((a, b) => a.component.localeCompare(b.component));

const txt = (parent, name, text, o) => lib.upsertText(parent, name, Object.assign(
  { text, size: 11, weight: 400, color: C.muted, x: 0, y: 0 }, o || {})).text;

let y = Y_OF[cat];
{
  const fams = byCat[cat] || [];

  // ---- section header: a band the eye can land on when scrolling the page
  const secH = 150;
  const { board: sec } = await lib.upsertBoard(PAGE, 'SEC / ' + cat,
    { x: LEFT, y, w: DOCW + GAP + 1600, h: secH, fill: C.base });
  txt(sec, 'SEC / ' + cat + ' / kicker', String(CATS.indexOf(cat) + 1).padStart(2, '0'), { size: 11, weight: 700, color: C.accent, x: 0, y: 6 });
  txt(sec, 'SEC / ' + cat + ' / title', cat, { size: 38, weight: 700, color: C.ink, x: 0, y: 26 });
  txt(sec, 'SEC / ' + cat + ' / blurb', CAT_BLURB[cat] || '', { size: 12, weight: 400, color: C.muted, x: 0, y: 84, growType: 'auto-height' }).resize(760, 30);
  txt(sec, 'SEC / ' + cat + ' / count', fams.length + ' families · ' + fams.reduce((a, f) => a + (f.cells || []).length, 0) + ' captured states',
    { size: 11, weight: 500, color: C.subtle, x: 0, y: 118 });
  try { lib.bindToken(sec, 'color.bg.base', ['fill']); } catch (e) {}
  y += secH + 40;

  for (const f of fams) {
    const container = lib.byName(f.component, page.root);
    if (!container) { stats.missing.push(f.component); continue; }
    stats.families++;

    // the family's sticker sheet sits to the RIGHT of its docs block
    const contH = Math.max(60, Math.round(container.height));
    const rowH = Math.max(contH, 250);
    container.x = LEFT + DOCW + GAP;
    container.y = y;

    // ---- docs block: intro → code → axes → use-when → don't (one template, every family)
    const { board: doc } = await lib.upsertBoard(PAGE, 'DOC / ' + f.component,
      { x: LEFT, y, w: DOCW, h: rowH, fill: C.raised });
    try { lib.bindToken(doc, 'color.bg.raised', ['fill']); } catch (e) {}
    doc.borderRadius = 16;
    doc.strokes = [{ strokeColor: C.line, strokeWidth: 1, strokeAlignment: 'inner' }];
    try { lib.bindToken(doc, 'color.border.base', ['strokeColor']); } catch (e) {}
    stats.docBoards++;

    const leaf = f.component.split('/').pop();
    let dy = 22;
    if (f.tier === 1) {
      const { rect } = lib.upsertRect(doc, 'DOC / ' + f.component + ' / tier', { x: 22, y: dy + 2, w: 46, h: 16, radius: 8, fill: '#FFF0EB' });
      try { lib.bindToken(rect, 'color.accent.soft', ['fill']); } catch (e) {}
      txt(doc, 'DOC / ' + f.component + ' / tierlbl', 'TIER 1', { size: 8, weight: 700, color: C.accent, x: 30, y: dy + 6 });
      dy += 24;
    }
    txt(doc, 'DOC / ' + f.component + ' / name', leaf, { size: 20, weight: 700, color: C.ink, x: 22, y: dy });
    dy += 30;
    const axes = (f.props || []).join(' × ');
    txt(doc, 'DOC / ' + f.component + ' / axes', axes + '  ·  ' + (f.cells || []).length + ' states',
      { size: 10, weight: 600, color: C.subtle, x: 22, y: dy });
    dy += 22;
    if (f.desc) { txt(doc, 'DOC / ' + f.component + ' / desc', f.desc, { size: 11, weight: 400, color: C.muted, x: 22, y: dy, growType: 'auto-height' }).resize(DOCW - 44, 48); dy += 62; }
    if (f.usage) {
      txt(doc, 'DOC / ' + f.component + ' / use-k', 'USE WHEN', { size: 8, weight: 700, color: C.ok, x: 22, y: dy });
      txt(doc, 'DOC / ' + f.component + ' / use', f.usage, { size: 11, weight: 400, color: C.ink, x: 22, y: dy + 14, growType: 'auto-height' }).resize(DOCW - 44, 54);
      dy += 78;
    }
    if (f.dont) {
      txt(doc, 'DOC / ' + f.component + ' / dont-k', 'DON\'T', { size: 8, weight: 700, color: C.bad, x: 22, y: dy });
      txt(doc, 'DOC / ' + f.component + ' / dont', f.dont, { size: 11, weight: 400, color: C.muted, x: 22, y: dy + 14, growType: 'auto-height' }).resize(DOCW - 44, 54);
      dy += 78;
    }
    if (f.codeRef) {
      txt(doc, 'DOC / ' + f.component + ' / code-k', 'IMPLEMENTED BY', { size: 8, weight: 700, color: C.subtle, x: 22, y: dy });
      txt(doc, 'DOC / ' + f.component + ' / code', f.codeRef, { size: 10, weight: 500, zone: 'mono', color: C.ink, x: 22, y: dy + 14, growType: 'auto-height' }).resize(DOCW - 44, 26);
      dy += 46;
    }
    if ((f.usedIn || []).length) {
      txt(doc, 'DOC / ' + f.component + ' / used-k', 'REUSED BY', { size: 8, weight: 700, color: C.subtle, x: 22, y: dy });
      const used = txt(doc, 'DOC / ' + f.component + ' / used', f.usedIn.map((p) => p.replace(/^src\//, '')).join('\n'),
        { size: 9, weight: 400, zone: 'mono', color: C.muted, x: 22, y: dy + 14, growType: 'auto-height' });
      used.lineHeight = '1.6';        // 9px mono at the default 1.2 crowds the paths into each other
      used.resize(DOCW - 44, Math.round(14.5 * f.usedIn.length) + 4);
      penpotUtils.setParentXY(used, 22, dy + 14);
      dy += 20 + Math.round(14.5 * f.usedIn.length);
    }
    // the block must be tall enough for what it holds, and the row tall enough for the block
    const need = dy + 24;
    if (need > rowH) doc.resize(DOCW, need);
    else doc.resize(DOCW, rowH);
    // machine twin of the same facts (the plugin API cannot write Penpot's Inspect annotation)
    if (f.codeRef) container.setPluginData('vela.codeRef', f.codeRef);
    if (f.usage) container.setPluginData('vela.usage', f.usage);
    if (f.dont) container.setPluginData('vela.dont', f.dont);
    container.setPluginData('vela.tier', String(f.tier || 2));

    y += Math.max(rowH, need) + ROWGAP;
  }
}

stats.yEnd = y;
// the fixed band origins must not collide: if a category outgrows its slot, say so loudly rather
// than letting the next section be overprinted
const nextY = Math.min(...CATS.map((c) => Y_OF[c]).filter((v) => v > Y_OF[cat]).concat([Infinity]));
if (y > nextY) { stats.overflow = true; stats.overflowBy = Math.round(y - nextY); }
return lib.done('75-components-shelf:' + cat, stats);
