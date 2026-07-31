if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
// 62-screens-wallet-rest-c.js — S/token-detail/default (screen index 3 → y 2850)
//   + S/add-token/erc20-form + S/add-token/erc20-resolving (screen index 4 → y 3800, cols 0–1).
// Visual truth: inv:05 §5 (TokenDetailScreen), inv:05 §7 (AddTokenScreen host + copy set),
// inv:02 D5 (AddTokenPanel anatomy), inv:05 §1.1–§1.3 (tokens), inv:05 §8.17 (VelaButton).
// Token data: Base USDC 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (src/models/chains.ts for chains).
// Idempotent: upsert-by-name; use() composes from the library, degrading to a named MISSING holder
// board that still carries the full depiction and self-upgrades on a later run.
const lib = storage.lib;
const PAGE = '05 Screens · Wallet';

const INK = '#1A1A18', MUTED = '#6E6B62', SUBTLE = '#8C887E';
const BG = '#FAFAF8', RAISED = '#FFFFFF', SUNKEN = '#F5F3EF';
const ACCENT = '#E8572A', OK = '#2D8E5F', ERR = '#C62828', ERRSOFT = '#FEF2F2';
const LINE = '#ECEBE4', LINE2 = '#D8D6CE';
const W = 390, SH = 844, GUT = 24, CW = 342;

const missing = [];
let overrides = 0;

const t = (p, n, text, size, weight, color, x, y, zone) =>
  lib.upsertText(p, n, { text, size, weight, color, x, y, zone: zone || 'sans' }).text;
const r = (p, n, s) => lib.upsertRect(p, n, s).rect;
const ico = (p, l, size, sw, x, y, c) => {
  const s = r(p, 'icon:' + l + ' ' + size + '/' + sw, { x, y, w: size, h: size, stroke: c || INK, strokeWidth: sw });
  s.fills = [];
  return s;
};
const hair = (p, n, x, y, w) => r(p, n, { x, y, w, h: 1, fill: LINE });
const wEst = (s, size, weight) => Math.round(String(s).length * size * ((weight || 400) >= 600 ? 0.575 : 0.54));
const cx = (s, size, weight) => Math.round((W - wEst(s, size, weight)) / 2);
const label = (p, n, text, x, y) => { // SectionLabel — 11 semibold fg.subtle ls 0.6 (inv:05 §8.18)
  const s = t(p, n, text, 11, 600, SUBTLE, x, y);
  try { s.letterSpacing = '0.6'; } catch (e) {}
  return s;
};
const flabel = (p, n, text, x, y) => { // AddTokenPanel field label — 11 semibold fg.muted ls 0.8 (inv:02 D5)
  const s = t(p, n, text, 11, 600, MUTED, x, y);
  try { s.letterSpacing = '0.8'; } catch (e) {}
  return s;
};
const use = (board, family, props, x, y, w, h, key, draw, fit) => {
  const base = family + (key ? ' ' + key : '');
  const useN = lib.norm('use:' + base), missN = lib.norm('MISSING:' + base);
  let slot = penpotUtils.findShape(sh => sh.type === 'board' && (sh.name === useN || sh.name === missN), board);
  if (!slot) { slot = penpot.createBoard(); slot.name = 'use:' + base; board.appendChild(slot); }
  if (Math.round(slot.width) !== w || Math.round(slot.height) !== h) slot.resize(w, h);
  penpotUtils.setParentXY(slot, x, y);
  slot.fills = [];
  const wasMissing = slot.name === missN;
  if ((slot.children || []).length && !wasMissing) return slot;
  const inst = lib.instance(family, props, slot, 0, 0);
  if (inst) {
    if (fit) { try { inst.resize(w, h); } catch (e) {} }
    for (const ch of (slot.children || [])) if (ch.id !== inst.id) ch.remove();
    slot.name = 'use:' + base;
    return slot;
  }
  slot.name = 'MISSING:' + base;
  if (missing.indexOf(base) < 0) missing.push(base);
  if (draw) draw(slot);
  return slot;
};
const relabel = (slot, values) => {
  try {
    const ts = penpotUtils.findShapes(sh => sh.type === 'text', slot) || [];
    values.forEach((v, i) => { if (v != null && ts[i] && ts[i].characters !== v) ts[i].characters = v; });
  } catch (e) { overrides++; }
};
const tint = (slot, color) => {
  try {
    const s = penpotUtils.findShape(sh => sh.type === 'ellipse' || sh.type === 'rectangle', slot);
    if (s) s.fills = [{ fillColor: color, fillOpacity: 1 }];
  } catch (e) { overrides++; }
};
// VelaButton fallback painter — inv:05 §8.17 (radius 16, padV 16, label text.lg semibold)
const btnDraw = (variant, text, state) => (slot) => {
  const fill = variant === 'primary' ? INK : (variant === 'accent' ? ACCENT : null);
  const box = r(slot, 'button', { x: 0, y: 0, w: slot.width, h: slot.height, radius: 16, fill: fill || undefined });
  if (!fill) { box.fills = []; box.strokes = [{ strokeColor: LINE2, strokeWidth: 1.5, strokeAlignment: 'inner' }]; }
  if (state === 'loading') r(slot, 'spinner', { x: Math.round(slot.width / 2) - 9, y: Math.round(slot.height / 2) - 9, w: 18, h: 18, radius: 9, fill: fill ? '#FFFFFF' : INK });
  else t(slot, 'label', text, 15, 600, fill ? '#FFFFFF' : INK, Math.round((slot.width - wEst(text, 15, 600)) / 2), Math.round(slot.height / 2) - 10);
  if (state === 'disabled' || state === 'loading') slot.opacity = 0.45;
};

