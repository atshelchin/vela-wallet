// 32-components-rows-a.js — C/Rows/TokenRow variant family.
// Manifest axes mode(3) × masked(2) × contract-chip(3) × fiat(2) × state(3) = 108 cells → built as the
// 7 combos the inventory actually documents; collapsed axes recorded on a note chip. inv:02 §C1.
// `pressed` is spring-scale 0.98 motion (rest tint undocumented — inv:02 §C1 "radius 12 for the
// pressed/selected tint only" names no pressed color) → motion chip, not a variant.
// Carries the canonical-selected-row ruling chip per inv:02 §Z-4.
// Idempotency: family-level skip-if-exists (variant containers are not field-upsertable).
if (!storage.lib) throw new Error('run 10-lib.js first');
const lib = storage.lib;
await lib.open('03 Components');

const FAMILY = 'C/Rows/TokenRow';
if (penpot.library.local.components.some(c => c.name === lib.norm(FAMILY))) {
  return lib.done('32-components-rows-a', { skipped: 'family exists' });
}

// palette (light theme depiction) — inv:02 §0.1
const INK = '#1A1A18';      // fg.base
const MUTED = '#6E6B62';    // fg.muted
const SUBTLE = '#8C887E';   // fg.subtle
const SUNKEN = '#F5F3EF';   // bg.sunken
const ACCENT = '#E8572A';   // accent.base
const ACCENT_SOFT = '#FFF0EB'; // accent.soft
const SUCCESS = '#2D8E5F';  // success.base
const STRONG = '#D8D6CE';   // border.strong

const icon = (name, size, sw, color, fill) => { // icon placeholder convention: name encodes real Lucide glyph
  const r = penpot.createRectangle();
  r.name = 'icon:' + name + ' ' + size + '/' + sw;
  r.resize(size, size);
  r.fills = fill ? [{ fillColor: fill, fillOpacity: 1 }] : [];
  r.strokes = [{ strokeColor: color, strokeWidth: sw, strokeAlignment: 'inner' }];
  return r;
};
const txt = (content, size, weight, color, zone) => {
  const t = penpot.createText(content);
  t.name = 'txt ' + content.slice(0, 18);
  t.fontSize = String(size);
  lib.applyFont(t, zone || 'sans', weight);
  t.fills = [{ fillColor: color, fillOpacity: 1 }];
  t.growType = 'auto-width';
  return t;
};
const col = (name, gap, alignEnd) => {
  const b = penpot.createBoard();
  b.name = name; b.fills = [];
  const fl = b.addFlexLayout();
  fl.dir = 'column'; fl.rowGap = gap;
  fl.alignItems = alignEnd ? 'end' : 'start';
  return b;
};
const maskedDots = (color) => { // 4×7px circles r3.5 gap 4, never bullet glyphs — inv:02 §0b.4
  const b = penpot.createBoard();
  b.name = 'masked-dots'; b.fills = []; b.resize(40, 7);
  for (let i = 0; i < 4; i++) {
    const e = penpot.createEllipse();
    e.name = 'dot'; e.resize(7, 7);
    e.fills = [{ fillColor: color, fillOpacity: 1 }];
    b.appendChild(e);
  }
  const fl = b.addFlexLayout();
  fl.dir = 'row'; fl.columnGap = 4; fl.alignItems = 'center';
  return b;
};

// combos: [mode, detail, opts] — inv:02 §C1 anatomy
const COMBOS = [
  ['plain', 'default',     {}],
  ['plain', 'masked',      { masked: true }],                    // inv:02 §C1 masked balance → 4 dots fg.base
  ['plain', 'chip',        { chip: 'default' }],                 // inv:02 §C1 contract chip 0x1234…abcd + Copy 11
  ['plain', 'chip-copied', { chip: 'copied' }],                  // inv:02 §C1 copied → "Copied" + Check 11 success
  ['plain', 'no-fiat',     { fiat: false }],                     // inv:02 §C1 unpriced lists
  ['checkbox-off', 'default', { checkbox: 'off' }],              // inv:02 §C1 22px circle 2px border.strong
  ['checkbox-on', 'selected', { checkbox: 'on', selected: true }], // inv:02 §C1 selected row fill accent.soft
];

