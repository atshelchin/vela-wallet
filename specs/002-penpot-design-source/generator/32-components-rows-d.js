// 32-components-rows-d.js — C/Rows/ContactRow + C/Primitives/SectionLabel (single) +
// C/Primitives/VelaCard + C/Primitives/AmountText.
// ContactRow: the contact list row in its two documented contexts. inv:03 §5.2 (picker), §5.3 (manager).
// SectionLabel: single component (spacing axis is margin-only → collapsed to note chip). inv:02 §A3.
// VelaCard: elevation(default/elevated). inv:02 §A2, inv:01 §20.
// AmountText: manifest 2×3×2×2=24 cells → 5 documented combos as a text-style recipe. inv:02 §A6, inv:01 §20.
// Idempotency: per-family skip-if-exists.
if (!storage.lib) throw new Error('run 10-lib.js first');
const lib = storage.lib;
await lib.open('03 Components');

// palette — inv:02 §0.1
const INK = '#1A1A18', MUTED = '#6E6B62', SUBTLE = '#8C887E';
const SUNKEN = '#F5F3EF', RAISED = '#FFFFFF', BORDER = '#ECEBE4', WARNING = '#92600A';
// ContactAvatar tinted-initial, terracotta hue 18: bg hsl(18,32%,91%), letter hsl(18,40%,36%) — inv:03 §5.1
const AVATAR_BG = '#F0E3DC', AVATAR_FG = '#816337';

const icon = (name, size, sw, color, fill) => {
  const r = penpot.createRectangle();
  r.name = 'icon:' + name + ' ' + size + '/' + sw;
  r.resize(size, size);
  r.fills = fill ? [{ fillColor: fill, fillOpacity: 1 }] : [];
  r.strokes = [{ strokeColor: color, strokeWidth: sw, strokeAlignment: 'inner' }];
  return r;
};
const txt = (content, size, weight, color, zone, extras) => {
  const t = penpot.createText(content);
  t.name = 'txt ' + content.slice(0, 18);
  t.fontSize = String(size);
  lib.applyFont(t, zone || 'sans', weight);
  t.fills = [{ fillColor: color, fillOpacity: 1 }];
  t.growType = 'auto-width';
  if (extras && extras.ls) t.letterSpacing = String(extras.ls);
  if (extras && extras.upper) t.textTransform = 'uppercase';
  return t;
};
const splitProps = (container, n) => {
  for (const vc of container.variants.variantComponents()) {
    const parts = String(Object.values(vc.variantProps)[0] || '').split(' ');
    if (parts.length === n) parts.forEach((p, i) => vc.setVariantProperty(i, p));
  }
};
const summary = {};
let x = 5000;