// ════════════════════════════════════════════════ S/token-detail/default (col 0, row 3)
{
  const { board } = await lib.upsertBoard(PAGE, 'S/token-detail/default', { x: 0, y: 2850, w: W, h: SH, fill: BG });
  ico(board, 'ArrowLeft', 24, 2, GUT, 58, INK);
  t(board, 'nav-title', 'USDC', 17, 700, INK, cx('USDC', 17, 700), 57); // centered symbol — inv:05 §5

  // 1. hero (open, no card) — 44 TokenLogo (chain-badged) + symbol/chain, then the balance
  const logo = use(board, 'C/Media/TokenLogo', { badge: 'chain', fallback: 'image', size: '44' },
    GUT, 112, 44, 44, 'usdc-base', (sl) => {
      r(sl, 'image:token-logo USDC 44', { x: 0, y: 0, w: 44, h: 44, radius: 22, fill: '#2775CA' });
      r(sl, 'badge-ring', { x: 22, y: 22, w: 24, h: 24, radius: 12, fill: BG });
      r(sl, 'image:chain-logo Base badge 20', { x: 24, y: 24, w: 20, h: 20, radius: 10, fill: '#0052FF' });
    });
  tint(logo, '#2775CA');
  t(board, 'hero-symbol', 'USDC', 15, 700, INK, 80, 114);   // text.lg bold
  t(board, 'hero-chain', 'Base', 11, 500, SUBTLE, 80, 136); // text.sm medium fg.subtle

  // AmountText: integer text.4xl display-bold ls −0.8, unit ticker subordinated at 0.56× — inv:05 §5/§8.19
  const bal = t(board, 'balance-amount', '1,240.00', 32, 700, INK, GUT, 176);
  try { bal.letterSpacing = '-0.8'; } catch (e) {}
  t(board, 'balance-unit', 'USDC', 18, 700, SUBTLE, GUT + wEst('1,240.00', 32, 700) + 8, 190);
  // fiat line is PLAIN text (NOT AmountText) — the fit cascade flickered on this short line
  t(board, 'fiat-annotation', '≈ $1,240.00', 20, 600, MUTED, GUT, 226);

  // 2. action row — two flex-1 VelaButtons
  const send = use(board, 'C/Primitives/VelaButton', { variant: 'primary', size: 'default', state: 'default' },
    GUT, 272, 165, 53, 'token-send', btnDraw('primary', 'Send'), true);
  relabel(send, ['Send']);
  const recv = use(board, 'C/Primitives/VelaButton', { variant: 'secondary', size: 'default', state: 'default' },
    201, 272, 165, 53, 'token-receive', btnDraw('secondary', 'Receive'), true);
  relabel(recv, ['Receive']);

  // 3. details — open rows padV 12, section padH 12, hairlines between
  const ROWS = [
    ['Name', 'USD Coin', null, 'sans'],
    ['Contract', '0x8335…2913', 'Copy', 'mono'],
    ['Decimals', '6', null, 'sans'],
    ['Price', '1 USDC = $1.00', null, 'sans'],
    ['Transactions', 'View on Explorer', 'ExternalLink', 'sans'],
  ];
  ROWS.forEach(([k, v, trailing, face], i) => {
    const y = 352 + i * 41;
    t(board, 'detail-label ' + k, k, 11, 400, SUBTLE, 36, y + 12);
    const tw = wEst(v, 11, 500);
    const vx = 354 - tw - (trailing ? 18 : 0);
    t(board, 'detail-value ' + k, v, 11, 500, trailing === 'ExternalLink' ? MUTED : INK, vx, y + 12, face);
    if (trailing) ico(board, trailing, 12, 2, 354 - 12, y + 12, SUBTLE);
    if (i < ROWS.length - 1) hair(board, 'hairline inset-12 ' + i, 36, y + 40, 318);
  });

  lib.chip(board, 'note', 'detail rows here are text.sm(11) REGULAR fg.subtle label / MEDIUM ink value — NOT C/Rows/DetailRow (text.base 13, muted/semibold). Screen-local recipe, inv:05 §5 vs inv:02 A4');
  lib.chip(board, 'note', 'every row is conditional: Name only when name ≠ symbol; Contract/Decimals/Price/Transactions only when the param exists (native coins drop Contract)');
  lib.chip(board, 'note', 'fiat line is PLAIN text.2xl semibold display fg.muted — deliberately NOT AmountText (the fit cascade flickered/shrank this short line); it is an annotation, not a hero');
  lib.chip(board, 'note', 'no loading / empty / error state exists — every value arrives through route params');
  lib.chip(board, 'note', 'hairlines are C/Rows/Divider inset-12 (section padH 12); nav spacer is 50 on this screen, not 40');
  lib.chip(board, 'motion', 'hero fadeIn(0,400) · actions fadeInDown(100,400) · details fadeInDown(200,400) — iOS only, once per mount (inv:05 §1.3)');
  lib.chip(board, 'edge', 'tap Send -> S/send/details (preselectedSymbol + preselectedNetwork prefill)');
  lib.chip(board, 'edge', 'tap Receive -> S/receive/address');
  lib.chip(board, 'edge', 'tap Contract -> copies, Copy 12 swaps to Check 12 success for ~1.5s');
  lib.chip(board, 'edge', 'tap Transactions -> external explorer, token-scoped when a contract exists else address-scoped');
}

