// 27-mode-demo.js — the mode axis, made visible (RESTRUCTURE-2026-07-30 §5, W3a; SC-011).
//
// Two boards, because the mode axis has two audiences:
//  · `D / tokens / mode-demo` — a miniature Vela surface whose every paint is TOKEN-BOUND. Toggle
//    the active colour set in Penpot's Tokens panel (activate `color-dark`, deactivate
//    `color-light`) and this board restyles itself. That is the proof the binding is real; a board
//    painted in literal hex looks identical and proves nothing.
//  · `D / tokens / mode-compare` — both palettes side by side in LITERAL hex, so a human sees light
//    and dark at once. It cannot be token-bound: sets are file-global, so a bound "both modes"
//    depiction is impossible — one set is always inactive. Literal values are correct here BY
//    DESIGN, and 26-tokens-dtcg-check guards them against drift.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const PAGE = '02 Tokens & Type';
const stats = { bound: 0, swatches: 0, created: [] };

const setOf = (name) => penpot.library.local.tokens.sets.find((s) => s.name === name);
const valueOf = (setName, tokenName) => {
  const s = setOf(setName);
  const t = s && s.tokens.find((x) => x.name === tokenName);
  return t ? String(t.value) : null;
};
const bind = (shape, token, props) => { try { lib.bindToken(shape, token, props); stats.bound++; } catch (e) {} };

// ── board 1: the live, token-bound surface ─────────────────────────────────────────────────────
const { board: demo, created: c1 } = await lib.upsertBoard(PAGE, 'D / tokens / mode-demo',
  { x: 900, y: 1000, w: 390, h: 560, fill: '#FAFAF8' });
if (c1) stats.created.push('mode-demo');
bind(demo, 'color.bg.base', ['fill']);
// clear previous generated content so a re-run is a no-op rather than a stack
for (let g = 0; g < 200; g++) {
  const old = penpotUtils.findShape((s) => lib.norm(s.name || '').startsWith('m / '), demo);
  if (!old) break;
  old.remove();
}

const label = (name, txt, o) => {
  const { text } = lib.upsertText(demo, 'm / ' + name, Object.assign({ text: txt, size: 13, weight: 500, color: '#1A1A18' }, o));
  return text;
};
let t;
t = label('kicker', 'MODE DEMO', { size: 10, weight: 600, x: 24, y: 24, color: '#8C887E' });
t.letterSpacing = '0.6'; t.textTransform = 'uppercase';
bind(t, 'color.fg.subtle', ['fill']);
t = label('title', 'Every paint here is bound to a token', { size: 17, weight: 600, x: 24, y: 46 });
bind(t, 'color.fg.base', ['fill']);
t = label('sub', 'Activate color-dark in the Tokens panel and this board follows.\nA board painted in literal hex would not move.',
  { size: 11, weight: 400, x: 24, y: 76, color: '#6E6B62', growType: 'auto-height' });
t.resize(342, 34);
bind(t, 'color.fg.muted', ['fill']);

// a raised card with a hairline border — the app's canonical container
const { rect: card } = lib.upsertRect(demo, 'm / card', { x: 24, y: 128, w: 342, h: 128, radius: 16, fill: '#FFFFFF' });
bind(card, 'color.bg.raised', ['fill']);
card.strokes = [{ strokeColor: '#ECEBE4', strokeWidth: 1, strokeAlignment: 'inner' }];
bind(card, 'color.border.base', ['strokeColor']);
t = label('card-label', 'Total balance', { size: 11, weight: 500, x: 44, y: 148, color: '#6E6B62' });
bind(t, 'color.fg.muted', ['fill']);
t = label('card-amount', '$4,182.19', { size: 32, weight: 600, x: 44, y: 168 });
bind(t, 'color.fg.base', ['fill']);
const { rect: hair } = lib.upsertRect(demo, 'm / hairline', { x: 44, y: 216, w: 302, h: 1, fill: '#ECEBE4' });
bind(hair, 'color.border.base', ['fill']);
t = label('card-foot', 'hairline divider · no shadow · no card stack', { size: 10, weight: 400, x: 44, y: 228, color: '#8C887E' });
bind(t, 'color.fg.subtle', ['fill']);

// the single accent CTA
const { rect: cta } = lib.upsertRect(demo, 'm / cta', { x: 24, y: 280, w: 342, h: 48, radius: 12, fill: '#E8572A' });
bind(cta, 'color.accent.base', ['fill']);
t = label('cta-label', 'Confirm & Send', { size: 15, weight: 600, x: 130, y: 295, color: '#FFFFFF' });
bind(t, 'color.fg.inverse', ['fill']);

