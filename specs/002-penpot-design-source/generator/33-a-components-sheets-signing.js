// 33-a-components-sheets-signing.js — sheet chrome (split a/3): C/Sheets/AppModal,
// C/Sheets/SheetHeader, C/Sheets/AppAlert, C/Primitives/TransactionReceipt.
// Visual truth: inv:07 §1 (AppModal shell), inv:07 §1.8 (header pattern), inv:07 §2 (web alert),
// inv:02 E1 (receipt — NOTE: lives outside this agent's assigned 03/07 sections; read + anchored).
// Idempotency: family-level skip-if-exists (variant containers are not field-upsertable).
// Final column x=2800, families y 1000/1900/2800/3700; scratch row y=8000 from x=5000.
if (!storage.lib) throw new Error('run 10-lib.js first');
const lib = storage.lib;
await lib.open('03 Components');

const FINAL_X = 2800, SCRATCH_Y = 8000;
let sx = 5000;
const summary = { built: {}, skipped: [], variantErrors: 0 };
const exists = (fam) => penpot.library.local.components.some(c => c.name === lib.norm(fam));
const bind = (shape, token, props) => { try { lib.bindToken(shape, token, props); } catch (e) {} };
const B = (name, w, h, fill, op) => {
  const b = penpot.createBoard();
  b.name = name;
  b.x = sx; b.y = SCRATCH_Y; sx += w + 60;
  b.resize(w, h);
  b.fills = fill ? [{ fillColor: fill, fillOpacity: op == null ? 1 : op }] : [];
  return b;
};
const T = (b, name, s) => lib.upsertText(b, name, s).text;
const R = (b, name, s) => lib.upsertRect(b, name, s).rect;
// Icon convention: placeholder rect whose NAME encodes the real Lucide icon (machine-readable).
const I = (b, lucide, size, sw, color, x, y) => {
  const r = R(b, 'icon:' + lucide + ' ' + size + '/' + sw, { x, y, w: size, h: size, stroke: color, strokeWidth: sw });
  r.fills = [];
  return r;
};
const E = (b, name, size, fill, x, y, strokeColor) => {
  const e = penpot.createEllipse();
  e.name = name;
  b.appendChild(e);
  e.resize(size, size);
  e.fills = fill ? [{ fillColor: fill, fillOpacity: 1 }] : [];
  if (strokeColor) e.strokes = [{ strokeColor, strokeWidth: 2 }];
  e.x = b.x + x; e.y = b.y + y;
  return e;
};
const combine = async (comps, family, axes, finalY) => {
  await lib.sleep(400);
  const container = penpot.createVariantFromComponents(comps.map(c => c.mainInstance()));
  await lib.sleep(500);
  container.name = family;
  container.x = FINAL_X; container.y = finalY;
  const vv = container.variants;
  vv.renameProperty(0, axes[0]);
  if (axes.length > 1) {
    for (let i = 1; i < axes.length; i++) vv.addProperty();
    await lib.sleep(300);
    for (let i = 1; i < axes.length; i++) vv.renameProperty(i, axes[i]);
    await lib.sleep(200);
    for (const vc of container.variants.variantComponents()) {
      const parts = String(Object.values(vc.variantProps)[0] || '').split(' ');
      if (parts.length === axes.length) parts.forEach((p, i) => vc.setVariantProperty(i, p));
    }
  }
  await lib.sleep(300);
  summary.variantErrors += container.variants.variantComponents().filter(vc => vc.variantError).length;
  summary.built[family] = comps.length;
  return container;
};

