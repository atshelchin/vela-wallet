// 32-components-rows-c.js — C/Rows/DetailRow + C/Rows/Divider + C/Rows/SettingsRow families.
// DetailRow: trailing(none/copy/copied/open) × face(sans/mono/custom) → 9 documented combos. inv:02 §A4, inv:01 §20.
// Divider: 1px border.base; inset variants from the app-wide hairline formula. inv:02 §0b.3, inv:02 §A4, inv:06 drift-8.
// SettingsRow: the single Settings nav-row recipe. inv:06 §SettingsRow. Assignment asked for a "toggle" kind —
// NOT documented anywhere in inventory (Settings inline controls are SegmentedToggle / TextScaleSlider), so omitted.
// Idempotency: per-family skip-if-exists.
if (!storage.lib) throw new Error('run 10-lib.js first');
const lib = storage.lib;
await lib.open('03 Components');

// palette — inv:02 §0.1
const INK = '#1A1A18', MUTED = '#6E6B62', SUBTLE = '#8C887E';
const SUNKEN = '#F5F3EF', SUCCESS = '#2D8E5F', BORDER = '#ECEBE4';

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
const splitProps = (container, n) => {
  for (const vc of container.variants.variantComponents()) {
    const parts = String(Object.values(vc.variantProps)[0] || '').split(' ');
    if (parts.length === n) parts.forEach((p, i) => vc.setVariantProperty(i, p));
  }
};
const summary = {};

// ── Family 1: C/Rows/DetailRow ──────────────────────────────────────────────
const FAM_DETAIL = 'C/Rows/DetailRow';
let x = 5000;
if (!penpot.library.local.components.some(c => c.name === lib.norm(FAM_DETAIL))) {
  // combos: [face, trailing, label, value] — inv:02 §A4
  const COMBOS = [
    ['sans', 'none',   'Network', 'Ethereum'],
    ['sans', 'copy',   'Recipient', 'alice.eth'],
    ['sans', 'copied', 'Recipient', 'alice.eth'],
    ['sans', 'open',   'Explorer', 'etherscan.io'],
    ['mono', 'none',   'Chain ID', '1'],
    ['mono', 'copy',   'From', '0x7A3f…D42b'],
    ['mono', 'copied', 'From', '0x7A3f…D42b'],
    ['mono', 'open',   'Transaction hash', '0x4c8a…9f21'],
    ['custom', 'none', 'Status', ''],                 // custom cell = TxStatusBadge — inv:02 §A4 usage, §A5
  ];
  const made = [];
  for (const [face, trailing, label, value] of COMBOS) {
    const b = penpot.createBoard();
    b.name = face + ' ' + trailing;
    b.x = x; b.y = 7000; x += 342 + 60;
    b.resize(342, 45);                                // padV 12 — inv:02 §A4
    b.fills = [];
    b.appendChild(txt(label, 13, 400, MUTED));        // label text.base regular fg.muted — inv:02 §A4, inv:01 §20
    const right = penpot.createBoard();
    right.name = 'value-cell'; right.fills = [];
    if (face === 'custom') {                          // custom replaces value cell — inv:02 §A4; badge recipe inv:02 §A5
      right.appendChild(icon('CheckCircle2', 16, 2.4, SUCCESS));
      right.appendChild(txt('Confirmed', 13, 600, SUCCESS));
    } else {
      right.appendChild(txt(value, 13, 600, INK, face === 'mono' ? 'mono' : 'sans')); // value semibold, mono option — inv:02 §A4
      if (trailing === 'copy') right.appendChild(icon('Copy', 14, 2, SUBTLE));         // 14px affordance — inv:02 §A4, inv:01 §20
      if (trailing === 'copied') right.appendChild(icon('Check', 14, 2.6, SUCCESS));   // copied swap — inv:02 §A4, §0b.5
      if (trailing === 'open') right.appendChild(icon('ExternalLink', 14, 2, SUBTLE)); // open-in-explorer — inv:02 §A4
    }
    const rfl = right.addFlexLayout();
    rfl.dir = 'row'; rfl.alignItems = 'center'; rfl.columnGap = 6;
    b.appendChild(right);
    const fl = b.addFlexLayout();
    fl.dir = 'row'; fl.alignItems = 'center'; fl.justifyContent = 'space-between';
    fl.columnGap = 12;                                // row gap 12 — inv:02 §A4
    try { fl.verticalPadding = 12; } catch (e) {}     // padV 12 — inv:02 §A4
    made.push(penpot.library.local.createComponent([b]));
  }
  await lib.sleep(400);
  const container = penpot.createVariantFromComponents(made.map(m => m.mainInstance()));
  await lib.sleep(500);
  container.name = FAM_DETAIL;
  container.x = 1400; container.y = 2800;             // agent slot: family 3 → y 2800
  const vv = container.variants;
  vv.renameProperty(0, 'face');
  vv.addProperty();
  await lib.sleep(300);
  vv.renameProperty(1, 'trailing');
  await lib.sleep(200);
  splitProps(container, 2);
  await lib.sleep(300);
  lib.chip(container, 'note', 'value cell hitSlop 10, role button "Label: value" + actionHint; value 1 line, shrinks; copied resets after 1.5–2s (inv 02 §A4, §0b.5)');
  lib.chip(container, 'note', 'axes: manifest trailing×face=12 → 9 combos (custom face documented with custom cell only, inv 02 §A4)');
  summary.DetailRow = { variants: made.length, variantErrors: container.variants.variantComponents().filter(vc => vc.variantError).length };
} else summary.DetailRow = { skipped: 'family exists' };

