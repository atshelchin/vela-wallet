if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
// 64-screens-settings-onboarding-c.js — page '07 Screens · Settings & Onboarding', screen row 2
// (S/onboarding, y 1900), states 0-2:
//   welcome (x 0) · welcome-signin-loading (x 450) · create-form (x 900)
// Source of visual truth: inv:06 §2.1 (arc + boot), §2.2 (WelcomeScreen), §2.4 (CreateWalletScreen
// State A), §5-4 (hardcoded-hex flags). The emotional arc is the point: fixed-dark brand Welcome
// (the ONLY place slow animation is allowed) -> the light, quiet, form-like Create step.
const lib = storage.lib;
const PAGE = '07 Screens · Settings & Onboarding';

const INK = '#1A1A18', MUTED = '#6E6B62', SUBTLE = '#8C887E', BG = '#FAFAF8';
const RAISED = '#FFFFFF', BORDER = '#ECEBE4', ACCENT = '#E8572A', WHITE = '#FFFFFF';
const DARK = '#1A1A18';                     // WelcomeScreen's hardcoded brand black — inv:06 §2.2
const HAIRLINE_ON_DARK = '#353533';         // rgba(255,255,255,0.12) composited over #1A1A18 — inv:06 §2.2

let missing = 0;
const T = (b, name, s) => lib.upsertText(b, name, s).text;
const R = (b, name, s) => { const r = lib.upsertRect(b, name, s).rect; if (!s.fill) r.fills = []; return r; };
const E = (b, name, s) => {
  const n = lib.norm(name);
  let e = penpotUtils.findShape(sh => sh.name === n && sh.type === 'ellipse', b);
  if (!e) { e = penpot.createEllipse(); e.name = name; b.appendChild(e); }
  if (Math.round(e.width) !== s.d || Math.round(e.height) !== s.d) e.resize(s.d, s.d);
  penpotUtils.setParentXY(e, s.x, s.y);
  e.fills = s.fill ? [{ fillColor: s.fill, fillOpacity: 1 }] : [];
  e.strokes = s.stroke ? [{ strokeColor: s.stroke, strokeWidth: s.sw || 2 }] : [];
  if (s.opacity !== undefined) e.opacity = s.opacity;
  return e;
};
const ICON = (b, lucide, size, sw, color, x, y, key) =>
  R(b, 'icon:' + lucide + ' ' + size + '/' + sw + ' · ' + key, { x, y, w: size, h: size, stroke: color, strokeWidth: sw });
const lh = (t, mult) => { try { t.lineHeight = String(mult); } catch (e) {} return t; };

const instAt = (b, key, family, props, x, y, w, h) => {
  const nm = lib.norm(key);
  const found = penpotUtils.findShape(s => s.name === nm, b);
  if (found) { penpotUtils.setParentXY(found, x, y); return found; }
  const i = lib.instance(family, props, b, x, y);
  if (!i) {
    missing++;
    R(b, 'MISSING:' + family + ' · ' + key, { x, y, w, h, fill: '#FEF2F2', stroke: '#C62828', strokeWidth: 1, radius: 8 });
    return null;
  }
  try { i.name = key; } catch (e) {}
  return i;
};
const setTexts = (inst, pairs) => {
  try {
    const ts = penpotUtils.findShapes(s => s.type === 'text', inst) || [];
    const used = {};
    for (const p of pairs) {
      const t = ts.find(s => !used[s.id] && Math.round(Number(s.fontSize)) === p.size);
      if (t) { used[t.id] = 1; if (t.characters !== p.text) t.characters = p.text; }
    }
  } catch (e) {}
};
// full-width CTA = C/Primitives/VelaButton primary/default (342×53 = 390 − 2×24 gutters)
const cta = (b, key, y, label, state) => {
  const i = instAt(b, 'cta/' + key, 'C/Primitives/VelaButton',
    { variant: 'primary', size: 'default', state: state || 'default' }, 24, y, 342, 53);
  if (i && state !== 'loading') setTexts(i, [{ size: 15, text: label }]);
  return i;
};

// ── the dark brand Welcome shell (shared by both welcome states) ────────────
const welcomeShell = (b) => {
  // wordmark "vela" 48 bold ls3, white, final "a" accent.base — inv:06 §2.2
  const w1 = T(b, 'brand/wordmark-vel', { text: 'vel', size: 48, weight: 700, color: WHITE, x: 131, y: 326 });
  const w2 = T(b, 'brand/wordmark-a', { text: 'a', size: 48, weight: 700, color: ACCENT, x: 227, y: 326 });
  try { w1.letterSpacing = '3'; w2.letterSpacing = '3'; } catch (e) {}
  // tagline text.lg regular rgba(255,255,255,0.45), centred, lineHeight 24 — inv:06 §2.2
  const t1 = T(b, 'brand/tagline-1', { text: 'Your keys, your coins.', size: 15, weight: 400, color: WHITE, x: 113, y: 386 });
  const t2 = T(b, 'brand/tagline-2', { text: 'Simple as a tap.', size: 15, weight: 400, color: WHITE, x: 136, y: 410 });
  t1.opacity = 0.45; t2.opacity = 0.45;
  // button block pinned to the bottom (padBottom 24 over the bottom safe edge), gap 12 — inv:06 §2.2
  R(b, 'btn/create', { x: 24, y: 654, w: 342, h: 60, radius: 16, fill: ACCENT });
  const cl = T(b, 'lbl/create', { text: 'Create Wallet', size: 15, weight: 700, color: WHITE, x: 143, y: 674 });
  try { cl.letterSpacing = '0.3'; } catch (e) {}
  R(b, 'btn/signin', { x: 24, y: 726, w: 342, h: 60, radius: 16, stroke: HAIRLINE_ON_DARK, strokeWidth: 1 });
};

