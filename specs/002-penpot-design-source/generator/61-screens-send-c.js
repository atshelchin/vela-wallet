if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
// 61-screens-send-c.js — S/send boards 8–11 (confirm, confirm/split, confirm/sweep,
// confirm/fee-blocker). Page '05 Screens · Wallet', row y=950, x = state index * 450.
// Visual truth: inv:05 §3.3 (Confirm step, all three modes + same-asset-fee blocker),
// inv:03 §4.2 (ConfirmAssets), inv:03 §4.3 (FlowArrow), inv:03 §3.1/§3.2 (GasFeeCard +
// FeeTokenSelector), inv:02 B2 (SlideToConfirm). Copy = real en/send.json strings.
// The review is an OPEN From→To flow — no card ("money follows the person").
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
const ct = (b, n, s, cx) => T(b, n, Object.assign({}, s, { x: Math.round((cx === undefined ? 195 : cx) - wEst(s.text, s.size, s.f) / 2) }));
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
// Party row — 38 avatar · name over short mono address · right amount column — inv:05 §3.3
const partyRow = (b, key, family, props, name, addr, amount, amountColor, fiat, y) => {
  slot(b, family, props, key + '-avatar', 24, y, 38, 38);
  T(b, key + ' name', { text: name, size: 13, weight: 700, color: C.ink, x: 70, y: y });
  T(b, key + ' address', { text: addr, size: 11, weight: 500, color: C.muted, zone: 'mono', x: 70, y: y + 20 });
  if (amount) {
    rt(b, key + ' amount', { text: amount, size: 13, weight: 700, color: amountColor, f: 0.58, y: y });
    rt(b, key + ' fiat', { text: fiat, size: 10, weight: 500, color: C.subtle, y: y + 20 });
  }
};
// Commit control — quiet raised track, accent knob, NEVER red — inv:05 §3.3, inv:02 B2
const commit = (b) => {
  relabel(slot(b, 'C/Controls/SlideToConfirmButton', { state: 'idle' }, 'slide', 24, 736, 342, 60), 'Confirm & Send', 'label'); // send.confirmSendBtn
  ct(b, 'slide hint', { text: 'Slide to confirm', size: 10, weight: 500, color: C.subtle, y: 806 });
};

// ════════════════════════════════════════ 8 · S/send/confirm — inv:05 §3.3
{
  const b = await screen('S/send/confirm', 8);
  chrome(b, 'ArrowLeft', 'Confirm');                                     // send.confirmTitle
  partyRow(b, 'from', 'C/Media/WalletAvatar', { size: '38', style: 'identicon' }, 'Main Wallet', '0x7F3a…C21d', '−250.00 USDC', C.ink, '≈ $250.00', 152);
  slot(b, 'C/Rows/FlowArrowSend', null, 'flow-arrow', 24, 196, 38, 40);  // 1.5×16 shaft into MoveDown 20 in border.base — inv:03 §4.3
  partyRow(b, 'to', 'C/Media/ContactAvatar', { mode: 'tinted-initial', size: '38' }, 'vitalik.eth', '0xd8dA…6045', '+250.00 USDC', C.success, '≈ $250.00', 244);
  slot(b, 'C/Primitives/RecipientTypeBadge', { kind: 'name-service' }, 'to-badge', 152, 243, 44, 24);
  slot(b, 'C/Rows/ConfirmAssets', { variant: 'single' }, 'assets', 24, 300, 168, 28); // quiet sunken pill "USDC · Base", no amount — inv:03 §4.2
  slot(b, 'C/Rows/GasFeeCard', { state: 'ready', expandable: 'yes', expanded: 'no' }, 'gas', 24, 356, 342, 52); // the ONE gas surface — inv:03 §3.1
  commit(b);
  lib.chip(b, 'edge', 'slide past 80% (or flick >900px/s past 45%) -> S/send/confirm/submitting');
  lib.chip(b, 'edge', 'fee re-quote makes the amount unpayable -> S/send/confirm/fee-blocker');
  lib.chip(b, 'edge', 'fee estimate fails -> same board, GasFeeCard shows "Tap to retry" in warning.base (whole row = retry)'); // inv:03 §3.1
  lib.chip(b, 'edge', 're-quote in flight -> slide disabled via onBusyChange, label "Checking gas..."'); // send.checkingGas
  lib.chip(b, 'edge', 'tap back -> S/send/details (blocked once a tx is in flight)');
  lib.chip(b, 'note', 'BalanceChangePreview is SILENT when the simulation merely corroborates this From→To; only loud states (expected-fail, underfunded, unexpected movement, self-transfer) render'); // inv:05 §3.3
  lib.chip(b, 'note', 'no speed tiers — everything runs "fast"; the quoted fee is the signed fee; a 0-native account auto-defaults to the first AFFORDABLE fee asset'); // inv:03 §3.1
  lib.chip(b, 'motion', 'step fadeInDown(0,300); knob idle-peek +9px ×3 teaches the gesture and dies on first grab; success haptic the instant the bundler accepts');
}

