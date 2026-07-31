// 32-components-rows-b.js — C/Rows/ActivityRow variant family.
// Manifest axes direction(2) × masked(2) × new(2) × time(2) × chain-badge(2) = 32 cells → built as the
// 6 combos the inventory documents; collapsed axes on a note chip. inv:02 §C2.
// NOTE (assignment drift): the orchestrator brief said "send/receive/swap/approve kinds × pending/confirmed/failed"
// — those axes are NOT in inv:02 §C2 (they belong to TransactionDetailSheet/TransactionReceipt, inv:02 §D17/§E1).
// Inventory is the only visual truth, so the documented direction/masked/new/time/badge axes are built instead.
if (!storage.lib) throw new Error('run 10-lib.js first');
const lib = storage.lib;
await lib.open('03 Components');

const FAMILY = 'C/Rows/ActivityRow';
if (penpot.library.local.components.some(c => c.name === lib.norm(FAMILY))) {
  return lib.done('32-components-rows-b', { skipped: 'family exists' });
}

// palette — inv:02 §0.1
const INK = '#1A1A18', MUTED = '#6E6B62', SUBTLE = '#8C887E';
const SUNKEN = '#F5F3EF', SUCCESS = '#2D8E5F', SUCCESS_SOFT = '#EDFAF2';