// ============================================================================
// Family 1 — C/Sheets/AppModal (single cross-platform sheet primitive). inv:07 §1
// ============================================================================
if (exists('C/Sheets/AppModal')) summary.skipped.push('C/Sheets/AppModal');
else {
  const comps = [];
  const GEO = {
    'ios-pagesheet': { top: 24, backdrop: false }, // native pageSheet; no visible backdrop on native — inv:07 §1.1/§1.3
    'android':       { top: 24, backdrop: false }, // same shell, custom PanResponder drag on handle — inv:07 §1.2
    'web':           { top: 140, backdrop: true }, // bottom-anchored portal sheet, max-height 92% — inv:07 §1.4
    'fit':           { top: 300, backdrop: true }, // content-height card over dimmed backdrop, native only — inv:07 §1.3
  };
  for (const [vName, g] of Object.entries(GEO)) {
    const b = B(vName, 390, 560, g.backdrop ? '#000000' : null, 0.35); // backdrop rgba(0,0,0,0.35) BOTH themes — inv:07 §0
    if (g.backdrop) bind(b, 'color.fixed.backdrop', ['fill']);
    // sheet: bg.base root, top corners radius.2xl 20 (fit/web spec; native corners are UIKit's own) — inv:07 §1.1/§1.3/§1.4
    const sheet = R(b, 'sheet', { x: 0, y: g.top, w: 390, h: 560 - g.top + 24, fill: '#FAFAF8', radius: 20 });
    bind(sheet, 'color.bg.base', ['fill']);
    bind(sheet, 'radius.2xl', ['borderRadiusTopLeft', 'borderRadiusTopRight']);
    // handle bar 36×5 radius 3 border.base, handle area padTop 10 — inv:07 §1.1
    const handle = R(b, 'handle bar', { x: 177, y: g.top + 10, w: 36, h: 5, fill: '#ECEBE4', radius: 3 });
    bind(handle, 'color.border.base', ['fill']);
    T(b, 'content slot', { text: '· sheet content ·', size: 13, weight: 500, color: '#8C887E', x: 148, y: g.top + Math.round((560 - g.top) / 2) });
    comps.push(penpot.library.local.createComponent([b]));
  }
  const c = await combine(comps, 'C/Sheets/AppModal', ['presentation'], 1000);
  lib.chip(c, 'motion', 'iOS native slide; web translateY(100%)→0 300ms cubic-bezier(.4,0,.2,1); fit 220ms in/180ms out; android handle-drag dismiss dy>90 or vy>0.5 (armed haptic at 90, spring back t80 f10; web drag 80 — 90 canonical)'); // inv:07 §1.2–1.4, §11.8
  lib.chip(c, 'note', 'axes collapsed: manifest mode×platform → 4 presentations; fit = native-only (ios≡android); android-dragged = motion, not a variant'); // inv:07 §1.3
  lib.chip(c, 'note', 'single-modal rule: iOS never stacks a 2nd sheet — content SWAPS instead (funding, rpc-fix, contacts views, bug-report)'); // inv:07 §1.7-1
  lib.chip(c, 'note', 'backdrop tap dismisses on web + fit only; full native sheets have no visible backdrop; native pageSheet corners are UIKit-native (20 drawn as stand-in)'); // inv:07 §1.3/§1.4
  lib.chip(c, 'platform', 'KeyboardAvoidingView behavior=padding BOTH platforms; web adds Escape/focus-trap/scroll-lock via useWebDialog'); // inv:07 §1.5, §11.10
}

