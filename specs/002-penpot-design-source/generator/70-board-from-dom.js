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
const stats = { rects: 0, texts: 0, icons: 0, images: 0, skipped: 0, maxDepth: 0, negTracking: 0,
  iconMissing: 0, imageMissing: 0, iconFallbacks: [], imageFallbacks: [] };

const hex = (c) => {
  if (!c) return null;
  const m = String(c).match(/^(#[0-9A-Fa-f]{6})(?:@(\d+)%)?$/);
  if (!m) return null;
  return { color: m[1].toUpperCase(), opacity: m[2] ? parseInt(m[2], 10) / 100 : 1 };
};

// A node earns a shape if it paints ANYTHING — and a radius alone counts. Rounded wrappers with no
// background are the app's clipping containers (avatar circles, tab pills, row hit areas, logo
// discs); dropping them was why almost every corner came out square.
const paints = (n) => !!(n.bg || n.border || n.shadow || n.radius || n.kind);

// CSS uses a huge number (9999) to mean "fully round"; Penpot needs a real radius, and anything
// larger than half the shorter side renders wrong. Also normalises the per-corner array form.
const radiusOf = (n) => {
  const cap = Math.max(0, Math.min(n.w || 0, n.h || 0) / 2);
  const one = (v) => Math.round(Math.min(Number(v) || 0, cap));
  if (Array.isArray(n.radius)) return n.radius.map(one);
  if (typeof n.radius === 'number') return one(n.radius);
  return 0;
};

const { board } = await lib.upsertBoard(spec.page, spec.name, {
  x: spec.x || 0, y: spec.y || 0,
  w: Math.round(dump.frame.w) || 390, h: Math.round(dump.frame.h) || 844,
  fill: spec.fill || '#FAFAF8',
});
// Wipe previously generated children (names all start with 'r/'). lib rule 1: Penpot rewrites
// '/' to ' / ', so the stored name is 'r / 0.1', and a raw startsWith('r/') silently matches
// NOTHING — which quietly turned every re-run into a second copy stacked on the first.
let guard = 0;
while (guard++ < 4000) {
  const old = penpotUtils.findShape((s) => s.name && lib.norm(s.name).startsWith('r / '), board);
  if (!old) break;
  old.remove();
}

const place = (shape, n) => {
  penpotUtils.setParentXY(shape, Math.round(n.x), Math.round(n.y));
};

async function build(n, path, depth) {
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
    if (n.font?.letterSpacing) {
      // Penpot's API rejects negative tracking outright ("Value not valid: -1.2"), so tight display
      // type has to land at 0 rather than blow up the whole board
      const ls = Number(n.font.letterSpacing);
      if (ls < 0) stats.negTracking++;
      text.letterSpacing = String(Math.max(0, ls));
    }
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
  } else if (n.kind === 'svg') {
    // REAL vectors: Lucide icons and Nimiq identicons, rebuilt from the markup the app rendered
    const nm = id + ' icon:' + (n.label || 'glyph') + ' ' + Math.round(n.w) + 'x' + Math.round(n.h);
    const asset = n.assetKey ? (storage.assets || {})[n.assetKey] : null;
    const svgMarkup = (asset && asset.svg) || n.svg;
    let ok = false;
    if (svgMarkup) {
      try {
        const g = penpot.createShapeFromSvg(svgMarkup);
        if (g) {
          g.name = nm;
          board.appendChild(g);
          if (Math.round(g.width) !== Math.round(n.w) || Math.round(g.height) !== Math.round(n.h)) {
            g.resize(Math.round(n.w), Math.round(n.h));
          }
          penpotUtils.setParentXY(g, Math.round(n.x), Math.round(n.y));
          ok = true;
          stats.icons++;
        }
      } catch (e) { stats.iconFallbacks.push(nm + ': ' + (e && e.message)); }
    }
    if (!ok) {
      // never leave a silent hole — a visible placeholder that names the missing glyph
      const { rect } = lib.upsertRect(board, nm + ' MISSING', {
        x: Math.round(n.x), y: Math.round(n.y), w: Math.round(n.w), h: Math.round(n.h),
        radius: typeof n.radius === 'number' ? Math.round(n.radius) : 0,
      });
      rect.fills = [];
      rect.strokes = [{ strokeColor: '#C62828', strokeWidth: 1, strokeAlignment: 'inner' }];
      stats.iconMissing++;
    }
  } else if (n.kind === 'img') {
    // REAL raster: token/chain/asset logos, embedded as bytes so the Penpot backend never
    // has to reach the network (it runs in a container and cannot see localhost)
    const nm = id + ' image:' + (n.label || 'logo') + ' ' + Math.round(n.w) + 'x' + Math.round(n.h);
    const rr = radiusOf(n);
    const { rect } = lib.upsertRect(board, nm, {
      x: Math.round(n.x), y: Math.round(n.y), w: Math.round(n.w), h: Math.round(n.h),
      radius: Array.isArray(rr) ? rr[0] : rr,
    });
    if (Array.isArray(rr)) {
      rect.borderRadiusTopLeft = rr[0]; rect.borderRadiusTopRight = rr[1];
      rect.borderRadiusBottomRight = rr[2]; rect.borderRadiusBottomLeft = rr[3];
    }
    let ok = false;
    const asset = n.assetKey ? (storage.assets || {})[n.assetKey] : null;
    if (asset && asset.media) {
      try {
        rect.fills = [{ fillOpacity: 1, fillImage: asset.media }];
        ok = true;
        stats.images++;
      } catch (e) { stats.imageFallbacks.push(nm + ': ' + (e && e.message)); }
    }
    if (!ok) {
      rect.fills = [];
      rect.strokes = [{ strokeColor: '#C62828', strokeWidth: 1, strokeAlignment: 'inner' }];
      stats.imageMissing++;
    }
  } else if (paints(n)) {
    const bg = hex(n.bg);
    const rr = radiusOf(n);
    const { rect } = lib.upsertRect(board, id, {
      x: Math.round(n.x), y: Math.round(n.y), w: Math.round(n.w), h: Math.round(n.h),
      radius: Array.isArray(rr) ? rr[0] : rr,
    });
    if (Array.isArray(rr)) {
      // per-corner (sheet tops are [20,20,0,0])
      rect.borderRadiusTopLeft = rr[0]; rect.borderRadiusTopRight = rr[1];
      rect.borderRadiusBottomRight = rr[2]; rect.borderRadiusBottomLeft = rr[3];
    }
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

  // children may contain nested arrays (React fragments survive the extractor); flatten or the
  // whole subtree below the array is silently dropped
  const kids = (n.children || []).flat(Infinity);
  for (let i = 0; i < kids.length; i++) await build(kids[i], path + '.' + i, depth + 1);
}

const roots = dump.tree.flat(Infinity);
for (let i = 0; i < roots.length; i++) await build(roots[i], String(i), 0);

lib.chip(board, 'note', 'generated from the live rendered DOM (' + dump.url + '); text sizes de-boosted by ' + WEB_BOOST + ' to token base');
return lib.done('70-board-from-dom:' + spec.name, stats);