const made = [];
let x = 5000;
for (const [mode, detail, o] of COMBOS) {
  const b = penpot.createBoard();
  b.name = mode + ' ' + detail;
  b.x = x; b.y = 7000; x += 342 + 60;
  b.resize(342, 64);                                 // row padV 12 + 40 logo — inv:02 §C1
  b.borderRadius = 12;                               // radius 12 for pressed/selected tint — inv:02 §C1
  b.fills = o.selected ? [{ fillColor: ACCENT_SOFT, fillOpacity: 1 }] : [];

  const left = penpot.createBoard();
  left.name = 'left'; left.fills = [];
  if (o.checkbox) {                                  // leading multi-select checkbox — inv:02 §C1
    const cb = penpot.createBoard();
    cb.name = 'checkbox ' + o.checkbox;
    cb.resize(22, 22); cb.borderRadius = 11;
    if (o.checkbox === 'on') {
      cb.fills = [{ fillColor: ACCENT, fillOpacity: 1 }];
      cb.appendChild(icon('Check', 13, 3, '#FFFFFF')); // check 13 sw3 white — inv:02 §C1
      const cfl = cb.addFlexLayout();
      cfl.dir = 'row'; cfl.alignItems = 'center'; cfl.justifyContent = 'center';
      try { lib.bindToken(cb, 'color.accent.base', ['fill']); } catch (e) {}
    } else {
      cb.fills = [];
      cb.strokes = [{ strokeColor: STRONG, strokeWidth: 2, strokeAlignment: 'inner' }];
    }
    left.appendChild(cb);
  }
  const logo = penpot.createEllipse();               // TokenLogo 40px fixed — inv:02 §C1
  logo.name = 'TokenLogo 40';
  logo.resize(40, 40);
  logo.fills = [{ fillColor: SUNKEN, fillOpacity: 1 }];
  left.appendChild(logo);

  const info = col('info', 3);                       // info column gap 3 — inv:02 §C1
  const isChip = !!o.chip;
  const sym = o.checkbox ? 'USDC' : (isChip ? 'USDC' : 'ETH');
  const chain = o.checkbox ? 'Base' : 'Ethereum';
  info.appendChild(txt(sym, 15, 600, INK));          // symbol text.lg semibold fg.base — inv:02 §C1
  info.appendChild(txt(chain, 11, 400, SUBTLE));     // chain text.sm regular fg.subtle — inv:02 §C1
  if (isChip) {                                      // contract chip: bg.sunken pill, mono 10 — inv:02 §C1
    const chip = penpot.createBoard();
    chip.name = 'contract-chip';
    chip.fills = [{ fillColor: SUNKEN, fillOpacity: 1 }];
    chip.borderRadius = 999;
    chip.resize(96, 18);
    chip.appendChild(txt(o.chip === 'copied' ? 'Copied' : '0xA0b8…eB48', 10, 500, MUTED, 'mono'));
    chip.appendChild(o.chip === 'copied'
      ? icon('Check', 11, 2.6, SUCCESS)              // copied → Check 11 success — inv:02 §C1, §0b.5
      : icon('Copy', 11, 2, SUBTLE));
    const chfl = chip.addFlexLayout();
    chfl.dir = 'row'; chfl.alignItems = 'center'; chfl.columnGap = 3;
    try { chfl.verticalPadding = 2; chfl.horizontalPadding = 4; } catch (e) {} // padding 4/2 — inv:02 §C1
    try { lib.bindToken(chip, 'color.bg.sunken', ['fill']); } catch (e) {}
    info.appendChild(chip);
  }
  left.appendChild(info);
  const lfl = left.addFlexLayout();
  lfl.dir = 'row'; lfl.alignItems = 'center'; lfl.columnGap = 12; // row gap 12 — inv:02 §C1

  const values = col('values', 2, true);             // values right-aligned gap 2 — inv:02 §C1
  if (o.masked) {
    values.appendChild(maskedDots(INK));             // masked balance → 4 dots fg.base — inv:02 §C1
  } else {
    const bal = o.checkbox ? '1,250.00' : (isChip ? '1,250.00' : '0.4521');
    values.appendChild(txt(bal, 15, 600, INK));      // balance text.lg semibold font.numeric — inv:02 §C1 (numeric = PJ, §Z-2)
  }
  if (o.fiat !== false) {
    const fiat = o.checkbox || isChip ? '$1,250.00' : '$1,203.18';
    values.appendChild(txt(fiat, 11, 400, MUTED));   // fiat text.sm regular numeric fg.muted — inv:02 §C1
  }

  b.appendChild(left);
  b.appendChild(values);
  const fl = b.addFlexLayout();
  fl.dir = 'row'; fl.alignItems = 'center'; fl.justifyContent = 'space-between';
  try { fl.verticalPadding = 12; fl.horizontalPadding = 8; } catch (e) {} // padV 12 padH 8 — inv:02 §C1
  try { if (o.selected) lib.bindToken(b, 'color.accent.soft', ['fill']); } catch (e) {}

  made.push(penpot.library.local.createComponent([b]));
}
await lib.sleep(400);
const container = penpot.createVariantFromComponents(made.map(m => m.mainInstance()));
await lib.sleep(500);
container.name = FAMILY;
container.x = 1400; container.y = 1000;              // agent slot: final col 1400, y 1000
const vv = container.variants;
vv.renameProperty(0, 'mode');
vv.addProperty();
await lib.sleep(300);
vv.renameProperty(1, 'detail');
await lib.sleep(200);
for (const vc of container.variants.variantComponents()) {
  const parts = String(Object.values(vc.variantProps)[0] || '').split(' ');
  if (parts.length === 2) {
    vc.setVariantProperty(0, parts[0]);
    vc.setVariantProperty(1, parts[1]);
  }
}
await lib.sleep(300);
lib.chip(container, 'motion', 'press = scale 0.98 spring(d15 s150 m0.8); entrance fadeIn(index×40ms, 300) iOS-only'); // inv:02 §C1 motion, §Z-8
lib.chip(container, 'note', 'axes collapsed: state pressed→motion chip (rest tint undocumented, inv 02 §C1); 3×2×3×2×3=108 matrix → 7 documented combos; list separator = C/Rows/Divider inset-60 owned by lists');
lib.chip(container, 'note', 'selected-row canon: trailing accent check, de-boxed no fill = canonical; accent-border card rows (CurrencySheet/NetworkFilterSheet) = legacy; checkbox-mode accent.soft fill is the multi-select exception (inv 02 §Z-4)');
const errs = container.variants.variantComponents().filter(vc => vc.variantError).length;
return lib.done('32-components-rows-a', { family: FAMILY, variants: made.length, variantErrors: errs });