// ── Family 2: C/Rows/Divider ────────────────────────────────────────────────
const FAM_DIV = 'C/Rows/Divider';
if (!penpot.library.local.components.some(c => c.name === lib.norm(FAM_DIV))) {
  // inset = row left padding + icon Ø + gap — inv:02 §0b.3; 66 = SettingsRow (inv:06 drift-8)
  const INSETS = [['full', 0], ['inset-36', 36], ['inset-48', 48], ['inset-60', 60], ['inset-66', 66]];
  const made = [];
  for (const [name, inset] of INSETS) {
    const b = penpot.createBoard();
    b.name = name;
    b.x = x; b.y = 7000; x += 342 + 60;
    b.resize(342, 8);
    b.fills = [];
    const hair = penpot.createRectangle();            // height 1, border.base — inv:02 §A4
    hair.name = 'hairline';
    hair.resize(342 - inset, 1);
    hair.fills = [{ fillColor: BORDER, fillOpacity: 1 }];
    try { lib.bindToken(hair, 'color.border.base', ['fill']); } catch (e) {}
    b.appendChild(hair);
    const fl = b.addFlexLayout();
    fl.dir = 'row'; fl.alignItems = 'center'; fl.justifyContent = 'end'; // inset from the left — inv:02 §0b.3
    made.push(penpot.library.local.createComponent([b]));
  }
  await lib.sleep(400);
  const container = penpot.createVariantFromComponents(made.map(m => m.mainInstance()));
  await lib.sleep(500);
  container.name = FAM_DIV;
  container.x = 1400; container.y = 3700;             // agent slot: family 4 → y 3700
  container.variants.renameProperty(0, 'inset');
  await lib.sleep(300);
  lib.chip(container, 'note', 'inset formula = row left pad + icon Ø + gap: 36 (28 logo+8), 48 (40 avatar+8 / 36 logo+12), 60 (8+40+12 token rows), 66 SettingsRow (math says 62 — undocumented drift, inv 06 §drift-8)');
  lib.chip(container, 'note', 'contextual insets also shipped: 56 ContactPicker (4+40+12), 58 ContactsManager (4+42+12) (inv 03 §5.2/§5.3)');
  summary.Divider = { variants: made.length, variantErrors: container.variants.variantComponents().filter(vc => vc.variantError).length };
} else summary.Divider = { skipped: 'family exists' };

