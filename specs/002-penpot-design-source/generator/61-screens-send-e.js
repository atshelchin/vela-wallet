if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
// 61-screens-send-e.js — S/send boards 16–19 (receipt/failed, locked/resolving,
// locked/network-not-supported, locked/unknown-token). Page '05 Screens · Wallet',
// row y=950, x = state index * 450.
// Visual truth: inv:05 §3.4 (receipt failed strip), inv:05 §3.5 (EIP-681 locked entry +
// exceptions), inv:02 E1. Copy = real en/send.json (send.lock.*) + componentsTx.json strings.
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
const receiptAction = (b, key, lucide, label, color, x) => {   // icon + label text actions under the card — inv:05 §3.4
  I(b, lucide, 18, 2, color, x + 20, 762);
  ct(b, 'action label ' + key, { text: label, size: 10, weight: 500, color: color, y: 786 }, x + 29);
};
// Locked-entry exception layout: centered column, gap 12, 64px accent.soft disc — inv:05 §3.5
const exception = (b, lucide, title, body1, body2) => {
  statusBar(b);
  I(b, 'X', 22, 2, C.ink, 33, 65);
  EL(b, 'exception disc 64', 64, 163, 296, { fill: C.accentSoft });
  I(b, lucide, 30, 2, C.accent, 180, 313);
  ct(b, 'exception title', { text: title, size: 17, weight: 700, color: C.ink, y: 384, f: 0.58 });
  ct(b, 'exception body 1', { text: body1, size: 13, weight: 400, color: C.subtle, y: 414 });
  if (body2) ct(b, 'exception body 2', { text: body2, size: 13, weight: 400, color: C.subtle, y: 434 });
};

// ════════════════════════════════════════ 16 · S/send/receipt/failed — inv:05 §3.4
{
  const b = await screen('S/send/receipt/failed', 16);
  statusBar(b);                                                            // receipt replaces the whole flow — no nav bar
  slot(b, 'C/Primitives/TransactionReceipt', { status: 'failed' }, 'receipt', 0, 40, 390, 680);
  hr(b, 'txhash hairline', 24, 726, 342);
  T(b, 'txhash label', { text: 'Tx Hash', size: 11, weight: 500, color: C.muted, x: 24, y: 736 });
  T(b, 'txhash value', { text: '0x9b12…4e77', size: 11, weight: 500, color: C.ink, zone: 'mono', x: 92, y: 736 }); // shown on failed too — inv:05 §3.4
  I(b, 'ExternalLink', 13, 2, C.muted, 350, 736);
  receiptAction(b, 'explorer', 'Compass', 'Explorer', C.muted, 110);
  receiptAction(b, 'share', 'Share2', 'Share', C.muted, 210);
  lib.chip(b, 'edge', 'tap Explorer / the Tx Hash row -> the chain explorer (the revert reason lives there)');
  lib.chip(b, 'edge', 'tap Done -> S/index; starting again is a fresh S/send/select-token');
  lib.chip(b, 'note', 'failed hint is explicit about money: "The transfer reverted on-chain — your funds were not sent. A network fee may still have been charged."'); // componentsTx.receipt.failedHint
  lib.chip(b, 'note', 'Save to contacts is withheld on a failed send — the receipt still exports/shares for support threads');
  lib.chip(b, 'note', 'the hero tint is error.soft → bg.raised at 82%; the stamp row is XCircle 18 + "Failed" in error.base'); // inv:02 E1
  lib.chip(b, 'platform', 'the shared canvas twin renders the same failed state — 390pt @2x, identical labels');
}

// ════════════════════════════════════════ 17 · S/send/locked/resolving — inv:05 §3.5
{
  const b = await screen('S/send/locked/resolving', 17);
  statusBar(b);
  I(b, 'X', 22, 2, C.ink, 33, 65);                                          // step-1 chrome: the locked entry is still step 1
  EL(b, 'spinner 32 accent', 32, 179, 406, { stroke: C.accent, sw: 2.5 });   // accent spinner, centered — inv:05 §3.5
  lib.chip(b, 'edge', 'EIP-681 request resolves -> S/send/details with token+chain+recipient pre-filled and locked');
  lib.chip(b, 'edge', 'chain is unknown to Vela -> S/send/locked/network-not-supported');
  lib.chip(b, 'edge', 'token cannot be recognised on that chain -> S/send/locked/unknown-token');
  lib.chip(b, 'edge', 'tap X -> S/index (the request is abandoned)');
  lib.chip(b, 'note', 'deliberately copy-free in source: a single accent spinner, no title, no skeleton — the wait is sub-second on a healthy RPC'); // inv:05 §3.5
  lib.chip(b, 'note', 'a request WITH an amount locks the amount field too; an amount-less request leaves it editable'); // inv:05 §3.5
  lib.chip(b, 'note', 'entered from a QR scan (O/qr-scanner) or a velawallet:// deep link — the same resolver in both cases');
}

// ════════════════════════════════════════ 18 · S/send/locked/network-not-supported — inv:05 §3.5
{
  const b = await screen('S/send/locked/network-not-supported', 18);
  exception(b, 'Globe', 'Network not supported',                            // send.lock.netTitle
    'This payment request is on a network Vela',                            // send.lock.netBody
    'doesn’t support yet (chain 8899).');
  relabel(slot(b, 'C/Primitives/VelaButton', { variant: 'primary', size: 'default', state: 'default' }, 'cta', 24, 492, 342, 53), 'Add this network', 'label'); // send.lock.addNetwork
  ct(b, 'inline error', { text: 'We couldn’t find that network.', size: 11, weight: 500, color: C.err, y: 560 }); // send.lock.netNotFound
  ct(b, 'cancel button', { text: 'Cancel', size: 13, weight: 500, color: C.muted, y: 590 });
  lib.chip(b, 'edge', 'tap Add this network + compatibility check passes -> S/send/locked/resolving');
  lib.chip(b, 'edge', 'add fails -> same board, inline error.base line (netNotFound / netNotCompatible / netAddError)');
  lib.chip(b, 'edge', 'tap Cancel -> S/index');
  lib.chip(b, 'note', 'the primary CTA carries its own loading state; the failure is an INLINE line, never a dialog — the user stays in the request'); // inv:05 §3.5
  lib.chip(b, 'note', 'the disc is accent.soft + an accent glyph: this is an unfinished journey, not an error (nothing is red)');
  lib.chip(b, 'note', 'compatibility means Vela smart accounts — a chain can exist and still be refused ("isn’t compatible with Vela smart accounts yet")');
}

// ════════════════════════════════════════ 19 · S/send/locked/unknown-token — inv:05 §3.5
{
  const b = await screen('S/send/locked/unknown-token', 19);
  exception(b, 'AlertCircle', 'Unknown token',                              // send.lock.tokenTitle
    'We couldn’t recognize the token in this payment',                      // send.lock.tokenBody
    'request on this network.');
  ct(b, 'cancel button', { text: 'Cancel', size: 13, weight: 500, color: C.muted, y: 492 });
  lib.chip(b, 'edge', 'tap Cancel / X -> S/index');
  lib.chip(b, 'note', 'Cancel ONLY — there is no "add it anyway" escape here: an unrecognised token in a payment request is a scam surface');
  lib.chip(b, 'note', 'same exception skeleton as network-not-supported (64px accent.soft disc, text.xl bold title, centred fg.subtle body), minus the primary CTA'); // inv:05 §3.5
  lib.chip(b, 'note', 'the user can still send that token manually via S/send/select-token → O/add-token-sheet/form if they trust it');
}

return lib.done('61-screens-send-e', summary);
