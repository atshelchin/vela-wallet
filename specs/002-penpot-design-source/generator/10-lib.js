// 10-lib.js — shared helpers. Run FIRST after any plugin reload; installs storage.lib.
// Upsert-by-name discipline; storage is cache only (names are the truth).
//
// HARD-WON PENPOT RULES (verified empirically 2026-07-29, Penpot 2.16.2 + mcp:2.16):
//  1. Penpot NORMALIZES '/' in shape names to ' / ' (padded). All lookups must norm() first.
//  2. Mutations (create/remove/reparent) only take effect on the CURRENT page; elsewhere
//     they silently no-op. Always `await lib.open(page)` before mutating.
//  3. penpot.openPage() settles ASYNCHRONOUSLY — poll currentPage until it matches (fixed
//     sleeps are NOT reliable), else shapes land on the previously-current page.
//  4. EVERY page's root frame has the same zero-uuid id — you CANNOT identify a shape's
//     page by walking parents to the root. To locate/mutate per page, iterate pages,
//     open each, and use scoped search on penpot.currentPage.root.
const lib = {};
lib.sleep = (ms) => new Promise(r => setTimeout(r, ms));
lib.norm = (name) => name.replace(/\s*\/\s*/g, ' / ');

lib.PAGES = ['00 Start Here', '01 Design Language', '02 Tokens & Type', '03 Components',
  '04 IA & Flows', '05 Screens · Wallet', '06 Screens · Browser & Connect',
  '07 Screens · Settings & Onboarding', '08 Overlays', '09 Patterns', '10 Dev & Parallel Space',
  '11 Changelog', '12 Archive'];   // 11/12 added by RESTRUCTURE-2026-07-30 §5 (non-breaking additions)

lib.ensurePage = (name) => {
  let p = penpotUtils.getPageByName(name);
  if (!p) { p = penpot.createPage(); p.name = name; }
  return p;
};

// Rule 3: poll until the page switch has really happened; fail loud if it never does.
lib.open = async (pageName) => {
  const p = lib.ensurePage(pageName);
  if (penpot.currentPage?.id !== p.id) {
    penpot.openPage(p);
    for (let i = 0; i < 30 && penpot.currentPage?.id !== p.id; i++) await lib.sleep(100);
    if (penpot.currentPage?.id !== p.id) throw new Error('openPage did not settle: ' + pageName);
  }
  return p;
};

lib.byName = (name, root) => {
  const n = lib.norm(name);
  return penpotUtils.findShape(s => s.name === n, root ?? null);
};

// Upsert a board on a page. Deterministic geometry → idempotent re-runs are no-ops.
lib.upsertBoard = async (pageName, name, geom) => {
  const g = Object.assign({ x: 0, y: 0, w: 390, h: 844 }, geom || {});
  const pg = await lib.open(pageName);
  const n = lib.norm(name);
  let b = penpotUtils.findShape(s => s.name === n && s.type === 'board', pg.root);
  let created = false;
  if (!b) { b = penpot.createBoard(); b.name = name; created = true; }
  b.x = g.x; b.y = g.y;
  if (Math.round(b.width) !== g.w || Math.round(b.height) !== g.h) b.resize(g.w, g.h);
  if (g.fill) b.fills = [{ fillColor: g.fill, fillOpacity: 1 }];
  return { board: b, created };
};

// Fonts: depiction stand-ins per research R3.
lib.FONT = { sans: 'Plus Jakarta Sans', mono: 'IBM Plex Mono' };
lib.applyFont = (text, zone, weight) => {
  const font = penpot.fonts.findByName(lib.FONT[zone] || lib.FONT.sans);
  if (!font) throw new Error('font missing: ' + zone);
  const w = String(weight || 400);
  const variant = font.variants.find(v => v.fontWeight === w && v.fontStyle === 'normal') || font.variants[0];
  font.applyToText(text, variant);
};

// Upsert a text child of parent by name. CALLER must have parent's page current.
lib.upsertText = (parent, name, spec) => {
  const s = Object.assign({ text: '', size: 13, weight: 400, zone: 'sans', color: '#1A1A18', x: 0, y: 0 }, spec || {});
  const n = lib.norm(name);
  let t = penpotUtils.findShape(sh => sh.name === n && sh.type === 'text', parent);
  let created = false;
  if (!t) {
    t = penpot.createText(s.text || ' ');
    t.name = name;
    parent.appendChild(t);
    created = true;
  }
  if (t.characters !== s.text) t.characters = s.text;
  t.fontSize = String(s.size);
  lib.applyFont(t, s.zone, s.weight);
  t.fills = [{ fillColor: s.color, fillOpacity: 1 }];
  t.growType = s.growType || 'auto-width';
  penpotUtils.setParentXY(t, s.x, s.y);
  return { text: t, created };
};

