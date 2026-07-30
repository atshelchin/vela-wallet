// 72-components-from-cells.js — build ONE component family from its rendered gallery cells.
//
// Input: storage.familyPlan = one entry of dom-dumps/cells/_plan.json, e.g.
//   { component: 'C/Rows/ActivityRow', props: ['state'],
//     cells: [{ slug: 'gallery-activityrow-out', w: 350, h: 95, values: ['out'], caption: '…' }] }
// Cell dumps are fetched from /plugins/mcp/cells/<slug>.json (see README §"Feeding big payloads").
//
// This is the US2 rebuild the pivot called for: a component's geometry comes from the pixels the
// app actually rendered in /design-gallery, not from reading its source. Drawing is delegated
// wholesale to 70-board-from-dom.js so screens and components share ONE converter — that file
// carries every hard-won fix (inline fragments, baselines, viewBox scaling, reflow, token binding)
// and a second copy of it would drift within a week.
//
// Idempotency: the family's container board is removed and rebuilt from scratch on every run.
// Variant components cannot be edited in place through the plugin API, and a half-updated variant
// set is worse than a rebuilt one.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const plan = storage.familyPlan;
if (!plan || !plan.cells || !plan.cells.length) throw new Error('set storage.familyPlan first');

const PAGE = '03 Components';
// Variants are drawn out here first, then swallowed by the container createVariantFromComponents
// makes. Parking them far from the finished shelves keeps a failed run's debris obvious.
const PARK = { x: -20000, y: -20000 };
const stats = { component: plan.component, variants: 0, shapes: 0, icons: 0, iconMissing: 0,
  images: 0, imageMissing: 0, colorBound: 0, colorLiteral: 0, reflowStuck: 0, removedPrior: 0,
  shadows: 0, dimmed: 0, rawHex: {}, perVariant: [] };

await lib.open(PAGE);

// ── retire whatever stood here before ──────────────────────────────────────────────────────────
// Either a pre-pivot board authored from the inventory reports, or this family's own previous run.
// Both carry the family's name, so both are found the same way.
for (let g = 0; g < 20; g++) {
  const prior = lib.byName(plan.component);
  if (!prior) break;
  prior.remove();
  stats.removedPrior++;
}

const src70 = storage.src70 ||
  (storage.src70 = await (await fetch('/plugins/mcp/gen/70-board-from-dom.js?v=' + Date.now(), { cache: 'reload' })).text());
const run70 = () => new Function('storage', 'penpot', 'penpotUtils',
  'return (async () => {' + src70 + '})()')(storage, penpot, penpotUtils);

// ── draw every variant ─────────────────────────────────────────────────────────────────────────
const made = [];
let px = PARK.x;
for (const cell of plan.cells) {
  const b = penpot.createBoard();
  // The component's name is the variant coordinate, space-joined: createVariantFromComponents
  // seeds the container's first property from it, and the recipe below splits it back out.
  b.name = cell.values.join(' ');
  b.x = px; b.y = PARK.y;
  px += Math.round(cell.w) + 60;
  b.clipContent = false;                       // a shadow or focus ring may sit outside the box

  storage.domDump = await (await fetch('/plugins/mcp/cells/' + cell.slug + '.json')).json();
  storage.boardSpec = { page: PAGE, name: plan.component + '/' + b.name, board: b, fill: null };
  const r = await run70();
  stats.shapes += (r.rects || 0) + (r.texts || 0) + (r.icons || 0) + (r.images || 0);
  stats.icons += r.icons || 0; stats.iconMissing += r.iconMissing || 0;
  stats.images += r.images || 0; stats.imageMissing += r.imageMissing || 0;
  stats.colorBound += r.colorBound || 0; stats.colorLiteral += r.colorLiteral || 0;
  // forward every converter stat that matters: `shadows` read 0 for a whole rebuild only because it
  // was never copied out of 70's result, which made a real fix look like it had not applied
  stats.shadows += r.shadows || 0;
  stats.reflowStuck += (r.reflowStuck || []).length;
  for (const h of (r.rawHex || [])) {
    const [hx, n] = String(h).split('×');
    stats.rawHex[hx] = (stats.rawHex[hx] || 0) + Number(n || 1);
  }
  // provenance rides in plugin data, never as text on the artwork (consumption contract)
  b.setPluginData('vela.source', '#' + cell.slug);
  if (cell.caption) lib.chip(b, 'note', cell.caption);
  stats.perVariant.push({ v: b.name, shapes: (r.rects || 0) + (r.texts || 0), missing: (r.iconMissing || 0) + (r.imageMissing || 0) });

  const comp = penpot.library.local.createComponent([b]);
  made.push({ comp, values: cell.values });
  stats.variants++;
}

