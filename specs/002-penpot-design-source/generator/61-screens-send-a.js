if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
// 61-screens-send-a.js — S/send boards 0–3 (select-token, select-token/sweep,
// select-token/empty, details). Page '05 Screens · Wallet', screen row 1 (y=950),
// state index = manifest order → x = index * 450.
// Visual truth: inv:05 §3 / §3.1 / §3.2, inv:02 C4 (TokenSelector), inv:02 C1 (TokenRow),
// inv:03 §4.4 (split pills), inv:05 §1.1–1.3 (tokens). Copy = the real en/send.json strings.
// Boards depict the NORMATIVE de-containered language (docs/DESIGN-LANGUAGE.md): open heroes,
// hairlines inset past the leading icon, single accent, no card pile.
// Idempotent: every shape upserts by name; instances are renamed to a stable slot id.
const lib = storage.lib;
const PAGE = '05 Screens · Wallet';
const ROWY = 950;                       // screen index 1
const summary = { boards: [], missingPlaceholders: 0, missingFamilies: [] };

// ── palette (light depiction) — inv:05 §1.1 ─────────────────────────────────
const C = {
  ink: '#1A1A18', muted: '#6E6B62', subtle: '#8C887E', inv: '#FFFFFF',
  bg: '#FAFAF8', raised: '#FFFFFF', sunken: '#F5F3EF',
  accent: '#E8572A', accentSoft: '#FFF0EB', success: '#2D8E5F', successSoft: '#EDFAF2',
  warn: '#92600A', warnSoft: '#FFF8F0', warnBorder: '#F0DCC8',
  err: '#C62828', errSoft: '#FEF2F2', border: '#ECEBE4', strong: '#D8D6CE', ghost: '#B0ADA5',
};
const T = (b, n, s) => lib.upsertText(b, n, s).text;
const R = (b, n, s) => lib.upsertRect(b, n, s).rect;
const I = (b, lucide, size, sw, color, x, y) => {                 // icon placeholder: name encodes the real Lucide glyph
  const r = R(b, 'icon:' + lucide + ' ' + size + '/' + sw, { x, y, w: size, h: size, stroke: color, strokeWidth: sw });
  r.fills = [];
  return r;
};
const EL = (b, name, d, x, y, o) => {                              // upserted ellipse (createEllipse alone is not idempotent)
  const n = lib.norm(name);
  let e = penpotUtils.findShape(s => s.name === n && s.type === 'ellipse', b);
  if (!e) { e = penpot.createEllipse(); e.name = name; b.appendChild(e); }
  if (Math.round(e.width) !== d || Math.round(e.height) !== d) e.resize(d, d);
  penpotUtils.setParentXY(e, x, y);
  e.fills = (o && o.fill) ? [{ fillColor: o.fill, fillOpacity: 1 }] : [];
  if (o && o.stroke) e.strokes = [{ strokeColor: o.stroke, strokeWidth: o.sw || 2, strokeAlignment: 'inner' }];
  return e;
};
const hr = (b, n, x, y, w) => R(b, n, { x, y, w, h: 1, fill: C.border });   // hairline border.base — DESIGN-LANGUAGE 3
const wEst = (str, size, f) => Math.round(String(str).length * size * (f || 0.56));
const rt = (b, n, s, right) => T(b, n, Object.assign({}, s, { x: (right === undefined ? 366 : right) - wEst(s.text, s.size, s.f) }));
const ct = (b, n, s, cx) => T(b, n, Object.assign({}, s, { x: Math.round((cx === undefined ? 195 : cx) - wEst(s.text, s.size, s.f) / 2) }));
const dash = (r) => { try { r.strokes = [{ strokeColor: C.border, strokeWidth: 1, strokeStyle: 'dashed', strokeAlignment: 'inner' }]; } catch (e) {} return r; };
const relabel = (inst, text, childName) => {
  if (!inst) return inst;
  try {
    let t = childName ? penpotUtils.findShape(s => s.type === 'text' && s.name === lib.norm(childName), inst) : null;
    if (!t) t = penpotUtils.findShape(s => s.type === 'text', inst);
    if (t && t.characters !== text) t.characters = text;
  } catch (e) {}
  return inst;
};
// Compose from the library first (FR-005); fall back to a counted MISSING placeholder.
const slot = (b, family, props, key, x, y, w, h) => {
  const iname = family + ' · ' + key, mname = 'MISSING:' + family + ' · ' + key;
  const found = penpotUtils.findShape(s => s.name === lib.norm(iname), b);
  if (found) { penpotUtils.setParentXY(found, x, y); return found; }
  const inst = lib.instance(family, props || null, b, x, y);
  if (inst) {
    try { inst.name = iname; } catch (e) {}
    const stale = penpotUtils.findShape(s => s.name === lib.norm(mname), b);
    if (stale) { try { stale.remove(); } catch (e) {} }
    return inst;
  }
  const r = R(b, mname, { x, y, w, h, stroke: C.ghost, strokeWidth: 1 });
  r.fills = [];
  if (w >= 90 && h >= 18) T(b, 'deco:missing-label · ' + key, { text: 'MISSING ' + family, size: 8, weight: 500, color: C.ghost, x: x + 6, y: y + Math.max(2, Math.round(h / 2) - 5) });
  summary.missingPlaceholders++;
  if (summary.missingFamilies.indexOf(family) < 0) summary.missingFamilies.push(family);
  return r;
};
const screen = async (name, col) => {
  const { board } = await lib.upsertBoard(PAGE, name, { x: col * 450, y: ROWY, w: 390, h: 844, fill: C.bg });
  summary.boards.push(name);
  return board;
};
// status bar + nav + step title — inv:05 §3 (nav = ONE 40×40 left icon button, no nav title)
const chrome = (b, backIcon, title) => {
  T(b, 'deco:status-bar clock', { text: '9:41', size: 12, weight: 600, color: C.ink, x: 24, y: 14 });
  R(b, 'deco:status-bar signal', { x: 302, y: 16, w: 16, h: 10, fill: C.ink });
  R(b, 'deco:status-bar wifi', { x: 322, y: 16, w: 14, h: 10, fill: C.ink });
  R(b, 'deco:status-bar battery', { x: 340, y: 16, w: 24, h: 10, fill: C.ink });
  if (backIcon) I(b, backIcon, 22, 2, C.ink, 33, 65);              // 40×40 plain icon button at 24,56 — DESIGN-LANGUAGE 7
  if (title) T(b, 'step title', { text: title, size: 26, weight: 700, color: C.ink, x: 24, y: 104 }); // text.3xl bold, mb 20 — inv:05 §3
};
// TokenSelector chrome shared by the three step-1 boards — inv:02 C4
const selectorHead = (b, netLabel, netSelected) => {
  const sc = R(b, 'search chip', { x: 24, y: 152, w: 232, h: 40, radius: 20, fill: C.sunken }); // bg.sunken radius.full — inv:02 C4
  I(b, 'Search', 16, 2, C.subtle, 40, 164);
  T(b, 'search placeholder', { text: 'Search tokens...', size: 13, weight: 400, color: C.subtle, x: 66, y: 166 }); // send.searchPlaceholder
  relabel(slot(b, 'C/Controls/NetworkFilterButton', { selection: netSelected ? 'chain-selected' : 'all' }, 'net-filter', 264, 152, 102, 40), netLabel);
  // category chips row: All / Stablecoins / Gas / Other; ACTIVE = neutral ink, never accent — inv:02 C4
  const chips = [['All', true, 24, 43], ['Stablecoins', false, 71, 92], ['Gas', false, 167, 43], ['Other', false, 214, 55]];
  for (const [label, on, x, w] of chips) {
    relabel(slot(b, 'C/Controls/FilterChip', { state: on ? 'selected' : 'unselected' }, 'chip-' + label, x, 208, w, 22), label);
  }
  return sc;
};

