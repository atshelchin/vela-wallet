// 30-components-velabutton.js — T014a: C/Primitives/VelaButton variant family.
// Axes: variant(primary|accent|secondary|destructive) × size(default|compact) × state(default|disabled|loading).
// `pressed` is scale-only motion (no rest-state visual delta) → motion chip, not a variant. inv:01 §20, inv:02 A1,
// destructive variant per inv:06 §5.5 correction (manifest judgment call 8).
// Idempotency: family-level skip-if-exists (variant containers are not field-upsertable).
if (!storage.lib) throw new Error('run 10-lib.js first');
const lib = storage.lib;
await lib.open('03 Components');

const FAMILY = 'C/Primitives/VelaButton';
if (penpot.library.local.components.some(c => c.name === lib.norm(FAMILY))) {
  return lib.done('30-components-velabutton', { skipped: 'family exists' });
}

const VARIANTS = {
  primary:     { fill: '#1A1A18', text: '#FFFFFF', fillToken: 'color.fg.base',     shadow: 'shadow.sm' },
  accent:      { fill: '#E8572A', text: '#FFFFFF', fillToken: 'color.accent.base', shadow: 'shadow.sm' },
  secondary:   { fill: null,      text: '#1A1A18', stroke: '#D8D6CE', strokeW: 1.5 },
  destructive: { fill: '#C62828', text: '#FFFFFF', fillToken: 'color.error.base',  shadow: 'shadow.sm' },
};
const SIZES = { default: { w: 342, h: 53, font: 15 }, compact: { w: 200, h: 42, font: 13 } };
const STATES = ['default', 'disabled', 'loading'];

const made = []; // {comp, v, s, st}
let x = 5000;
for (const [vName, vs] of Object.entries(VARIANTS)) {
  for (const [sName, sz] of Object.entries(SIZES)) {
    for (const st of STATES) {
      const b = penpot.createBoard();
      b.name = vName + ' ' + sName + ' ' + st;
      b.x = x; b.y = 5000; x += sz.w + 40;
      b.resize(sz.w, sz.h);
      b.fills = vs.fill ? [{ fillColor: vs.fill, fillOpacity: 1 }] : [];
      b.borderRadius = 16;
      if (vs.stroke) b.strokes = [{ strokeColor: vs.stroke, strokeWidth: vs.strokeW, strokeAlignment: 'inner' }];
      if (st === 'disabled') b.opacity = 0.45;
      if (st === 'loading') {
        const e = penpot.createEllipse();
        e.name = 'spinner';
        e.resize(18, 18);
        e.fills = [];
        e.strokes = [{ strokeColor: vs.text, strokeWidth: 2 }];
        b.appendChild(e);
      } else {
        const t = penpot.createText('Continue');
        t.name = 'label';
        t.fontSize = String(sz.font);
        lib.applyFont(t, 'sans', 600);
        t.fills = [{ fillColor: vs.text, fillOpacity: 1 }];
        b.appendChild(t);
      }
      const fl = b.addFlexLayout();
      fl.dir = 'row'; fl.alignItems = 'center'; fl.justifyContent = 'center';
      try { if (vs.fillToken) lib.bindToken(b, vs.fillToken, ['fill']); } catch (e) {}
      try { if (vs.shadow) lib.bindToken(b, vs.shadow, ['shadow']); } catch (e) {}
      try { lib.bindToken(b, 'radius.xl', ['borderRadiusTopLeft', 'borderRadiusTopRight', 'borderRadiusBottomRight', 'borderRadiusBottomLeft']); } catch (e) {}
      const comp = penpot.library.local.createComponent([b]);
      made.push({ comp, v: vName, s: sName, st });
    }
  }
}
await lib.sleep(400);
const container = penpot.createVariantFromComponents(made.map(m => m.comp.mainInstance()));
await lib.sleep(500);
container.name = FAMILY;
container.x = 0; container.y = 0;
const vv = container.variants;
vv.renameProperty(0, 'variant');
vv.addProperty(); vv.addProperty();
await lib.sleep(300);
vv.renameProperty(1, 'size');
vv.renameProperty(2, 'state');
await lib.sleep(200);
// initial Property-1 value = board name "variant size state" → split back out
for (const vc of container.variants.variantComponents()) {
  const parts = String(Object.values(vc.variantProps)[0] || '').split(' ');
  if (parts.length === 3) {
    vc.setVariantProperty(0, parts[0]);
    vc.setVariantProperty(1, parts[1]);
    vc.setVariantProperty(2, parts[2]);
  }
}
await lib.sleep(300);
lib.chip(container, 'motion', 'press = scale 0.97 spring(d15 s150 m0.8) + hapticLight; never opacity/timing');
lib.chip(container, 'note', 'loading = ActivityIndicator in label color; disabled = opacity 0.45; full-width in flows (342 = 390 - 2×24)');
const errs = container.variants.variantComponents().filter(vc => vc.variantError).length;
return lib.done('30-components-velabutton', { variants: made.length, variantErrors: errs });