// ════════════════════════════════════════ 9 · S/send/confirm/split — inv:05 §3.3
{
  const b = await screen('S/send/confirm/split', 9);
  chrome(b, 'ArrowLeft', 'Confirm');
  partyRow(b, 'from', 'C/Media/WalletAvatar', { size: '38', style: 'identicon' }, 'Main Wallet', '0x7F3a…C21d', '−1,000.00 USDC', C.ink, '≈ $1,000.00', 152);
  slot(b, 'C/Rows/FlowArrowSend', null, 'flow-arrow', 24, 196, 38, 40);
  T(b, 'recipients label', { text: '4 RECIPIENTS', size: 10, weight: 600, color: C.subtle, x: 24, y: 246 }); // text.xs uppercase fg.subtle — inv:05 §3.3
  const list = [
    ['1', 'alice.eth', '0x4B21…9A3c', '+250.00 USDC', 268],
    ['2', 'Bob · Design', '0x9c0E…14Fd', '+250.00 USDC', 322],
    ['3', 'carol.vela', '0x1A77…D0b2', '+250.00 USDC', 376],
    ['4', '0x5E9b…77Aa', '0x5E9b…77Aa', '+250.00 USDC', 430],
  ];
  list.forEach(([idx, name, addr, amt, y], i) => {
    T(b, 'row index ' + idx, { text: idx, size: 10, weight: 500, color: C.subtle, x: 24, y: y + 10 });   // minW 16 numeric — inv:05 §3.3
    slot(b, 'C/Media/ContactAvatar', { mode: 'tinted-initial', size: '32' }, 'row-avatar-' + idx, 46, y + 2, 32, 32);
    T(b, 'row name ' + idx, { text: name, size: 13, weight: 600, color: C.ink, x: 88, y: y + 2 });
    T(b, 'row address ' + idx, { text: addr, size: 10, weight: 500, color: C.muted, zone: 'mono', x: 88, y: y + 20 });
    rt(b, 'row amount ' + idx, { text: amt, size: 11, weight: 600, color: C.success, f: 0.58, y: y + 2 });
    rt(b, 'row fiat ' + idx, { text: '≈ $250.00', size: 10, weight: 500, color: C.subtle, y: y + 20 });
    if (i > 0) hr(b, 'row hairline ' + idx, 88, y - 6, 278);
  });
  slot(b, 'C/Rows/ConfirmAssets', { variant: 'single' }, 'assets', 24, 496, 168, 28);
  slot(b, 'C/Rows/GasFeeCard', { state: 'ready', expandable: 'yes', expanded: 'no' }, 'gas', 24, 548, 342, 52);
  commit(b);
  lib.chip(b, 'edge', 'slide past 80% -> S/send/confirm/submitting (ONE signature for the whole batch)');
  lib.chip(b, 'edge', 'tap back -> S/send/details/split with every row intact');
  lib.chip(b, 'edge', 'fee re-quote makes the total unpayable -> S/send/confirm/fee-blocker');
  lib.chip(b, 'note', 'the recipient list scrolls INTERNALLY (maxHeight 320, ~5 rows visible) — the page itself never scrolls away from the commit control'); // inv:05 §3.3
  lib.chip(b, 'note', 'split still submits as one MultiSend UserOp: one signature, one fee, one receipt with a numbered recipient list');
  lib.chip(b, 'note', 'first-time-recipient tags are deliberately NOT shown on plain sends; identity = RecipientTrust + RecipientTypeBadge only');
}