// ════════════════════════════════════════ 0 · S/send/select-token — inv:05 §3.1
{
  const b = await screen('S/send/select-token', 0);
  chrome(b, 'X', 'Select Token');                                   // send.selectTokenTitle; step 1 back glyph = X — inv:05 §3
  selectorHead(b, 'All networks', false);
  T(b, 'summary count', { text: '12 tokens', size: 11, weight: 500, color: C.muted, x: 24, y: 252 });     // send.tokenCount — inv:02 C4
  rt(b, 'summary total', { text: '$4,182.60', size: 11, weight: 600, color: C.ink, f: 0.6, y: 252 });     // total: sm semibold numeric — inv:02 C4
  hr(b, 'summary hairline', 24, 278, 342);
  const rows = [['USDC', 286], ['ETH', 350], ['USDT', 414], ['ARB', 478], ['CELO', 542]];
  rows.forEach(([sym, y], i) => {
    slot(b, 'C/Rows/TokenRow', { mode: 'plain', detail: i === 0 ? 'chip' : 'default' }, 'row-' + sym, 24, y, 342, 64); // ERC-20 rows carry the contract chip — inv:05 §3.1
    if (i > 0) hr(b, 'row hairline ' + sym, 84, y, 282);             // list hairline inset 60 (8+40+12) — inv:02 C1
  });
  I(b, 'Plus', 18, 2.5, C.accent, 148, 610);                         // de-boxed centered accent add row — inv:02 C4
  T(b, 'add token label', { text: 'Add Token', size: 13, weight: 600, color: C.accent, x: 172, y: 608 }); // send.addTokenBtn
  lib.chip(b, 'edge', 'tap a token row -> S/send/details');
  lib.chip(b, 'edge', 'pick one chain + tick 2+ tokens -> S/send/select-token/sweep');
  lib.chip(b, 'edge', 'no priced balances -> S/send/select-token/empty');
  lib.chip(b, 'edge', 'tap Add Token -> O/add-token-sheet/form');
  lib.chip(b, 'edge', 'tap the network filter -> O/network-filter-sheet/default');
  lib.chip(b, 'note', 'body IS C/Rows/TokenSelector, composed inline from TokenRow instances; loading = centered "Loading tokens..." text.lg fg.muted, top 48'); // inv:02 C4
  lib.chip(b, 'motion', 'TokenRow entrance fadeIn(index*40, 300), gated to play once; chip selection haptic');
  lib.chip(b, 'platform', 'entrances are iOS-only — Android AND web render the settled state instantly'); // inv:05 §1.3
}

