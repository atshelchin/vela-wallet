if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
// 64-screens-settings-onboarding-a.js — page '07 Screens · Settings & Onboarding', screen row 0:
//   S/settings/default · S/settings/advanced-expanded · S/settings/developer-unlocked
// Source of visual truth: inv:06 §1.1 (SettingsScreen), §0.2 (motion), §0.3 (shared primitives),
// §5 flags. Normative container treatment per docs/DESIGN-LANGUAGE.md (de-containered rows +
// inset hairlines — SettingsScreen already ships that way, inv:06 §5-2).
// Grid: x = stateIndex * 450, y = screenIndex(0) * 950. Idempotent: every shape upserted by name.
const lib = storage.lib;
const PAGE = '07 Screens · Settings & Onboarding';

// palette — inv:06 §0.1 (theme.ts is authoritative; DESIGN_SYSTEM.md hexes are stale)
const INK = '#1A1A18', MUTED = '#6E6B62', SUBTLE = '#8C887E', BG = '#FAFAF8';
const RAISED = '#FFFFFF', SUNKEN = '#F5F3EF', BORDER = '#ECEBE4', STRONG = '#D8D6CE';
const ACCENT = '#E8572A';

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
  return e;
};
// board-level icon placeholders always carry a ' · key' suffix so they can never collide with
// (and silently re-parent) an identically named icon INSIDE a component instance.
const ICON = (b, lucide, size, sw, color, x, y, key) =>
  R(b, 'icon:' + lucide + ' ' + size + '/' + sw + ' · ' + key, { x, y, w: size, h: size, stroke: color, strokeWidth: sw });

// instance upsert: reuse by key on re-run, placeholder + count when the family is not in the library
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
// instance content overrides, matched by font size (SettingsRow: title 15 / subtitle 11)
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
const setLeadIcon = (inst, lucide) => {
  try {
    const ic = (penpotUtils.findShapes(s => /^icon:/.test(s.name), inst) || [])
      .filter(s => !/Chevron|ExternalLink/.test(s.name));
    if (ic[0]) ic[0].name = 'icon:' + lucide + ' 16/2';
  } catch (e) {}
};

// ── recurring compositions ──────────────────────────────────────────────────
// SettingsRow: 342×66 (padding 16 all sides), icon chip 34 r10 bg.sunken, title 15 semibold,
// subtitle 11 fg.subtle, trailing Chevron/ExternalLink 16 — inv:06 §1.1 SettingsRow
const row = (b, key, y, kind, detail, icon, title, sub) => {
  const i = instAt(b, 'row/' + key, 'C/Rows/SettingsRow', { kind, detail }, 24, y, 342, 66);
  if (i) { setTexts(i, [{ size: 15, text: title }, { size: 11, text: sub }]); setLeadIcon(i, icon); }
  return i;
};
// divider board is 342×8 with the hairline centred → y-4 lands the 1px line on the row boundary
const div = (b, key, y) => instAt(b, 'div/' + key, 'C/Rows/Divider', { inset: 'inset-66' }, 24, y - 4, 342, 8);
// section labels take Settings' paddingHorizontal-16 override so the label aligns with row titles
const seclabel = (b, key, y, text) => {
  const i = instAt(b, 'sec/' + key, 'C/Primitives/SectionLabel', null, 40, y, 342, 24);
  if (i) setTexts(i, [{ size: 11, text }]);
  return i;
};
// Sign Out: open, centred, de-boxed row in quiet ink — the danger lives in the confirm sheet
const signOut = (b, y) => {
  ICON(b, 'LogOut', 16, 2, MUTED, 155, y, 'signout');
  T(b, 'lbl/signout', { text: 'Sign Out', size: 15, weight: 600, color: INK, x: 179, y: y - 1 });
};