// ── AddTokenScreen host chrome + panel painter — inv:05 §7, inv:02 D5 ───────────────────
const addTokenNav = (board) => {
  ico(board, 'ArrowLeft', 24, 2, GUT, 58, INK);
  t(board, 'nav-title', 'Add Token', 17, 700, INK, cx('Add Token', 17, 700), 57);
};
// ⚠ legacy control style (inv:02 §Z-6): sunken track + raised active chip with an ACCENT label
const panelTabs = (sl, tab) => {
  r(sl, 'tab-track', { x: 0, y: 0, w: CW, h: 42, radius: 12, fill: SUNKEN });
  const aw = Math.round((CW - 6) / 2);
  [['ERC-20 Token', 'erc20'], ['Native Token', 'network']].forEach(([lb, key], i) => {
    const x = 3 + i * aw, on = tab === key;
    if (on) r(sl, 'tab-active-chip', { x, y: 3, w: aw, h: 36, radius: 8, fill: RAISED });
    const lw = wEst(lb, 11, 600) + (i === 1 ? 20 : 0);
    const lx = Math.round(x + (aw - lw) / 2);
    if (i === 1) ico(sl, 'Globe', 14, 2, lx, 14, on ? ACCENT : SUBTLE); // network tab carries Globe 14
    t(sl, 'tab-label ' + key, lb, 11, 600, on ? ACCENT : SUBTLE, i === 1 ? lx + 20 : lx, 15);
  });
};
// input recipe — bg.sunken, radius 12, 1px border.base, padding 16, text.base medium mono
const panelInput = (sl, name, value, filled, y, scan) => {
  r(sl, name, { x: 0, y, w: CW, h: 52, radius: 12, fill: SUNKEN, stroke: LINE, strokeWidth: 1 });
  t(sl, name + ' value', value, 13, 500, filled ? INK : SUBTLE, 16, y + 18, 'mono');
  if (scan) ico(sl, 'ScanLine', 20, 2, CW - 40, y + 16, SUBTLE);
};

