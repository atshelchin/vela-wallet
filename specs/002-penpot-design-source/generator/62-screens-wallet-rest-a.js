if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
// 62-screens-wallet-rest-a.js — S/receive/address + S/receive/request (manifest screen index 2 → y 1900).
// Visual truth: inv:05 §4 (ReceiveScreen) with inv:05 §1.1–§1.3 (tokens), inv:03 §7.2 (QRCode),
// inv:03 §7.5 (ReceiveRequestControls), inv:05 §8.18 (SectionLabel). Chain data = src/models/chains.ts
// (12 supported networks) — the inventory never enumerates them.
// The first-visit warning gate is deliberately NOT drawn here: manifest boards it as O/receive-gate.
// Idempotency: every shape upserts by name; library families are composed through use(), which
// degrades to a named MISSING holder board (still fully drawn, never silently omitted) and
// self-upgrades to a real instance on a later run once the family lands.
const lib = storage.lib;
const PAGE = '05 Screens · Wallet';

// ── palette / metrics — inv:05 §1.1, §1.3 ───────────────────────────────────
const INK = '#1A1A18', MUTED = '#6E6B62', SUBTLE = '#8C887E';
const BG = '#FAFAF8', RAISED = '#FFFFFF', SUNKEN = '#F5F3EF';
const ACCENT = '#E8572A', OK = '#2D8E5F';
const LINE = '#ECEBE4', LINE2 = '#D8D6CE';
const W = 390, SH = 844, GUT = 24, CW = 342; // gutters 24 = space.3xl — inv:05 §1.3

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
const label = (p, n, text, x, y) => { // SectionLabel: 11 semibold fg.subtle ls 0.6 — inv:05 §8.18
  const s = t(p, n, text, 11, 600, SUBTLE, x, y);
  try { s.letterSpacing = '0.6'; } catch (e) {}
  return s;
};

// Compose from the library FIRST (FR-005). Missing family → holder board named MISSING:<family>
// carrying a hand-drawn depiction; re-running upgrades it once the family exists.
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
const relabel = (slot, values) => { // instance text overrides (segment labels, CTA labels)
  try {
    const ts = penpotUtils.findShapes(sh => sh.type === 'text', slot) || [];
    values.forEach((v, i) => { if (v != null && ts[i] && ts[i].characters !== v) ts[i].characters = v; });
  } catch (e) { overrides++; }
};
const tint = (slot, color) => { // brand-colour the depicted logo art inside a Media instance
  try {
    const s = penpotUtils.findShape(sh => sh.type === 'ellipse' || sh.type === 'rectangle', slot);
    if (s) s.fills = [{ fillColor: color, fillOpacity: 1 }];
  } catch (e) { overrides++; }
};

// SegmentedToggle fallback painter — inv:05 §8.2 (transparent track, ONE floating raised chip)
const segDraw = (labels, active) => (slot) => {
  let x = 0;
  labels.forEach((l, i) => {
    const w = 32 + Math.round(l.length * 7);
    if (i === active) r(slot, 'active-chip', { x, y: 0, w, h: 44, radius: 22, fill: RAISED, stroke: LINE2, strokeWidth: 1 });
    t(slot, 'label ' + l, l, 13, 600, i === active ? INK : MUTED, x + 16, 14);
    x += w + 2;
  });
};
// QRCode fallback painter — inv:03 §7.2 / inv:05 §4 (literal-white plate, pad 20, r16, 1px border.base)
const qrDraw = (size) => (slot) => {
  r(slot, 'quiet-zone plate', { x: 0, y: 0, w: size + 40, h: size + 40, radius: 16, fill: '#FFFFFF', stroke: LINE, strokeWidth: 1 });
  r(slot, 'qr-matrix', { x: 20, y: 20, w: size, h: size, fill: '#000000' });
};

// 12 supported networks — src/models/chains.ts (displayName / chainId / iconColor)
const CHAINS = [
  ['Ethereum', 1, '#627EEA'], ['BNB Chain', 56, '#F0B90B'], ['Polygon', 137, '#8247E5'],
  ['Arbitrum', 42161, '#28A0F0'], ['Optimism', 10, '#FF0420'], ['Base', 8453, '#0052FF'],
  ['Avalanche', 43114, '#E84142'], ['Gnosis', 100, '#04795B'], ['Unichain', 130, '#F50DB4'],
  ['Tempo', 4217, '#0B0B0B'], ['Monad', 143, '#836EF9'], ['World Chain', 480, '#000000'],
];