// ════════════════════════════════════════════════ S/settings/default  (state 0)
{
  const { board: b } = await lib.upsertBoard(PAGE, 'S/settings/default', { x: 0, y: 0, w: 390, h: 844, fill: BG });
  // header: "Settings" text.3xl bold ls −0.5 + plain X 22 in a 40×40 hit area — inv:06 §1.1 Header
  const ttl = T(b, 'hd/title', { text: 'Settings', size: 26, weight: 700, color: INK, x: 24, y: 70 });
  try { ttl.letterSpacing = '-0.5'; } catch (e) {}
  ICON(b, 'X', 22, 2, INK, 344, 76, 'close');

  seclabel(b, 'account', 131, 'ACCOUNT');
  row(b, 'account', 161, 'chevron', 'value', 'User', 'Vela Main', '0x8Ba1…BA72');
  div(b, 'account-1', 227);
  row(b, 'contacts', 227, 'chevron', 'default', 'BookUser', 'Contacts', 'Manage saved addresses');
  div(b, 'account-2', 293);
  row(b, 'feedback', 293, 'external', 'last', 'MessageSquare', 'Send feedback', 'Report a bug or share an idea');

  seclabel(b, 'browser', 379, 'BROWSER');
  row(b, 'safari', 409, 'chevron', 'default', 'Puzzle', 'Use Vela in Safari', 'Connect to any dApp in the browser');

  seclabel(b, 'appearance', 495, 'APPEARANCE');
  row(b, 'language', 525, 'chevron', 'value', 'Languages', 'Language', 'English · System');
  div(b, 'appearance-1', 591);

  // TextScaleSlider — inline control, padV 20 / padH 16, gap 12 — inv:06 §1.1 Appearance-2
  T(b, 'lbl/scale-min', { text: 'A', size: 11, weight: 600, color: SUBTLE, x: 40, y: 619 });
  T(b, 'lbl/scale-max', { text: 'A', size: 17, weight: 600, color: SUBTLE, x: 350, y: 615 });
  R(b, 'slider/track', { x: 60, y: 623, w: 272, h: 4, radius: 2, fill: BORDER });          // track + fill both border.base (implemented fill is NEUTRAL — inv:06 §5-6)
  [60, 113, 166, 218, 271, 324].forEach((tx, i) => E(b, 'slider/tick-' + i, { d: 8, x: tx, y: 621, fill: STRONG })); // 6 tick dots, one per level
  E(b, 'slider/thumb', { d: 28, x: 156, y: 611, fill: RAISED, stroke: STRONG, sw: 2 });     // thumb parked on Standard 1.00 (level 3 of 6)

  R(b, 'hair/appearance-1', { x: 40, y: 659, w: 310, h: 1, fill: BORDER });                 // full-width hairline, marginH 16 — inv:06 §1.1

  // ThemePicker — SegmentedToggle recipe: transparent track, ONE floating active chip — inv:06 §1.1 Appearance-4
  R(b, 'theme/active-chip', { x: 213, y: 672, w: 146, h: 44, radius: 22, fill: RAISED, stroke: STRONG, strokeWidth: 1 });
  ICON(b, 'Sun', 14, 2, SUBTLE, 56, 687, 'theme-light');
  T(b, 'lbl/theme-light', { text: 'Light', size: 13, weight: 600, color: MUTED, x: 76, y: 687 });
  ICON(b, 'Moon', 14, 2, SUBTLE, 146, 687, 'theme-dark');
  T(b, 'lbl/theme-dark', { text: 'Dark', size: 13, weight: 600, color: MUTED, x: 166, y: 687 });
  ICON(b, 'Monitor', 14, 2, INK, 229, 687, 'theme-system');
  T(b, 'lbl/theme-system', { text: 'Follow System', size: 13, weight: 600, color: INK, x: 249, y: 687 });

  R(b, 'hair/appearance-2', { x: 40, y: 728, w: 310, h: 1, fill: BORDER });

  // AvatarStylePicker — same toggle recipe; previews stay one NEUTRAL look in both states — inv:06 §1.1 Appearance-6
  R(b, 'avatar/active-chip', { x: 40, y: 741, w: 114, h: 44, radius: 22, fill: RAISED, stroke: STRONG, strokeWidth: 1 });
  E(b, 'avatar/preview-initials', { d: 18, x: 56, y: 754, fill: SUNKEN });
  T(b, 'lbl/avatar-initial', { text: 'V', size: 9, weight: 700, color: INK, x: 61, y: 758 });
  T(b, 'lbl/avatar-initials', { text: 'Initials', size: 13, weight: 600, color: INK, x: 80, y: 756 });
  E(b, 'avatar/preview-identicon', { d: 18, x: 172, y: 754, fill: '#E9B213' });              // identicon:nimiq seeded by the address
  T(b, 'lbl/avatar-identicon', { text: 'Identicon', size: 13, weight: 600, color: MUTED, x: 196, y: 756 });

  seclabel(b, 'localization', 817, 'LOCALIZATION');                                          // scroll edge: the next section starts here

  lib.chip(b, 'note', 'ScreenContainer padH 24 + ScrollView padTop 8 / padBottom 48; the bottom tab bar is hidden app-wide so this X is the only exit -> S/home/default (inv 06 §1.1)');
  lib.chip(b, 'note', 'rows = C/Rows/SettingsRow instances (34 chip r10 bg.sunken + 16 icon fg.muted, title 15 semibold, subtitle 11 fg.subtle); hairline = C/Rows/Divider inset-66 (math says 62 — inv 06 §5-8)');
  lib.chip(b, 'note', 'ThemePicker + AvatarStylePicker drawn at Settings label widths; recipe = C/Controls/SegmentedToggle (three|first + icon adorn) — inactive segments are transparent, only the active chip is painted');
  lib.chip(b, 'note', 'icon chips stay one quiet recipe for EVERY row — accent/semantic tints are reserved for states, never navigation (explicit code comment, inv 06 §1.1)');
  lib.chip(b, 'note', 'row taps -> O/account-switcher · O/contacts-manager · O/bug-report · S/safari-extension · O/language-picker; below the fold: O/currency-sheet · O/format-picker');
  lib.chip(b, 'platform', 'BROWSER section renders on iOS ONLY (the Safari Web Extension exists only there) — inv 06 §1.1');
  lib.chip(b, 'motion', 'header fadeIn 0/300; sections fadeInDown 50/75/100/135/150/175/200/225 (300ms). iOS ONLY — Android + web paint the settled state (inv 06 §0.2, §5-7)');
  lib.chip(b, 'motion', 'TextScaleSlider snaps live to 6 levels with a light haptic per snap (0.82 · 0.91 · 1.00 · 1.10 · 1.22 · 1.35); release springs to the tick (damping 20 stiffness 200); whole screen re-renders instantly');
  lib.chip(b, 'edge', 'dev_unlocked set (About wordmark x6 in 3s) -> S/settings/developer-unlocked');
}

