// 70-board-from-dom.js — build a screen board from a REAL rendered DOM dump.
// Input: storage.domDump = <output of extract-dom-layout.js run in the live web app>
//        storage.boardSpec = { page: '05 Screens · Wallet', name: 'S/home/default', x: 0, y: 0 }
// Produces a pixel-faithful board: geometry, colours, radii, borders and type come from what the
// app actually rendered, not from reading source.
//
// Idempotency: the board is addressed by name and its generated children are REPLACED wholesale on
// each run (generated content, not hand-edited), so re-running yields an identical board.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const dump = storage.domDump;
const spec = storage.boardSpec;
if (!dump || !spec) throw new Error('set storage.domDump and storage.boardSpec first');

// Type is rendered at the SAME scale the geometry was measured at. An earlier revision divided
// every font size by the web's ×1.2 boost while keeping the DOM's pixel positions, so the glyphs
// shrank inside boxes that had not — every label drifted off its row and the balance hero came out
// visibly smaller than the app's. Geometry and type must share one coordinate system; the board is
// a 1:1 replica of the rendered screen, and the ×1.2 web/native ratio is a fact about the app's
// font scaling, recorded on the note chip rather than baked into the drawing.
const WEB_BOOST = 1;
const stats = { rects: 0, texts: 0, icons: 0, images: 0, skipped: 0, maxDepth: 0, negTracking: 0,
  iconMissing: 0, imageMissing: 0, reflowWidened: 0, reflowShrunk: 0, reflowStuck: [],
  colorBound: 0, colorLiteral: 0, colorAlpha: 0, radiusBound: 0, iconColorBound: 0, shadows: 0, dimmed: 0, inlineClipped: 0, inlineTruncated: 0, rawHex: {},
  iconFallbacks: [], imageFallbacks: [] };
const reflow = [];   // text shapes to settle-and-fit once the whole board is drawn

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

// ── TOKEN BINDING ──────────────────────────────────────────────────────────────────────────────
// A board painted in literal hex is not a design system: switching the token set changed nothing
// on the canvas because no shape referenced a token. Every colour is therefore looked up in the
// `color-light` set and BOUND; only a genuine miss falls back to the literal, and those hexes get
// reported because that list is exactly the app's raw-hex debt.
// Several tokens legitimately share a value (#FFFFFF is both fg.inverse and bg.raised), so the
// candidate is chosen by ROLE — a text fill prefers color.fg.*, a shape fill color.bg.*, a stroke
// color.border.* — otherwise dark mode would recolour backgrounds with a foreground ramp.
// Which colour set the capture's hexes are matched against. A dark-mode capture must resolve
// against `color-dark` or nothing matches and the whole board falls back to literal hex — the very
// thing the binding exists to prevent.
const COLOR_SET = penpot.library.local.tokens.sets.find((s) => s.name === (spec.colorSet || 'color-light'));
const rankFor = {
  text:   (t) => (t.startsWith('color.fg.') ? 0 : /\.base$/.test(t) ? 1 : 3),
  fill:   (t) => (t.startsWith('color.bg.') ? 0 : /\.soft$/.test(t) ? 1 : /\.base$/.test(t) && !t.startsWith('color.fg.') ? 2 : 3),
  stroke: (t) => (t.startsWith('color.border.') ? 0 : /\.border$/.test(t) ? 1 : 3),
};
const COLOR_MAPS = {};
for (const role of Object.keys(rankFor)) {
  const best = new Map();
  for (const t of (COLOR_SET ? COLOR_SET.tokens : [])) {
    const v = String(t.value || '').trim().toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(v)) continue;                 // rgba()/reference values cannot match
    const sc = rankFor[role](t.name);
    const cur = best.get(v);
    if (!cur || sc < cur.sc) best.set(v, { name: t.name, sc });
  }
  COLOR_MAPS[role] = best;
}
const RADIUS_TOKENS = new Map();
for (const s of penpot.library.local.tokens.sets) {
  for (const t of s.tokens) {
    if (t.type === 'borderRadius' && !RADIUS_TOKENS.has(Number(t.value))) RADIUS_TOKENS.set(Number(t.value), t.name);
  }
}
// prop names Penpot expects per role
const PROP = { text: 'fill', fill: 'fill', stroke: 'strokeColor' };
const bindColor = (shape, c, role) => {
  if (!c) return false;
  // a token carries only the colour, so a semi-transparent paint would lose its alpha
  if (c.opacity !== undefined && c.opacity < 1) { stats.colorAlpha++; return false; }
  const hit = COLOR_MAPS[role].get(String(c.color).toUpperCase());
  if (!hit) {
    stats.colorLiteral++;
    stats.rawHex[c.color] = (stats.rawHex[c.color] || 0) + 1;
    return false;
  }
  try { lib.bindToken(shape, hit.name, [PROP[role]]); stats.colorBound++; return true; }
  catch (e) { stats.colorLiteral++; return false; }
};
// Imported vector art keeps the literal colours the browser resolved into the markup, so icons
// would NOT follow a theme switch — in dark mode every glyph stayed near-black ink on a near-black
// ground. Bind any path colour that EXACTLY matches a token. Multi-colour art is safe by
// construction: an identicon's generated palette and the token logos match no token, so they are
// left untouched; only the app's own ink/muted/subtle glyph colours are rebound.
const bindVector = (shape, depth) => {
  if (depth > 5) return;
  for (const c of (shape.children || [])) {
    for (const s of (c.strokes || [])) {
      const hit = s.strokeColor && COLOR_MAPS.text.get(String(s.strokeColor).toUpperCase());
      if (hit) { try { lib.bindToken(c, hit.name, ['strokeColor']); stats.iconColorBound++; } catch (e) {} }
    }
    for (const f of (c.fills || [])) {
      const hit = f.fillColor && COLOR_MAPS.text.get(String(f.fillColor).toUpperCase());
      if (hit) { try { lib.bindToken(c, hit.name, ['fill']); stats.iconColorBound++; } catch (e) {} }
    }
    bindVector(c, depth + 1);
  }
};

