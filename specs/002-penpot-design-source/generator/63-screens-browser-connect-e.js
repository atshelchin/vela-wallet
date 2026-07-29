if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
// 63-screens-browser-connect-e.js — page '06 Screens · Browser & Connect', screen row 2 = S/web-request.
// Phases in this chunk: waiting (col 0) · consent (col 2) · unsupported-chain (col 3).  Spec: inv:06 §3.2.
// This is the WEB-ONLY popup a dApp opens through the Vela SDK — the board depicts the popup viewport
// (a deco: browser chrome strip marks that), not a native route. Every string here is HARDCODED ENGLISH
// in the source (zero t() calls in web-request.tsx) — recorded on a note chip.
const lib = storage.lib;
const PAGE = '06 Screens · Browser & Connect';
const ROW = 2;

const BG = '#FAFAF8', RAISED = '#FFFFFF', SUNKEN = '#F5F3EF';
const INK = '#1A1A18', MUTED = '#6E6B62', SUBTLE = '#8C887E';
const BORDER = '#ECEBE4';
const ACCENT = '#E8572A', ACCENT_SOFT = '#FFF0EB';
const SUCCESS = '#2D8E5F', SUCCESS_SOFT = '#EDFAF2';
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

// The popup is a browser window, not a device screen — this strip says so at a glance.
const popupChrome = (b) => {
  R(b, 'deco:popup-window-chrome', { x: 0, y: 0, w: 390, h: 36, fill: '#EFEDE7' });
  R(b, 'deco:popup-url-pill', { x: 60, y: 8, w: 270, h: 20, radius: 10, fill: RAISED });
  ICON(b, 'Lock', 10, 1.6, SUBTLE, 68, 13, 'popup-url');
  T(b, 'deco:popup-url', { text: 'getvela.app/web-request?session=…', size: 9, weight: 400, color: SUBTLE, x: 84, y: 13 });
  HAIR(b, 'deco:popup-chrome-hairline', 0, 36, 390);
};
// Card: width 100% / maxWidth 390 → 350 here, centred column, gap 8, padding 24, bg.raised, 1px border.base.
const card = (b, y, h) => R(b, 'card (bg.raised, 1px border.base, padding 24, gap 8)', { x: 20, y, w: 350, h, radius: 20, fill: RAISED, stroke: BORDER, strokeWidth: 1 });
// Brand logo tile 68×68, radius 19, 1px border.base, bg.sunken.
const brandTile = (b, key, x, y, isDapp) => {
  R(b, 'brand-tile-' + key + ' 68 (radius 19, bg.sunken, 1px border.base)', { x, y, w: 68, h: 68, radius: 19, fill: SUNKEN, stroke: BORDER, strokeWidth: 1 });
  if (isDapp) {
    R(b, 'image:dapp-logo (https + exact requesting origin ONLY)', { x: x + 14, y: y + 14, w: 40, h: 40, radius: 10, fill: '#FF007A' });
  } else {
    R(b, 'image:vela-app-icon 40', { x: x + 14, y: y + 14, w: 40, h: 40, radius: 10, fill: ACCENT });
    T(b, 'vela-mark-letter', { text: 'V', size: 20, weight: 700, color: RAISED, x: x + 27, y: y + 24 });
  }
};
// Identity row: two 96-wide brand columns flanking a 38px connection mark, gap 16, alignItems flex-start.
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