// ═══════════════════════════════════════ S/settings/advanced-expanded  (state 1)
{
  const { board: b } = await lib.upsertBoard(PAGE, 'S/settings/advanced-expanded', { x: 450, y: 0, w: 390, h: 844, fill: BG });
  // scrolled to the ADVANCED section — the tail of LOCALIZATION is still on screen
  row(b, 'date-format', 59, 'chevron', 'value', 'Calendar', 'Date format', '13/06/2026');
  div(b, 'loc-1', 125);
  row(b, 'time-format', 125, 'chevron', 'value', 'Clock', 'Time format', '13:45');

  seclabel(b, 'advanced', 211, 'ADVANCED');
  ICON(b, 'ChevronDown', 14, 2, SUBTLE, 336, 216, 'advanced-open');                          // rotated 180° while open — inv:06 §1.1 Advanced
  row(b, 'networks', 241, 'chevron', 'default', 'Globe', 'Networks', 'RPC, Explorer & Bundler URLs');
  div(b, 'adv-1', 307);
  row(b, 'rpc-providers', 307, 'chevron', 'default', 'Zap', 'RPC Providers', 'Alchemy, dRPC, Ankr keys');
  div(b, 'adv-2', 373);
  row(b, 'add-network', 373, 'chevron', 'default', 'Plus', 'Add Network', 'Add custom EVM network');
  div(b, 'adv-3', 439);
  row(b, 'service-endpoints', 439, 'chevron', 'default', 'Server', 'Service Endpoints', 'Chain data, identity index, Bundler');

  row(b, 'about', 525, 'chevron', 'default', 'Info', 'About', 'Vela Wallet v1.0.0');
  signOut(b, 615);

  lib.chip(b, 'note', 'board depicts the Settings scroll parked at ADVANCED — Account / Browser / Appearance / Localization sit above (see S/settings/default)');
  lib.chip(b, 'note', 'ADVANCED is COLLAPSED by default; header = SectionLabel + ChevronDown 14 fg.subtle (paddingRight 16) that rotates 180 deg when open (inv 06 §1.1)');
  lib.chip(b, 'note', 'row taps -> O/network-editor · O/rpc-providers · O/add-network · O/endpoint-editor · S/about');
  lib.chip(b, 'note', 'Sign Out is an open de-boxed centred row in QUIET ink (LogOut 16 fg.muted + text.lg semibold fg.base) — the danger lives in the confirm sheet, not here (inv 06 §1.1)');
  lib.chip(b, 'note', 'confirm sheet: 56 circle error.soft + LogOut 24 error.base, title text.xl bold, body "Your wallet data stays on this device...", destructive CTA = VelaButton accent with backgroundColor overridden to error.base (inv 06 §5-5)');
  lib.chip(b, 'motion', 'Advanced expand/collapse animates the row stack + 180 deg chevron rotation; section entrance stagger is iOS-only');
  lib.chip(b, 'edge', 'Sign Out tapped + public-key upload still pending -> O/app-modal (sign-out confirm, warning.soft banner, CTA relabels "Sign Out Anyway")');
  lib.chip(b, 'edge', 'LOGOUT dispatched -> S/onboarding/welcome (replace /)');
}