// ══════════════════════════════════════════ S/onboarding/welcome (state 0)
{
  const { board: b } = await lib.upsertBoard(PAGE, 'S/onboarding/welcome', { x: 0, y: 1900, w: 390, h: 844, fill: DARK });
  welcomeShell(b);
  const sl = T(b, 'lbl/signin', { text: 'I already have a wallet', size: 15, weight: 600, color: WHITE, x: 112, y: 746 });
  sl.opacity = 0.5;

  lib.chip(b, 'note', 'DELIBERATE BRAND EXCEPTION: fixed dark #1A1A18, hardcoded, NEVER follows the theme — the only board that ignores color.bg.base (inv 06 §2.2, §5-4)');
  lib.chip(b, 'note', 'buttons are bespoke here (padV 20, radius 16, BOLD label ls 0.3, white-alpha secondary) — deliberately NOT C/Primitives/VelaButton (padV 16, semibold, light-theme border.strong)');
  lib.chip(b, 'note', 'secondary border = raw rgba(255,255,255,0.12) and the labels raw rgba(255,255,255,0.45 / 0.5) — depicted composited over #1A1A18');
  lib.chip(b, 'motion', 'THE ONLY PLACE SLOW ANIMATION IS ALLOWED: wordmark fadeIn 200/600, tagline fadeIn 500/600, buttons fadeInUp 700/500 — iOS only, Android + web paint settled');
  lib.chip(b, 'edge', '"Create Wallet" -> S/onboarding/create-form');
  lib.chip(b, 'edge', '"I already have a wallet" -> S/onboarding/welcome-signin-loading');
  lib.chip(b, 'edge', 'passkey-index health check fails 3x (2s apart, /api/health identity) -> endpointUnreachable -> O/onboarding-settings/unreachable-warning auto-opens');
  lib.chip(b, 'edge', 'deep link /onboarding?mode=create -> S/onboarding/create-form (skips this board)');
  lib.chip(b, 'platform', 'DEV builds only: 800ms long-press on the wordmark opens O/onboarding-settings');
}

// ═════════════════════════════ S/onboarding/welcome-signin-loading (state 1)
{
  const { board: b } = await lib.upsertBoard(PAGE, 'S/onboarding/welcome-signin-loading', { x: 450, y: 1900, w: 390, h: 844, fill: DARK });
  welcomeShell(b);
  // loading swaps the secondary label for an ActivityIndicator in rgba(255,255,255,0.5); button disabled — inv:06 §2.2
  E(b, 'spinner:ActivityIndicator signin', { d: 20, x: 185, y: 746, stroke: WHITE, sw: 2, opacity: 0.5 });

  lib.chip(b, 'note', 'only the SECONDARY button carries the loading state — the primary stays untouched (inv 06 §2.2)');
  lib.chip(b, 'note', 'there is NO dedicated sign-in screen: the whole arc is the OS passkey sheet + alerts on top of this dark board');
  lib.chip(b, 'edge', 'passkey authenticates + local account match -> S/home/default');
  lib.chip(b, 'edge', 'passkey index 404 -> O/app-alert/two-button "Recover Your Wallet" (Not Now / Recover Now) -> one more signature rebuilds the public key + address on-device');
  lib.chip(b, 'edge', 'no biometrics / incompatible provider / auth failure -> O/app-alert ("Not Supported" · "Device Not Compatible" -> Google Password Manager hint · "Sign In Failed" + Face ID/Touch ID hint · "Recovery Didn\'t Work")');
  lib.chip(b, 'edge', 'network-ish failure -> endpointUnreachable -> O/onboarding-settings/unreachable-warning');
  lib.chip(b, 'edge', 'user cancels the passkey sheet -> S/onboarding/welcome (silent return, no alert)');
  lib.chip(b, 'platform', 'the system passkey sheet is an OS surface covering this board — never a Vela board');
}