// Annotations (consumption contract). These used to be 8px text shapes parked on the board, but
// provenance text sitting on a screen is noise in a design tool — a designer opening the file saw
// "note:generated 1:1 from the live rendered DOM…" printed across the CTA row. They now live in
// PLUGIN DATA instead: invisible on canvas, still machine-readable via getPluginData, and no
// longer able to collide with the artwork. Key is `vela.<kind>`; repeated calls of the same kind
// append with ' | ' so a board can carry several edges.
// Consumers: read board.getPluginData('vela.note' | 'vela.edge' | 'vela.platform' | 'vela.motion').
lib.chip = (board, kind, textContent) => {
  const key = 'vela.' + kind;
  const prev = board.getPluginData(key) || '';
  const parts = prev ? prev.split(' | ') : [];
  if (parts.includes(textContent)) return { chip: board, created: false };
  parts.push(textContent);
  board.setPluginData(key, parts.join(' | '));
  return { chip: board, created: true };
};

// Remove the legacy on-canvas annotation shapes wherever they still exist. Their names carry the
// `kind:` prefix, which nothing else uses — the IA diagram's arrow labels are named 'e/…' and are
// deliberately NOT matched, because there the label IS the visualisation.
lib.stripChipShapes = (root) => {
  let removed = 0, guard = 0;
  while (guard++ < 2000) {
    const s = penpotUtils.findShape(sh => sh.type === 'text' &&
      /^(edge|platform|motion|note)\s*:/.test(sh.name || ''), root ?? null);
    if (!s) break;
    s.remove(); removed++;
  }
  return removed;
};

lib.bindToken = (shape, tokenName, props) => {
  const tk = penpotUtils.findTokenByName(tokenName);
  if (!tk) throw new Error('token missing: ' + tokenName);
  shape.applyToken(tk, props);
};

// Rule 4: bulk removal iterates ALL pages (cannot resolve a shape's page any other way).
lib.removeWhere = async (pred) => {
  let removed = 0;
  const perPage = {};
  for (const pageName of lib.PAGES) {
    if (!penpotUtils.getPageByName(pageName)) continue;
    await lib.open(pageName);
    let guard = 0, n = 0;
    while (guard++ < 500) {
      const s = penpotUtils.findShape(pred, penpot.currentPage.root);
      if (!s) break;
      s.remove(); removed++; n++;
    }
    if (n) perPage[pageName] = n;
  }
  return { removed, perPage };
};

// Deterministic board grid inside a page (row = surface, col = state).
lib.screenPos = (row, col) => ({ x: col * 450, y: row * 950 });
lib.docGeom = (y, col, h) => ({ x: (col || 0) * 900, y, w: 800, h: h || 600, fill: '#FFFFFF' }); // explicit y — row-index math overlapped with mixed heights

// Upsert a rectangle child of parent by name. CALLER must have parent's page current.
lib.upsertRect = (parent, name, spec) => {
  const s = Object.assign({ x: 0, y: 0, w: 40, h: 40 }, spec || {});
  const n = lib.norm(name);
  let r = penpotUtils.findShape(sh => sh.name === n && sh.type === 'rectangle', parent);
  let created = false;
  if (!r) { r = penpot.createRectangle(); r.name = name; parent.appendChild(r); created = true; }
  if (Math.round(r.width) !== s.w || Math.round(r.height) !== s.h) r.resize(s.w, s.h);
  penpotUtils.setParentXY(r, s.x, s.y);
  if (s.fill) r.fills = [{ fillColor: s.fill, fillOpacity: 1 }];
  if (s.radius !== undefined) r.borderRadius = s.radius;
  if (s.stroke) r.strokes = [{ strokeColor: s.stroke, strokeWidth: s.strokeWidth || 1, strokeAlignment: 'inner' }];
  return { rect: r, created };
};

// Instantiate a library component by family name (+ optional variant props) and place it.
// Screen boards MUST compose from instances, not redrawn copies (FR-005, US4-AS2).
// Returns null when the family is missing so a chunk can fall back to a placeholder and
// report the gap instead of dying mid-board.
lib.instance = (familyName, props, parent, x, y) => {
  const n = lib.norm(familyName);
  const candidates = penpot.library.local.components.filter(c => c.name === n);
  if (!candidates.length) return null;
  let comp = candidates[0];
  if (props && candidates.length > 1) {
    const match = candidates.find(c => typeof c.variantProps === 'object' && c.variantProps &&
      Object.entries(props).every(([k, v]) => String(c.variantProps[k]) === String(v)));
    if (match) comp = match;
  }
  const inst = comp.instance();
  if (parent) parent.appendChild(inst);
  if (x !== undefined) penpotUtils.setParentXY(inst, x, y);
  return inst;
};

lib.done = (chunk, summary) => {
  storage.progress = storage.progress || {};
  storage.progress[chunk] = Object.assign({ done: true }, summary);
  return Object.assign({ chunk }, summary);
};

storage.lib = lib;
return { installed: true, version: 5, helpers: Object.keys(lib) };
