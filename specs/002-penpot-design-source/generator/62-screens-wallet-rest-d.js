if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
// 62-screens-wallet-rest-d.js — S/add-token/erc20-resolved · erc20-error · network-search
// (manifest screen index 4 → y 3800, cols 2–4).
// Visual truth: inv:02 D5 (AddTokenPanel: result cards, suggestions card, copy), inv:05 §7 (host + copy
// set: "Search Token" → "Add to Wallet" → "Added"; errors "Not Found" / "This network is already added"),
// inv:05 §1.1–§1.3 (tokens). Chain data = src/models/chains.ts.
// Idempotent: upsert-by-name; use() composes from the library and degrades to a named MISSING holder
// board that still draws the depiction and self-upgrades on a later run.
const lib = storage.lib;
const PAGE = '05 Screens · Wallet';

const INK = '#1A1A18', MUTED = '#6E6B62', SUBTLE = '#8C887E';
const BG = '#FAFAF8', RAISED = '#FFFFFF', SUNKEN = '#F5F3EF';
const ACCENT = '#E8572A', OK = '#2D8E5F', ERR = '#C62828';
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
const flabel = (p, n, text, x, y) => { // field label — 11 semibold fg.muted UPPERCASE ls 0.8 (inv:02 D5)
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
const btnDraw = (variant, text, state) => (slot) => {
  const fill = variant === 'primary' ? INK : (variant === 'accent' ? ACCENT : null);
  const box = r(slot, 'button', { x: 0, y: 0, w: slot.width, h: slot.height, radius: 16, fill: fill || undefined });
  if (!fill) { box.fills = []; box.strokes = [{ strokeColor: LINE2, strokeWidth: 1.5, strokeAlignment: 'inner' }]; }
  if (state === 'loading') r(slot, 'spinner', { x: Math.round(slot.width / 2) - 9, y: Math.round(slot.height / 2) - 9, w: 18, h: 18, radius: 9, fill: fill ? '#FFFFFF' : INK });
  else t(slot, 'label', text, 15, 600, fill ? '#FFFFFF' : INK, Math.round((slot.width - wEst(text, 15, 600)) / 2), Math.round(slot.height / 2) - 10);
  if (state === 'disabled' || state === 'loading') slot.opacity = 0.45;
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
const panelInput = (sl, name, value, filled, y, scan, zone) => {
  r(sl, name, { x: 0, y, w: CW, h: 52, radius: 12, fill: SUNKEN, stroke: LINE, strokeWidth: 1 });
  t(sl, name + ' value', value, 13, 500, filled ? INK : SUBTLE, 16, y + 18, zone || 'mono');
  if (scan) ico(sl, 'ScanLine', 20, 2, CW - 40, y + 16, SUBTLE);
};
// label/value row inside a result card: label base regular fg.muted / value base semibold fg.base
const cardRow = (sl, key, k, v, x, y, w, sep) => {
  t(sl, 'row-label ' + key, k, 13, 400, MUTED, x, y + 12);
  t(sl, 'row-value ' + key, v, 13, 600, INK, x + w - wEst(v, 13, 600), y + 12);
  if (sep) hair(sl, 'row-sep ' + key, x, y + 40, w);
};

// ════════════════════════════════════════════════ S/add-token/erc20-resolved (col 2, row 4)
{
  const { board } = await lib.upsertBoard(PAGE, 'S/add-token/erc20-resolved', { x: 900, y: 3800, w: W, h: SH, fill: BG });
  addTokenNav(board);
  use(board, 'C/Sheets/AddTokenPanel', { tab: 'erc20', result: 'found', compat: 'pass' },
    GUT, 104, CW, 640, 'erc20-resolved', (sl) => {
      panelTabs(sl, 'erc20');
      flabel(sl, 'field-label', 'CONTRACT ADDRESS', 0, 62);
      panelInput(sl, 'input-address', '0x833589fCD6eDb…54bdA02913', true, 86, true);
      const search = use(sl, 'C/Primitives/VelaButton', { variant: 'secondary', size: 'default', state: 'default' },
        0, 158, CW, 53, 'search-token', btnDraw('secondary', 'Search Token'), true);
      relabel(search, ['Search Token']);

      // result card 1 — found on Base, not yet added (marginTop 24, padding 20)
      use(sl, 'C/Primitives/VelaCard', { elevation: 'default' }, 0, 235, CW, 224, 'result-base', cardDraw('default'), true);
      cardRow(sl, 'base-network', 'Network', 'Base', 20, 255, 302, true);
      cardRow(sl, 'base-name', 'Name', 'USD Coin', 20, 296, 302, true);
      cardRow(sl, 'base-decimals', 'Decimals', '6', 20, 337, 302, false);
      const add = use(sl, 'C/Primitives/VelaButton', { variant: 'accent', size: 'default', state: 'default' },
        20, 386, 302, 53, 'add-base', btnDraw('accent', 'Add to Wallet'), true);
      relabel(add, ['Add to Wallet']);

      // result card 2 — same contract on Ethereum, already committed → added row
      use(sl, 'C/Primitives/VelaCard', { elevation: 'default' }, 0, 479, CW, 141, 'result-eth', cardDraw('default'), true);
      cardRow(sl, 'eth-network', 'Network', 'Ethereum', 20, 499, 302, true);
      cardRow(sl, 'eth-name', 'Name', 'USD Coin', 20, 540, 302, false);
      ico(sl, 'Check', 16, 2.5, 129, 586, OK);
      t(sl, 'added-label', 'Added', 13, 600, OK, 153, 588);
    });

  lib.chip(board, 'note', 'ONE result card per network the contract was found on — the multi-chain auto-detect is the feature, so two cards is the normal case, not an edge case');
  lib.chip(board, 'note', 'card commit copy walks "Search Token" → "Add to Wallet" → "Added"; the added row is a CENTERED Check 16 success sw2.5 + text.base semibold success.base, replacing the button in place');
  lib.chip(board, 'note', 'accent is spent here deliberately: "Add to Wallet" mutates the wallet, so it outranks the secondary fetch button (inv:05 §8.17)');
  lib.chip(board, 'note', 'cards are C/Primitives/VelaCard default (bg.raised, radius 16, 1px border.base) — the panel is one of the documented card-keeping exceptions');
  lib.chip(board, 'edge', 'tap Add to Wallet -> that card flips to the added row and the token appears on S/home/assets');
  lib.chip(board, 'edge', 'contract already present on that network -> error copy "This network is already added"');
}

// ════════════════════════════════════════════════ S/add-token/erc20-error (col 3, row 4)
{
  const { board } = await lib.upsertBoard(PAGE, 'S/add-token/erc20-error', { x: 1350, y: 3800, w: W, h: SH, fill: BG });
  addTokenNav(board);
  use(board, 'C/Sheets/AddTokenPanel', { tab: 'erc20', result: 'error', compat: 'pass' },
    GUT, 104, CW, 250, 'erc20-error', (sl) => {
      panelTabs(sl, 'erc20');
      flabel(sl, 'field-label', 'CONTRACT ADDRESS', 0, 62);
      panelInput(sl, 'input-address', '0x1111111111…11111111', true, 86, true);
      t(sl, 'error-text', 'Not Found', 11, 500, ERR, 0, 148); // text.sm medium error.base — inv:02 D5
      const btn = use(sl, 'C/Primitives/VelaButton', { variant: 'secondary', size: 'default', state: 'default' },
        0, 176, CW, 53, 'search-token', btnDraw('secondary', 'Search Token'), true);
      relabel(btn, ['Search Token']);
    });

  lib.chip(board, 'note', 'error text sits UNDER the input (text.sm medium error.base) — the input itself keeps its normal border; only the message carries the error ink');
  lib.chip(board, 'note', 'error copy set: "Not Found" (no such ERC-20 on any supported network) / "This network is already added"');
  lib.chip(board, 'note', 'the fetch button returns to its enabled secondary state so a retry is one tap — the error never blocks the field');
  lib.chip(board, 'edge', 'edit the address -> S/add-token/erc20-form (error clears on change)');
  lib.chip(board, 'edge', 'tap Search Token again -> S/add-token/erc20-resolving');
}

// ════════════════════════════════════════════════ S/add-token/network-search (col 4, row 4)
{
  const { board } = await lib.upsertBoard(PAGE, 'S/add-token/network-search', { x: 1800, y: 3800, w: W, h: SH, fill: BG });
  addTokenNav(board);
  use(board, 'C/Sheets/AddTokenPanel', { tab: 'network', result: 'none', compat: 'pass' },
    GUT, 104, CW, 380, 'network-search', (sl) => {
      panelTabs(sl, 'network');
      flabel(sl, 'field-label', 'NETWORK', 0, 62);
      panelInput(sl, 'input-network', 'Name or chain ID (e.g. Avalanche, 43114)', false, 86, false, 'sans');
      // suggestions card: name base medium ↔ "Chain ID x" sm regular subtle — inv:02 D5
      use(sl, 'C/Primitives/VelaCard', { elevation: 'default' }, 0, 158, CW, 204, 'suggestions', cardDraw('default'), true);
      [['Linea', 59144], ['Scroll', 534352], ['Celo', 42220], ['Blast', 81457]].forEach(([name, id], i) => {
        const y = 178 + i * 41;
        t(sl, 'suggest-name ' + name, name, 13, 500, INK, 20, y + 12);
        const cid = 'Chain ID ' + id;
        t(sl, 'suggest-id ' + name, cid, 11, 400, SUBTLE, 322 - wEst(cid, 11, 400), y + 13);
        if (i < 3) hair(sl, 'suggest-sep ' + name, 20, y + 40, 302);
      });
    });

  lib.chip(board, 'note', 'placeholder copy is verbatim: "Name or chain ID (e.g. Avalanche, 43114)" — the field accepts both a name and a numeric chain ID');
  lib.chip(board, 'note', 'the network tab is labelled "Native Token" in the tab strip but its job is ADDING A CUSTOM NETWORK (inv:05 §7 copy vs inv:02 D5 behaviour) — keep the copy, know the semantics');
  lib.chip(board, 'note', 'suggestions are networks NOT already supported; picking one already in src/models/chains.ts yields "This network is already added"');
  lib.chip(board, 'note', 'custom networks store fixed gray iconColor #888888 / iconBg #F0F0F0 — a bright disc in dark mode (flagged inv:02 §Z-7)');
  lib.chip(board, 'edge', 'pick a suggestion (or submit a chain ID) -> S/add-token/network-checking');
  lib.chip(board, 'edge', 'tap ERC-20 Token tab -> S/add-token/erc20-form');
}

return lib.done('62-screens-wallet-rest-d', {
  boards: ['S/add-token/erc20-resolved', 'S/add-token/erc20-error', 'S/add-token/network-search'],
  missingFamilies: missing, overrideFailures: overrides,
});