// ════════════════════════════════════════ 1 · S/send/select-token/sweep — inv:05 §3.1
{
  const b = await screen('S/send/select-token/sweep', 1);
  chrome(b, 'X', 'Select Token');
  selectorHead(b, 'Base', true);                                     // sweep only exists once ONE chain is picked — inv:05 §3.1
  T(b, 'summary count', { text: '8 tokens', size: 11, weight: 500, color: C.muted, x: 24, y: 252 });
  rt(b, 'summary total', { text: '$1,904.22', size: 11, weight: 600, color: C.ink, f: 0.6, y: 252 });
  hr(b, 'summary hairline', 24, 278, 342);
  // master row: 22px circle checkbox (2px border.strong → accent fill + white check) — inv:02 C4
  EL(b, 'master checkbox 22 on', 22, 24, 292, { fill: C.accent });
  I(b, 'Check', 14, 2.6, C.inv, 28, 296);
  T(b, 'master label', { text: 'Select all valuable', size: 13, weight: 600, color: C.ink, x: 58, y: 294 }); // send.selectAllValuable
  const rows = [['USDC', 'checkbox-on', 330], ['ETH', 'checkbox-on', 398], ['DEGEN', 'checkbox-on', 466], ['cbBTC', 'checkbox-off', 534]];
  rows.forEach(([sym, mode, y]) => slot(b, 'C/Rows/TokenRow', { mode }, 'row-' + sym, 24, y, 342, 64)); // sweep rows use space.sm gaps, not hairlines — inv:02 C4
  I(b, 'Plus', 18, 2.5, C.accent, 148, 618);
  T(b, 'add token label', { text: 'Add Token', size: 13, weight: 600, color: C.accent, x: 172, y: 616 });
  // sticky accent CTA under the list — the ONE money-moving accent on this board — inv:05 §3.1
  relabel(slot(b, 'C/Primitives/VelaButton', { variant: 'accent', size: 'default', state: 'default' }, 'cta', 24, 743, 342, 53), 'Send 3 · Base →', 'label'); // send.multiSendContinue
  lib.chip(b, 'edge', 'tap "Send 3 · Base →" -> S/send/details/sweep');
  lib.chip(b, 'edge', 'untick down to 1 token -> CTA label flips to "Continue" -> S/send/details');
  lib.chip(b, 'edge', 'switch back to All networks -> S/send/select-token (single-select only)');
  lib.chip(b, 'note', 'one batch = one chain: "All networks" stays single-select; checkbox ON = accent fill + white check, selected row bg accent.soft'); // inv:05 §3.1
  lib.chip(b, 'note', 'sweep sends FULL balances minus a gas reserve; a token with nothing left after the reserve is rejected ("Not enough to cover gas after the reserve.")'); // send.multiSendNoFundsAfterGas
  lib.chip(b, 'motion', 'selection haptic per tick; CTA appears with the first selection');
}