// ============================================================================
// Family 2 — C/Sheets/SheetHeader (standard sheet header pattern). inv:07 §1.8
// ============================================================================
if (exists('C/Sheets/SheetHeader')) summary.skipped.push('C/Sheets/SheetHeader');
else {
  const comps = [];
  { // centered: [34 spacer][centered title text.xl 17 bold][34×34 plain X, icon 20/2] — inv:07 §1.8; copy inv:07 §5.4
    const b = B('centered', 390, 50, '#FAFAF8'); bind(b, 'color.bg.base', ['fill']);
    T(b, 'title', { text: 'Add token', size: 17, weight: 700, color: '#1A1A18', x: 155, y: 16 });
    I(b, 'X', 20, 2, '#1A1A18', 343, 15);
    comps.push(penpot.library.local.createComponent([b]));
  }
  { // left-aligned title + right X (AccountSwitcherModal et al.) — inv:07 §1.8/§5.8
    const b = B('left-aligned', 390, 50, '#FAFAF8'); bind(b, 'color.bg.base', ['fill']);
    T(b, 'title', { text: 'Accounts', size: 17, weight: 700, color: '#1A1A18', x: 20, y: 16 });
    I(b, 'X', 20, 2, '#1A1A18', 343, 15);
    comps.push(penpot.library.local.createComponent([b]));
  }
  { // title + text action "Clear all" in error.base (BrowserHistorySheet) — inv:07 §1.8/§5.9
    const b = B('text-action', 390, 50, '#FAFAF8'); bind(b, 'color.bg.base', ['fill']);
    T(b, 'title', { text: 'Recent dApps', size: 17, weight: 700, color: '#1A1A18', x: 20, y: 16 });
    const act = T(b, 'action', { text: 'Clear all', size: 11, weight: 600, color: '#C62828', x: 322, y: 19 });
    bind(act, 'color.error.base', ['fill']);
    comps.push(penpot.library.local.createComponent([b]));
  }
  const c = await combine(comps, 'C/Sheets/SheetHeader', ['variant'], 1900);
  lib.chip(c, 'note', 'AddTokenSheet exception: X icon 18px (07 §5.4); standard X = 20px in a 34×34 plain target, strokeWidth 2, hitSlop 8, no bg/border'); // inv:07 §1.8/§5.4
  lib.chip(c, 'note', 'row pad: horizontal 20, vertical 8; title numberOfLines 1; BrowserHistorySheet drifts to a 15px title (07 §5.9)'); // inv:07 §1.8
}