// Stack the families down the page. The cursor lives in storage because each family is its own
// chunk invocation (the <15s budget does not fit 189 variants in one call), so nothing else knows
// where the previous shelf ended.
const cur = storage.compCursor || (storage.compCursor = { y: 0 });
let container;
try {
  // ── fold them into one variant container ─────────────────────────────────────────────────────
  // A family with a single rendered state has no axis to vary: createVariantFromComponents returns
  // something with no `.variants` for one input, and calling renameProperty on it throws — which is
  // how nine one-cell families (SectionLabel, Collapsible, SigningAccountRow…) died on the first
  // run. They are plain components; only a family with something to choose between is a variant set.
  if (made.length > 1) {
    await lib.sleep(400);
    container = penpot.createVariantFromComponents(made.map((m) => m.comp.mainInstance()));
    await lib.sleep(500);
  }
  if (container && container.variants) {
    container.name = plan.component;
    container.x = 0; container.y = cur.y;
    const vv = container.variants;
    vv.renameProperty(0, plan.props[0]);
    for (let i = 1; i < plan.props.length; i++) vv.addProperty();
    await lib.sleep(300);
    for (let i = 1; i < plan.props.length; i++) vv.renameProperty(i, plan.props[i]);
    await lib.sleep(200);
    // The initial value of Property-1 is the component name — "compact default accent" — so split
    // it back into one value per axis.
    for (const vc of container.variants.variantComponents()) {
      const parts = String(Object.values(vc.variantProps)[0] || '').split(' ');
      if (parts.length === plan.props.length) parts.forEach((p, i) => vc.setVariantProperty(i, p));
    }
    await lib.sleep(300);
    stats.variantErrors = container.variants.variantComponents().filter((vc) => vc.variantError).length;
  } else {
    // single state (or a Penpot build without variant containers): the board itself is the component
    if (container) { try { container.remove(); } catch (e) {} }
    container = made[0].comp.mainInstance();
    container.name = plan.component;
    container.x = 0; container.y = cur.y;
    stats.singleVariant = true;
  }
} catch (e) {
  // never leave half-built debris parked off-canvas for the next run to trip over
  for (const m of made) { try { m.comp.mainInstance().remove(); } catch (e2) {} }
  throw e;
}
cur.y += Math.round(container.height) + 140;

// ── restore paint order ────────────────────────────────────────────────────────────────────────
// Folding the variants into a container INVERTS each board's child order (a screen board built by
// the same converter keeps it; only components come back flipped). Inverted means every wrapper
// paints over its own contents: the cream 40px disc covered the USDC logo, and a button's label
// disappeared behind its own fill — visible on the disabled variant only because the fill is
// translucent there. The order 70 appended in is a depth-first walk of the DOM, and each shape's
// name carries that path, so the correct stacking is recoverable exactly rather than by reversing
// and hoping. parentIndex 0 is the BACK.
const pathOf = (n) => {
  const m = lib.norm(n || '').match(/^r \/ ([\d.]+)/);
  return m ? m[1].split('.').map(Number) : null;
};
const restoreOrder = (bd) => {
  const kids = (bd.children || []).slice();
  const keyed = kids.map((c) => ({ c, k: pathOf(c.name) }));
  if (!keyed.length || keyed.some((x) => !x.k)) return false;   // something we did not draw: leave it
  keyed.sort((a, b) => {
    for (let i = 0; i < Math.max(a.k.length, b.k.length); i++) {
      const d = (a.k[i] === undefined ? -1 : a.k[i]) - (b.k[i] === undefined ? -1 : b.k[i]);
      if (d) return d;
    }
    return 0;
  });
  let moved = 0;
  keyed.forEach((x, i) => { if (x.c.parentIndex !== i) { x.c.setParentIndex(i); moved++; } });
  return moved;
};
stats.reordered = 0;
const kids0 = container.children || [];
// a variant container holds variant BOARDS; a single-state component is the drawn board itself
if (kids0.some((s) => pathOf(s.name))) { if (restoreOrder(container)) stats.reordered++; }
else for (const vb of kids0) if (restoreOrder(vb)) stats.reordered++;

lib.chip(container, 'note', 'rebuilt 1:1 from /design-gallery cells (' + plan.cells.length +
  ' rendered states); geometry, colour and type are the app\'s own, not read from source');
stats.y = cur.y;
stats.rawHex = Object.entries(stats.rawHex).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([h, n]) => h + '×' + n);
return lib.done('72-components-from-cells:' + plan.component, stats);