// ── Family 1: C/Rows/ContactRow ─────────────────────────────────────────────
const FAM_CONTACT = 'C/Rows/ContactRow';
if (!penpot.library.local.components.some(c => c.name === lib.norm(FAM_CONTACT))) {
  // combos: [context, state, opts] — inv:03 §5.2/§5.3
  const COMBOS = [
    ['manager', 'default',  {}],
    ['manager', 'favorite', { fav: true }],   // trailing Star 18 filled amber — inv:03 §5.3
    ['manager', 'pressed',  { pressed: true }], // pressed = bg.sunken fill radius.lg — inv:03 §5.3
    ['picker',  'default',  {}],
    ['picker',  'favorite', { fav: true }],   // filled Star 12 warning.base beside name — inv:03 §5.2
  ];
  const made = [];
  for (const [ctx, state, o] of COMBOS) {
    const isMgr = ctx === 'manager';
    const avSize = isMgr ? 42 : 40;           // avatar 42 manager / 40 picker — inv:03 §5.3/§5.2
    const b = penpot.createBoard();
    b.name = ctx + ' ' + state;
    b.x = x; b.y = 7000; x += 342 + 60;
    b.resize(342, isMgr ? 60 : 56);           // minHeight 60 / 56 — inv:03 §5.3/§5.2
    b.borderRadius = 12;                      // pressed tint radius.lg — inv:03 §5.3
    b.fills = o.pressed ? [{ fillColor: SUNKEN, fillOpacity: 1 }] : [];
    const left = penpot.createBoard();
    left.name = 'left'; left.fills = [];
    const av = penpot.createBoard();          // ContactAvatar tinted initial — inv:03 §5.1
    av.name = 'ContactAvatar ' + avSize;
    av.resize(avSize, avSize); av.borderRadius = avSize / 2;
    av.fills = [{ fillColor: AVATAR_BG, fillOpacity: 1 }];
    av.appendChild(txt('A', Math.round(avSize * 0.42), 700, AVATAR_FG, 'sans', { ls: -0.5 })); // 0.42×N bold ls −0.5 — inv:03 §5.1
    const avfl = av.addFlexLayout();
    avfl.dir = 'row'; avfl.alignItems = 'center'; avfl.justifyContent = 'center';
    left.appendChild(av);
    const tcol = penpot.createBoard();
    tcol.name = 'text-col'; tcol.fills = [];
    if (!isMgr && o.fav) {                    // picker favorite: name + inline filled Star 12 — inv:03 §5.2
      const nrow = penpot.createBoard();
      nrow.name = 'name-row'; nrow.fills = [];
      nrow.appendChild(txt('Alice Chen', 15, 600, INK)); // name text.lg semibold — inv:03 §5.2
      nrow.appendChild(icon('Star', 12, 2, WARNING, WARNING));
      const nfl = nrow.addFlexLayout();
      nfl.dir = 'row'; nfl.alignItems = 'center'; nfl.columnGap = 4;
      tcol.appendChild(nrow);
    } else {
      tcol.appendChild(txt('Alice Chen', 15, 600, INK));
    }
    tcol.appendChild(txt(isMgr ? '0x9F2c…41Ab' : '0x9F2c…41Ab · 12 sends', 11, 500, MUTED, 'mono')); // sub-line sm mono muted — inv:03 §5.2
    const tfl = tcol.addFlexLayout();
    tfl.dir = 'column'; tfl.rowGap = 2;
    left.appendChild(tcol);
    const lfl = left.addFlexLayout();
    lfl.dir = 'row'; lfl.alignItems = 'center'; lfl.columnGap = 12; // gap 12 — inv:03 §5.2
    b.appendChild(left);
    if (isMgr) {                              // trailing star toggle 36×36, Star 18 — inv:03 §5.3
      const star = penpot.createBoard();
      star.name = 'star-toggle 36';
      star.resize(36, 36); star.fills = [];
      star.appendChild(o.fav ? icon('Star', 18, 2, WARNING, WARNING) : icon('Star', 18, 2, SUBTLE));
      const sfl = star.addFlexLayout();
      sfl.dir = 'row'; sfl.alignItems = 'center'; sfl.justifyContent = 'center';
      b.appendChild(star);
    }
    const fl = b.addFlexLayout();
    fl.dir = 'row'; fl.alignItems = 'center'; fl.justifyContent = 'space-between';
    try { fl.verticalPadding = isMgr ? 8 : 8; fl.horizontalPadding = 4; } catch (e) {} // padV 8 padH 4 — inv:03 §5.2
    try { if (o.pressed) lib.bindToken(b, 'color.bg.sunken', ['fill']); } catch (e) {}
    made.push(penpot.library.local.createComponent([b]));
  }
  await lib.sleep(400);
  const container = penpot.createVariantFromComponents(made.map(m => m.mainInstance()));
  await lib.sleep(500);
  container.name = FAM_CONTACT;
  container.x = 1400; container.y = 5500;     // agent slot: family 6 → y 5500
  const vv = container.variants;
  vv.renameProperty(0, 'context');
  vv.addProperty();
  await lib.sleep(300);
  vv.renameProperty(1, 'state');
  await lib.sleep(200);
  splitProps(container, 2);
  await lib.sleep(300);
  lib.chip(container, 'motion', 'press = bg.sunken fill (manager) + row spring 0.98; avatar enlargeable → identicon viewer w/ selection haptic (inv 03 §5.1/§5.3)');
  lib.chip(container, 'note', 'axes collapsed: account-kind badge (16px info.base disc + Wallet 9) & identicon avatar mode omitted; dividers inset 56 picker / 58 manager (inv 03 §5.1–§5.3)');
  summary.ContactRow = { variants: made.length, variantErrors: container.variants.variantComponents().filter(vc => vc.variantError).length };
} else summary.ContactRow = { skipped: 'family exists' };