// ============================================================================
// S/web-request/waiting — default phase: READY posted to window.opener until INIT lands
// ============================================================================
{
  const b = await screen('S/web-request/waiting', 0);
  popupChrome(b);
  card(b, 328, 225);
  velaBrandOnly(b, 352);
  E(b, 'spinner ActivityIndicator small accent.base', 24, 183, 451, { stroke: ACCENT, sw: 2 });
  const t1 = 'Connecting securely…';
  T(b, 'title', { text: t1, size: 17, weight: 700, color: INK, x: cx(t1, 17, true, 20, 350), y: 483 });
  const n1 = 'You can close this window after it finishes.';
  T(b, 'note', { text: n1, size: 11, weight: 400, color: MUTED, x: cx(n1, 11, false, 20, 350), y: 513 });
  lib.chip(b, 'platform', 'WEB-ONLY: a popup window the dApp opens via the Vela SDK — there is no native route; board depicts the popup viewport at 390 CSS px, and on web every text.* also gets a fixed ×1.2 scale boost the board does not draw'); // inv:06 §0 + §3.2
  lib.chip(b, 'note', 'handshake: the popup posts READY to window.opener every 300ms until the dApp answers INIT over a MessagePort; dApp metadata is PRESENTATION-ONLY — the security identity is always event.origin (name trimmed, capped at 80 chars, falls back to the host)'); // inv:06 §3.2
  lib.chip(b, 'note', 'the lone Vela brand column (no dApp side) is used by waiting/processing/done/error — the two-column identity row appears only in consent, unsupported-chain and onboarding'); // inv:06 §3.2
  lib.chip(b, 'edge', 'INIT arrives, connect request, no prior grant -> S/web-request/consent');
  lib.chip(b, 'edge', 'INIT arrives, no wallet exists yet -> S/web-request/onboarding');
  lib.chip(b, 'edge', 'missing session param / no window.opener -> S/web-request/error');
}

// ============================================================================
// S/web-request/consent — connect request with no prior grant
// ============================================================================
{
  const b = await screen('S/web-request/consent', 2);
  popupChrome(b);
  card(b, 208, 464);
  identityRow(b, 232);
  const t2 = 'Connect with Vela';
  T(b, 'title', { text: t2, size: 17, weight: 700, color: INK, x: cx(t2, 17, true, 20, 350), y: 331 });
  // origin pill: row gap 6, padH 10 / padV 7, radius 999, bg success.soft; ShieldCheck 15 + host text.sm medium
  R(b, 'origin-pill (success.soft, radius.full)', { x: 131, y: 361, w: 128, h: 29, radius: 14, fill: SUCCESS_SOFT });
  ICON(b, 'ShieldCheck', 15, 2, SUCCESS, 141, 368, 'origin');
  T(b, 'origin-host', { text: 'app.uniswap.org', size: 11, weight: 500, color: SUCCESS, x: 162, y: 370 });
  // account box: padding 16, gap 4, radius 16, bg.sunken
  R(b, 'account-box (bg.sunken, radius.xl, padding 16)', { x: 44, y: 398, w: 302, h: 82, radius: 16, fill: SUNKEN });
  T(b, 'account-label', { text: 'Account', size: 10, weight: 500, color: SUBTLE, x: 60, y: 414 });
  T(b, 'account-name', { text: 'Main', size: 13, weight: 600, color: INK, x: 60, y: 430 });
  T(b, 'account-address (numberOfLines 1)', { text: '0x7a2E4c8B19f3D5a0Ce41b7d2A6c8F390b12E9f31', size: 11, weight: 400, zone: 'mono', color: MUTED, x: 60, y: 450 });
  ['This site can view your wallet address and', 'request signatures. Every signature still', 'requires your approval.'].forEach((ln, i) => {
    T(b, 'note-line-' + (i + 1), { text: ln, size: 11, weight: 400, color: MUTED, x: cx(ln, 11, false, 20, 350), y: 488 + i * 18 });
  });
  INST(b, 'C/Primitives/VelaButton', { variant: 'accent', size: 'default', state: 'default' }, 44, 548,
    { w: 302, h: 48, name: 'i:VelaButton accent "Connect"', label: 'Connect' });
  INST(b, 'C/Primitives/VelaButton', { variant: 'secondary', size: 'default', state: 'default' }, 44, 604,
    { w: 302, h: 44, name: 'i:VelaButton secondary "Cancel"', label: 'Cancel' });
  lib.chip(b, 'note', 'CODE DRIFT (depicted normative): the shipped buttons are bespoke Pressables (primary radius 14 / padV 14 / no press spring / no haptic; secondary transparent) — board uses VelaButton per the CTA mandate. Card radius is 24 in code (OFF the radius scale, max token is 2xl 20) — drawn at 20'); // inv:06 §3.2 + §5.5
  lib.chip(b, 'note', 'the dApp logo tile loads ONLY when it resolves to the exact requesting origin over https ("metadata cannot turn the wallet into a third-party tracking-image client"); on failure the tile falls back to bg #0B0E0C + up-to-3 uppercase initials in #99F6B7 — both hexes HARDCODED and identical in light + dark'); // inv:06 §3.2
  lib.chip(b, 'note', 'approve persists the grant {origin, address, chainId} then responds; reject responds 4001 "User rejected the connection". Invisible outcomes (no UI): already-granted resolves instantly · non-connect without a grant → 4100 · address mismatch → 4100 · closing the popup mid-flight → 4001'); // inv:06 §3.2
  lib.chip(b, 'note', 'ZERO t() calls in web-request.tsx — every string on this board is hardcoded English (corrects inv:07 §3.6); only the embedded OnboardingScreen is localized'); // inv:06 §3.2
  lib.chip(b, 'edge', 'tap Connect (chain supported) -> S/web-request/processing');
  lib.chip(b, 'edge', 'tap Connect (chain unknown to Vela) -> S/web-request/unsupported-chain');
  lib.chip(b, 'edge', 'tap Cancel -> S/web-request/error');
}

