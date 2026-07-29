// extract-dom-layout.js — run in the RUNNING WEB APP (chrome-devtools evaluate_script), not in Penpot.
// Walks the rendered DOM of the current screen and dumps an exact layout tree: geometry relative to
// the 390px phone frame, resolved colours, type, radii, borders, shadows and text content.
// This is the machine-precision counterpart to the screenshots: screenshots show what a screen looks
// like, this shows exactly what the numbers are. Feed both into the Penpot board generator.
//
// Usage (chrome-devtools MCP):
//   evaluate_script with function: () => { <paste this file's body> ; return extractLayout(); }
// Returns a JSON-serialisable tree. Web caveat: text sizes include the ×1.2 WEB_TEXT_BOOST —
// divide by 1.2 to recover the token base.

function extractLayout(opts) {
  const O = Object.assign({ maxDepth: 60, minSize: 2 }, opts || {});

  // The app renders inside a fixed 390px phone frame on desktop web; find it so all
  // coordinates come out in screen space (0,0 = top-left of the phone), not window space.
  const frame = (() => {
    const all = Array.from(document.querySelectorAll('div'));
    let best = null;
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (Math.abs(r.width - 390) <= 2 && r.height > 600) {
        if (!best || r.height > best.rect.height) best = { el, rect: r };
      }
    }
    if (best) return best.rect;
    const b = document.body.getBoundingClientRect();
    return { left: b.left, top: b.top, width: b.width, height: b.height };
  })();

  const px = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  };
  const rgbToHex = (c) => {
    if (!c || c === 'none') return null;
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return c;
    const p = m[1].split(',').map((s) => parseFloat(s.trim()));
    const [r, g, b] = p;
    const a = p.length > 3 ? p[3] : 1;
    if (a === 0) return null;
    const hex = '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
    return a < 1 ? hex + '@' + Math.round(a * 100) + '%' : hex;
  };

  const seen = new Set();
  function walk(el, depth) {
    if (depth > O.maxDepth || seen.has(el)) return null;
    seen.add(el);
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return null;
    // `display: contents` boxes (expo-router / react-navigation screen wrappers) generate no box
    // of their own, so getBoundingClientRect() is 0×0. Without this pass-through the size gate
    // below would prune the entire screen underneath them. Returns an array, flattened by callers.
    if (cs.display === 'contents') {
      const out = [];
      for (const child of Array.from(el.children)) {
        const c = walk(child, depth);
        if (c) out.push(...(Array.isArray(c) ? c : [c]));
      }
      return out.length ? out : null;
    }
    const r = el.getBoundingClientRect();
    if (r.width < O.minSize || r.height < O.minSize) return null;

    // direct text (excluding text inside child elements)
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .filter(Boolean)
      .join(' ');

    const node = {
      tag: el.tagName.toLowerCase(),
      x: Math.round((r.left - frame.left) * 100) / 100,
      y: Math.round((r.top - frame.top) * 100) / 100,
      w: Math.round(r.width * 100) / 100,
      h: Math.round(r.height * 100) / 100,
    };
    const label = el.getAttribute('aria-label') || el.getAttribute('data-testid') || el.id;
    if (label) node.label = label;
    if (el.getAttribute('role')) node.role = el.getAttribute('role');
    if (own) node.text = own;

    const bg = rgbToHex(cs.backgroundColor);
    if (bg) node.bg = bg;
    if (own) {
      node.color = rgbToHex(cs.color);
      node.font = { size: px(cs.fontSize), weight: cs.fontWeight, family: (cs.fontFamily || '').split(',')[0].replace(/["']/g, '') };
      if (cs.lineHeight && cs.lineHeight !== 'normal') node.font.lineHeight = px(cs.lineHeight);
      if (cs.letterSpacing && cs.letterSpacing !== 'normal') node.font.letterSpacing = px(cs.letterSpacing);
      if (cs.textTransform && cs.textTransform !== 'none') node.font.transform = cs.textTransform;
    }
    const radii = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(px);
    if (radii.some((v) => v > 0)) node.radius = radii.every((v) => v === radii[0]) ? radii[0] : radii;
    const bw = px(cs.borderTopWidth);
    if (bw > 0) node.border = { w: bw, color: rgbToHex(cs.borderTopColor) };
    if (cs.boxShadow && cs.boxShadow !== 'none') node.shadow = cs.boxShadow;
    if (cs.opacity && parseFloat(cs.opacity) < 1) node.opacity = parseFloat(cs.opacity);
    const pad = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(px);
    if (pad.some((v) => v > 0)) node.padding = pad;
    if (cs.display === 'flex') {
      node.flex = { dir: cs.flexDirection, justify: cs.justifyContent, align: cs.alignItems };
      if (px(cs.gap) > 0) node.flex.gap = px(cs.gap);
    }
    // ---- real assets, not placeholders -------------------------------------------------
    // Icons (Lucide) and Nimiq identicons are inline SVG: capture the actual markup so Penpot
    // can rebuild them as vectors. `currentColor` is resolved to the computed colour first,
    // otherwise the icon lands black regardless of its real tint.
    if (el.tagName === 'svg' || el.tagName === 'SVG') {
      node.kind = 'svg';
      let markup = el.outerHTML;
      const resolved = rgbToHex(cs.color) || '#1A1A18';
      const plain = resolved.split('@')[0];
      markup = markup.split('currentColor').join(plain);
      // guarantee a viewBox so Penpot scales rather than clips
      if (!/viewBox=/.test(markup)) {
        markup = markup.replace('<svg', '<svg viewBox="0 0 ' + Math.round(r.width) + ' ' + Math.round(r.height) + '"');
      }
      node.svg = markup;
      node.svgColor = plain;
    } else if (el.tagName === 'IMG') {
      // Token/chain/asset logos. Prefer bytes over URLs: the Penpot backend runs in a container
      // and cannot resolve localhost, and remote CDNs may be unreachable from it.
      node.kind = 'img';
      node.src = el.currentSrc || el.src || '';
      if (node.src.startsWith('data:')) {
        node.dataUri = node.src;
      } else {
        try {
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(r.width * 2));
          c.height = Math.max(1, Math.round(r.height * 2));
          const ctx = c.getContext('2d');
          ctx.drawImage(el, 0, 0, c.width, c.height);
          node.dataUri = c.toDataURL('image/png');   // throws if the image taints the canvas
        } catch (e) {
          node.dataUriError = String(e && e.message ? e.message : e);
        }
      }
    }

    const kids = [];
    for (const child of Array.from(el.children)) {
      const c = walk(child, depth + 1);
      if (c) kids.push(...(Array.isArray(c) ? c : [c]));
    }
    if (kids.length) node.children = kids;

    // prune wrappers that add nothing: no paint, no text, exactly one child of the same box
    const paints = node.bg || node.border || node.shadow || node.text || node.radius;
    if (!paints && kids.length === 1) {
      const k = kids[0];
      if (Math.abs(k.w - node.w) < 1 && Math.abs(k.h - node.h) < 1) return k;
    }
    return node;
  }

  const root = document.body;
  const tree = [];
  for (const child of Array.from(root.children)) {
    const n = walk(child, 0);
    if (n) tree.push(...(Array.isArray(n) ? n : [n]));
  }
  return {
    url: location.pathname + location.search,
    frame: { w: Math.round(frame.width), h: Math.round(frame.height) },
    webTextBoost: 1.2,
    note: 'x/y are relative to the 390px phone frame; font.size includes the ×1.2 web boost',
    tree,
  };
}
