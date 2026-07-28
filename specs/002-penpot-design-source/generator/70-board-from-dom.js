// 70-board-from-dom.js — build a screen board from a REAL rendered DOM dump.
// Input: storage.domDump = <output of extract-dom-layout.js run in the live web app>
//        storage.boardSpec = { page: '05 Screens · Wallet', name: 'S/home/default', x: 0, y: 0 }
// Produces a pixel-faithful board: geometry, colours, radii, borders and type come from what the
// app actually rendered, not from reading source. Text sizes are de-boosted (web renders ×1.2).
//
// Idempotency: the board is addressed by name and its generated children are REPLACED wholesale on
// each run (generated content, not hand-edited), so re-running yields an identical board.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const dump = storage.domDump;
const spec = storage.boardSpec;
if (!dump || !spec) throw new Error('set storage.domDump and storage.boardSpec first');

const WEB_BOOST = dump.webTextBoost || 1.2;
const stats = { rects: 0, texts: 0, icons: 0, images: 0, skipped: 0, maxDepth: 0 };

const hex = (c) => {
  if (!c) return null;
  const m = String(c).match(/^(#[0-9A-Fa-f]{6})(?:@(\d+)%)?$/);
  if (!m) return null;
  return { color: m[1].toUpperCase(), opacity: m[2] ? parseInt(m[2], 10) / 100 : 1 };
};

// A node earns a shape only if it paints something or carries text.
const paints = (n) => !!(n.bg || n.border || n.shadow || (n.radius && n.bg) || n.kind);

const { board } = await lib.upsertBoard(spec.page, spec.name, {
  x: spec.x || 0, y: spec.y || 0,
  w: Math.round(dump.frame.w) || 390, h: Math.round(dump.frame.h) || 844,
  fill: spec.fill || '#FAFAF8',
});
// wipe previously generated children (names all start with 'r/')
let guard = 0;
while (guard++ < 800) {
  const old = penpotUtils.findShape((s) => s.name && s.name.startsWith('r/'), board);
  if (!old) break;
  old.remove();
}

const place = (shape, n) => {
  penpotUtils.setParentXY(shape, Math.round(n.x), Math.round(n.y));
};

function build(n, path, depth) {
  stats.maxDepth = Math.max(stats.maxDepth, depth);
  const id = 'r/' + path;

  if (n.text) {
    // de-boost the web text scale so the board carries token-base sizes
    const size = Math.round((n.font?.size || 13) / WEB_BOOST * 10) / 10;
    const weight = parseInt(n.font?.weight || '400', 10) || 400;
    const isMono = /mono|menlo|courier|plex/i.test(n.font?.family || '');
    const c = hex(n.color) || { color: '#1A1A18', opacity: 1 };
    const { text } = lib.upsertText(board, id + ' ' + n.text.slice(0, 24), {
      text: n.text, size, weight, zone: isMono ? 'mono' : 'sans',
      color: c.color, x: Math.round(n.x), y: Math.round(n.y),
    });
    if (c.opacity < 1) text.opacity = c.opacity;           // colours like "#FFFFFF@45%"
    if (n.font?.transform === 'uppercase') text.textTransform = 'uppercase';
    if (n.font?.letterSpacing) text.letterSpacing = String(n.font.letterSpacing);
    if (n.font?.lineHeight && n.font.size) {
      // DOM gives absolute px; Penpot wants a multiplier
      text.lineHeight = String(Math.round((n.font.lineHeight / n.font.size) * 100) / 100);
    }
    // a wrapped paragraph must keep its measured box, otherwise auto-width relayouts it
    if (n.text.includes('\n') || n.w < 300) {
      text.growType = 'auto-height';
      text.resize(Math.round(n.w), Math.round(n.h));
      penpotUtils.setParentXY(text, Math.round(n.x), Math.round(n.y));
    }
    stats.texts++;
  } else if (n.kind === 'img' || n.kind === 'svg') {
    // icons/logos are represented by a named placeholder — the name IS the contract
    const kindName = n.kind === 'svg' ? 'icon' : 'image';
    const { rect } = lib.upsertRect(board, id + ' ' + kindName + ':' + (n.label || 'unnamed') + ' ' + Math.round(n.w) + 'x' + Math.round(n.h), {
      x: Math.round(n.x), y: Math.round(n.y), w: Math.round(n.w), h: Math.round(n.h),
      radius: typeof n.radius === 'number' ? Math.round(n.radius) : 0,
    });
    rect.fills = [];
    rect.strokes = [{ strokeColor: '#B0ADA5', strokeWidth: 1, strokeAlignment: 'inner' }];
    if (n.kind === 'svg') stats.icons++; else stats.images++;
  } else if (paints(n)) {
    const bg = hex(n.bg);
    const { rect } = lib.upsertRect(board, id, {
      x: Math.round(n.x), y: Math.round(n.y), w: Math.round(n.w), h: Math.round(n.h),
      radius: typeof n.radius === 'number' ? Math.round(n.radius) : (Array.isArray(n.radius) ? Math.round(n.radius[0]) : 0),
    });
    rect.fills = bg ? [{ fillColor: bg.color, fillOpacity: bg.opacity }] : [];
    if (n.border) {
      const bc = hex(n.border.color);
      // strokeOpacity matters: hairlines are frequently a low-alpha white/black
      if (bc) rect.strokes = [{ strokeColor: bc.color, strokeOpacity: bc.opacity, strokeWidth: n.border.w, strokeAlignment: 'inner' }];
    }
    if (n.opacity !== undefined) rect.opacity = n.opacity;
    stats.rects++;
  } else {
    stats.skipped++;
  }

  const kids = n.children || [];
  for (let i = 0; i < kids.length; i++) build(kids[i], path + '.' + i, depth + 1);
}

for (let i = 0; i < dump.tree.length; i++) build(dump.tree[i], String(i), 0);

lib.chip(board, 'note', 'generated from the live rendered DOM (' + dump.url + '); text sizes de-boosted by ' + WEB_BOOST + ' to token base');
return lib.done('70-board-from-dom:' + spec.name, stats);