// ── Family 2: C/Primitives/SectionLabel (single component) ──────────────────
const FAM_LABEL = 'C/Primitives/SectionLabel';
if (!penpot.library.local.components.some(c => c.name === lib.norm(FAM_LABEL))) {
  const b = penpot.createBoard();
  b.name = FAM_LABEL;
  b.x = x; b.y = 7000; x += 342 + 60;
  b.resize(342, 24);
  b.fills = [];
  // text.sm (11) semibold, fg.subtle #8C887E, UPPERCASE, letterSpacing 0.6 — inv:02 §A3
  b.appendChild(txt('RECENT ACTIVITY', 11, 600, SUBTLE, 'sans', { ls: 0.6, upper: true }));
  const fl = b.addFlexLayout();
  fl.dir = 'row'; fl.alignItems = 'center';
  const comp = penpot.library.local.createComponent([b]);
  comp.name = FAM_LABEL;
  await lib.sleep(300);
  const mi = comp.mainInstance();
  mi.x = 1400; mi.y = 6400;                   // agent slot: family 7 → y 6400
  lib.chip(mi, 'note', 'axes collapsed: spacing(standalone mT20/mB8 · inline m0 · first-in-sheet mT12) — margin-only, zero glyph delta (inv 02 §A3)');
  lib.chip(mi, 'note', 'letterSpacing 0.6 is code truth; DESIGN_SYSTEM 0.8–1.2 is stale (inv 02 §Z-5)');
  summary.SectionLabel = { variants: 1 };
} else summary.SectionLabel = { skipped: 'family exists' };

// ── Family 3: C/Primitives/VelaCard ─────────────────────────────────────────
const FAM_CARD = 'C/Primitives/VelaCard';
if (!penpot.library.local.components.some(c => c.name === lib.norm(FAM_CARD))) {
  const made = [];
  for (const elev of ['default', 'elevated']) {
    const b = penpot.createBoard();
    b.name = elev;
    b.x = x; b.y = 7000; x += 342 + 60;
    b.resize(342, 140);
    b.fills = [{ fillColor: RAISED, fillOpacity: 1 }]; // bg.raised — inv:02 §A2, inv:01 §20
    b.borderRadius = 16;                               // radius.xl — inv:02 §A2
    if (elev === 'default') b.strokes = [{ strokeColor: BORDER, strokeWidth: 1, strokeAlignment: 'inner' }]; // 1px border.base — inv:02 §A2
    try { lib.bindToken(b, 'color.bg.raised', ['fill']); } catch (e) {}
    try { lib.bindToken(b, elev === 'elevated' ? 'shadow.md' : 'shadow.sm', ['shadow']); } catch (e) {} // elevated → shadow.md, border transparent — inv:02 §A2
    try { lib.bindToken(b, 'radius.xl', ['borderRadiusTopLeft', 'borderRadiusTopRight', 'borderRadiusBottomRight', 'borderRadiusBottomLeft']); } catch (e) {}
    made.push(penpot.library.local.createComponent([b]));
  }
  await lib.sleep(400);
  const container = penpot.createVariantFromComponents(made.map(m => m.mainInstance()));
  await lib.sleep(500);
  container.name = FAM_CARD;
  container.x = 1400; container.y = 7300;     // agent slot: family 8 → y 7300
  container.variants.renameProperty(0, 'elevation');
  await lib.sleep(300);
  lib.chip(container, 'note', 'no internal padding by design — children own it; static, no press; reserved for genuinely distinct surfaces per de-container language (inv 02 §A2)');
  summary.VelaCard = { variants: made.length, variantErrors: container.variants.variantComponents().filter(vc => vc.variantError).length };
} else summary.VelaCard = { skipped: 'family exists' };