// ============================================================================
// Family 3 — C/Sheets/AppAlert (web-styled confirmation dialog). inv:07 §2
// ============================================================================
if (exists('C/Sheets/AppAlert')) summary.skipped.push('C/Sheets/AppAlert');
else {
  const comps = [];
  const card = (b, h) => { // card bg.raised r16 pad 20 w 85%≤340 shadow.lg — inv:07 §2
    const r = R(b, 'card', { x: 29, y: 100, w: 332, h, fill: '#FFFFFF', radius: 16 });
    bind(r, 'color.bg.raised', ['fill']);
    bind(r, 'shadow.lg', ['shadow']);
    bind(r, 'radius.xl', ['borderRadiusTopLeft', 'borderRadiusTopRight', 'borderRadiusBottomRight', 'borderRadiusBottomLeft']);
    return r;
  };
  const head = (b, title, msg) => { // title text.lg bold fg.base; message text.base regular fg.subtle — inv:07 §2
    T(b, 'title', { text: title, size: 15, weight: 700, color: '#1A1A18', x: 49, y: 120 });
    T(b, 'message', { text: msg, size: 13, weight: 400, color: '#8C887E', x: 49, y: 146 });
  };
  const txtBtn = (b, name, label, color, x, y) => T(b, name, { text: label, size: 13, weight: 600, color, x, y }); // text-only button — inv:07 §2
  const fillBtn = (b, name, label, fill, x, y, w) => { // filled button pad 8×16 r12 minWidth 70 — inv:07 §2
    const r = R(b, name, { x, y, w, h: 34, fill, radius: 12 });
    T(b, name + ' label', { text: label, size: 13, weight: 600, color: '#FFFFFF', x: x + 16, y: y + 9 });
    return r;
  };
  { // one-button: scanner upload-decode error — inv:07 §10; default role = text accent — inv:07 §2
    const b = B('one-button', 390, 340, '#000000', 0.35); bind(b, 'color.fixed.backdrop', ['fill']);
    card(b, 120); head(b, 'No QR found', 'Try a sharper photo of the code.');
    txtBtn(b, 'btn ok', 'OK', '#E8572A', 321, 178);
    comps.push(penpot.library.local.createComponent([b]));
  }
  { // two-button: contacts export 2-option alert (JSON/CSV) — inv:03 §5.3; implicit primary = last non-cancel filled accent — inv:07 §2
    const b = B('two-button', 390, 340, '#000000', 0.35); bind(b, 'color.fixed.backdrop', ['fill']);
    card(b, 130); head(b, 'Export contacts', 'Choose a format for the export file.');
    txtBtn(b, 'btn json', 'JSON', '#E8572A', 214, 193);
    bind(fillBtn(b, 'btn csv', 'CSV', '#E8572A', 261, 184, 80), 'color.accent.base', ['fill']);
    comps.push(penpot.library.local.createComponent([b]));
  }
  { // three-button: export + Cancel (manifest buttons axis "three"; 03 §5.3 documents the 2-option core — see chip)
    const b = B('three-button', 390, 340, '#000000', 0.35); bind(b, 'color.fixed.backdrop', ['fill']);
    card(b, 130); head(b, 'Export contacts', 'Choose a format for the export file.');
    txtBtn(b, 'btn cancel', 'Cancel', '#8C887E', 148, 193); // cancel role = text fg.subtle — inv:07 §2
    txtBtn(b, 'btn json', 'JSON', '#E8572A', 214, 193);
    bind(fillBtn(b, 'btn csv', 'CSV', '#E8572A', 261, 184, 80), 'color.accent.base', ['fill']);
    comps.push(penpot.library.local.createComponent([b]));
  }
  { // destructive: filled error.base + fg.inverse (disconnect dApp confirm) — inv:07 §2/§8.4
    const b = B('destructive', 390, 340, '#000000', 0.35); bind(b, 'color.fixed.backdrop', ['fill']);
    card(b, 140); head(b, 'Disconnect this site?', "app.uniswap.org won't see your address anymore.");
    txtBtn(b, 'btn cancel', 'Cancel', '#8C887E', 178, 203);
    bind(fillBtn(b, 'btn disconnect', 'Disconnect', '#C62828', 233, 194, 108), 'color.error.base', ['fill']);
    comps.push(penpot.library.local.createComponent([b]));
  }
  const c = await combine(comps, 'C/Sheets/AppAlert', ['layout'], 2800);
  lib.chip(c, 'platform', 'native = OS system alert (Alert.alert, unthemed) — this styled card is WEB-ONLY'); // inv:07 §2, §11.3
  lib.chip(c, 'note', 'backdrop tap / Escape = dismiss w/o action; role=alertdialog, focus-trapped; body-level portal z 9999999 — always above every AppModal'); // inv:07 §2, §1.7-4
  lib.chip(c, 'note', 'button grammar: default = text accent · cancel = text fg.subtle · destructive = filled error.base · implicit primary (last non-cancel when >1) = filled accent'); // inv:07 §2
  lib.chip(c, 'note', 'axes collapsed: manifest buttons×role → 4 documented compositions; three-button = export alert + cancel (inventory documents the 2-option core, 03 §5.3)');
}