// ════════════════════════════════════════ 2 · S/send/select-token/empty — inv:05 §3.1
{
  const b = await screen('S/send/select-token/empty', 2);
  chrome(b, 'X', 'Select Token');
  selectorHead(b, 'All networks', false);
  hr(b, 'summary hairline', 24, 278, 342);
  ct(b, 'empty title', { text: 'No tokens with balance', size: 17, weight: 600, color: C.muted, y: 392, f: 0.58 }); // send.noTokensWithBalance, text.xl semibold fg.muted — inv:02 C4
  I(b, 'Plus', 18, 2.5, C.accent, 148, 446);                          // add-token stays reachable from the empty state — inv:02 C4
  T(b, 'add token label', { text: 'Add Token', size: 13, weight: 600, color: C.accent, x: 172, y: 444 });
  lib.chip(b, 'edge', 'a balance streams in -> S/send/select-token');
  lib.chip(b, 'edge', 'tap Add Token -> O/add-token-sheet/form');
  lib.chip(b, 'edge', 'search/category filters everything out -> same board, title becomes "No matching tokens"'); // send.noMatchingTokens
  lib.chip(b, 'edge', 'balances still loading -> same board, centered "Loading tokens..." text.lg fg.muted top 48'); // send.loadingTokens
  lib.chip(b, 'note', 'empty is NEVER blank — search + chips + add row stay mounted so the user can act (stream-in, never blank)'); // inv:08 §7.3
}