// ── Family 4: C/Primitives/AmountText ───────────────────────────────────────
const FAM_AMOUNT = 'C/Primitives/AmountText';
if (!penpot.library.local.components.some(c => c.name === lib.norm(FAM_AMOUNT))) {
  // hero size 40 (text.5xl); tail = 0.56× → 22; subordinated symbol = 0.58× → 23 — inv:01 §20, inv:02 §A6
  const COMBOS = [
    // [mode, symbol, decimals, representation, parts: [text, size]]
    ['fiat', 'subordinated', 'shown', 'full',    [['$', 23], ['12,847', 40], ['.32', 22]]],
    ['fiat', 'full', 'shown', 'full',            [['$12,847', 40], ['.32', 22]]],   // full-size symbol glued to integer — inv:02 §A6.4
    ['fiat', 'subordinated', 'hidden', 'full',   [['$', 23], ['12,847', 40]]],
    ['fiat', 'subordinated', 'shown', 'compact', [['$', 23], ['1.23M', 40]]],       // compact floor $1.23M — inv:02 §A6.2
    ['preformatted', 'none', 'shown', 'full',    [['0.4521', 40], ['ETH', 22]]],    // unit at tailScale — inv:02 §A6.3
  ];
  const made = [];
  for (const [mode, symbol, decimals, rep, parts] of COMBOS) {
    const b = penpot.createBoard();
    b.name = mode + ' ' + symbol + ' ' + decimals + ' ' + rep;
    b.x = x; b.y = 7000; x += 342 + 60;
    b.resize(342, 56);
    b.fills = [];
    for (const [content, size] of parts) {
      b.appendChild(txt(content, size, 700, INK)); // hero = font.display PJ Bold — inv:02 §0.4
    }
    const fl = b.addFlexLayout();
    fl.dir = 'row'; fl.alignItems = 'end'; fl.columnGap = 2; // two-tier baseline cascade — inv:02 §A6.3
    made.push(penpot.library.local.createComponent([b]));
  }
  await lib.sleep(400);
  const container = penpot.createVariantFromComponents(made.map(m => m.mainInstance()));
  await lib.sleep(500);
  container.name = FAM_AMOUNT;
  container.x = 1400; container.y = 8200;     // agent slot: family 9 → y 8200
  const vv = container.variants;
  vv.renameProperty(0, 'mode');
  vv.addProperty(); vv.addProperty(); vv.addProperty();
  await lib.sleep(300);
  vv.renameProperty(1, 'symbol');
  vv.renameProperty(2, 'decimals');
  vv.renameProperty(3, 'representation');
  await lib.sleep(200);
  splitProps(container, 4);
  await lib.sleep(300);
  lib.chip(container, 'note', 'text-style recipe, not a frame: tail = 0.56× (decimals+unit), hero symbol = 0.58×, minScale 0.6 shrink floor then compact notation, lineHeight ×1.12, single line atomic (inv 01 §20, inv 02 §A6)');
  lib.chip(container, 'note', 'axes collapsed: 2×3×2×2=24 → 5 documented combos; preformatted/text mode never compacts (inv 02 §A6.2); maxLines>1 only for input/full-precision surfaces (inv 02 §A6.5)');
  summary.AmountText = { variants: made.length, variantErrors: container.variants.variantComponents().filter(vc => vc.variantError).length };
} else summary.AmountText = { skipped: 'family exists' };

return lib.done('32-components-rows-d', summary);
