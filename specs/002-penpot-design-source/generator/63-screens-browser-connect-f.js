if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
// 63-screens-browser-connect-f.js — page '06 Screens · Browser & Connect', screen row 2 = S/web-request.
// Phases in this chunk: onboarding (col 1) · processing (col 4) · done (col 5) · error (col 6).  inv:06 §3.2.
// `onboarding` is the ONE phase that is not a card: a hardcoded-English context shell wrapping the
// REAL, fully-localized OnboardingScreen.
const lib = storage.lib;
const PAGE = '06 Screens · Browser & Connect';
const ROW = 2;

const BG = '#FAFAF8', RAISED = '#FFFFFF', SUNKEN = '#F5F3EF';
const INK = '#1A1A18', MUTED = '#6E6B62', SUBTLE = '#8C887E';
const BORDER = '#ECEBE4';
const ACCENT = '#E8572A', ACCENT_SOFT = '#FFF0EB';
const ERROR = '#C62828', ERROR_SOFT = '#FEF2F2';

const missing = [];
const T = (b, n, s) => lib.upsertText(b, n, s).text;
const R = (b, n, s) => lib.upsertRect(b, n, s).rect;
const E = (b, name, d, x, y, o) => {
  const n = lib.norm(name);
  let e = penpotUtils.findShape(s => s.name === n && s.type === 'ellipse', b);
  if (!e) { e = penpot.createEllipse(); e.name = name; b.appendChild(e); }
  if (Math.round(e.width) !== d || Math.round(e.height) !== d) e.resize(d, d);
  penpotUtils.setParentXY(e, x, y);
  e.fills = (o && o.fill) ? [{ fillColor: o.fill, fillOpacity: o.fillOpacity != null ? o.fillOpacity : 1 }] : [];
  e.strokes = (o && o.stroke) ? [{ strokeColor: o.stroke, strokeWidth: o.sw || 2 }] : [];
  if (o && o.opacity != null) e.opacity = o.opacity;
  return e;
};
const ICON = (b, lucide, size, sw, col, x, y, sfx) => {
  const { rect } = lib.upsertRect(b, 'icon:' + lucide + ' ' + size + '/' + sw + (sfx ? ' ' + sfx : ''),
    { x, y, w: size, h: size, stroke: col, strokeWidth: sw });
  rect.fills = [];
  return rect;
};
const HAIR = (b, n, x, y, w) => R(b, n, { x, y, w, h: 1, fill: BORDER });
const tw = (s, size, bold) => Math.round(s.length * size * (bold ? 0.58 : 0.53));
const cx = (s, size, bold, left, width) => Math.round(left + (width - tw(s, size, bold)) / 2);
const INST = (b, family, props, x, y, o) => {
  o = o || {};
  const nm = o.name || ('i:' + family.split('/').pop() + (props ? ' ' + Object.values(props).join(' ') : ''));
  const ph = 'MISSING:' + family;
  let inst = penpotUtils.findShape(s => s.name === lib.norm(nm), b);
  if (inst) { penpotUtils.setParentXY(inst, x, y); }
  else {
    inst = lib.instance(family, props, b, x, y);
    if (inst) { try { inst.name = nm; } catch (e) {} }
  }
  if (!inst) {
    missing.push(family);
    R(b, ph, { x, y, w: o.w || 342, h: o.h || 53, radius: 8, fill: '#FEF2F2', stroke: '#C62828', strokeWidth: 1 });
    T(b, ph + ' label', { text: 'MISSING ' + family, size: 9, weight: 600, color: '#C62828', x: x + 8, y: y + 8 });
    return null;
  }
  const st1 = penpotUtils.findShape(s => s.name === lib.norm(ph), b); if (st1) st1.remove();
  const st2 = penpotUtils.findShape(s => s.name === lib.norm(ph + ' label'), b); if (st2) st2.remove();
  if (o.w) { try { inst.resize(o.w, o.h || Math.round(inst.height)); } catch (e) {} }
  if (o.label) { try { const ts = penpotUtils.findShapes(s => s.type === 'text', inst); if (ts && ts.length) ts[0].characters = o.label; } catch (e) {} }
  return inst;
};
const screen = async (name, col) =>
  (await lib.upsertBoard(PAGE, name, { x: col * 450, y: ROW * 950, w: 390, h: 844, fill: BG })).board;