// ============================================================================
// Family 4 — C/Primitives/TransactionReceipt (bank-style receipt). inv:02 E1
// ============================================================================
if (exists('C/Primitives/TransactionReceipt')) summary.skipped.push('C/Primitives/TransactionReceipt');
else {
  const comps = [];
  const ST = { // status tints + colors — inv:02 E1 (confirmed success.soft / submitted warning.soft / failed error.soft)
    submitted: { tint: '#FFF8F0', color: '#92600A', icon: 'Clock',        word: 'Submitted', tintTk: 'color.warning.soft', colTk: 'color.warning.base' },
    confirmed: { tint: '#EDFAF2', color: '#2D8E5F', icon: 'CheckCircle2', word: 'Confirmed', tintTk: 'color.success.soft', colTk: 'color.success.base' },
    failed:    { tint: '#FEF2F2', color: '#C62828', icon: 'XCircle',      word: 'Failed',    tintTk: 'color.error.soft',   colTk: 'color.error.base' },
  };
  for (const [stName, st] of Object.entries(ST)) {
    const b = B(stName, 390, 680, '#FAFAF8'); bind(b, 'color.bg.base', ['fill']);
    // receipt card: bg.raised, radius 16 (xl), 1px border.base, clipped — inv:02 E1
    const cardR = R(b, 'receipt card', { x: 24, y: 20, w: 342, h: 540, fill: '#FFFFFF', radius: 16, stroke: '#ECEBE4', strokeWidth: 1 });
    bind(cardR, 'color.bg.raised', ['fill']);
    // hero: state-tint (real thing is a vertical gradient tint→bg.raised@82% — drawn flat, see chip) — inv:02 E1
    const tint = R(b, 'hero tint', { x: 24, y: 20, w: 342, h: 96, fill: st.tint, radius: 16 });
    bind(tint, st.tintTk, ['fill']);
    E(b, 'TokenLogo 52 · ETH', 52, '#F5F3EF', 169, 30); // TokenLogo 52 — inv:02 E1
    I(b, st.icon, 18, 2.4, st.color, 148, 90); // state icon 18 sw2.4 — inv:02 E1
    const word = T(b, 'status word', { text: st.word, size: 15, weight: 700, color: st.color, x: 172, y: 90 }); // text.lg bold state color — inv:02 E1
    bind(word, st.colTk, ['fill']);
    T(b, 'meta line', { text: 'Ethereum · Jul 29, 2026 · 14:32', size: 10, weight: 400, color: '#8C887E', x: 120, y: 122 }); // Chain · date — inv:02 E1
    // From→To flow (identity treatment = confirm screen), padH 12 — inv:02 E1
    E(b, 'WalletAvatar 38 · from', 38, '#F5F3EF', 40, 148);
    T(b, 'from name', { text: 'Main Wallet', size: 13, weight: 700, color: '#1A1A18', x: 90, y: 150 });
    T(b, 'from addr', { text: '0x7F3a…C21d', size: 11, weight: 500, zone: 'mono', color: '#6E6B62', x: 90, y: 168 });
    T(b, 'from amount', { text: '−1.2 ETH', size: 13, weight: 700, color: '#1A1A18', x: 296, y: 150 }); // out = ink — inv:02 E1
    I(b, 'MoveDown', 20, 1.5, '#ECEBE4', 49, 194); // FlowArrow connector in border.base — inv:02 E1 + inv:03 §4.3
    E(b, 'ContactAvatar 38 · to', 38, '#F5F3EF', 40, 222);
    T(b, 'to name', { text: 'vitalik.eth', size: 13, weight: 700, color: '#1A1A18', x: 90, y: 224 });
    T(b, 'to addr', { text: '0xd8dA…6045', size: 11, weight: 500, zone: 'mono', color: '#6E6B62', x: 90, y: 242 });
    const inAmt = T(b, 'to amount', { text: '+1.2 ETH', size: 13, weight: 700, color: '#2D8E5F', x: 294, y: 224 }); // in = success.base — inv:02 E1
    bind(inAmt, 'color.success.base', ['fill']);
    // meta row: UserOp hash tap-to-copy (available instantly) — inv:02 E1
    R(b, 'meta hairline', { x: 36, y: 272, w: 318, h: 1, fill: '#ECEBE4' });
    T(b, 'userop label', { text: 'UserOp', size: 11, weight: 500, color: '#6E6B62', x: 36, y: 282 });
    T(b, 'userop hash', { text: '0x1234567890…abcdef', size: 11, weight: 500, zone: 'mono', color: '#1A1A18', x: 110, y: 282 });
    I(b, 'Copy', 13, 2, '#6E6B62', 341, 282);
    // settlement block — inv:02 E1
    R(b, 'settlement hairline', { x: 36, y: 306, w: 318, h: 1, fill: '#ECEBE4' });
    if (stName === 'confirmed') { // QR 72 of the explorer URL + hint — inv:02 E1
      R(b, 'qr plate', { x: 151, y: 316, w: 88, h: 88, fill: '#FFFFFF', radius: 8, stroke: '#ECEBE4', strokeWidth: 1 }); // QR pinned on white in both themes — inv:07 §11.5
      R(b, 'QRCode 72 · explorer link', { x: 159, y: 324, w: 72, h: 72, fill: '#1A1A18' });
      T(b, 'settle hint', { text: 'Scan to view on the explorer', size: 10, weight: 400, color: '#8C887E', x: 128, y: 410 });
    } else if (stName === 'submitted') { // countdown 60s window + progress track h7 warning.soft/base — inv:02 E1
      T(b, 'settle hint', { text: 'Waiting for the network to confirm', size: 11, weight: 500, color: '#6E6B62', x: 36, y: 318 });
      T(b, 'countdown label', { text: 'EST. CONFIRMATION', size: 10, weight: 500, color: '#8C887E', x: 36, y: 344 });
      const cd = T(b, 'countdown', { text: '00:37', size: 11, weight: 700, color: '#92600A', x: 322, y: 342 });
      bind(cd, 'color.warning.base', ['fill']);
      R(b, 'progress track', { x: 36, y: 364, w: 318, h: 7, fill: '#FFF8F0', radius: 999 });
      const fillBar = R(b, 'progress fill', { x: 36, y: 364, w: 122, h: 7, fill: '#92600A', radius: 999 });
      bind(fillBar, 'color.warning.base', ['fill']);
      T(b, 'poll hint', { text: 'Checking automatically…', size: 10, weight: 400, color: '#8C887E', x: 36, y: 382 });
    } else { // failed: hint in error.base, explorer still reachable — inv:02 E1
      const hint = T(b, 'settle hint', { text: 'This transaction reverted — still inspectable on the explorer.', size: 11, weight: 500, color: '#C62828', x: 36, y: 318 });
      bind(hint, 'color.error.base', ['fill']);
    }
    // footer: calm 3-tier signature — inv:02 E1
    R(b, 'footer hairline', { x: 36, y: 430, w: 318, h: 1, fill: '#ECEBE4' });
    E(b, 'Vela mark 34', 34, '#E8572A', 178, 448);
    const brand = T(b, 'brand', { text: 'VELA WALLET', size: 11, weight: 700, color: '#6E6B62', x: 148, y: 492 }); // ls 2.5 — inv:02 E1
    brand.letterSpacing = '2.5';
    T(b, 'brand url', { text: 'getvela.app', size: 10, weight: 400, color: '#8C887E', x: 166, y: 512 });
    // Done: full-width fg.base fill r16 padV16 (⚠ re-implements VelaButton primary) — inv:02 E1
    const done = R(b, 'done button', { x: 24, y: 584, w: 342, h: 53, fill: '#1A1A18', radius: 16 });
    bind(done, 'color.fg.base', ['fill']);
    T(b, 'done label', { text: 'Done', size: 15, weight: 600, color: '#FFFFFF', x: 176, y: 600 });
    comps.push(penpot.library.local.createComponent([b]));
  }
  const c = await combine(comps, 'C/Primitives/TransactionReceipt', ['status'], 3700);
  lib.chip(c, 'note', 'axes collapsed: kind(single|split|multiSelect) × saveContact(none|available|saved) drawn as kind=single — split numbered list, multiSelect left-rule token list, actions row (Explorer/Share/Save-contact) + Tx-hash row live on the S/send receipt boards'); // inv:02 E1
  lib.chip(c, 'note', 'hero tint is an SVG vertical gradient state-tint → bg.raised at 82% — drawn flat here'); // inv:02 E1
  lib.chip(c, 'note', 'submitted: 60s countdown window (then "still confirming" copy); UserOp hash copyable instantly; progressbar a11y role with value'); // inv:02 E1
  lib.chip(c, 'note', 'Done re-implements VelaButton primary (02 §Z-7 drift); shareable canvas twin 390pt@2x must mirror 1:1 (its font name drifts to "Inter")'); // inv:02 E1, §Z-7
}

return lib.done('33-a-components-sheets-signing', summary);