// Penpot rejects a bare 'borderRadius' property for radius tokens — only the four per-corner names
// are accepted, so a uniform radius binds as four corner bindings.
const CORNERS = ['borderRadiusTopLeft', 'borderRadiusTopRight', 'borderRadiusBottomRight', 'borderRadiusBottomLeft'];
const bindRadius = (shape, r) => {
  const vals = Array.isArray(r) ? r : [r, r, r, r];
  let any = false;
  vals.forEach((v, i) => {
    const name = v && RADIUS_TOKENS.get(Number(v));
    if (!name) return;
    try { lib.bindToken(shape, name, [CORNERS[i]]); any = true; } catch (e) { /* not fatal */ }
  });
  if (any) stats.radiusBound++;
};

// The caller may own the board (`spec.board`). Component variants need that: they are addressed by
// a name that is only unique INSIDE their variant container ("default", "compact"), and
// upsert-by-name searches the whole page — so letting this chunk look them up would let one
// family's "default" variant find and overwrite another's.
const W = Math.round(dump.frame.w) || 390, H = Math.round(dump.frame.h) || 844;
const fill = 'fill' in spec ? spec.fill : '#FAFAF8';
let board;
if (spec.board) {
  board = spec.board;
  if (Math.round(board.width) !== W || Math.round(board.height) !== H) board.resize(W, H);
  board.fills = fill ? [{ fillColor: fill, fillOpacity: 1 }] : [];
} else {
  ({ board } = await lib.upsertBoard(spec.page, spec.name, { x: spec.x || 0, y: spec.y || 0, w: W, h: H, fill }));
}
if (fill) bindColor(board, { color: fill, opacity: 1 }, 'fill');   // the page ground itself
// Wipe previously generated children (names all start with 'r/'). lib rule 1: Penpot rewrites
// '/' to ' / ', so the stored name is 'r / 0.1', and a raw startsWith('r/') silently matches
// NOTHING — which quietly turned every re-run into a second copy stacked on the first.
let guard = 0;
while (guard++ < 4000) {
  const old = penpotUtils.findShape((s) => s.name && lib.norm(s.name).startsWith('r / '), board);
  if (!old) break;
  old.remove();
}
// Annotations moved into plugin data; sweep away any legacy on-canvas chips still on this board.
lib.stripChipShapes(board);

