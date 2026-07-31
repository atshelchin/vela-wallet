if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
// 62-screens-wallet-rest-e.js — S/add-token/network-checking · network-compatible · network-incompatible
// (manifest screen index 4 → y 3800, cols 5–7).
// Visual truth: inv:02 D5 (AddTokenPanel network flow: chain-info card, compat card elevated, check rows,
// deploy action), inv:05 §7 (copy set: "Checking compatibility..." / "Compatible" / "Not compatible with
// Vela Wallet"), inv:05 §1.1–§1.3 (tokens).
// AMBIGUITY: the individual compatibility CHECK-ROW labels and the deploy-action label are not quoted
// anywhere in the inventory — depicted generically and flagged on note chips.
// Idempotent: upsert-by-name; use() composes from the library, degrading to a named MISSING holder.
const lib = storage.lib;
const PAGE = '05 Screens · Wallet';

const INK = '#1A1A18', MUTED = '#6E6B62', SUBTLE = '#8C887E';
const BG = '#FAFAF8', RAISED = '#FFFFFF', SUNKEN = '#F5F3EF';
const ACCENT = '#E8572A', ASOFT = '#FFF0EB', OK = '#2D8E5F', ERR = '#C62828';
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
const wEst = (s, size, weight) => Math.round(String(s).length * size * ((weight || 400) >= 600 ? 0.575 : 0.54));
const cx = (s, size, weight) => Math.round((W - wEst(s, size, weight)) / 2);
const flabel = (p, n, text, x, y) => {
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
const tint = (slot, color) => {
  try {
    const s = penpotUtils.findShape(sh => sh.type === 'ellipse' || sh.type === 'rectangle', slot);
    if (s) s.fills = [{ fillColor: color, fillOpacity: 1 }];
  } catch (e) { overrides++; }
};
const cardDraw = (elev) => (slot) => {
  const c = r(slot, 'card', { x: 0, y: 0, w: slot.width, h: slot.height, radius: 16, fill: RAISED });
  if (elev !== 'elevated') c.strokes = [{ strokeColor: LINE, strokeWidth: 1, strokeAlignment: 'inner' }];
};

const addTokenNav = (board) => {
  ico(board, 'ArrowLeft', 24, 2, GUT, 58, INK);
  t(board, 'nav-title', 'Add Token', 17, 700, INK, cx('Add Token', 17, 700), 57);
};
const panelTabs = (sl, tab) => { // ⚠ legacy control style — inv:02 §Z-6 / D5
  r(sl, 'tab-track', { x: 0, y: 0, w: CW, h: 42, radius: 12, fill: SUNKEN });
  const aw = Math.round((CW - 6) / 2);
  [['ERC-20 Token', 'erc20'], ['Native Token', 'network']].forEach(([lb, key], i) => {
    const x = 3 + i * aw, on = tab === key;
    if (on) r(sl, 'tab-active-chip', { x, y: 3, w: aw, h: 36, radius: 8, fill: RAISED });
    const lw = wEst(lb, 11, 600) + (i === 1 ? 20 : 0);
    const lx = Math.round(x + (aw - lw) / 2);
    if (i === 1) ico(sl, 'Globe', 14, 2, lx, 14, on ? ACCENT : SUBTLE);
    t(sl, 'tab-label ' + key, lb, 11, 600, on ? ACCENT : SUBTLE, i === 1 ? lx + 20 : lx, 15);
  });
};
const panelInput = (sl, name, value, y, zone) => {
  r(sl, name, { x: 0, y, w: CW, h: 52, radius: 12, fill: SUNKEN, stroke: LINE, strokeWidth: 1 });
  t(sl, name + ' value', value, 13, 500, INK, 16, y + 18, zone || 'sans');
};
// chain-info card: 32 logo + name + "Chain ID: {id}" + editable RPC input — inv:02 D5
const chainInfo = (sl, y) => {
  use(sl, 'C/Primitives/VelaCard', { elevation: 'default' }, 0, y, CW, 150, 'chain-info', cardDraw('default'), true);
  const logo = use(sl, 'C/Media/ChainLogo', { fallback: 'colored-disc', size: '32' }, 20, y + 20, 32, 32, 'linea',
    (s2) => r(s2, 'disc', { x: 0, y: 0, w: 32, h: 32, radius: 16, fill: '#61DFFF' }));
  tint(logo, '#61DFFF'); // custom networks have no brand token in chains.ts — depicted from the Linea mark
  t(sl, 'chain-name', 'Linea', 15, 600, INK, 62, y + 22);
  t(sl, 'chain-id', 'Chain ID: 59144', 11, 400, SUBTLE, 62, y + 44);
  r(sl, 'rpc-input', { x: 20, y: y + 86, w: 302, h: 44, radius: 12, fill: SUNKEN, stroke: LINE, strokeWidth: 1 });
  t(sl, 'rpc-value', 'https://rpc.linea.build', 11, 500, INK, 32, y + 101, 'mono');
};
// compat check row: Check 14 success sw2.5 (ok, name → fg.base) / X 14 subtle (pending or failed)
const checkRow = (sl, key, name, state, y) => {
  if (state === 'ok') ico(sl, 'Check', 14, 2.5, 20, y, OK);
  else ico(sl, 'X', 14, 2, 20, y, state === 'fail' ? ERR : SUBTLE);
  t(sl, 'check-name ' + key, name, 11, 400, state === 'ok' ? INK : SUBTLE, 44, y + 1);
};
const CHECKS = ['EntryPoint v0.7', 'Safe singleton + factory', 'Bundler endpoint', 'Fee/price feed'];

// ════════════════════════════════════════════════ S/add-token/network-checking (col 5, row 4)
{
  const { board } = await lib.upsertBoard(PAGE, 'S/add-token/network-checking', { x: 2250, y: 3800, w: W, h: SH, fill: BG });
  addTokenNav(board);
  use(board, 'C/Sheets/AddTokenPanel', { tab: 'network', result: 'none', compat: 'pass' },
    GUT, 104, CW, 560, 'network-checking', (sl) => {
      panelTabs(sl, 'network');
      flabel(sl, 'field-label', 'NETWORK', 0, 62);
      panelInput(sl, 'input-network', 'Linea', 86);
      chainInfo(sl, 158);
      use(sl, 'C/Primitives/VelaCard', { elevation: 'elevated' }, 0, 328, CW, 210, 'compat', cardDraw('elevated'), true);
      flabel(sl, 'compat-title', 'COMPATIBILITY', 20, 348);
      t(sl, 'compat-status', 'Checking compatibility...', 13, 600, INK, 20, 372);
      CHECKS.forEach((c, i) => checkRow(sl, c, c, i === 0 ? 'ok' : 'pending', 402 + i * 32));
    });

  lib.chip(board, 'note', 'AMBIGUITY: the four check-row labels are NOT quoted in the inventory — depicted generically (EntryPoint / Safe factory / bundler / fee feed). Re-read AddTokenPanel before rebuilding this list');
  lib.chip(board, 'note', 'status copy is verbatim: "Checking compatibility..." (three dots, not an ellipsis glyph)');
  lib.chip(board, 'note', 'compat card is VelaCard ELEVATED (shadow.md, no border) while the chain-info card above it is the default bordered card — the elevation is the hierarchy signal');
  lib.chip(board, 'note', 'the RPC field inside the chain-info card is EDITABLE — a user-supplied endpoint is what the checks actually probe');
  lib.chip(board, 'motion', 'rows resolve one at a time: X 14 fg.subtle → Check 14 success.base sw2.5 and the name lifts fg.subtle → fg.base');
  lib.chip(board, 'edge', 'every check passes -> S/add-token/network-compatible');
  lib.chip(board, 'edge', 'any check fails -> S/add-token/network-incompatible');
  lib.chip(board, 'edge', 'RPC unreachable / serves a different chain -> inline error on the RPC field (same wording family as O/rpc-fix-form)');
}

// ════════════════════════════════════════════════ S/add-token/network-compatible (col 6, row 4)
{
  const { board } = await lib.upsertBoard(PAGE, 'S/add-token/network-compatible', { x: 2700, y: 3800, w: W, h: SH, fill: BG });
  addTokenNav(board);
  use(board, 'C/Sheets/AddTokenPanel', { tab: 'network', result: 'found', compat: 'pass' },
    GUT, 104, CW, 590, 'network-compatible', (sl) => {
      panelTabs(sl, 'network');
      flabel(sl, 'field-label', 'NETWORK', 0, 62);
      panelInput(sl, 'input-network', 'Linea', 86);
      chainInfo(sl, 158);
      use(sl, 'C/Primitives/VelaCard', { elevation: 'elevated' }, 0, 328, CW, 234, 'compat', cardDraw('elevated'), true);
      ico(sl, 'Check', 20, 2.5, 20, 350, OK);
      t(sl, 'compat-title', 'Compatible', 15, 700, OK, 48, 348); // text.lg bold success.base — inv:02 D5
      CHECKS.forEach((c, i) => checkRow(sl, c, c, 'ok', 386 + i * 32));
      // deploy action: accent.soft fill radius 12, centered padV 12, label sm semibold accent.base
      r(sl, 'deploy-action', { x: 20, y: 498, w: 302, h: 44, radius: 12, fill: ASOFT });
      t(sl, 'deploy-label', 'Add Network', 11, 600, ACCENT, Math.round(20 + (302 - wEst('Add Network', 11, 600)) / 2), 514);
    });

  lib.chip(board, 'note', 'AMBIGUITY: the deploy-action label is NOT quoted in the inventory ("accent.soft fill, sm semibold accent.base" only) — depicted as "Add Network"; confirm before rebuild');
  lib.chip(board, 'note', 'title copy is verbatim "Compatible" (text.lg bold success.base) with a Check 20 success glyph — the success ink is scoped to the compat card, never the page');
  lib.chip(board, 'note', 'the commit is an accent-SOFT tinted row, not a filled accent VelaButton — adding a network is reversible, so it stays quieter than "Add to Wallet"');
  lib.chip(board, 'edge', 'tap the deploy action -> the network joins the chain list and the panel returns to S/add-token/network-search');
  lib.chip(board, 'edge', 'network already in src/models/chains.ts -> "This network is already added"');
}

// ════════════════════════════════════════════════ S/add-token/network-incompatible (col 7, row 4)
{
  const { board } = await lib.upsertBoard(PAGE, 'S/add-token/network-incompatible', { x: 3150, y: 3800, w: W, h: SH, fill: BG });
  addTokenNav(board);
  use(board, 'C/Sheets/AddTokenPanel', { tab: 'network', result: 'error', compat: 'fail' },
    GUT, 104, CW, 560, 'network-incompatible', (sl) => {
      panelTabs(sl, 'network');
      flabel(sl, 'field-label', 'NETWORK', 0, 62);
      panelInput(sl, 'input-network', 'Fantom', 86);
      chainInfo(sl, 158);
      use(sl, 'C/Primitives/VelaCard', { elevation: 'elevated' }, 0, 328, CW, 210, 'compat', cardDraw('elevated'), true);
      ico(sl, 'X', 20, 2.5, 20, 350, ERR);
      t(sl, 'compat-title', 'Not compatible with Vela Wallet', 15, 700, ERR, 48, 348);
      ['ok', 'ok', 'fail', 'fail'].forEach((st, i) => checkRow(sl, CHECKS[i], CHECKS[i], st, 386 + i * 32));
    });

  lib.chip(board, 'note', 'title copy is verbatim: "Not compatible with Vela Wallet". Its COLOUR is not specified in the inventory — depicted error.base by analogy with the app failure grammar (judgement call)');
  lib.chip(board, 'note', 'failing rows keep the same X 14 glyph as the pending state in the source spec (X 14 fg.subtle); error ink on the failed rows is this board’s reading of the failure, verify before rebuild');
  lib.chip(board, 'note', 'no commit affordance exists in this state — an incompatible network simply cannot be added (no override, no "add anyway")');
  lib.chip(board, 'edge', 'edit the network or its RPC -> S/add-token/network-checking (re-runs every check)');
  lib.chip(board, 'edge', 'tap ERC-20 Token tab -> S/add-token/erc20-form');
}

return lib.done('62-screens-wallet-rest-e', {
  boards: ['S/add-token/network-checking', 'S/add-token/network-compatible', 'S/add-token/network-incompatible'],
  missingFamilies: missing, overrideFailures: overrides,
});