// ── shared Receive chrome — inv:05 §4 (nav · mode toggle · QR block · identity) ─────────────
const nav = (b, title) => {
  ico(b, 'ArrowLeft', 24, 2, GUT, 58, INK);                       // 40×40 tap target — inv:05 §4
  t(b, 'nav-title', title, 17, 700, INK, cx(title, 17, 700), 57); // text.xl bold centered
};
const modeToggle = (b, active) => {
  const s = use(b, 'C/Controls/SegmentedToggle', { segments: 'two', active: active === 0 ? 'first' : 'second', adorn: 'none' },
    120, 104, 150, 44, 'receive-mode', segDraw(['Address', 'Request'], active));
  relabel(s, ['Address', 'Request']);                             // Address | Request — inv:05 §4
  return s;
};
const saveImage = (b, y) => { // secondary plain text-button — inv:05 §4
  ico(b, 'ImageDown', 17, 2, 152, y, MUTED);
  t(b, 'save-image', 'Save image', 11, 600, INK, 175, y + 3);
};

// ════════════════════════════════════════════════ S/receive/address (col 0, row 2)
{
  const { board } = await lib.upsertBoard(PAGE, 'S/receive/address', { x: 0, y: 1900, w: W, h: SH, fill: BG });
  nav(board, 'Receive');
  modeToggle(board, 0);
  use(board, 'C/Media/QRCode', { size: '200' }, 75, 164, 240, 240, 'address', qrDraw(200)); // 200 QR — inv:05 §4

  // post-acknowledgement decay of the warning gate — inv:05 §4
  const rem = 'Supported networks only — transfers on other networks may be lost.';
  t(board, 'gate-reminder', rem, 10, 400, SUBTLE, cx(rem, 10, 400), 416);
  t(board, 'account-name', 'Main Account', 20, 700, INK, cx('Main Account', 20, 700), 440); // text.2xl bold

  // copy row = THE accent action, de-boxed stretched row minH 44 padV 12 — inv:05 §4
  t(board, 'copy-address', '0x7A3fE2…c9D42b', 13, 500, INK, 125, 488, 'mono');
  ico(board, 'Copy', 18, 2, 247, 486, ACCENT);
  saveImage(board, 531);

  label(board, 'label-networks', 'SUPPORTED NETWORKS', GUT, 588);
  CHAINS.forEach(([name, id, color], i) => {                       // 22px logos in 34px transparent chips
    const s = use(board, 'C/Media/ChainLogo', { fallback: 'image', size: '22' },
      GUT + (i % 8) * 40, 616 + Math.floor(i / 8) * 40, 22, 22, name.toLowerCase(),
      (sl) => r(sl, 'disc', { x: 0, y: 0, w: 22, h: 22, radius: 11, fill: color }));
    tint(s, color);
  });
  t(board, 'networks-caption', 'One address across all 12 networks', 11, 400, SUBTLE, GUT, 700);

  lib.chip(board, 'note', 'QR quiet zone is literal #FFFFFF in BOTH themes (scanners need contrast) — inv:05 §4/§10');
  lib.chip(board, 'note', 'chip anatomy: 22 logo inside a 34 transparent full-radius chip with a RESERVED 1.5px border (no layout shift); active = accent border + accent.soft fill, all others dim to 0.4');
  lib.chip(board, 'note', 'active chip swaps the caption for "{Name} · Chain ID {id}" (text.sm semibold ink) + ExternalLink 13 → chain explorer');
  lib.chip(board, 'note', 'copy row = THE accent action (de-boxed stretched row, minH 44, padV 12); Save image is a plain secondary text-button (busy = 0.4 opacity, "Generating...")');
  lib.chip(board, 'motion', 'two sections fadeInDown(100,400) and (200,400), hasEntered-gated — iOS only; Android AND web render settled instantly (inv:05 §1.3)');
  lib.chip(board, 'platform', '/receive is a modal stack route; save-image = photo-library permission on native vs file download on web');
  lib.chip(board, 'edge', 'first visit, ack flag false -> O/receive-gate/default (covers the QR; copy+save disabled until acknowledged)');
  lib.chip(board, 'edge', 'ack flag still loading (null) -> gate covers with NO content (never flash the QR)');
  lib.chip(board, 'edge', 'copy tapped -> S/receive/copied');
  lib.chip(board, 'edge', 'balance poll finds a landed deposit (3s x 1min, then 60s until 5min) -> S/receive/deposit-detected');
  lib.chip(board, 'edge', 'toggle Request -> S/receive/request');
}