// status grammar: success / warning / error / info soft chips
const CHIPS = [
  ['success', 'Confirmed', 'color.success.soft', 'color.success.base'],
  ['warning', 'Needs review', 'color.warning.soft', 'color.warning.base'],
  ['error', 'Reverted', 'color.error.soft', 'color.error.base'],
  ['info', 'Pending', 'color.info.soft', 'color.info.base'],
];
CHIPS.forEach(([key, txt, softTok, baseTok], i) => {
  const x = 24 + (i % 2) * 174, y = 352 + Math.floor(i / 2) * 46;
  const { rect } = lib.upsertRect(demo, 'm / chip-' + key, { x, y, w: 162, h: 34, radius: 10, fill: valueOf('color-light', softTok) || '#EEE' });
  bind(rect, softTok, ['fill']);
  const tx = label('chip-' + key + '-label', txt, { size: 11, weight: 600, x: x + 14, y: y + 11, color: valueOf('color-light', baseTok) || '#333' });
  bind(tx, baseTok, ['fill']);
});
t = label('chips-note', 'accent = money movement & submission only.\nStatus colours never borrow it.',
  { size: 10, weight: 400, x: 24, y: 452, color: '#8C887E', growType: 'auto-height' });
t.resize(320, 28);
bind(t, 'color.fg.subtle', ['fill']);
lib.chip(demo, 'note', 'SC-011 proof board: toggle the active colour set (core + exactly one of color-light / color-dark) and every paint here follows');

// ── board 2: both palettes at once, literal by necessity ────────────────────────────────────────
const ROWS = ['color.bg.base', 'color.bg.raised', 'color.bg.sunken', 'color.fg.base', 'color.fg.muted',
  'color.fg.subtle', 'color.fg.inverse', 'color.border.base', 'color.border.strong', 'color.accent.base',
  'color.accent.soft', 'color.success.base', 'color.success.soft', 'color.warning.base', 'color.warning.soft',
  'color.warning.border', 'color.error.base', 'color.error.soft', 'color.info.base', 'color.info.soft'];
const H = 120 + ROWS.length * 34 + 40;
const { board: cmp, created: c2 } = await lib.upsertBoard(PAGE, 'D / tokens / mode-compare',
  { x: 1400, y: 1000, w: 560, h: H, fill: '#FFFFFF' });
if (c2) stats.created.push('mode-compare');
for (let g = 0; g < 400; g++) {
  const old = penpotUtils.findShape((s) => lib.norm(s.name || '').startsWith('c / '), cmp);
  if (!old) break;
  old.remove();
}
const clab = (name, txt, o) => lib.upsertText(cmp, 'c / ' + name, Object.assign({ text: txt, size: 11, weight: 500, color: '#1A1A18' }, o)).text;
const k = clab('kicker', 'BOTH MODES AT ONCE', { size: 10, weight: 600, x: 24, y: 24, color: '#8C887E' });
k.letterSpacing = '0.6'; k.textTransform = 'uppercase';
clab('title', 'Light and dark, same token name', { size: 17, weight: 600, x: 24, y: 46 });
clab('sub', 'Literal hex on purpose: token sets are file-global, so one mode is always inactive and a bound side-by-side is impossible. Drift is caught by 26-tokens-dtcg-check.',
  { size: 10, weight: 400, x: 24, y: 74, color: '#6E6B62', growType: 'auto-height' }).resize(512, 28);
clab('h-name', 'token', { size: 10, weight: 600, x: 24, y: 112, color: '#8C887E' });
clab('h-light', 'light', { size: 10, weight: 600, x: 300, y: 112, color: '#8C887E' });
clab('h-dark', 'dark', { size: 10, weight: 600, x: 430, y: 112, color: '#8C887E' });
ROWS.forEach((tok, i) => {
  const y = 132 + i * 34;
  clab('r' + i + '-name', tok.replace(/^color\./, ''), { size: 11, weight: 400, x: 24, y: y + 8, color: '#1A1A18' });
  const lv = valueOf('color-light', tok), dv = valueOf('color-dark', tok);
  [[300, lv], [430, dv]].forEach(([x, v], j) => {
    const { rect } = lib.upsertRect(cmp, 'c / r' + i + '-sw' + j, { x, y, w: 26, h: 26, radius: 6, fill: (v || '#EEE').startsWith('#') ? v : '#EEE' });
    rect.strokes = [{ strokeColor: '#ECEBE4', strokeWidth: 1, strokeAlignment: 'inner' }];
    clab('r' + i + '-hex' + j, v || '—', { size: 10, weight: 400, x: x + 34, y: y + 8, color: '#6E6B62' });
    stats.swatches++;
  });
});
lib.chip(cmp, 'note', 'palette reference for humans; values are literal because a token-bound both-modes board cannot exist (sets are file-global)');

return lib.done('27-mode-demo', stats);
