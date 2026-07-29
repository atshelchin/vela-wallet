if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
// 61-screens-send-b.js — S/send boards 4–7 (details/split, details/sweep,
// details/error-insufficient, details/estimating). Page '05 Screens · Wallet', row y=950,
// x = manifest state index * 450.
// Visual truth: inv:05 §3.2 (Enter Details, all three modes), inv:03 §4.4 (MultiRecipientEditor),
// inv:03 §4.1 (payroll importer hand-off), inv:05 §1.1–1.3 (tokens). Copy = real en/send.json strings.
const lib = storage.lib;
const PAGE = '05 Screens · Wallet';
const ROWY = 950;
const summary = { boards: [], missingPlaceholders: 0, missingFamilies: [] };

const C = {
  ink: '#1A1A18', muted: '#6E6B62', subtle: '#8C887E', inv: '#FFFFFF',
  bg: '#FAFAF8', raised: '#FFFFFF', sunken: '#F5F3EF',
  accent: '#E8572A', accentSoft: '#FFF0EB', success: '#2D8E5F', successSoft: '#EDFAF2',
  warn: '#92600A', warnSoft: '#FFF8F0', warnBorder: '#F0DCC8',
  err: '#C62828', errSoft: '#FEF2F2', border: '#ECEBE4', strong: '#D8D6CE', ghost: '#B0ADA5',
};
const T = (b, n, s) => lib.upsertText(b, n, s).text;
const R = (b, n, s) => lib.upsertRect(b, n, s).rect;
const I = (b, lucide, size, sw, color, x, y) => {
  const r = R(b, 'icon:' + lucide + ' ' + size + '/' + sw, { x, y, w: size, h: size, stroke: color, strokeWidth: sw });
  r.fills = [];
  return r;
};
const hr = (b, n, x, y, w) => R(b, n, { x, y, w, h: 1, fill: C.border });
const wEst = (str, size, f) => Math.round(String(str).length * size * (f || 0.56));
const rt = (b, n, s, right) => T(b, n, Object.assign({}, s, { x: (right === undefined ? 366 : right) - wEst(s.text, s.size, s.f) }));
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
const chrome = (b, backIcon, title) => {
  T(b, 'deco:status-bar clock', { text: '9:41', size: 12, weight: 600, color: C.ink, x: 24, y: 14 });
  R(b, 'deco:status-bar signal', { x: 302, y: 16, w: 16, h: 10, fill: C.ink });
  R(b, 'deco:status-bar wifi', { x: 322, y: 16, w: 14, h: 10, fill: C.ink });
  R(b, 'deco:status-bar battery', { x: 340, y: 16, w: 24, h: 10, fill: C.ink });
  if (backIcon) I(b, backIcon, 22, 2, C.ink, 33, 65);
  if (title) T(b, 'step title', { text: title, size: 26, weight: 700, color: C.ink, x: 24, y: 104 });
};
// Token hero — open block, tap = back to the picker; ERC-20 adds hairline + contract row — inv:05 §3.2
const tokenHero = (b, sym, chain, bal, fiat) => {
  slot(b, 'C/Media/TokenLogo', { size: '44', badge: 'chain' }, 'hero-logo', 24, 152, 44, 44);
  T(b, 'hero symbol', { text: sym, size: 15, weight: 700, color: C.ink, x: 80, y: 154 });
  T(b, 'hero chain', { text: chain, size: 11, weight: 500, color: C.subtle, x: 80, y: 176 });
  rt(b, 'hero balance', { text: bal, size: 17, weight: 700, color: C.ink, f: 0.58, y: 152 });
  rt(b, 'hero fiat', { text: fiat, size: 11, weight: 500, color: C.muted, y: 176 });
  hr(b, 'hero hairline', 80, 212, 286);
  T(b, 'contract label', { text: 'Token Address', size: 11, weight: 400, color: C.subtle, x: 80, y: 224 });
  rt(b, 'contract value', { text: '0x8335…2913', size: 11, weight: 500, color: C.muted, zone: 'mono', f: 0.62, y: 224 }, 342);
  I(b, 'Copy', 14, 2, C.subtle, 350, 224);
};
// Amount hero + recipient block shared by the single-mode detail boards — inv:05 §3.2
const amountAndRecipient = (b, amount, warn) => {
  relabel(slot(b, 'C/Primitives/SectionLabel', { spacing: 'standalone' }, 'label-amount', 24, 264, 96, 14), 'AMOUNT');
  T(b, 'amount input', { text: amount, size: 36, weight: 700, color: C.ink, x: 24, y: 288 });   // ≈ round(230/max(len,5.75)) clamped 17–40 — inv:05 §3.2
  rt(b, 'amount unit', { text: 'USDC', size: 25, weight: 600, color: C.subtle, f: 0.6, y: 300 });
  I(b, 'ArrowUpDown', 14, 2, C.muted, 24, 350);
  T(b, 'conversion', { text: '≈ $' + amount, size: 11, weight: 500, color: C.muted, x: 46, y: 350 });
  if (warn) T(b, 'inline warning', { text: warn, size: 11, weight: 500, color: C.err, x: 24, y: 376 }); // live inline warning, error.base — inv:05 §3.2
  relabel(slot(b, 'C/Primitives/SectionLabel', { spacing: 'standalone' }, 'label-recipient', 24, 406, 110, 14), 'RECIPIENT');
  R(b, 'recipient input', { x: 24, y: 432, w: 342, h: 48, radius: 12, fill: C.sunken, stroke: C.border, strokeWidth: 1 });
  T(b, 'recipient value', { text: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', size: 11, weight: 400, color: C.ink, zone: 'mono', x: 36, y: 448 });
  I(b, 'ScanLine', 22, 2, C.muted, 300, 445);
  I(b, 'BookUser', 22, 2, C.muted, 332, 445);
  slot(b, 'C/Media/ContactAvatar', { mode: 'tinted-initial', size: '28' }, 'identity-avatar', 24, 490, 28, 28);
  T(b, 'identity name', { text: 'vitalik.eth', size: 13, weight: 600, color: C.ink, x: 60, y: 494 });
  slot(b, 'C/Primitives/RecipientTypeBadge', { kind: 'name-service' }, 'identity-badge', 146, 492, 44, 24);
};

// ════════════════════════════════════════ 4 · S/send/details/split — inv:05 §3.2, inv:03 §4.4
{
  const b = await screen('S/send/details/split', 4);
  chrome(b, 'ArrowLeft', 'Send USDC');
  tokenHero(b, 'USDC', 'Base', '1,240.00', '$1,240.00');
  relabel(slot(b, 'C/Primitives/SectionLabel', { spacing: 'standalone' }, 'label-recipients', 24, 258, 120, 14), 'RECIPIENTS');
  // MultiRecipientEditor: the deliberate card exception — a repeating compound form unit — inv:03 §4.4
  slot(b, 'C/Rows/MultiRecipientEditor', { 'recipient-card': 'valid', footer: 'add-enabled' }, 'editor', 24, 284, 342, 300);
  // footer totals row (renders directly under the editor) — inv:03 §4.4
  hr(b, 'totals hairline', 24, 600, 342);
  T(b, 'totals count', { text: '4 recipients', size: 11, weight: 500, color: C.muted, x: 24, y: 614 });   // send.recipientCount_other
  rt(b, 'totals amount', { text: '1,000.00 USDC', size: 15, weight: 700, color: C.ink, f: 0.6, y: 610 });
  rt(b, 'totals fiat', { text: '≈ $1,000.00', size: 10, weight: 500, color: C.muted, y: 630 });
  dash(R(b, 'pill dashed · add recipient', { x: 24, y: 660, w: 167, h: 40, radius: 12 })).fills = [];
  I(b, 'Plus', 18, 2.5, C.accent, 46, 671);
  T(b, 'pill label add', { text: 'Add recipient', size: 13, weight: 600, color: C.accent, x: 70, y: 672 });
  dash(R(b, 'pill dashed · import list', { x: 199, y: 660, w: 167, h: 40, radius: 12 })).fills = [];
  I(b, 'FileUp', 18, 2, C.accent, 228, 671);
  T(b, 'pill label import', { text: 'Import list', size: 13, weight: 600, color: C.accent, x: 252, y: 672 });
  relabel(slot(b, 'C/Primitives/VelaButton', { variant: 'primary', size: 'default', state: 'default' }, 'cta', 24, 743, 342, 53), 'Continue', 'label');
  lib.chip(b, 'edge', 'tap Continue -> S/send/confirm/split');
  lib.chip(b, 'edge', 'rows drop to <=1 -> S/send/details (carries the remaining address + amount)');
  lib.chip(b, 'edge', 'tap Import list -> O/batch-import-sheet/paste (fiat rows priced at an editable rate, then seeded here)');
  lib.chip(b, 'edge', 'per-row scan -> O/qr-scanner/scanning-native fills ONLY that row; whole-group pick from O/contact-picker seeds every address');
  lib.chip(b, 'edge', 'total over balance -> totals amount turns error.base + "The total exceeds your balance." (CTA disabled)'); // send.alertInsufficientBalanceBody
  lib.chip(b, 'note', 'cap 20 (BATCH_MAX_RECIPIENTS): at the cap both dashed pills go opacity 0.4; split submits as ONE MultiSend UserOp — one signature, one fee'); // inv:05 §3
  lib.chip(b, 'note', 'totals row + dashed pills belong to MultiRecipientEditor; drawn on the board so the instance can stay a single stacked card');
}

// ════════════════════════════════════════ 5 · S/send/details/sweep — inv:05 §3.2
{
  const b = await screen('S/send/details/sweep', 5);
  chrome(b, 'ArrowLeft', 'Send tokens');                                 // send.multiSendTitle
  T(b, 'sweep summary', { text: '3 tokens · Base', size: 11, weight: 600, color: C.muted, x: 24, y: 156 }); // send.multiSendSummary
  rt(b, 'sweep total', { text: '$248.37', size: 15, weight: 700, color: C.ink, f: 0.6, y: 150 });
  hr(b, 'sweep hairline', 24, 186, 342);
  const rows = [
    ['USDC', 'Base', '182.40', '≈ $182.40', 198],
    ['ETH', 'Base · gas reserved', '0.0186', '≈ $61.22', 258],          // send.gasReserved — trimmed below balance for the fee
    ['DEGEN', 'Base', '412.00', '≈ $4.75', 318],
  ];
  rows.forEach(([sym, chain, amt, fiat, y], i) => {
    slot(b, 'C/Media/TokenLogo', { size: '32', badge: 'chain' }, 'sweep-logo-' + sym, 24, y + 6, 32, 32);
    T(b, 'sweep symbol ' + sym, { text: sym, size: 13, weight: 600, color: C.ink, x: 68, y: y + 6 });
    T(b, 'sweep chain ' + sym, { text: chain, size: 11, weight: 500, color: C.subtle, x: 68, y: y + 26 });
    rt(b, 'sweep amount ' + sym, { text: amt, size: 13, weight: 600, color: C.ink, f: 0.58, y: y + 6 });
    rt(b, 'sweep fiat ' + sym, { text: fiat, size: 10, weight: 500, color: C.subtle, y: y + 26 });
    if (i > 0) hr(b, 'sweep row hairline ' + sym, 68, y - 6, 298);       // hairlines inset 44 past the 32 logo — inv:05 §3.2
  });
  relabel(slot(b, 'C/Primitives/SectionLabel', { spacing: 'standalone' }, 'label-recipient', 24, 400, 110, 14), 'RECIPIENT');
  R(b, 'recipient input', { x: 24, y: 426, w: 342, h: 48, radius: 12, fill: C.sunken, stroke: C.border, strokeWidth: 1 });
  T(b, 'recipient value', { text: '0x7A3fC2b1D9e4A8F05C6b1E2d3A4B5c6D7e8F9012', size: 11, weight: 400, color: C.ink, zone: 'mono', x: 36, y: 442 });
  I(b, 'BookUser', 22, 2, C.muted, 332, 439);                            // sweep shows BookUser only (no per-row scan) — inv:05 §3.2
  slot(b, 'C/Media/ContactAvatar', { mode: 'tinted-initial', size: '28' }, 'identity-avatar', 24, 484, 28, 28);
  T(b, 'identity name', { text: 'Payroll · Ops', size: 13, weight: 600, color: C.ink, x: 60, y: 488 });
  slot(b, 'C/Primitives/RecipientTypeBadge', { kind: 'contact' }, 'identity-badge', 160, 486, 44, 24);
  relabel(slot(b, 'C/Primitives/VelaButton', { variant: 'primary', size: 'default', state: 'default' }, 'cta', 24, 743, 342, 53), 'Continue', 'label');
  lib.chip(b, 'edge', 'tap Continue -> S/send/confirm/sweep');
  lib.chip(b, 'edge', 'tap back -> S/send/select-token/sweep (selection preserved)');
  lib.chip(b, 'edge', 'a token has nothing left after the gas reserve -> row rejected, "Not enough to cover gas after the reserve."'); // send.multiSendNoFundsAfterGas
  lib.chip(b, 'note', 'sweep = N tokens on ONE chain -> 1 recipient at FULL balance minus the gas reserve; "· gas reserved" appends only on the trimmed token'); // inv:05 §3.2
  lib.chip(b, 'note', 'no amount field in sweep — amounts are derived; one MultiSend UserOp = one signature, one fee');
  lib.chip(b, 'motion', 'step enters fadeInDown(0,300); rows are open (no cards), hairlines inset 44');
}

// ════════════════════════════════════════ 6 · S/send/details/error-insufficient — inv:05 §3.2
{
  const b = await screen('S/send/details/error-insufficient', 6);
  chrome(b, 'ArrowLeft', 'Send USDC');
  tokenHero(b, 'USDC', 'Base', '1,240.00', '$1,240.00');
  amountAndRecipient(b, '1,500.00', 'You do not have enough USDC in this account');   // send.warnNotEnoughToken
  relabel(slot(b, 'C/Primitives/VelaButton', { variant: 'primary', size: 'default', state: 'disabled' }, 'cta', 24, 743, 342, 53), 'Continue', 'label');
  lib.chip(b, 'edge', 'amount drops under balance − fee -> S/send/details (CTA re-enables)');
  lib.chip(b, 'edge', 'tap Max -> amount = balance − quoted in-band fee -> S/send/details (Max never trips its own gas warning)');
  lib.chip(b, 'edge', 'fee asset is a separate ERC-20 with too little balance -> same board, "You need USDT to pay gas fees"'); // send.warnNeedGas
  lib.chip(b, 'note', 'warning is LIVE (typing-time) and fee-asset aware: same-token fee reserves, separate ERC-20 fee balances checked independently'); // inv:05 §3.2
  lib.chip(b, 'note', 'copy set: warnNotEnoughToken / warnInsufficientForGas "Insufficient USDC to cover amount + gas fees" / warnNeedGas — never a raw RPC string');
  lib.chip(b, 'note', 'disabled CTA = VelaButton opacity 0.45 (never a washed-out accent); the alert path (Invalid Address/Amount) is O/app-alert/one-button');
}

// ════════════════════════════════════════ 7 · S/send/details/estimating — inv:05 §3.2
{
  const b = await screen('S/send/details/estimating', 7);
  chrome(b, 'ArrowLeft', 'Send USDC');
  tokenHero(b, 'USDC', 'Base', '1,240.00', '$1,240.00');
  amountAndRecipient(b, '250.00', null);
  relabel(slot(b, 'C/Primitives/VelaButton', { variant: 'primary', size: 'default', state: 'loading' }, 'cta', 24, 743, 342, 53), 'Preparing...', 'label'); // send.preparing
  lib.chip(b, 'edge', 'estimate resolves + treasury preflight passes -> S/send/confirm');
  lib.chip(b, 'edge', 'estimate fails or exceeds the 15s timeout -> O/app-alert/one-button "Could not prepare transaction"'); // send.alertEstimateFailedTitle
  lib.chip(b, 'edge', 'relayer treasury depleted at preflight -> O/treasury-bootstrap/default (confirm is never reached)'); // inv:05 §3.2/§3.6
  lib.chip(b, 'edge', 'account key unavailable -> O/app-alert/one-button (alertAccountUnavailableBody)');
  lib.chip(b, 'note', 'the estimate runs on the REAL calldata — never a guess; the quoted fee is the fee that gets signed (quotedFee invariant)'); // inv:02 C6
  lib.chip(b, 'note', 'CTA shows a spinner + "Preparing..."; every field stays visible and untouched so the user keeps context');
  lib.chip(b, 'motion', 'VelaButton loading = ActivityIndicator in the label colour; no layout shift when the label swaps');
}

return lib.done('61-screens-send-b', summary);
