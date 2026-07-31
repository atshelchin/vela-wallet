if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
// 61-screens-send-d.js — S/send boards 12–15 (confirm/submitting, confirm/error,
// receipt/submitted, receipt/confirmed). Page '05 Screens · Wallet', row y=950, x = index * 450.
// Visual truth: inv:05 §3.3 (in-flight status panel + error state), inv:05 §3.4 (TransactionReceipt),
// inv:08 §10.3 (send/sign failure), inv:02 E1 (receipt anatomy). Copy = real en/send.json +
// componentsTx.json strings.
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
const EL = (b, name, d, x, y, o) => {
  const n = lib.norm(name);
  let e = penpotUtils.findShape(s => s.name === n && s.type === 'ellipse', b);
  if (!e) { e = penpot.createEllipse(); e.name = name; b.appendChild(e); }
  if (Math.round(e.width) !== d || Math.round(e.height) !== d) e.resize(d, d);
  penpotUtils.setParentXY(e, x, y);
  e.fills = (o && o.fill) ? [{ fillColor: o.fill, fillOpacity: 1 }] : [];
  if (o && o.stroke) e.strokes = [{ strokeColor: o.stroke, strokeWidth: o.sw || 2, strokeAlignment: 'inner' }];
  return e;
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
const statusBar = (b) => {
  T(b, 'deco:status-bar clock', { text: '9:41', size: 12, weight: 600, color: C.ink, x: 24, y: 14 });
  R(b, 'deco:status-bar signal', { x: 302, y: 16, w: 16, h: 10, fill: C.ink });
  R(b, 'deco:status-bar wifi', { x: 322, y: 16, w: 14, h: 10, fill: C.ink });
  R(b, 'deco:status-bar battery', { x: 340, y: 16, w: 24, h: 10, fill: C.ink });
};
const chrome = (b, backIcon, title) => {
  statusBar(b);
  if (backIcon) I(b, backIcon, 22, 2, C.ink, 33, 65);
  if (title) T(b, 'step title', { text: title, size: 26, weight: 700, color: C.ink, x: 24, y: 104 });
};
const partyRow = (b, key, family, props, name, addr, amount, amountColor, fiat, y) => {
  slot(b, family, props, key + '-avatar', 24, y, 38, 38);
  T(b, key + ' name', { text: name, size: 13, weight: 700, color: C.ink, x: 70, y: y });
  T(b, key + ' address', { text: addr, size: 11, weight: 500, color: C.muted, zone: 'mono', x: 70, y: y + 20 });
  if (amount) {
    rt(b, key + ' amount', { text: amount, size: 13, weight: 700, color: amountColor, f: 0.58, y: y });
    rt(b, key + ' fiat', { text: fiat, size: 10, weight: 500, color: C.subtle, y: y + 20 });
  }
};
// the frozen confirm review shared by the two in-flight boards — inv:05 §3.3
const confirmReview = (b) => {
  partyRow(b, 'from', 'C/Media/WalletAvatar', { size: '38', style: 'identicon' }, 'Main Wallet', '0x7F3a…C21d', '−250.00 USDC', C.ink, '≈ $250.00', 152);
  slot(b, 'C/Rows/FlowArrowSend', null, 'flow-arrow', 24, 196, 38, 40);
  partyRow(b, 'to', 'C/Media/ContactAvatar', { mode: 'tinted-initial', size: '38' }, 'vitalik.eth', '0xd8dA…6045', '+250.00 USDC', C.success, '≈ $250.00', 244);
  slot(b, 'C/Primitives/RecipientTypeBadge', { kind: 'name-service' }, 'to-badge', 152, 243, 44, 24);
  slot(b, 'C/Rows/ConfirmAssets', { variant: 'single' }, 'assets', 24, 300, 168, 28);
  slot(b, 'C/Rows/GasFeeCard', { state: 'ready', expandable: 'yes', expanded: 'no' }, 'gas', 24, 356, 342, 52);
};
// receipt action row — icon + label text actions under the card — inv:05 §3.4
const receiptAction = (b, key, lucide, label, color, x) => {   // icon + label text actions under the card — inv:05 §3.4
  I(b, lucide, 18, 2, color, x + 20, 762);
  ct(b, 'action label ' + key, { text: label, size: 10, weight: 500, color: color, y: 786 }, x + 29);
};

// ════════════════════════════════════════ 12 · S/send/confirm/submitting — inv:05 §3.3
{
  const b = await screen('S/send/confirm/submitting', 12);
  chrome(b, 'ArrowLeft', 'Confirm');
  confirmReview(b);
  // in-flight status panel REPLACES the slide — sunken radius-16 bordered box, padding 16 — inv:05 §3.3
  R(b, 'status panel', { x: 24, y: 716, w: 342, h: 80, radius: 16, fill: C.sunken, stroke: C.border, strokeWidth: 1 });
  EL(b, 'spinner 20 accent', 20, 44, 746, { stroke: C.accent, sw: 2 });
  T(b, 'status text', { text: 'Submitting to network...', size: 13, weight: 500, color: C.muted, x: 76, y: 749 }); // send.txSubmitting
  I(b, 'X', 18, 2, C.subtle, 326, 747);                                  // subtle cancel, only after 3s — inv:05 §3.3
  lib.chip(b, 'edge', 'bundler accepts (userOpHash returned) -> S/send/receipt/submitted');
  lib.chip(b, 'edge', 'submit fails -> S/send/confirm/error');
  lib.chip(b, 'edge', 'passkey prompt cancelled -> S/send/confirm (silent return to idle; a cancelled send never resurrects a prompt)');
  lib.chip(b, 'edge', 'bundler/treasury underfunded -> O/treasury-bootstrap/default ("Bundler account needs more gas.")'); // send.txErrorBundlerFund
  lib.chip(b, 'note', 'status ladder: "Preparing transaction..." -> "Waiting for biometric..." -> "Submitting to network..." — one line, never a progress bar'); // send.txPreparing/txSigning/txSubmitting
  lib.chip(b, 'note', 'the X cancel appears only after 3s of preparing/signing and aborts the passkey prompt; the back gesture is blocked while in flight');
  lib.chip(b, 'platform', 'the biometric step is Face ID / Touch ID (iOS), BiometricPrompt (Android), or the browser WebAuthn dialog (web)');
  lib.chip(b, 'motion', 'panel enters fadeInDown(0,200); success haptic fires the moment the bundler accepts — the on-chain hash resolves later, in the background');
}

// ════════════════════════════════════════ 13 · S/send/confirm/error — inv:05 §3.3, inv:08 §10.3
{
  const b = await screen('S/send/confirm/error', 13);
  chrome(b, 'ArrowLeft', 'Confirm');
  confirmReview(b);
  I(b, 'AlertCircle', 20, 2, C.err, 24, 676);                             // 20pt AlertCircle error.base + message — inv:08 §10.3
  T(b, 'error line 1', { text: 'The transaction couldn’t be submitted.', size: 13, weight: 500, color: C.err, x: 54, y: 674 }); // send.txErrorGeneric
  T(b, 'error line 2', { text: 'Your funds are safe — please try again.', size: 13, weight: 500, color: C.err, x: 54, y: 694 });
  relabel(slot(b, 'C/Primitives/VelaButton', { variant: 'secondary', size: 'default', state: 'default' }, 'retry', 24, 743, 342, 53), 'Try Again', 'label'); // send.txRetryBtn
  lib.chip(b, 'edge', 'tap Try Again -> S/send/confirm/submitting (resets to idle and re-arms the slide)');
  lib.chip(b, 'edge', 'error names an underfunded bundler -> O/treasury-bootstrap/default (fund + retry the interrupted step)');
  lib.chip(b, 'edge', 'submitted-but-timed-out -> same board, "Transaction submitted but confirmation timed out. Check history later."'); // send.txErrorTimeout
  lib.chip(b, 'note', 'raw RPC errors are NEVER shown — always a calm localized string, and always the funds-are-safe framing'); // inv:08 §19
  lib.chip(b, 'note', 'the review above stays on screen unchanged: the user can re-read exactly what failed before retrying');
  lib.chip(b, 'motion', 'hapticError on failure; the slide springs home and clears its latch so it can be used again');
}

// ════════════════════════════════════════ 14 · S/send/receipt/submitted — inv:05 §3.4
{
  const b = await screen('S/send/receipt/submitted', 14);
  statusBar(b);                                                           // the receipt REPLACES the whole flow — no nav bar, no title
  slot(b, 'C/Primitives/TransactionReceipt', { status: 'submitted' }, 'receipt', 0, 40, 390, 680);
  receiptAction(b, 'share', 'Share2', 'Share', C.muted, 130);
  receiptAction(b, 'save-contact', 'UserPlus', 'Save to contacts', C.muted, 210);
  lib.chip(b, 'edge', 'on-chain receipt succeeds (polled every 3s) -> S/send/receipt/confirmed');
  lib.chip(b, 'edge', 'on-chain receipt reverts -> S/send/receipt/failed');
  lib.chip(b, 'edge', '60s countdown elapses -> same board, the countdown becomes "Still confirming"'); // componentsTx.receipt.confirmingDelayed
  lib.chip(b, 'edge', 'tap Done -> S/index (the send flow is torn down)');
  lib.chip(b, 'note', 'the countdown is expectation-setting, NOT a deadline — the receipt self-polls and the Tx Hash row appears only once the hash resolves'); // inv:05 §3.4
  lib.chip(b, 'note', 'instance owns the card + Done; the Tx-hash row and these actions sit BETWEEN card and Done in the real screen'); // inv:02 E1 note
  lib.chip(b, 'platform', 'Share = native share sheet (iOS/Android) or a download of the 390pt @2x canvas twin (web); Explorer opens once the tx hash exists');
}

// ════════════════════════════════════════ 15 · S/send/receipt/confirmed — inv:05 §3.4
{
  const b = await screen('S/send/receipt/confirmed', 15);
  statusBar(b);
  slot(b, 'C/Primitives/TransactionReceipt', { status: 'confirmed' }, 'receipt', 0, 40, 390, 680);
  hr(b, 'txhash hairline', 24, 726, 342);
  T(b, 'txhash label', { text: 'Tx Hash', size: 11, weight: 500, color: C.muted, x: 24, y: 736 });          // componentsTx.receipt.txHash
  T(b, 'txhash value', { text: '0x4c8a…9f21', size: 11, weight: 500, color: C.ink, zone: 'mono', x: 92, y: 736 });
  I(b, 'ExternalLink', 13, 2, C.muted, 350, 736);
  receiptAction(b, 'explorer', 'Compass', 'Explorer', C.muted, 60);
  receiptAction(b, 'share', 'Share2', 'Share', C.muted, 150);
  receiptAction(b, 'save-contact', 'Check', 'Saved', C.success, 240);      // Save → Check "Saved"; single-send only, never split — inv:05 §3.4
  lib.chip(b, 'edge', 'tap Explorer / the Tx Hash row -> the chain explorer, outside the app');
  lib.chip(b, 'edge', 'tap Save to contacts -> same board, the action flips to a success Check + "Saved"');
  lib.chip(b, 'edge', 'tap Done -> S/index');
  lib.chip(b, 'note', 'confirmed adds a 72px QR of the explorer link + "Scan to view on explorer" — the phone hands the link to a desktop'); // componentsTx.receipt.scanHint
  lib.chip(b, 'note', 'UserOp Hash is copyable from the moment of submission; Tx Hash appears once resolved (including on failed)');
  lib.chip(b, 'note', 'Save to contacts is offered on single sends only — never on split/sweep');
  lib.chip(b, 'platform', 'share/export renders a 390pt-wide @2x canvas twin with the SAME layout language (sunken outer bg, raised card, identical labels)');
}

return lib.done('61-screens-send-d', summary);