// ════════════════════════════════════════ 10 · S/send/confirm/sweep — inv:05 §3.3
{
  const b = await screen('S/send/confirm/sweep', 10);
  chrome(b, 'ArrowLeft', 'Confirm');
  partyRow(b, 'from', 'C/Media/WalletAvatar', { size: '38', style: 'identicon' }, 'Main Wallet', '0x7F3a…C21d', null, C.ink, null, 152); // sender carries NO amount in sweep — inv:05 §3.3
  slot(b, 'C/Rows/FlowArrowSend', null, 'flow-arrow', 24, 196, 38, 40);
  partyRow(b, 'to', 'C/Media/ContactAvatar', { mode: 'tinted-initial', size: '38' }, 'Payroll · Ops', '0x7A3f…9012', '+3 tokens', C.success, '≈ $248.37', 244);
  slot(b, 'C/Primitives/RecipientTypeBadge', { kind: 'contact' }, 'to-badge', 170, 243, 44, 24);
  slot(b, 'C/Rows/ConfirmAssets', { variant: 'multi-collapsed' }, 'assets', 24, 300, 226, 34); // ≤4 overlapping 22px logos + "3 tokens · ≈ $248.37" + chevron — inv:03 §4.2
  slot(b, 'C/Rows/GasFeeCard', { state: 'ready', expandable: 'yes', expanded: 'yes' }, 'gas', 24, 360, 342, 184); // expanded = FeeTokenSelector rows — inv:03 §3.2
  commit(b);
  lib.chip(b, 'edge', 'tap the assets pill -> expands (fadeInDown 200) into open per-token rows, same board');
  lib.chip(b, 'edge', 'pick another fee token -> row shows a 16px accent spinner, slide stays disabled until the re-quote lands');
  lib.chip(b, 'edge', 'slide past 80% -> S/send/confirm/submitting');
  lib.chip(b, 'note', 'GasFeeCard auto-expands ONCE per (chain, account) when >1 fee asset exists, then remembers; insufficient rows stay VISIBLE at opacity 0.4 for context'); // inv:03 §3.1/§3.2
  lib.chip(b, 'note', 'selected fee row = accent Check only — never a filled tint (app-wide picker convention)'); // inv:02 C5
  lib.chip(b, 'note', 'sweep amounts are full balances minus the gas reserve; the trimmed token carries "· gas reserved" in the expanded list');
}

// ════════════════════════════════════════ 11 · S/send/confirm/fee-blocker — inv:05 §3.3
{
  const b = await screen('S/send/confirm/fee-blocker', 11);
  chrome(b, 'ArrowLeft', 'Confirm');
  partyRow(b, 'from', 'C/Media/WalletAvatar', { size: '38', style: 'identicon' }, 'Main Wallet', '0x7F3a…C21d', '−250.00 USDC', C.ink, '≈ $250.00', 152);
  slot(b, 'C/Rows/FlowArrowSend', null, 'flow-arrow', 24, 196, 38, 40);
  partyRow(b, 'to', 'C/Media/ContactAvatar', { mode: 'tinted-initial', size: '38' }, 'vitalik.eth', '0xd8dA…6045', '+250.00 USDC', C.success, '≈ $250.00', 244);
  slot(b, 'C/Rows/ConfirmAssets', { variant: 'single' }, 'assets', 24, 300, 168, 28);
  slot(b, 'C/Rows/GasFeeCard', { state: 'ready', expandable: 'yes', expanded: 'no' }, 'gas', 24, 356, 342, 52);
  // same-asset-fee blocker — the deliberate warning gate (one of the few legitimate cards) — inv:05 §3.3
  R(b, 'blocker card', { x: 24, y: 424, w: 342, h: 108, radius: 12, fill: C.errSoft, stroke: C.err, strokeWidth: 1 });
  I(b, 'AlertCircle', 20, 2, C.err, 36, 436);
  T(b, 'blocker title', { text: 'Not enough USDC to cover this transfer', size: 11, weight: 600, color: C.err, x: 66, y: 438 }); // send.sameFeeTokenTitle
  T(b, 'blocker body 1', { text: 'Sending 250.00 USDC + network fee 0.42 USDC requires', size: 11, weight: 400, color: C.muted, x: 66, y: 462 }); // send.sameFeeTokenBody
  T(b, 'blocker body 2', { text: '250.42 USDC, but you have 250.10.', size: 11, weight: 400, color: C.muted, x: 66, y: 480 });
  T(b, 'blocker max', { text: 'You can send up to 249.58 USDC.', size: 11, weight: 600, color: C.ink, x: 66, y: 502 }); // send.sameFeeTokenMax
  relabel(slot(b, 'C/Primitives/VelaButton', { variant: 'primary', size: 'default', state: 'default' }, 'cta', 24, 743, 342, 53), 'Edit amount', 'label'); // send.sameFeeTokenEdit
  lib.chip(b, 'edge', 'tap Edit amount -> S/send/details with the amount field focused');
  lib.chip(b, 'edge', 'switch the fee to another affordable token -> blocker clears -> S/send/confirm');
  lib.chip(b, 'note', 'this state only exists when the fee is paid in the SAME asset being sent and a re-quote pushed amount+fee over balance'); // inv:05 §3.3
  lib.chip(b, 'note', 'the SlideToConfirm is REPLACED (not disabled) — there is no way to commit an unpayable transfer');
  lib.chip(b, 'note', 'the max line is the actionable number: balance − quoted fee, string-exact so tapping Max never re-trips the gate');
  lib.chip(b, 'motion', 'card enters fadeInDown(0,200); warning haptic is NOT fired here (calm gate, not an alarm)');
}

return lib.done('61-screens-send-c', summary);
