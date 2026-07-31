if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
// 64-screens-settings-onboarding-b.js — page '07 Screens · Settings & Onboarding':
//   S/about/default        (screen row 1, y 950)
//   S/index/loading        (screen row 3, y 2850) — the entry route, redirect-only boot splash
// Source of visual truth: inv:06 §1.2 (AboutScreen), §2.1 (boot), §5-2/§5-10 (flags).
// About is depicted in the NORMATIVE de-containered language (docs/DESIGN-LANGUAGE.md); the
// shipped screen still wraps tech + links in VelaCards — recorded as a drift note chip.
const lib = storage.lib;
const PAGE = '07 Screens · Settings & Onboarding';

const INK = '#1A1A18', MUTED = '#6E6B62', SUBTLE = '#8C887E', BG = '#FAFAF8';
const BORDER = '#ECEBE4', ACCENT = '#E8572A';

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
const ICON = (b, lucide, size, sw, color, x, y, key) =>
  R(b, 'icon:' + lucide + ' ' + size + '/' + sw + ' · ' + key, { x, y, w: size, h: size, stroke: color, strokeWidth: sw });

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
const seclabel = (b, key, y, text) => {
  const i = instAt(b, 'sec/' + key, 'C/Primitives/SectionLabel', null, 24, y, 342, 24);
  if (i) setTexts(i, [{ size: 11, text }]);
  return i;
};
const hair = (b, key, y) => instAt(b, 'div/' + key, 'C/Rows/Divider', { inset: 'full' }, 24, y - 4, 342, 8);

// ═══════════════════════════════════════════════════ S/about/default (row 1)
{
  const { board: b } = await lib.upsertBoard(PAGE, 'S/about/default', { x: 0, y: 950, w: 390, h: 844, fill: BG });

  // nav header: ArrowLeft 22 in 40×40 · centred "About" text.xl bold · right spacer minWidth 50 — inv:06 §1.2
  ICON(b, 'ArrowLeft', 22, 2, INK, 33, 70, 'back');
  T(b, 'hd/title', { text: 'About', size: 17, weight: 700, color: INK, x: 173, y: 71 });

  // wordmark "vela" 40 bold ls 3, final "a" in accent.base (48 on web via scaleFont) — inv:06 §1.2
  const w1 = T(b, 'brand/wordmark-vel', { text: 'vel', size: 40, weight: 700, color: INK, x: 141, y: 131 });
  const w2 = T(b, 'brand/wordmark-a', { text: 'a', size: 40, weight: 700, color: ACCENT, x: 222, y: 131 });
  try { w1.letterSpacing = '3'; w2.letterSpacing = '3'; } catch (e) {}
  T(b, 'brand/version', { text: 'v1.0.0 (33ef847)', size: 11, weight: 500, color: SUBTLE, x: 152, y: 187 });
  T(b, 'brand/tagline', { text: 'A simpler way to own crypto', size: 13, weight: 400, color: MUTED, x: 106, y: 213 });

  // TECHNICAL DETAILS — 5 label/value rows, value text.sm semibold MONO — inv:06 §1.2
  seclabel(b, 'tech', 249, 'TECHNICAL DETAILS');
  const TECH = [
    ['Wallet', 'Safe v1.4.1', 293],
    ['Authentication', 'WebAuthn / P-256', 260],
    ['Account type', 'ERC-4337 (Smart Account)', 208],
    ['Signer module', 'SafeWebAuthnSharedSigner', 208],
    ['Networks', '12 EVM chains', 280],
  ];
  TECH.forEach(([label, value, vx], i) => {
    const y = 279 + i * 40;
    T(b, 'tech/label-' + i, { text: label, size: 11, weight: 400, color: MUTED, x: 24, y: y + 13 });
    T(b, 'tech/value-' + i, { text: value, size: 11, weight: 600, color: INK, zone: 'mono', x: vx, y: y + 13 });
    if (i > 0) hair(b, 'tech-' + i, y);
  });

  // LINKS — three rows, label text.base semibold + ExternalLink 14 fg.subtle — inv:06 §1.2
  seclabel(b, 'links', 499, 'LINKS');
  ['Website', 'GitHub', 'Safe Wallet'].forEach((label, i) => {
    const y = 529 + i * 52;
    T(b, 'link/label-' + i, { text: label, size: 13, weight: 600, color: INK, x: 24, y: y + 18 });
    ICON(b, 'ExternalLink', 14, 2, SUBTLE, 352, y + 19, 'link-' + i);
    if (i > 0) hair(b, 'links-' + i, y);
  });

  T(b, 'footer/line', { text: 'Built with care. Your keys, your coins.', size: 11, weight: 400, color: SUBTLE, x: 84, y: 713 });

  lib.chip(b, 'note', 'DRIFT: the shipped AboutScreen still wraps tech + links in VelaCards (legacy DESIGN_SYSTEM.md). This board depicts the NORMATIVE de-containered target — open rows + full-width hairlines (inv 06 §1.2 flag, §5-2)');
  lib.chip(b, 'note', 'wordmark = "vela" 40 bold letterSpacing 3 with the FINAL "a" in accent.base; scaleFont makes it 48 on web (inv 06 §1.2)');
  lib.chip(b, 'note', 'HIDDEN AFFORDANCE: 6 taps on the wordmark inside a rolling 3s window set dev_unlocked=1 with a success haptic — the only way in (inv 06 §1.2, §5-10)');
  lib.chip(b, 'note', 'values are live: version = APP_VERSION + git commit; "Networks" = current chain count (12 shown); tech values are text.sm semibold MONO against text.sm regular fg.muted labels');
  lib.chip(b, 'note', 'link rows open the in-app / system browser: getvela.app · the GitHub repo · safe-smart-account v1.4.1 tree');
  lib.chip(b, 'edge', 'wordmark tapped 6x within 3s -> S/settings/developer-unlocked (also ungates S/clear-signing-test + S/receipt-harness in production builds)');
  lib.chip(b, 'motion', 'logo fadeIn 0/400 · tech fadeInDown 150/400 · links fadeInDown 200/400 — iOS ONLY, Android + web paint settled (inv 06 §0.2, §5-7)');
}

// ════════════════════════════════════════════════ S/index/loading (row 3, ENTRY)
{
  const { board: b } = await lib.upsertBoard(PAGE, 'S/index/loading', { x: 0, y: 2850, w: 390, h: 844, fill: BG });
  // the whole screen: page bg.base + one large accent.base ActivityIndicator, no copy, no logo — inv:06 §2.1
  E(b, 'spinner:ActivityIndicator large accent', { d: 36, x: 177, y: 404, stroke: ACCENT, sw: 3 });

  lib.chip(b, 'note', 'ENTRY ROUTE (app/index.tsx). Redirect-only: it renders while wallet state loads and is the EFFECTIVE splash beyond the native splash image — deliberately empty, no wordmark (inv 06 §2.1)');
  lib.chip(b, 'note', 'cold-boot arc starts here: warm-neutral page + single accent spinner -> the always-dark brand Welcome (inv 06 §2.1 emotional arc)');
  lib.chip(b, 'edge', 'wallet state resolved + account exists -> S/home/default');
  lib.chip(b, 'edge', 'wallet state resolved + no account -> S/onboarding/welcome');
  lib.chip(b, 'edge', 'native splash hands off (O/splash) -> S/index/loading');
  lib.chip(b, 'platform', 'iOS/Android show the native splash image before JS boots; web paints this board first — same shape either way');
}

return lib.done('64-screens-settings-onboarding-b', {
  page: PAGE,
  boards: ['S/about/default', 'S/index/loading'],
  missingPlaceholders: missing,
});