const icon = (name, size, sw, color) => {
  const r = penpot.createRectangle();
  r.name = 'icon:' + name + ' ' + size + '/' + sw;
  r.resize(size, size);
  r.fills = [];
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
const maskedDots = (color) => { // 4×7px dots — inv:02 §0b.4; success-tinted when incoming — inv:02 §C2
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

// combos: [direction, detail, opts] — inv:02 §C2
const COMBOS = [
  ['out', 'default',  {}],
  ['in',  'default',  {}],
  ['in',  'masked',   { masked: true }],   // masked dots success-tinted — inv:02 §C2
  ['in',  'glow',     { glow: true }],     // isNew full-row success.soft overlay — inv:02 §C2
  ['out', 'no-time',  { time: false }],    // time omitted on Home (date headers) — inv:02 §C2
  ['out', 'no-badge', { badge: false }],
];

const made = [];
let x = 5000;
for (const [dir, detail, o] of COMBOS) {
  const isIn = dir === 'in';
  const b = penpot.createBoard();
  b.name = dir + ' ' + detail;
  b.x = x; b.y = 7000; x += 342 + 60;
  b.resize(342, 78);                                  // padV 16, de-boxed edge-to-edge — inv:02 §C2
  b.fills = o.glow ? [{ fillColor: SUCCESS_SOFT, fillOpacity: 1 }] : []; // glow overlay — inv:02 §C2

  const left = penpot.createBoard();
  left.name = 'left'; left.fills = [];
  const av = penpot.createBoard();                    // avatar 44 circle bg.sunken / success.soft in — inv:02 §C2
  av.name = 'avatar 44';
  av.resize(44, 44); av.borderRadius = 22;
  av.fills = [{ fillColor: isIn ? SUCCESS_SOFT : SUNKEN, fillOpacity: 1 }];
  av.appendChild(isIn
    ? icon('ArrowDownLeft', 19, 2.2, SUCCESS)         // incoming arrow success.base — inv:02 §C2
    : icon('ArrowUpRight', 19, 2.2, SUBTLE));         // outgoing arrow fg.subtle — inv:02 §C2
  const afl = av.addFlexLayout();
  afl.dir = 'row'; afl.alignItems = 'center'; afl.justifyContent = 'center';
  left.appendChild(av);
  if (o.badge !== false) {                            // ChainLogo 18 badge (flattened beside avatar) — inv:02 §C2
    const badge = penpot.createEllipse();
    badge.name = 'ChainLogo 18';
    badge.resize(18, 18);
    badge.fills = [{ fillColor: SUNKEN, fillOpacity: 1 }];
    badge.strokes = [{ strokeColor: '#FFFFFF', strokeWidth: 2, strokeAlignment: 'outer' }]; // 2px bg.raised ring — inv:02 §C2
    left.appendChild(badge);
  }
  const content = penpot.createBoard();               // 3-line content col gap 3 — inv:02 §C2
  content.name = 'content'; content.fills = [];
  content.appendChild(txt(isIn ? 'Received' : 'Sent', 13, 600, MUTED)); // calm title fg.muted — inv:02 §C2
  content.appendChild(txt(isIn ? '0x12F8…9bC4' : '0x7A3f…D42b', 11, 500, MUTED, 'mono')); // counterparty mono — inv:02 §C2
  if (o.time !== false) content.appendChild(txt(isIn ? '5h ago' : '2h ago', 10, 400, SUBTLE)); // time xs fg.subtle — inv:02 §C2
  const cfl = content.addFlexLayout();
  cfl.dir = 'column'; cfl.rowGap = 3;
  left.appendChild(content);
  const lfl = left.addFlexLayout();
  lfl.dir = 'row'; lfl.alignItems = 'center'; lfl.columnGap = 12; // row gap 12 — inv:02 §C2

  const right = penpot.createBoard();
  right.name = 'right'; right.fills = [];
  if (o.masked) {
    right.appendChild(maskedDots(SUCCESS));           // masked incoming → success dots — inv:02 §C2
  } else {
    const amt = penpot.createBoard();
    amt.name = 'amount'; amt.fills = [];
    amt.appendChild(txt(isIn ? '125.00' : '0.0500', 17, 700, isIn ? SUCCESS : INK)); // amount text.xl bold — inv:02 §C2
    amt.appendChild(txt(isIn ? 'USDC' : 'ETH', 11, 600, MUTED)); // ticker subordinated 11 semibold — inv:02 §C2
    const amfl = amt.addFlexLayout();
    amfl.dir = 'row'; amfl.alignItems = 'end'; amfl.columnGap = 3;
    right.appendChild(amt);
  }
  right.appendChild(txt(isIn ? '$125.00' : '$90.21', 11, 500, MUTED)); // fiat sm medium no-shrink — inv:02 §C2
  const rfl = right.addFlexLayout();
  rfl.dir = 'column'; rfl.rowGap = 3; rfl.alignItems = 'end';

  b.appendChild(left);
  b.appendChild(right);
  const fl = b.addFlexLayout();
  fl.dir = 'row'; fl.alignItems = 'center'; fl.justifyContent = 'space-between';
  try { fl.verticalPadding = 16; fl.horizontalPadding = 2; } catch (e) {} // padV 16 padH 2 — inv:02 §C2
  try { if (o.glow) lib.bindToken(b, 'color.success.soft', ['fill']); } catch (e) {}

  made.push(penpot.library.local.createComponent([b]));
}
await lib.sleep(400);
const container = penpot.createVariantFromComponents(made.map(m => m.mainInstance()));
await lib.sleep(500);
container.name = FAMILY;
container.x = 1400; container.y = 1900;               // agent slot: family 2 → y 1900
const vv = container.variants;
vv.renameProperty(0, 'direction');
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
lib.chip(container, 'motion', 'press = scale 0.98 spring + hapticLight; glow fades out 1600ms; entrance fadeInDown(index×40, 300) iOS-only, once'); // inv:02 §C2 motion, §Z-8
lib.chip(container, 'note', 'axes collapsed: 2×2×2×2×2=32 → 6 documented combos; ticker rendered inside amount (only NUMBER fits-to-width, shrink floor 0.85); a11y = single spoken label (inv 02 §C2)');
lib.chip(container, 'note', 'ChainLogo 18 badge really overlaps avatar bottom-right (−2,−2) ringed 2px bg.raised — flattened beside avatar in this depiction (inv 02 §C2)');
const errs = container.variants.variantComponents().filter(vc => vc.variantError).length;
return lib.done('32-components-rows-b', { family: FAMILY, variants: made.length, variantErrors: errs });