const popupChrome = (b) => {
  R(b, 'deco:popup-window-chrome', { x: 0, y: 0, w: 390, h: 36, fill: '#EFEDE7' });
  R(b, 'deco:popup-url-pill', { x: 60, y: 8, w: 270, h: 20, radius: 10, fill: RAISED });
  ICON(b, 'Lock', 10, 1.6, SUBTLE, 68, 13, 'popup-url');
  T(b, 'deco:popup-url', { text: 'getvela.app/web-request?session=…', size: 9, weight: 400, color: SUBTLE, x: 84, y: 13 });
  HAIR(b, 'deco:popup-chrome-hairline', 0, 36, 390);
};
const card = (b, y, h) => R(b, 'card (bg.raised, 1px border.base, padding 24, gap 8)', { x: 20, y, w: 350, h, radius: 20, fill: RAISED, stroke: BORDER, strokeWidth: 1 });
const brandTile = (b, key, x, y, isDapp) => {
  R(b, 'brand-tile-' + key + ' 68 (radius 19, bg.sunken, 1px border.base)', { x, y, w: 68, h: 68, radius: 19, fill: SUNKEN, stroke: BORDER, strokeWidth: 1 });
  if (isDapp) {
    R(b, 'image:dapp-logo (https + exact requesting origin ONLY)', { x: x + 14, y: y + 14, w: 40, h: 40, radius: 10, fill: '#FF007A' });
  } else {
    R(b, 'image:vela-app-icon 40', { x: x + 14, y: y + 14, w: 40, h: 40, radius: 10, fill: ACCENT });
    T(b, 'vela-mark-letter', { text: 'V', size: 20, weight: 700, color: RAISED, x: x + 27, y: y + 24 });
  }
};
const identityRow = (b, y) => {
  brandTile(b, 'vela', 78, y, false);
  T(b, 'brand-name-vela', { text: 'Vela Wallet', size: 11, weight: 600, color: INK, x: 77, y: y + 76 });
  E(b, 'connection-mark 38 (accent.soft, 1px border.base, marginTop 15)', 38, 176, y + 15, { fill: ACCENT_SOFT, stroke: BORDER, sw: 1 });
  ICON(b, 'Link2', 19, 2.4, ACCENT, 186, y + 24, 'connection-mark');
  brandTile(b, 'dapp', 244, y, true);
  T(b, 'brand-name-dapp (numberOfLines 1 — the truncating side)', { text: 'app.uniswap.org', size: 11, weight: 600, color: INK, x: 230, y: y + 76 });
};
const velaBrandOnly = (b, y) => {
  brandTile(b, 'vela', 161, y, false);
  T(b, 'brand-name-vela', { text: 'Vela Wallet', size: 11, weight: 600, color: INK, x: 160, y: y + 76 });
};
// waiting / processing / done share one card recipe: brand · spinner · title · note.
const spinnerCard = (b, title, note) => {
  card(b, 328, 225);
  velaBrandOnly(b, 352);
  E(b, 'spinner ActivityIndicator small accent.base', 24, 183, 451, { stroke: ACCENT, sw: 2 });
  T(b, 'title', { text: title, size: 17, weight: 700, color: INK, x: cx(title, 17, true, 20, 350), y: 483 });
  T(b, 'note', { text: note, size: 11, weight: 400, color: MUTED, x: cx(note, 11, false, 20, 350), y: 513 });
};

// ============================================================================
// S/web-request/onboarding — hardcoded-English shell around the REAL OnboardingScreen
// ============================================================================
{
  const b = await screen('S/web-request/onboarding', 1);
  popupChrome(b);
  identityRow(b, 60);
  const t = 'Set up Vela to continue';
  T(b, 'onboarding-title', { text: t, size: 15, weight: 700, color: INK, x: cx(t, 15, true, 0, 390), y: 155 });
  ['Create or recover your wallet. Your connection', 'request from app.uniswap.org will continue', 'automatically.'].forEach((ln, i) => {
    T(b, 'onboarding-note-' + (i + 1), { text: ln, size: 11, weight: 400, color: MUTED, x: cx(ln, 11, false, 0, 390), y: 179 + i * 18 });
  });
  // embedded real screen (flex 1, maxWidth 480) — WelcomeScreen is deliberately brand-dark
  R(b, 'embed:OnboardingScreen (real component, fully i18n)', { x: 0, y: 239, w: 390, h: 605, fill: '#1A1A18' });
  T(b, 'embed:label', { text: 'embedded: OnboardingScreen → see S/onboarding/welcome', size: 8, weight: 500, color: '#85827A', x: 12, y: 247 });
  R(b, 'embed:vela-logo 72', { x: 159, y: 340, w: 72, h: 72, radius: 20, fill: ACCENT });
  T(b, 'embed:vela-logo-letter', { text: 'V', size: 36, weight: 700, color: RAISED, x: 182, y: 358 });
  T(b, 'embed:wordmark', { text: 'Vela', size: 32, weight: 700, color: '#E8E6E1', x: 169, y: 436 });
  T(b, 'embed:tagline-1', { text: 'Your keys, your coins.', size: 15, weight: 400, color: '#9A9790', x: 108, y: 486 });
  T(b, 'embed:tagline-2', { text: 'Simple as a tap.', size: 15, weight: 400, color: '#9A9790', x: 132, y: 508 });
  R(b, 'embed:btn-create-wallet', { x: 44, y: 640, w: 302, h: 53, radius: 16, fill: ACCENT });
  T(b, 'embed:btn-create-wallet-label', { text: 'Create Wallet', size: 15, weight: 600, color: RAISED, x: cx('Create Wallet', 15, true, 44, 302), y: 657 });
  const alt = 'I already have a wallet';
  T(b, 'embed:btn-signin', { text: alt, size: 13, weight: 500, color: '#9A9790', x: cx(alt, 13, false, 0, 390), y: 714 });
  lib.chip(b, 'note', 'the ONE phase that is NOT the card: full page (flex 1, minHeight 640) — a HARDCODED-ENGLISH context shell (identity row + title + note, maxWidth 480, padH 24 / top 24 / bottom 8) wrapping the fully-localized OnboardingScreen'); // inv:06 §3.2
  lib.chip(b, 'note', 'onComplete re-evaluates the held request; chain validation deliberately runs AFTER setup completes, so an unsupported chain surfaces only once a wallet exists'); // inv:06 §3.2
  lib.chip(b, 'note', 'the embedded WelcomeScreen is deliberately brand-dark #1A1A18 in BOTH themes (documented hardcoded-hex exception) — the shell around it stays bg.base'); // inv:06 §5.4
  lib.chip(b, 'edge', 'wallet created, chain supported -> S/web-request/consent');
  lib.chip(b, 'edge', 'wallet created, chain unknown -> S/web-request/unsupported-chain');
  lib.chip(b, 'edge', 'the embedded flow itself -> S/onboarding/welcome');
}