// ═══════════════════════════════════════ S/onboarding/create-form (state 2)
{
  const { board: b } = await lib.upsertBoard(PAGE, 'S/onboarding/create-form', { x: 900, y: 1900, w: 390, h: 844, fill: BG });
  // header (centred, padV 16): title text.xl bold; back = ArrowLeft 20 accent stroke 2.5 in an absolute-left 44×44 — inv:06 §2.4
  T(b, 'hd/title', { text: 'Create Wallet', size: 17, weight: 700, color: INK, x: 139, y: 75 });
  ICON(b, 'ArrowLeft', 20, 2.5, ACCENT, 36, 73, 'back');

  const al = T(b, 'lbl/account-name', { text: 'ACCOUNT NAME', size: 11, weight: 600, color: MUTED, x: 24, y: 139 });
  try { al.letterSpacing = '0.8'; } catch (e) {}
  // name input: bg.raised, 1px border.base, radius 16, padH 20 / V 16, text.lg regular, autoFocus — inv:06 §2.4
  R(b, 'field/name', { x: 24, y: 161, w: 342, h: 52, radius: 16, fill: RAISED, stroke: BORDER, strokeWidth: 1 });
  T(b, 'field/name-value', { text: 'Main Account', size: 15, weight: 400, color: INK, x: 44, y: 179 });
  lh(T(b, 'field/name-hint', {
    text: 'This name is stored with your public key on-chain\nfor cross-device sign-in.',
    size: 11, weight: 400, color: SUBTLE, x: 24, y: 221,
  }), 1.6);

  // acknowledgment checklist: 4 rows, gap 16 — unchecked Square 18 fg.subtle 1.5 / checked CheckSquare 18 accent 2
  const ACK = [
    [281, true, 'This is a self-custodial wallet. Your passkey private\nkey is managed by your device’s password manager\n(iCloud Keychain / Google Password Manager). Vela\nWallet cannot access or recover it.'],
    [377, true, 'If you lose your device, you can restore your wallet\non a new device through your iCloud or Google account.'],
    [433, true, 'If your iCloud or Google account is compromised, your\nwallet control may also be compromised. Protect it\nwith a strong password and 2FA.'],
  ];
  ACK.forEach(([y, checked, copy], i) => {
    ICON(b, checked ? 'CheckSquare' : 'Square', 18, checked ? 2 : 1.5, checked ? ACCENT : SUBTLE, 24, y, 'ack-' + i);
    lh(T(b, 'ack/copy-' + i, { text: copy, size: 11, weight: 400, color: MUTED, x: 50, y: y }), 1.8);
  });
  // row 4 is the UNCHECKED one — this board depicts the gate: CTA stays disabled at 3/4
  ICON(b, 'Square', 18, 1.5, SUBTLE, 24, 509, 'ack-3');
  T(b, 'ack/copy-3a', { text: 'I agree to the', size: 11, weight: 400, color: MUTED, x: 50, y: 509 });
  T(b, 'ack/link-privacy', { text: 'Privacy Policy', size: 11, weight: 600, color: ACCENT, x: 136, y: 509 });
  R(b, 'deco:underline · privacy', { x: 136, y: 523, w: 78, h: 1, fill: ACCENT });
  T(b, 'ack/copy-3b', { text: 'and', size: 11, weight: 400, color: MUTED, x: 220, y: 509 });
  T(b, 'ack/link-terms', { text: 'Terms of Service', size: 11, weight: 600, color: ACCENT, x: 248, y: 509 });
  R(b, 'deco:underline · terms', { x: 248, y: 523, w: 91, h: 1, fill: ACCENT });

  cta(b, 'create', 553, 'Create Wallet', 'disabled');

  lib.chip(b, 'note', 'CTA is disabled until the name is valid AND all 4 boxes are checked — this board deliberately shows 3/4 (the gate). VelaButton PRIMARY (dark ink), never accent, on this step');
  lib.chip(b, 'note', 'the name field is bg.raised r16 padH20/V16 text.lg — NOT the shared bg.sunken config-input recipe (C/Primitives/Input); it is the only "raised" surface on the board');
  lib.chip(b, 'note', 'the ACCOUNT NAME label is fg.muted ls 0.8 — a near-miss of C/Primitives/SectionLabel (fg.subtle ls 0.6); rebuild should collapse them');
  lib.chip(b, 'note', 'hint swaps to accent.base medium live validation when the UTF-8 name exceeds the 27-byte passkey budget: "This name is too long to fit in a passkey — please shorten it."');
  lib.chip(b, 'note', 'inline accent links -> getvela.app/privacy and /terms (semibold + underline, the only accent text on the board besides the back arrow)');
  lib.chip(b, 'edge', '"Create Wallet" tapped -> S/onboarding/create-ceremony');
  lib.chip(b, 'edge', 'back arrow -> S/onboarding/welcome');
  lib.chip(b, 'edge', 'no biometrics available -> O/app-alert "Not Supported"');
  lib.chip(b, 'motion', 'fadeIn 0/400 (iOS only); keyboard-persistent ScrollView, name field autoFocus, iOS keyboard-avoid behavior = padding');
}

return lib.done('64-screens-settings-onboarding-c', {
  page: PAGE,
  boards: ['S/onboarding/welcome', 'S/onboarding/welcome-signin-loading', 'S/onboarding/create-form'],
  missingPlaceholders: missing,
});