const place = (shape, n) => {
  penpotUtils.setParentXY(shape, Math.round(n.x), Math.round(n.y));
};

// Penpot's SVG importer keeps user units and does NOT clip to the viewBox. Identicons paint well
// outside theirs (a 160-unit box imports as 466x160), so resizing the imported group to the DOM box
// squashes the artwork — the 44px avatar came out as a 15px slit. When that happens, locate the
// viewBox with two invisible probe rects (the import is 1:1 in user units, so the probes reveal
// exactly where the box sits inside the group), scale so the VIEWBOX — not the raw bbox — matches
// the DOM box, and hang the group inside a clipping board so the overspill is hidden the same way
// the browser hides it.
const placeSvg = (markup, n, nm, parent) => {
  const w = Math.round(n.w), h = Math.round(n.h);
  let g = penpot.createShapeFromSvg(markup);
  if (!g) return null;
  const m = markup.match(/viewBox="\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)/);
  if (!m || (Math.round(g.width) <= +m[3] + 1 && Math.round(g.height) <= +m[4] + 1)) {
    g.name = nm;
    board.appendChild(g);
    if (Math.round(g.width) !== w || Math.round(g.height) !== h) g.resize(w, h);
    penpotUtils.setParentXY(g, Math.round(n.x), Math.round(n.y));
    return g;
  }
  g.remove();
  const vb = { x: +m[1], y: +m[2], w: +m[3], h: +m[4] };
  const s = Math.max(1, Math.min(vb.w, vb.h) / 40);   // probe big enough to survive rounding
  const dot = (x, y) => '<rect x="' + x + '" y="' + y + '" width="' + s + '" height="' + s + '" fill="#000" fill-opacity="0"/>';
  g = penpot.createShapeFromSvg(markup.replace(/^(<svg[^>]*>)/,
    '$1' + dot(vb.x, vb.y) + dot(vb.x + vb.w - s, vb.y + vb.h - s)));
  if (!g) return null;
  const p = (g.children || []).filter((c) => c.width <= s + 0.5 && c.height <= s + 0.5)
    .map((c) => ({ x: c.x - g.x, y: c.y - g.y, w: c.width, h: c.height }))
    .sort((a, b) => (a.x + a.y) - (b.x + b.y));
  if (p.length < 2) { g.remove(); return null; }
  // ONE uniform factor. Scaling x and y independently is what turned the identicon into a stretched
  // portrait: its viewBox is square, so any difference between the two ratios is measurement noise
  // being baked into the artwork. Scale to COVER the box, then centre the overspill under the clip.
  const k = Math.max(w / ((p[1].x + p[1].w) - p[0].x), h / ((p[1].y + p[1].h) - p[0].y));
  const clip = penpot.createBoard();
  clip.name = nm;
  board.appendChild(clip);
  clip.resize(w, h);
  clip.fills = [];
  clip.clipContent = true;
  // The app's identicon is square artwork made round by its wrapper's borderRadius + overflow
  // (src/components/ui/Identicon.tsx says so outright: the stock hexagon is "clipped by its
  // native/web wrapper" to match every other avatar). The markup therefore paints a full square
  // background and the circle can only come from here.
  const wrapR = (n.radius === undefined && parent && parent.radius !== undefined
    && Math.abs((parent.w || 0) - n.w) < 1.5 && Math.abs((parent.h || 0) - n.h) < 1.5)
    ? radiusOf({ w: n.w, h: n.h, radius: parent.radius }) : radiusOf(n);
  if (Array.isArray(wrapR)) {
    clip.borderRadiusTopLeft = wrapR[0]; clip.borderRadiusTopRight = wrapR[1];
    clip.borderRadiusBottomRight = wrapR[2]; clip.borderRadiusBottomLeft = wrapR[3];
  } else if (wrapR) {
    clip.borderRadius = wrapR;
  }
  penpotUtils.setParentXY(clip, Math.round(n.x), Math.round(n.y));
  clip.appendChild(g);
  g.resize(g.width * k, g.height * k);
  penpotUtils.setParentXY(g, -p[0].x * k + (w - ((p[1].x + p[1].w) - p[0].x) * k) / 2,
                             -p[0].y * k + (h - ((p[1].y + p[1].h) - p[0].y) * k) / 2);
  return clip;
};

// ── INHERITED OPACITY ──────────────────────────────────────────────────────────────────────────
// The browser composites a subtree at its ancestor's opacity; this converter flattens the tree into
// board siblings, so an ancestor's `opacity: 0.45` reached only the one shape that declared it.
// Every disabled control was therefore wrong in the same way: VelaButton's disabled variants drew a
// solid-white label over a 45% fill (neither the app's treatment nor legible), and its three
// disabled boards were otherwise byte-identical to their enabled twins. Worse, a dimmed WRAPPER
// that paints nothing produced no shape at all, so FeeTokenSelector's `busy` variant lost its dim
// entirely and shipped as a pixel-identical copy of `default`.
// The fix is to carry the product of every ancestor's opacity down the recursion and apply it to
// each shape actually drawn.
const withOpacity = (shape, eff) => {
  if (eff < 0.999) { try { shape.opacity = Math.max(0, Math.min(1, eff)); } catch (e) {} }
};

// ── SHADOWS ────────────────────────────────────────────────────────────────────────────────────
// `shadow` was named in paints() but never written to a shape, so 18 cells carried one into the
// file and lost it. VelaCard's `elevated` variant is defined by nothing else — it has no border —
// so it published as a plain white rectangle indistinguishable from `default`.
const parseShadow = (css) => {
  const s = String(css || '');
  const m = s.match(/rgba?\(([^)]+)\)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+(-?[\d.]+)px)?/);
  if (!m) return null;
  const p = m[1].split(',').map((x) => parseFloat(x.trim()));
  const hex2 = '#' + p.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  return { style: 'drop-shadow', offsetX: +m[2], offsetY: +m[3], blur: +m[4], spread: +(m[5] || 0),
    color: hex2, opacity: p.length > 3 ? p[3] : 1 };
};
const applyShadow = (shape, css) => {
  const sh = parseShadow(css);
  if (!sh) return;
  try { shape.shadows = [sh]; stats.shadows++; } catch (e) { /* not fatal */ }
};