// ============================================================================
// S/web-request/processing — signing handed off to the shared extension-sign path
// ============================================================================
{
  const b = await screen('S/web-request/processing', 4);
  popupChrome(b);
  spinnerCard(b, 'Confirm in Vela', 'Review the request in the Vela confirmation sheet.');
  lib.chip(b, 'note', 'signing hands off to the shared extension-sign path via WebPopupTransport; the account AUTO-SWITCHES to the granted account first, so the sheet can never sign from the wrong address'); // inv:06 §3.2
  lib.chip(b, 'note', 'the popup deliberately shows no request detail — the authoritative review surface is the Vela confirmation sheet, never this window'); // inv:06 §3.2
  lib.chip(b, 'edge', 'the confirmation sheet opens -> O/signing-sheet/clear-signed');
  lib.chip(b, 'edge', 'signature returned -> S/web-request/done');
  lib.chip(b, 'edge', 'user rejects in the sheet / any error response -> S/web-request/error');
}

// ============================================================================
// S/web-request/done — terminal success; the popup self-closes
// ============================================================================
{
  const b = await screen('S/web-request/done', 5);
  popupChrome(b);
  spinnerCard(b, 'Done', 'You can close this window after it finishes.');
  lib.chip(b, 'note', 'terminal state, yet the spinner deliberately STAYS (same card as waiting/processing) because the window is about to vanish — no success tick is drawn'); // inv:06 §3.2
  lib.chip(b, 'motion', 'closePopupSoon: the popup self-closes 250ms after this paints — the copy is a fallback for browsers that block the close'); // inv:06 §3.2
  lib.chip(b, 'edge', 'dApp starts another request -> S/web-request/waiting');
  lib.chip(b, 'edge', 'user opens the wallet to check the result -> S/home/default');
}

// ============================================================================
// S/web-request/error — Vela brand only, never the dApp column
// ============================================================================
{
  const b = await screen('S/web-request/error', 6);
  popupChrome(b);
  card(b, 284, 315);
  velaBrandOnly(b, 308);
  E(b, 'error-icon 44 (error.soft disc)', 44, 173, 407, { fill: ERROR_SOFT });
  ICON(b, 'X', 22, 2, ERROR, 184, 418, 'error-icon');
  const t = 'Request unavailable';
  T(b, 'title', { text: t, size: 17, weight: 700, color: INK, x: cx(t, 17, true, 20, 350), y: 459 });
  ['Set up or recover Vela Wallet, then try again', 'from the dApp.'].forEach((ln, i) => {
    T(b, 'note-line-' + (i + 1), { text: ln, size: 11, weight: 400, color: MUTED, x: cx(ln, 11, false, 20, 350), y: 489 + i * 18 });
  });
  INST(b, 'C/Primitives/VelaButton', { variant: 'secondary', size: 'default', state: 'default' }, 44, 531,
    { w: 302, h: 44, name: 'i:VelaButton secondary "Close"', label: 'Close' });
  lib.chip(b, 'note', 'the dApp column is NEVER shown here — an unidentified or hostile request must not get to render its own branding next to Vela\'s'); // inv:06 §3.2
  lib.chip(b, 'note', 'entered on: missing session param ("Invalid Vela request session."), no window.opener ("Open this page from a dApp using the Vela SDK."), or any error response; the note line shows the error text when there is one'); // inv:06 §3.2
  lib.chip(b, 'edge', 'tap Close -> S/web-request/done');
  lib.chip(b, 'edge', 'user sets up a wallet first -> S/web-request/onboarding');
  lib.chip(b, 'edge', 'dApp retries -> S/web-request/waiting');
}

return lib.done('63-screens-browser-connect-f', {
  boards: ['S/web-request/onboarding', 'S/web-request/processing', 'S/web-request/done', 'S/web-request/error'],
  missingFamilies: missing,
});