// ════════════════════════════════════════════════ S/add-token/erc20-form (col 0, row 4)
{
  const { board } = await lib.upsertBoard(PAGE, 'S/add-token/erc20-form', { x: 0, y: 3800, w: W, h: SH, fill: BG });
  addTokenNav(board);
  use(board, 'C/Sheets/AddTokenPanel', { tab: 'erc20', result: 'none', compat: 'pass' },
    GUT, 104, CW, 340, 'erc20-form', (sl) => {
      panelTabs(sl, 'erc20');
      flabel(sl, 'field-label', 'CONTRACT ADDRESS', 0, 62);
      panelInput(sl, 'input-address', '0x…', false, 86, true);
      const btn = use(sl, 'C/Primitives/VelaButton', { variant: 'secondary', size: 'default', state: 'disabled' },
        0, 158, CW, 53, 'search-token', btnDraw('secondary', 'Search Token', 'disabled'), true);
      relabel(btn, ['Search Token']);
      label(sl, 'label-manage', 'YOUR CUSTOM TOKENS', 0, 238);
      r(sl, 'custom-token-row', { x: 0, y: 262, w: CW, h: 64, radius: 12, fill: RAISED, stroke: LINE, strokeWidth: 1 });
      t(sl, 'custom-symbol', 'PEPE', 13, 600, INK, 12, 276);
      t(sl, 'custom-meta', 'Pepe · Ethereum', 11, 400, MUTED, 12, 298);
      r(sl, 'delete-square', { x: 294, y: 276, w: 36, h: 36, radius: 8, fill: ERRSOFT });
      ico(sl, 'Trash2', 18, 2, 303, 285, ERR);
    });

  lib.chip(board, 'note', 'body = C/Sheets/AddTokenPanel — the SAME panel is presented as O/add-token-sheet/form; the two surfaces MUST share one component (inv:05 §7 drift note)');
  lib.chip(board, 'note', '⚠ legacy control style (inv:02 §Z-6): sunken track + raised active chip with an ACCENT label + shadow.sm — this is NOT C/Controls/SegmentedToggle, the app-wide tab control');
  lib.chip(board, 'note', 'ERC-20 field placeholder copy is NOT captured in the inventory — depicted as "0x…"; the section label "YOUR CUSTOM TOKENS" is likewise a depiction (inv:02 D5 names the Manage section without quoting it)');
  lib.chip(board, 'note', 'manage row: bg.raised + 1px border.base + radius 12, symbol text.base semibold over "Name · Network"; delete = 36×36 radius 8 error.soft square with Trash2 18 error.base');
  lib.chip(board, 'platform', 'full-screen host = ScreenContainer 24 gutters + nav (ArrowLeft 40×40 · title · 50 spacer); the sheet host uses padH 20 and an 18px ✕ header instead');
  lib.chip(board, 'edge', 'valid contract address entered or scanned -> S/add-token/erc20-resolving');
  lib.chip(board, 'edge', 'tap the scan affordance -> O/qr-scanner/scanning-native');
  lib.chip(board, 'edge', 'tap Native Token tab -> S/add-token/network-search');
}

// ════════════════════════════════════════════════ S/add-token/erc20-resolving (col 1, row 4)
{
  const { board } = await lib.upsertBoard(PAGE, 'S/add-token/erc20-resolving', { x: 450, y: 3800, w: W, h: SH, fill: BG });
  addTokenNav(board);
  use(board, 'C/Sheets/AddTokenPanel', { tab: 'erc20', result: 'none', compat: 'pass' },
    GUT, 104, CW, 240, 'erc20-resolving', (sl) => {
      panelTabs(sl, 'erc20');
      flabel(sl, 'field-label', 'CONTRACT ADDRESS', 0, 62);
      panelInput(sl, 'input-address', '0x833589fCD6eDb…54bdA02913', true, 86, true);
      const btn = use(sl, 'C/Primitives/VelaButton', { variant: 'secondary', size: 'default', state: 'loading' },
        0, 158, CW, 53, 'search-token', btnDraw('secondary', 'Search Token', 'loading'), true);
      relabel(btn, [null]);
    });

  lib.chip(board, 'note', 'multi-chain auto-detect: ONE pasted contract is probed on every supported network at once — the result set is a card per network found');
  lib.chip(board, 'note', 'the fetch button is a SECONDARY VelaButton (disabled until the address parses); accent is reserved for the per-result "Add to Wallet" commit');
  lib.chip(board, 'motion', 'VelaButton loading = spinner replaces the label at 0.45 opacity; the input stays editable');
  lib.chip(board, 'edge', 'contract resolves on >=1 network -> S/add-token/erc20-resolved');
  lib.chip(board, 'edge', 'contract resolves nowhere / not an ERC-20 -> S/add-token/erc20-error ("Not Found")');
}

return lib.done('62-screens-wallet-rest-c', {
  boards: ['S/token-detail/default', 'S/add-token/erc20-form', 'S/add-token/erc20-resolving'],
  missingFamilies: missing, overrideFailures: overrides,
});