// ============================================================================
// S/web-request/unsupported-chain — dApp asked for a chain Vela cannot serve
// ============================================================================
{
  const b = await screen('S/web-request/unsupported-chain', 3);
  popupChrome(b);
  card(b, 226, 428);
  identityRow(b, 250);
  E(b, 'error-icon 44 (error.soft disc)', 44, 173, 349, { fill: ERROR_SOFT });
  ICON(b, 'X', 22, 2, ERROR, 184, 360, 'error-icon');
  const t3 = 'Network not supported';
  T(b, 'title', { text: t3, size: 17, weight: 700, color: INK, x: cx(t3, 17, true, 20, 350), y: 401 });
  ['app.uniswap.org requested Chain ID 999. Vela', 'cannot safely process this request.'].forEach((ln, i) => {
    T(b, 'note-line-' + (i + 1), { text: ln, size: 11, weight: 400, color: MUTED, x: cx(ln, 11, false, 20, 350), y: 431 + i * 18 });
  });
  R(b, 'network-box (bg.sunken, radius.xl, padding 16, gap 7)', { x: 44, y: 473, w: 302, h: 105, radius: 16, fill: SUNKEN });
  T(b, 'network-label', { text: 'Networks available in Vela', size: 10, weight: 500, color: SUBTLE, x: 60, y: 489 });
  ['Ethereum (1) · Base (8453) · Arbitrum (42161) ·', 'Optimism (10) · Polygon (137) · BNB Chain (56) ·', 'Gnosis (100) · Celo (42220) · Tempo (4217)'].forEach((ln, i) => {
    T(b, 'network-list-' + (i + 1), { text: ln, size: 10, weight: 400, color: MUTED, x: 60, y: 508 + i * 18 });
  });
  INST(b, 'C/Primitives/VelaButton', { variant: 'secondary', size: 'default', state: 'default' }, 44, 586,
    { w: 302, h: 44, name: 'i:VelaButton secondary "Close"', label: 'Close' });
  lib.chip(b, 'note', 'the network list is generated from getAllNetworksSync() as "DisplayName (chainId)" joined by " · " — text.xs fg.muted, lineHeight 18, LEFT-aligned inside the box while everything else on the card is centred'); // inv:06 §3.2
  lib.chip(b, 'note', 'Close responds with the chain error (default code 4902); the popup does not self-close here — the user leaves deliberately'); // inv:06 §3.2
  lib.chip(b, 'note', 'chain validation deliberately runs AFTER wallet setup completes, so a first-time user sees onboarding first and this screen only if the chain is still unknown'); // inv:06 §3.2
  lib.chip(b, 'edge', 'tap Close -> S/web-request/done');
  lib.chip(b, 'edge', 'dApp retries on a supported chain -> S/web-request/consent');
}

return lib.done('63-screens-browser-connect-e', {
  boards: ['S/web-request/waiting', 'S/web-request/consent', 'S/web-request/unsupported-chain'],
  missingFamilies: missing,
});
