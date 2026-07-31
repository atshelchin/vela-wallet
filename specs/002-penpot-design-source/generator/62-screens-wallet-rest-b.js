if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
// 62-screens-wallet-rest-b.js — S/receive/copied + S/receive/deposit-detected (screen index 2 → y 1900).
// Visual truth: inv:05 §4 (ReceiveScreen: copied flip, deposit detection), inv:05 §1.1–§1.3 (tokens),
// inv:03 §7.2 (QRCode). Both boards are the Address mode frame from 62-…-a with one region swapped.
// Chain data = src/models/chains.ts. Idempotent: upsert-by-name everywhere; use() composes from the
// library and degrades to a named MISSING holder that still draws the real depiction.
const lib = storage.lib;
const PAGE = '05 Screens · Wallet';

const INK = '#1A1A18', MUTED = '#6E6B62', SUBTLE = '#8C887E';
const BG = '#FAFAF8', RAISED = '#FFFFFF';
const ACCENT = '#E8572A', OK = '#2D8E5F';
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
const label = (p, n, text, x, y) => {
  const s = t(p, n, text, 11, 600, SUBTLE, x, y);
  try { s.letterSpacing = '0.6'; } catch (e) {}
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
const segDraw = (labels, active) => (slot) => {
  let x = 0;
  labels.forEach((l, i) => {
    const w = 32 + Math.round(l.length * 7);
    if (i === active) r(slot, 'active-chip', { x, y: 0, w, h: 44, radius: 22, fill: RAISED, stroke: LINE2, strokeWidth: 1 });
    t(slot, 'label ' + l, l, 13, 600, i === active ? INK : MUTED, x + 16, 14);
    x += w + 2;
  });
};
const qrDraw = (size) => (slot) => {
  r(slot, 'quiet-zone plate', { x: 0, y: 0, w: size + 40, h: size + 40, radius: 16, fill: '#FFFFFF', stroke: LINE, strokeWidth: 1 });
  r(slot, 'qr-matrix', { x: 20, y: 20, w: size, h: size, fill: '#000000' });
};

const CHAINS = [
  ['Ethereum', 1, '#627EEA'], ['BNB Chain', 56, '#F0B90B'], ['Polygon', 137, '#8247E5'],
  ['Arbitrum', 42161, '#28A0F0'], ['Optimism', 10, '#FF0420'], ['Base', 8453, '#0052FF'],
  ['Avalanche', 43114, '#E84142'], ['Gnosis', 100, '#04795B'], ['Unichain', 130, '#F50DB4'],
  ['Tempo', 4217, '#0B0B0B'], ['Monad', 143, '#836EF9'], ['World Chain', 480, '#000000'],
];

// Address-mode frame shared by both boards — inv:05 §4
const frame = (board, key) => {
  ico(board, 'ArrowLeft', 24, 2, GUT, 58, INK);
  t(board, 'nav-title', 'Receive', 17, 700, INK, cx('Receive', 17, 700), 57);
  const seg = use(board, 'C/Controls/SegmentedToggle', { segments: 'two', active: 'first', adorn: 'none' },
    120, 104, 150, 44, 'receive-mode', segDraw(['Address', 'Request'], 0));
  relabel(seg, ['Address', 'Request']);
  use(board, 'C/Media/QRCode', { size: '200' }, 75, 164, 240, 240, key, qrDraw(200));
  const rem = 'Supported networks only — transfers on other networks may be lost.';
  t(board, 'gate-reminder', rem, 10, 400, SUBTLE, cx(rem, 10, 400), 416);
  t(board, 'account-name', 'Main Account', 20, 700, INK, cx('Main Account', 20, 700), 440);
};
const saveImage = (b, y) => {
  ico(b, 'ImageDown', 17, 2, 152, y, MUTED);
  t(b, 'save-image', 'Save image', 11, 600, INK, 175, y + 3);
};

// ════════════════════════════════════════════════ S/receive/copied (col 2, row 2)
{
  const { board } = await lib.upsertBoard(PAGE, 'S/receive/copied', { x: 900, y: 1900, w: W, h: SH, fill: BG });
  frame(board, 'copied');

  // copied (2 s): text + icon flip to success.base "Copied" + Check 18 — inv:05 §4
  t(board, 'copy-address', 'Copied', 13, 500, OK, 146, 488);
  ico(board, 'Check', 18, 2.6, 200, 486, OK);
  saveImage(board, 531);

  label(board, 'label-networks', 'SUPPORTED NETWORKS', GUT, 588);
  CHAINS.forEach(([name, id, color], i) => {
    const s = use(board, 'C/Media/ChainLogo', { fallback: 'image', size: '22' },
      GUT + (i % 8) * 40, 616 + Math.floor(i / 8) * 40, 22, 22, name.toLowerCase(),
      (sl) => r(sl, 'disc', { x: 0, y: 0, w: 22, h: 22, radius: 11, fill: color }));
    tint(s, color);
  });
  t(board, 'networks-caption', 'One address across all 12 networks', 11, 400, SUBTLE, GUT, 700);

  lib.chip(board, 'note', 'ONLY the copy row changes: label + icon flip to success.base ("Copied" + Check 18). Success ink never spreads to the rest of the screen');
  lib.chip(board, 'note', 'Address mode copies the raw address; Request mode copies the public /pay link — same 2s flip either way (inv:05 §4)');
  lib.chip(board, 'note', 'copy/save actions stay DISABLED until the first-visit warning gate is acknowledged (O/receive-gate)');
  lib.chip(board, 'motion', 'copy fires a light haptic; no layout shift on the flip (icon + label swap in place)');
  lib.chip(board, 'edge', '2s timeout elapses -> S/receive/address');
  lib.chip(board, 'edge', 'toggle Request -> S/receive/request');
}

// ════════════════════════════════════════════════ S/receive/deposit-detected (col 3, row 2)
{
  const { board } = await lib.upsertBoard(PAGE, 'S/receive/deposit-detected', { x: 1350, y: 1900, w: W, h: SH, fill: BG });
  frame(board, 'deposit');

  t(board, 'copy-address', '0x7A3fE2…c9D42b', 13, 500, INK, 125, 488, 'mono');
  ico(board, 'Copy', 18, 2, 247, 486, ACCENT);
  saveImage(board, 531);

  // landed deposits append an OPEN hairline-topped section — inv:05 §4
  hair(board, 'hairline full deposits', GUT, 578, CW);
  const DEPOSITS = [
    ['14:32:08', '+25.00 USDC', 'Base  $25.00'],
    ['14:29:41', '+0.0250 ETH', 'Ethereum  $92.14'],
  ];
  DEPOSITS.forEach(([time, amount, meta], i) => {
    const y = 598 + i * 62;
    r(board, 'deposit-dot ' + i, { x: GUT, y: y + 4, w: 6, h: 6, radius: 3, fill: OK }); // 6px success dot
    t(board, 'deposit-time ' + i, time, 10, 400, MUTED, GUT + 14, y);                    // text.xs fg.muted
    t(board, 'deposit-amount ' + i, amount, 13, 600, OK, GUT + 14, y + 20);              // text.base semibold success
    t(board, 'deposit-meta ' + i, meta, 11, 500, MUTED, 366 - wEst(meta, 11, 500), y + 22);
  });

  label(board, 'label-networks', 'SUPPORTED NETWORKS', GUT, 736);
  t(board, 'networks-caption', 'One address across all 12 networks (strip continues below the fold)', 10, 400, SUBTLE, GUT, 762);

  lib.chip(board, 'note', 'rows inset past the dot (leading 14); success ink stays on the DOT + AMOUNT only — network/fiat stay fg.muted');
  lib.chip(board, 'note', 'the persistent lower half (SUPPORTED NETWORKS strip) is unchanged and simply scrolls below the deposits');
  lib.chip(board, 'note', 'deposit polling cadence: every 3s for 1 min, then every 60s until 5 min, then stops (screen-open only)');
  lib.chip(board, 'motion', 'deposit block fadeIn(0,300); a landing deposit fires the SUCCESS haptic');
  lib.chip(board, 'platform', 'polling runs only while the screen is focused; backgrounding the app suspends it (no push detection)');
  lib.chip(board, 'edge', 'poll window ends at 5 min -> S/receive/address (detection stops silently, entries stay)');
  lib.chip(board, 'edge', 'deposit also lands on Home as O/receipt-toast/default + a new S/home Activity row');
}

return lib.done('62-screens-wallet-rest-b', {
  boards: ['S/receive/copied', 'S/receive/deposit-detected'],
  missingFamilies: missing, overrideFailures: overrides,
});