// ════════════════════════════════════════════════ S/receive/request (col 1, row 2)
{
  const { board } = await lib.upsertBoard(PAGE, 'S/receive/request', { x: 450, y: 1900, w: W, h: SH, fill: BG });
  nav(board, 'Receive');
  modeToggle(board, 1);
  use(board, 'C/Media/QRCode', { size: '200' }, 75, 164, 240, 240, 'request', qrDraw(200)); // EIP-681 payload

  t(board, 'account-name', 'Main Account', 20, 700, INK, cx('Main Account', 20, 700), 416);
  const addr = '0x12345678…abcdef';                                 // Request mode adds the receiving address
  t(board, 'receiving-address', addr, 11, 400, MUTED, cx(addr, 11, 400), 444, 'mono');

  // copy row copies the PUBLIC /pay web link, not the raw ethereum: URI — inv:05 §4
  t(board, 'copy-link', 'Copy payment link', 13, 600, ACCENT, 118, 476);
  ico(board, 'Copy', 18, 2, 253, 474, ACCENT);
  saveImage(board, 514);

  // lower half = ReceiveRequestControls — inv:03 §7.5
  use(board, 'C/Controls/ReceiveRequestControls', null, GUT, 556, CW, 196, null, (sl) => {
    label(sl, 'label-token', 'TOKEN', 0, 0);
    r(sl, 'image:token-logo USDC 32', { x: 0, y: 24, w: 32, h: 32, radius: 16, fill: '#2775CA' });
    r(sl, 'badge-ring', { x: 18, y: 42, w: 18, h: 18, radius: 9, fill: BG });
    r(sl, 'image:chain-logo Base badge 14', { x: 20, y: 44, w: 14, h: 14, radius: 7, fill: '#0052FF' });
    t(sl, 'asset-symbol', 'USDC', 13, 600, INK, 44, 26);
    t(sl, 'asset-network', 'Base', 11, 400, MUTED, 44, 46);
    ico(sl, 'ChevronDown', 18, 2, 324, 33, MUTED);
    hair(sl, 'hairline full', 0, 70, CW);
    label(sl, 'label-amount', 'AMOUNT', 0, 84);
    r(sl, 'amount-chip', { x: 0, y: 108, w: CW, h: 48, radius: 12, fill: SUNKEN });
    t(sl, 'amount-value', '25.00', 15, 600, INK, 12, 124);
    t(sl, 'amount-symbol', 'USDC', 13, 600, MUTED, 296, 126);
    t(sl, 'amount-hint', 'Leave blank to let the sender choose the amount', 10, 400, SUBTLE, 0, 168);
  });

  lib.chip(board, 'note', 'copy copies the PUBLIC pay link (wallet.getvela.app/pay?…), NOT the raw ethereum: URI — inv:05 §4, inv:04 §4');
  lib.chip(board, 'note', 'asset row opens the shared TokenSelector fed with EVERY token incl. zero-balance/custom, hideTotals (you can request what you do not hold)');
  lib.chip(board, 'note', 'QR + summary + pay-link rebuild live as token/amount change; blank amount = sender chooses');
  lib.chip(board, 'motion', 'switching modes swaps the lower block WITHOUT remount — entrances never replay (hasEntered ref)');
  lib.chip(board, 'edge', 'tap asset row -> O/token-selector-sheet/default');
  lib.chip(board, 'edge', 'copy tapped -> S/receive/copied');
  lib.chip(board, 'edge', 'toggle Address -> S/receive/address');
  lib.chip(board, 'edge', 'tap Save image -> C/Media/ReceiveShareCard (variant=request) capture -> saved/downloaded alert');
}

return lib.done('62-screens-wallet-rest-a', {
  boards: ['S/receive/address', 'S/receive/request'],
  missingFamilies: missing, overrideFailures: overrides,
});
