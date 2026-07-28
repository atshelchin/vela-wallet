// 50-beauty-docs.js — visual polish pass over documentation boards (pages 01/02/04) + column
// headers on 03. Restyle ONLY: names untouched (machine contract intact). New decorative shapes
// use the `deco:` name prefix — consumers ignore them (added to consumption contract).
// Vela-izes the doc pages: card border+radius, accent title bars, sunken panels behind mono
// blobs, airier line-height.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const out = { pages: {}, headers: 0 };

const POLISH_PAGES = ['01 Design Language', '02 Tokens & Type', '04 IA & Flows'];
for (const pageName of POLISH_PAGES) {
  const pg = await lib.open(pageName);
  const boards = penpotUtils.findShapes(s => s.type === 'board' && s.name.startsWith('D / '), pg.root);
  let touched = 0;
  for (const b of boards) {
    // Vela card look on the canvas
    b.borderRadius = 16;
    b.strokes = [{ strokeColor: '#ECEBE4', strokeWidth: 1, strokeAlignment: 'inner' }];
    // find title texts (20px bold by our convention) → accent underline bar
    const titles = penpotUtils.findShapes(s => s.type === 'text' && String(s.fontSize) === '20', b);
    for (const t of titles) {
      const barName = 'deco:title-bar ' + t.name;
      if (!penpotUtils.findShape(s => s.name === lib.norm(barName), b)) {
        lib.upsertRect(b, barName, { x: Math.round(t.parentX ?? 24), y: Math.round((t.parentY ?? 24)) + 30, w: 40, h: 4, radius: 2, fill: '#E8572A' });
      }
    }
    // mono blobs: breathe (lineHeight) + sunken backdrop panel sized to the rendered text
    const blobs = penpotUtils.findShapes(s => s.type === 'text' && s.characters && s.characters.includes('\n'), b);
    for (const t of blobs) {
      t.lineHeight = '1.6';
      await lib.sleep(120); // let auto-height resettle before measuring
      const panelName = 'deco:panel ' + t.name;
      const px = Math.round((t.parentX ?? 24)) - 16;
      const py = Math.round((t.parentY ?? 64)) - 12;
      const pw = 784 - px + 8;
      const ph = Math.round(t.height) + 24;
      const existing = penpotUtils.findShape(s => s.name === lib.norm(panelName), b);
      const { rect } = lib.upsertRect(b, panelName, { x: px, y: py, w: pw, h: ph, radius: 12, fill: '#F5F3EF' });
      if (!existing) rect.sendToBack(); // behind the text, above board fill
      // grow the board if the panel now overflows it
      const need = py + ph + 40;
      if (need > b.height) b.resize(b.width, need);
    }
    touched++;
  }
  out.pages[pageName] = touched;
}

// 03 Components: column headers above each family column
{
  await lib.open('03 Components');
  const COLS = [[0, 'Controls & Buttons'], [1400, 'Rows & Primitives'], [2800, 'Sheets & Signing'], [4200, 'Media & Status']];
  for (const [cx, label] of COLS) {
    const name = 'D/components/col ' + label;
    const { board: hb } = await lib.upsertBoard('03 Components', name, { x: cx, y: 860, w: 800, h: 100, fill: '#FFFFFF' });
    hb.borderRadius = 16;
    hb.strokes = [{ strokeColor: '#ECEBE4', strokeWidth: 1, strokeAlignment: 'inner' }];
    lib.upsertText(hb, name + '/title', { text: label, size: 22, weight: 700, x: 28, y: 26 });
    lib.upsertRect(hb, 'deco:title-bar ' + name, { x: 28, y: 62, w: 40, h: 4, radius: 2, fill: '#E8572A' });
    lib.upsertText(hb, name + '/sub', { text: 'Variant containers below — axes on each container; motion/platform notes as chips', size: 10, weight: 500, color: '#8C887E', x: 88, y: 36 });
    out.headers++;
  }
}
return lib.done('50-beauty-docs', out);