// ── Family 3: C/Rows/SettingsRow ────────────────────────────────────────────
const FAM_SET = 'C/Rows/SettingsRow';
if (!penpot.library.local.components.some(c => c.name === lib.norm(FAM_SET))) {
  // combos: [kind, detail, iconName, title, subtitle, trailingIcon] — inv:06 §SettingsRow
  const COMBOS = [
    ['chevron', 'default', 'BookUser', 'Contacts', 'Manage saved addresses', 'ChevronRight'],
    ['chevron', 'value', 'Banknote', 'Currency', 'USD · $1,234.56', 'ChevronRight'],   // live-example subtitle — inv:06 §Localization
    ['external', 'last', 'MessageSquare', 'Send feedback', 'Report a bug or share an idea', 'ExternalLink'], // inv:06 §Account row 3
  ];
  const made = [];
  for (const [kind, detail, ic, title, sub, trail] of COMBOS) {
    const b = penpot.createBoard();
    b.name = kind + ' ' + detail;
    b.x = x; b.y = 7000; x += 342 + 60;
    b.resize(342, 66);                                // padding 16 all sides — inv:06 §SettingsRow
    b.fills = [];
    const left = penpot.createBoard();
    left.name = 'left'; left.fills = [];
    const chipB = penpot.createBoard();               // icon chip 34×34 r10 bg.sunken — inv:06 §SettingsRow
    chipB.name = 'icon-chip';
    chipB.resize(34, 34); chipB.borderRadius = 10;
    chipB.fills = [{ fillColor: SUNKEN, fillOpacity: 1 }];
    chipB.appendChild(icon(ic, 16, 2, MUTED));        // 16px Lucide in fg.muted, one quiet recipe — inv:06 §SettingsRow
    const chfl = chipB.addFlexLayout();
    chfl.dir = 'row'; chfl.alignItems = 'center'; chfl.justifyContent = 'center';
    try { lib.bindToken(chipB, 'color.bg.sunken', ['fill']); } catch (e) {}
    left.appendChild(chipB);
    const tcol = penpot.createBoard();
    tcol.name = 'text-col'; tcol.fills = [];
    tcol.appendChild(txt(title, 15, 600, INK));       // title text.lg semibold fg.base — inv:06 §SettingsRow
    tcol.appendChild(txt(sub, 11, 400, SUBTLE));      // subtitle text.sm regular fg.subtle — inv:06 §SettingsRow
    const tfl = tcol.addFlexLayout();
    tfl.dir = 'column'; tfl.rowGap = 2;               // gap 2 — inv:06 §SettingsRow
    left.appendChild(tcol);
    const lfl = left.addFlexLayout();
    lfl.dir = 'row'; lfl.alignItems = 'center'; lfl.columnGap = 12; // marginLeft 12 — inv:06 §SettingsRow
    b.appendChild(left);
    b.appendChild(icon(trail, 16, 2, SUBTLE));        // ChevronRight/ExternalLink 16 fg.subtle — inv:06 §SettingsRow
    const fl = b.addFlexLayout();
    fl.dir = 'row'; fl.alignItems = 'center'; fl.justifyContent = 'space-between';
    try { fl.verticalPadding = 16; fl.horizontalPadding = 16; } catch (e) {}
    made.push(penpot.library.local.createComponent([b]));
  }
  await lib.sleep(400);
  const container = penpot.createVariantFromComponents(made.map(m => m.mainInstance()));
  await lib.sleep(500);
  container.name = FAM_SET;
  container.x = 1400; container.y = 4600;             // agent slot: family 5 → y 4600
  const vv = container.variants;
  vv.renameProperty(0, 'kind');
  vv.addProperty();
  await lib.sleep(300);
  vv.renameProperty(1, 'detail');
  await lib.sleep(200);
  splitProps(container, 2);
  await lib.sleep(300);
  lib.chip(container, 'note', 'toggle kind NOT documented in inventory — Settings inline controls are SegmentedToggle / TextScaleSlider, never row switches (inv 06 §Settings); accent/semantic tints never on nav rows');
  lib.chip(container, 'note', 'divider = C/Rows/Divider inset-66 absolutely positioned at row bottom, showDivider=false on section-last rows; a11y label "title, subtitle" (inv 06 §SettingsRow)');
  summary.SettingsRow = { variants: made.length, variantErrors: container.variants.variantComponents().filter(vc => vc.variantError).length };
} else summary.SettingsRow = { skipped: 'family exists' };

return lib.done('32-components-rows-c', summary);