async function build(n, path, depth, parent, inherited) {
  stats.maxDepth = Math.max(stats.maxDepth, depth);
  const id = 'r/' + path;
  // the opacity this node's own paint is composited at, and the factor its children inherit
  const eff = (inherited === undefined ? 1 : inherited) * (n.opacity === undefined ? 1 : n.opacity);

  if (n.text) {
    const size = Math.round((n.font?.size || 13) / WEB_BOOST * 10) / 10;
    const weight = parseInt(n.font?.weight || '400', 10) || 400;
    const isMono = /mono|menlo|courier|plex/i.test(n.font?.family || '');
    const c = hex(n.color) || { color: '#1A1A18', opacity: 1 };
    // An inline fragment: this node owns text AND wraps sibling <span>s, so its rect is the whole
    // line box. Drawing the text at that rect's left edge stacks it on top of a span that comes
    // first — which is why the balance hero painted "3" straight over the "$". When a text child
    // starts at our own left edge and we occupy a single line, our own text really begins where
    // that child ends. Multi-line nodes are left alone (there the child is just the next line).
    const lh = n.font?.lineHeight || n.font?.size || 0;
    let tx = Math.round(n.x);
    if (lh && (n.h || 0) <= lh * 1.5) {
      for (const c2 of (n.children || []).flat(Infinity)) {
        if (c2 && c2.text && Math.abs((c2.x || 0) - n.x) < 1.5) tx = Math.max(tx, Math.round(c2.x + c2.w));
      }
    }
    // INLINE FRAGMENTS. When a node owns text AND wraps <span> children, the extractor hands us the
    // span text separately and this node's `text` is only the LEFTOVER connective bits, joined:
    // "You're sending <b>1,000 USDC</b> to <b>vitalik.eth</b>." arrives as text "You're sending to ."
    // plus two children. Those fragments were never measured individually, so where each one really
    // sat is unknowable, and drawing the join as one run printed it straight across the bold spans.
    // What IS knowable is the slot the LEADING fragment occupies: this node's left edge out to the
    // first span starting to its right on the same line. Penpot does not clip an overflowing text
    // box (a fixed box just wraps and lands back on the spans), so the string itself is trimmed to
    // the whole words that fit. The trailing connectives are dropped — see stats.inlineTruncated.
    let shown = n.text;
    const inlineKids = (n.children || []).flat(Infinity).filter((k) => k && k.text);
    let slotW = 0;
    if (inlineKids.length && lh) {
      let slotRight = n.x + n.w;
      for (const k of inlineKids) {
        if ((k.x || 0) > tx + 0.5 && (k.x || 0) < slotRight && Math.abs((k.y || 0) - n.y) < lh) slotRight = k.x;
      }
      slotW = Math.max(8, slotRight - tx);
      // 0.455em is the measured average advance for Plus Jakarta Sans lowercase copy — calibrated
      // against these two slots, where the browser fitted exactly "You're sending" into 130px and
      // "You're letting" into 116px. A looser guess drops the verb and the headline reads "You're".
      const cap = Math.max(1, Math.floor(slotW / (size * 0.455)));
      const t = n.text.trim().replace(/\s+/g, ' ');
      if (t.length > cap) {
        let acc = '';
        for (const w of t.split(' ')) {
          const next = acc ? acc + ' ' + w : w;
          if (next.length > cap) break;
          acc = next;
        }
        shown = acc || t.slice(0, cap);
        stats.inlineTruncated++;
      } else shown = t;
      stats.inlineClipped++;
    }
    const { text } = lib.upsertText(board, id + ' ' + n.text.slice(0, 24), {
      text: shown, size, weight, zone: isMono ? 'mono' : 'sans',
      color: c.color, x: tx, y: Math.round(n.y),
    });
    withOpacity(text, eff * (c.opacity === undefined ? 1 : c.opacity));   // "#FFFFFF@45%" x ancestors
    // opacity here rides on the SHAPE, not the paint, so the colour itself can still bind
    bindColor(text, { color: c.color, opacity: 1 }, 'text');
    if (n.font?.transform === 'uppercase') text.textTransform = 'uppercase';
    if (n.font?.letterSpacing) {
      // Penpot's API rejects negative tracking outright ("Value not valid: -1.2"), so tight display
      // type has to land at 0 rather than blow up the whole board
      const ls = Number(n.font.letterSpacing);
      if (ls < 0) stats.negTracking++;
      text.letterSpacing = String(Math.max(0, ls));
    }
    // BASELINE. A browser rect means two different things depending on the node: for a block the
    // rect is the line box (height ≈ the CSS line-height), for an inline <span> it is the glyph's
    // content box (height ≈ 1.25em), which sits lower inside the shared line. Penpot only knows
    // "box top + half-leading + ascent", so feeding it the CSS line-height for BOTH pushed every
    // inline span down by half the difference — that is why the hero's "$" and ".20" sank below
    // the "3" instead of sharing its baseline. Taking the SMALLER of the two makes the line box
    // equal whichever box the DOM actually measured, so the baselines coincide again.
    if (n.font?.size) {
      const box = Math.min(n.h || Infinity, n.font.lineHeight || Infinity);
      const mult = Number.isFinite(box) ? box / size : 1.2;
      text.lineHeight = String(Math.max(0.8, Math.round(mult * 100) / 100));
    }
    // How much room is genuinely free to the right: the nearest LATER sibling that overlaps this
    // text vertically, else the board edge. Widening into empty space is free; widening into a
    // neighbour is the collision we are trying to avoid.
    let rightLimit = dump.frame.w;
    for (const s of ((parent && parent.children) || []).flat(Infinity)) {
      if (!s || s === n || typeof s.x !== 'number') continue;
      if (s.x < n.x + n.w - 1) continue;                                        // not to our right
      if ((s.y || 0) + (s.h || 0) <= n.y + 1 || (s.y || 0) >= n.y + n.h - 1) continue;  // no overlap
      rightLimit = Math.min(rightLimit, s.x);
    }
    const shift = tx - Math.round(n.x);
    // A wrapped paragraph must keep its measured box or auto-width relays it out on one line. But
    // the test used to be "narrow box", which pinned SINGLE-line labels to their measured width
    // too — and Penpot re-flows with its own metrics (plus the tracking it refuses to take
    // negative), so a label that fit the browser by a hair now wrapped: "Parallel One" broke over
    // the address, "No activity yet" over its subtitle. A line the browser did not wrap must not
    // wrap here, so only genuinely multi-line text gets a fixed width.
    if (slotW) {
      // trimmed to one line inside its slot: never wrap, never reach the spans
      text.growType = 'auto-width';
      penpotUtils.setParentXY(text, tx, Math.round(n.y));
      stats.texts++;
      const kids0 = (n.children || []).flat(Infinity);
      for (let i = 0; i < kids0.length; i++) await build(kids0[i], path + '.' + i, depth + 1, n, eff);
      return;
    }
    const wrapped = n.text.includes('\n') || (lh && (n.h || 0) > lh * 1.5);
    if (wrapped) {
      text.growType = 'auto-height';
      // +2px slack: Penpot shapes text slightly wider than the browser did, so a line that just
      // fitted there tips onto a new one here — and with auto-height that extra line grows DOWN
      // past the measured rect and onto whatever sits below, which is pinned to its own DOM
      // position and cannot move out of the way.
      text.resize(Math.max(1, Math.round(n.w) - shift + 2), Math.round(n.h));
    }
    // re-assert the origin last: changing lineHeight/growType resizes the box about its centre,
    // which silently walks the shape off the position we just computed
    penpotUtils.setParentXY(text, tx, Math.round(n.y));
    // Penpot lays text out asynchronously, so nothing can be measured yet. Queue it and settle the
    // whole board in one pass at the end rather than sleeping once per text shape.
    reflow.push({ text, tx, y: Math.round(n.y), targetH: Math.round(n.h), size,
      boxW: Math.max(1, Math.round(n.w) - shift + 2),
      maxW: Math.max(0, rightLimit - tx - 2), wrapped, cur: size });
    stats.texts++;
  } else if (n.kind === 'svg') {
    // REAL vectors: Lucide icons and Nimiq identicons, rebuilt from the markup the app rendered
    const nm = id + ' icon:' + (n.label || 'glyph') + ' ' + Math.round(n.w) + 'x' + Math.round(n.h);
    const asset = n.assetKey ? (storage.assets || {})[n.assetKey] : null;
    const svgMarkup = (asset && asset.svg) || n.svg;
    let ok = false;
    if (svgMarkup) {
      try {
        const g = placeSvg(svgMarkup, n, nm, parent);
        if (g) { bindVector(g, 0); withOpacity(g, eff); ok = true; stats.icons++; }
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
    // The app never sets border-radius on the <img> itself: it wraps it in a rounded,
    // overflow:hidden div (40px token disc, 24px chain chip, 18px badge). Penpot rectangles do NOT
    // clip their children, so the square image simply covered the round wrapper — every token logo
    // came out a square. Inherit the wrapper's radius whenever the two boxes coincide.
    const wrap = (n.radius === undefined && parent && parent.radius !== undefined
      && Math.abs((parent.w || 0) - (n.w || 0)) < 1.5 && Math.abs((parent.h || 0) - (n.h || 0)) < 1.5)
      ? { w: n.w, h: n.h, radius: parent.radius } : n;
    const rr = radiusOf(wrap);
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
        withOpacity(rect, eff);
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
    if (bg) bindColor(rect, bg, 'fill');
    if (n.border) {
      const bc = hex(n.border.color);
      // strokeOpacity matters: hairlines are frequently a low-alpha white/black
      if (bc) {
        rect.strokes = [{ strokeColor: bc.color, strokeOpacity: bc.opacity, strokeWidth: n.border.w, strokeAlignment: 'inner' }];
        bindColor(rect, bc, 'stroke');
      }
    }
    bindRadius(rect, rr);
    if (n.shadow) applyShadow(rect, n.shadow);
    withOpacity(rect, eff);
    stats.rects++;
  } else {
    stats.skipped++;
  }

  // children may contain nested arrays (React fragments survive the extractor); flatten or the
  // whole subtree below the array is silently dropped
  const kids = (n.children || []).flat(Infinity);
  for (let i = 0; i < kids.length; i++) await build(kids[i], path + '.' + i, depth + 1, n, eff);
}

const roots = dump.tree.flat(Infinity);
for (let i = 0; i < roots.length; i++) await build(roots[i], String(i), 0, null, 1);

// ── REFLOW PASS ────────────────────────────────────────────────────────────────────────────────
// Penpot's text engine is not the browser's: different shaping, and the negative tracking it
// refuses means a paragraph the browser set in 2 lines can come out in 3. Under auto-height that
// third line grows DOWNWARD out of the measured rect and lands on the row below, which is pinned
// to its own DOM position and cannot yield — the founder's "wrapped line overlaps the content
// beneath it". So: measure what Penpot actually produced and make it fit the box the DOM measured.
// Widening comes first because empty space to the right costs nothing; only when there is no free
// width left do we take the font down, and never below 92% — past that the board stops being a
// faithful record of the type scale. Anything still over is reported, not silently accepted.
// Batched in rounds: one settle per round for the whole board instead of a sleep per shape.
const MIN_SCALE = 0.92;
let queue = reflow;
for (let round = 0; round < 4 && queue.length; round++) {
  await lib.sleep(round === 0 ? 260 : 140);
  const again = [];
  for (const p of queue) {
    try {
      if (p.wrapped) {
        if (p.text.height <= p.targetH + 1) continue;             // fits — done
        if (p.boxW < p.maxW) {                                    // free space to the right
          p.boxW = Math.min(p.maxW, p.boxW + Math.max(8, Math.round((p.maxW - p.boxW) / 2)));
          p.text.resize(p.boxW, p.targetH);
          p.widened = true;
        } else if (p.cur > p.size * MIN_SCALE + 0.05) {
          p.cur = Math.max(p.size * MIN_SCALE, Math.round(p.cur * 0.97 * 10) / 10);
          p.text.fontSize = String(p.cur);
          p.shrunk = true;
        } else { p.stuck = true; continue; }
      } else {
        // the same collision in horizontal form: an auto-width label that now runs past the
        // right-aligned value beside it (token amounts, settings values)
        if (p.maxW <= 8 || p.text.width <= p.maxW) continue;
        if (p.cur > p.size * MIN_SCALE + 0.05) {
          p.cur = Math.max(p.size * MIN_SCALE, Math.round(p.cur * 0.97 * 10) / 10);
          p.text.fontSize = String(p.cur);
          p.shrunk = true;
        } else { p.stuck = true; continue; }
      }
      penpotUtils.setParentXY(p.text, p.tx, p.y);
      again.push(p);
    } catch (e) { /* shape gone; nothing to fit */ }
  }
  queue = again;
}
for (const p of reflow) {
  if (p.widened) stats.reflowWidened++;
  if (p.shrunk) stats.reflowShrunk++;
  if (p.stuck) stats.reflowStuck.push((p.text.characters || '').slice(0, 28));
}

board.setPluginData('vela.source', dump.url);
lib.chip(board, 'note', 'generated 1:1 from the live rendered DOM; web renders type ×' + (dump.webTextBoost || 1.2) + ' vs native');
stats.rawHex = Object.entries(stats.rawHex).sort((a, b) => b[1] - a[1]).map(([h, n]) => h + '×' + n);
return lib.done('70-board-from-dom:' + spec.name, stats);