// ════════════════════════════════════════ 3 · S/send/details — inv:05 §3.2
{
  const b = await screen('S/send/details', 3);
  chrome(b, 'ArrowLeft', 'Send USDC');                                // send.sendTitle {{symbol}}; steps 2–3 back glyph = ArrowLeft — inv:05 §3
  // token hero — OPEN block, no card; tap = back to the picker — inv:05 §3.2
  slot(b, 'C/Media/TokenLogo', { size: '44', badge: 'chain' }, 'hero-logo', 24, 152, 44, 44);
  T(b, 'hero symbol', { text: 'USDC', size: 15, weight: 700, color: C.ink, x: 80, y: 154 });
  T(b, 'hero chain', { text: 'Base', size: 11, weight: 500, color: C.subtle, x: 80, y: 176 });
  rt(b, 'hero balance', { text: '1,240.00', size: 17, weight: 700, color: C.ink, f: 0.58, y: 152 });      // AmountText xl display-bold, right — inv:05 §3.2
  rt(b, 'hero fiat', { text: '$1,240.00', size: 11, weight: 500, color: C.muted, y: 176 });
  hr(b, 'hero hairline', 80, 212, 286);                                // hairline inset 56 past the 44 logo — inv:05 §3.2
  T(b, 'contract label', { text: 'Token Address', size: 11, weight: 400, color: C.subtle, x: 80, y: 224 });
  rt(b, 'contract value', { text: '0x8335…2913', size: 11, weight: 500, color: C.muted, zone: 'mono', f: 0.62, y: 224 }, 342);
  I(b, 'Copy', 14, 2, C.subtle, 350, 224);
  // amount hero — open on the page, no box — inv:05 §3.2
  relabel(slot(b, 'C/Primitives/SectionLabel', { spacing: 'standalone' }, 'label-amount', 24, 264, 96, 14), 'AMOUNT');
  T(b, 'amount input', { text: '250.00', size: 40, weight: 700, color: C.ink, x: 24, y: 288 });           // dynamic size ≈ round(230/max(len,5.75)) clamped 17–40 — inv:05 §3.2
  rt(b, 'amount unit', { text: 'USDC', size: 26, weight: 600, color: C.subtle, f: 0.6, y: 300 });         // unit at 0.7× the amount size, min 16 — inv:05 §3.2
  I(b, 'ArrowUpDown', 14, 2, C.muted, 24, 352);                                                           // conversion toggle (only when priced) — inv:05 §3.2
  T(b, 'conversion', { text: '≈ $250.00', size: 11, weight: 500, color: C.muted, x: 46, y: 352 });
  // recipient — inv:05 §3.2
  relabel(slot(b, 'C/Primitives/SectionLabel', { spacing: 'standalone' }, 'label-recipient', 24, 392, 110, 14), 'RECIPIENT'); // send.recipientLabel
  R(b, 'recipient input', { x: 24, y: 418, w: 342, h: 48, radius: 12, fill: C.sunken, stroke: C.border, strokeWidth: 1 }); // sunken, 1px border, radius.lg, autogrow 48→100 — inv:05 §3.2
  T(b, 'recipient value', { text: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', size: 11, weight: 400, color: C.ink, zone: 'mono', x: 36, y: 434 });
  I(b, 'ScanLine', 22, 2, C.muted, 300, 431);                          // trailing inside icons — hidden when EIP-681-prefilled — inv:05 §3.2
  I(b, 'BookUser', 22, 2, C.muted, 332, 431);
  slot(b, 'C/Media/ContactAvatar', { mode: 'tinted-initial', size: '28' }, 'identity-avatar', 24, 476, 28, 28); // identity row once a valid 0x40 address — inv:05 §3.2
  T(b, 'identity name', { text: 'vitalik.eth', size: 13, weight: 600, color: C.ink, x: 60, y: 480 });      // RecipientTrust: contact › vela › ens, ink-colored and calm
  slot(b, 'C/Primitives/RecipientTypeBadge', { kind: 'name-service' }, 'identity-badge', 146, 478, 44, 24);
  // split / payroll entries — two dashed pills, accent text — inv:05 §3.2, inv:03 §4.4
  dash(R(b, 'pill dashed · add recipient', { x: 24, y: 516, w: 167, h: 40, radius: 12 })).fills = [];
  I(b, 'Plus', 18, 2.5, C.accent, 46, 527);
  T(b, 'pill label add', { text: 'Add recipient', size: 13, weight: 600, color: C.accent, x: 70, y: 528 }); // send.addRecipient
  dash(R(b, 'pill dashed · import list', { x: 199, y: 516, w: 167, h: 40, radius: 12 })).fills = [];
  I(b, 'FileUp', 18, 2, C.accent, 228, 527);
  T(b, 'pill label import', { text: 'Import list', size: 13, weight: 600, color: C.accent, x: 252, y: 528 }); // send.batchImport
  relabel(slot(b, 'C/Primitives/VelaButton', { variant: 'primary', size: 'default', state: 'default' }, 'cta', 24, 743, 342, 53), 'Continue', 'label'); // send.continueBtn
  lib.chip(b, 'edge', 'tap Continue with a valid amount -> S/send/details/estimating -> S/send/confirm');
  lib.chip(b, 'edge', 'amount + fee exceeds balance -> S/send/details/error-insufficient');
  lib.chip(b, 'edge', 'tap Add recipient -> S/send/details/split (seeded with this recipient + one empty row)');
  lib.chip(b, 'edge', 'tap Import list -> O/batch-import-sheet/paste');
  lib.chip(b, 'edge', 'tap ScanLine -> O/qr-scanner/scanning-native · tap BookUser -> O/contact-picker/default');
  lib.chip(b, 'edge', 'tap the token hero -> S/send/select-token (disabled when EIP-681-locked)');
  lib.chip(b, 'note', 'Max chip (sunken, radius.full, sm semibold fg.muted) occupies the unit slot while the amount is EMPTY; native Max = balance − quoted in-band fee, string-exact');
  lib.chip(b, 'motion', 'step enters fadeInDown(0,300); amount shrinks smoothly (Cash-App), never abbreviates; Copy → Check success.base for 1.5s');
}

return lib.done('61-screens-send-a', summary);