// ══════════════════════════════════════ S/settings/developer-unlocked  (state 2)
{
  const { board: b } = await lib.upsertBoard(PAGE, 'S/settings/developer-unlocked', { x: 900, y: 0, w: 390, h: 844, fill: BG });
  row(b, 'time-format', 59, 'chevron', 'value', 'Clock', 'Time format', '13:45');

  seclabel(b, 'advanced', 145, 'ADVANCED');
  ICON(b, 'ChevronDown', 14, 2, SUBTLE, 336, 150, 'advanced-closed');                        // collapsed here so both section headers fit one board

  seclabel(b, 'developer', 189, 'DEVELOPER');
  ICON(b, 'ChevronDown', 14, 2, SUBTLE, 336, 194, 'developer-open');
  row(b, 'treasury', 219, 'chevron', 'default', 'Key', 'Treasury', 'View treasury address & balances');
  div(b, 'dev-1', 285);
  row(b, 'clear-signing', 285, 'chevron', 'default', 'Key', 'Clear Signing Test', 'ERC-7730 signing UI preview');

  row(b, 'about', 371, 'chevron', 'default', 'Info', 'About', 'Vela Wallet v1.0.0');
  signOut(b, 461);

  lib.chip(b, 'note', 'the DEVELOPER section exists ONLY while dev_unlocked=1 — set by 6 taps on the About wordmark inside a rolling 3s window (success haptic). Same flag ungates /clear-signing-test + /receipt-harness in production builds (inv 06 §1.2, §5-10)');
  lib.chip(b, 'note', 'ADVANCED shown collapsed here purely so both collapsible headers fit one board; the two sections are independent');
  lib.chip(b, 'note', 'row taps -> O/treasury-modal (bundler gas-treasury inspector) · S/clear-signing-test (27 mock scenarios driving the REAL SigningSheet)');
  lib.chip(b, 'edge', 'dev_unlocked absent (fresh install / cleared) -> S/settings/default — the section simply is not rendered');
  lib.chip(b, 'motion', 'expand/collapse + 180 deg chevron rotation; entrances iOS-only (inv 06 §5-7)');
}

return lib.done('64-screens-settings-onboarding-a', {
  page: PAGE,
  boards: ['S/settings/default', 'S/settings/advanced-expanded', 'S/settings/developer-unlocked'],
  missingPlaceholders: missing,
});
