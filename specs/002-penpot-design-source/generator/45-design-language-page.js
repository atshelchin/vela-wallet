// 45-design-language-page.js — `01 Design Language`, designed rather than transcribed.
//
// The previous version was a plotter output: hairline wireframe boxes, cramped rhythm, no elevation,
// everything the same size. This one is composed like a real spread — an eyebrow/title/lede block,
// numbered principles with generous vertical rhythm, and specimens on elevated cards floating on a
// neutral canvas. It also USES the file's own assets (library typographies, colour tokens) instead
// of hand-setting every font, which is the whole point of having them.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const PAGE = '01 Design Language';
await lib.open(PAGE);

const C = { ink: '#1A1A18', muted: '#6E6B62', subtle: '#8C887E', line: '#ECEBE4', strong: '#D8D6CE',
            accent: '#E8572A', raised: '#FFFFFF', sunken: '#F5F3EF', base: '#FAFAF8',
            canvas: '#EDEDEC', good: '#2D8E5F', bad: '#C62828' };
const stats = { specimens: 0, typographyApplied: 0 };

// page geometry — a wide spread with real margins, not a cramped 1180 box
const W = 1520, M = 120, COL = 560, GAP = 48;
const board = (await lib.upsertBoard(PAGE, 'D/design-language/specimens', { x: 0, y: 0, w: W, h: 3200, fill: C.canvas })).board;
let g = 0;
while (g++ < 1400) {
  const old = penpotUtils.findShape((s) => s.name && s.name.startsWith('sp/'), board);
  if (!old) break;
  old.remove();
}

const typo = (name) => penpot.library.local.typographies.find((t) => t.name === name);
const T = (name, spec) => {
  const r = lib.upsertText(board, 'sp/' + name, spec);
  if (spec.typography) {
    const ty = typo(spec.typography);
    // library typography carries family/size/weight/leading/tracking in one asset — applying it is
    // what makes a later change to the style propagate instead of needing a sweep of literals
    if (ty) { try { r.text.applyTypography(ty); stats.typographyApplied++; } catch (e) {} }
  }
  return r.text;
};
const R = (name, spec) => lib.upsertRect(board, 'sp/' + name, spec).rect;
const SHADOW = [{ style: 'drop-shadow', offsetX: 0, offsetY: 10, blur: 30, spread: -6,
                  color: { color: '#1A1A18', opacity: 0.10 } }];

// ── masthead ────────────────────────────────────────────────────────────────────────────────────
T('eyebrow', { text: 'VELA · DESIGN LANGUAGE', size: 12, weight: 700, color: C.accent, x: M, y: 96 });
(() => { const t = lib.byName('sp/eyebrow', board); if (t) t.letterSpacing = '2.4'; })();
T('title', { text: 'Quiet, typographic, de-containered', size: 46, weight: 700, color: C.ink, x: M, y: 124 });
const lede = T('lede', {
  text: 'Every rule below is a rendered specimen, not a sentence about one. Left is the register we '
      + 'ship; right is the anti-pattern it replaced. All of it is drawn from the same tokens the '
      + 'app runs on, so a value that drifts here has drifted there too.',
  size: 15, weight: 400, color: C.muted, x: M, y: 196,
});
lede.growType = 'auto-height'; lede.resize(760, 80); lede.lineHeight = '1.7';
penpotUtils.setParentXY(lede, M, 196);
R('rule', { x: M, y: 320, w: W - M * 2, h: 1, fill: C.strong });

// ── one principle ───────────────────────────────────────────────────────────────────────────────
let Y = 384;
const STAGE_H = 260;
const principle = (num, key, heading, rule, draw) => {
  T(key + '/num', { text: num, size: 13, weight: 700, zone: 'mono', color: C.accent, x: M, y: Y + 4 });
  T(key + '/h', { text: heading, size: 24, weight: 700, color: C.ink, x: M + 48, y: Y });
  const r = T(key + '/r', { text: rule, size: 13, weight: 400, color: C.muted, x: M + 48, y: Y + 36 });
  r.growType = 'auto-height'; r.resize(720, 40); r.lineHeight = '1.6';
  penpotUtils.setParentXY(r, M + 48, Y + 36);

  const sy = Y + 96;
  const doX = M + 48, dontX = M + 48 + COL + GAP;
  // caption above each stage, the way the HTML spreads label a comparison
  R(key + '/dot-do', { x: doX, y: sy - 22, w: 7, h: 7, radius: 4, fill: C.good });
  T(key + '/lbl-do', { text: 'the register we ship', size: 11, weight: 600, color: C.muted, x: doX + 14, y: sy - 25 });
  R(key + '/dot-dont', { x: dontX, y: sy - 22, w: 7, h: 7, radius: 4, fill: C.bad });
  T(key + '/lbl-dont', { text: 'what it replaced', size: 11, weight: 600, color: C.muted, x: dontX + 14, y: sy - 25 });
  // elevated cards, not wireframe outlines
  for (const [n, x] of [['do', doX], ['dont', dontX]]) {
    const card = R(key + '/stage-' + n, { x, y: sy, w: COL, h: STAGE_H, radius: 20, fill: C.base });
    card.shadows = SHADOW;
    try { lib.bindToken(card, 'color.bg.base', ['fill']); } catch (e) {}
  }
  draw(doX + 36, sy + 44, dontX + 36, sy + 44, key);
  Y = sy + STAGE_H + 96;
  stats.specimens++;
};

// shared row specimen
const row = (key, x, y, w, title, sub, right, opts) => {
  const o = opts || {};
  if (o.card) {
    const c = R(key + '/card', { x, y, w, h: 60, radius: 14, fill: C.raised });
    c.shadows = [{ style: 'drop-shadow', offsetX: 0, offsetY: 2, blur: 8, color: { color: '#1A1A18', opacity: 0.06 } }];
  }
  const lx = x + (o.card ? 14 : 0);
  R(key + '/logo', { x: lx, y: y + 10, w: 40, h: 40, radius: 20, fill: C.sunken });
  const tx = lx + 52;
  T(key + '/t', { text: title, size: 15, weight: 600, color: C.ink, x: tx, y: y + 12 });
  T(key + '/s', { text: sub, size: 11, weight: 400, color: C.subtle, x: tx, y: y + 34 });
  T(key + '/r', { text: right, size: 15, weight: 600, color: C.ink, x: x + w - (o.card ? 14 : 0) - 66, y: y + 12 });
};

principle('01', 'decon', 'De-container',
  'Content sits directly on the page, grouped by whitespace, a section label and hairline dividers. One card per row is the pattern we removed.',
  (dx, dy, nx, ny, k) => {
    T(k + '/lab', { text: 'ASSETS', size: 11, weight: 600, color: C.subtle, x: dx, y: dy - 24, typography: 'Label / Section' });
    row(k + '/r1', dx, dy, 480, 'BNB', 'BNB Chain', '0.0038');
    R(k + '/div', { x: dx + 52, y: dy + 60, w: 428, h: 1, fill: C.line });
    row(k + '/r2', dx, dy + 61, 480, 'XDAI', 'Gnosis', '0.996');
    row(k + '/n1', nx, ny, 480, 'BNB', 'BNB Chain', '0.0038', { card: true });
    row(k + '/n2', nx, ny + 72, 480, 'XDAI', 'Gnosis', '0.996', { card: true });
  });

principle('02', 'amount', 'The number is the hero',
  'In a big amount the currency symbol scales to 0.58 and the decimal tail to 0.56, and the tail drops to fg.subtle. One flat size makes the cents compete with the number.',
  (dx, dy, nx, ny, k) => {
    T(k + '/lab', { text: 'TOTAL BALANCE · USD', size: 11, weight: 600, color: C.subtle, x: dx, y: dy - 24, typography: 'Label / Section' });
    T(k + '/sym', { text: '$', size: 27, weight: 700, color: C.ink, x: dx, y: dy + 20 });
    T(k + '/int', { text: '3', size: 47, weight: 700, color: C.ink, x: dx + 19, y: dy });
    T(k + '/tail', { text: '.20', size: 26, weight: 700, color: C.subtle, x: dx + 48, y: dy + 21 });
    R(k + '/tick', { x: dx + 132, y: dy + 8, w: 1, h: 44, fill: C.strong });
    T(k + '/tickt', { text: '47 / 27 / 26 px', size: 10, weight: 500, zone: 'mono', color: C.muted, x: dx + 144, y: dy + 16 });
    T(k + '/tickt2', { text: 'symbol 0.58 · tail 0.56', size: 10, weight: 500, color: C.subtle, x: dx + 144, y: dy + 32 });
    T(k + '/nsym', { text: '$3.20', size: 40, weight: 700, color: C.ink, x: nx, y: dy + 4 });
    T(k + '/nnote', { text: 'symbol and cents at full weight — nothing leads', size: 11, weight: 500, color: C.muted, x: nx, y: dy + 68 });
  });

principle('03', 'controls', 'Light controls',
  'Tabs are a transparent track carrying ONE floating chip: raised fill, hairline border, shadow.sm. Filled boxes read as heavy, and spend the accent on navigation.',
  (dx, dy, nx, ny, k) => {
    const segs = ['Activity', 'Assets', 'Connections'];
    let x = dx;
    segs.forEach((s, i) => {
      const w = 30 + s.length * 7.4;
      if (i === 1) {
        const chip = R(k + '/chip', { x, y: dy, w, h: 44, radius: 22, fill: C.raised, stroke: C.strong });
        chip.shadows = [{ style: 'drop-shadow', offsetX: 0, offsetY: 1, blur: 3, color: { color: '#1A1A18', opacity: 0.04 } }];
      }
      T(k + '/s' + i, { text: s, size: 13, weight: 600, color: i === 1 ? C.ink : C.muted, x: x + 15, y: dy + 14 });
      x += w + 2;
    });
    let nx2 = nx;
    segs.forEach((s, i) => {
      const w = 30 + s.length * 7.4;
      R(k + '/nb' + i, { x: nx2, y: dy, w, h: 44, radius: 8, fill: i === 1 ? C.accent : C.sunken, stroke: C.strong });
      T(k + '/ns' + i, { text: s, size: 13, weight: 600, color: i === 1 ? '#FFFFFF' : C.muted, x: nx2 + 15, y: dy + 14 });
      nx2 += w + 8;
    });
  });

principle('04', 'accent', 'One accent, reserved',
  'Accent #E8572A marks money-moving CTAs and truly-primary actions. Everything else is ink or muted — an accent spent everywhere means nothing anywhere.',
  (dx, dy, nx, ny, k) => {
    R(k + '/recv', { x: dx, y: dy, w: 220, h: 60, radius: 16, fill: C.base, stroke: C.strong });
    T(k + '/recvt', { text: 'Receive', size: 17, weight: 600, color: C.ink, x: dx + 76, y: dy + 19 });
    const send = R(k + '/send', { x: dx + 244, y: dy, w: 220, h: 60, radius: 16, fill: C.accent });
    try { lib.bindToken(send, 'color.accent.base', ['fill']); } catch (e) {}
    T(k + '/sendt', { text: 'Send', size: 17, weight: 700, color: '#FFFFFF', x: dx + 330, y: dy + 19 });
    T(k + '/note', { text: 'only Send moves money, so only Send is accent', size: 11, weight: 500, color: C.muted, x: dx, y: dy + 78 });
    ['Receive', 'Send', 'Scan'].forEach((s, i) => {
      R(k + '/n' + i, { x: nx + i * 154, y: dy, w: 142, h: 60, radius: 16, fill: C.accent });
      T(k + '/nt' + i, { text: s, size: 15, weight: 700, color: '#FFFFFF', x: nx + i * 154 + 42, y: dy + 20 });
    });
    T(k + '/nnote', { text: 'three primaries — the eye has nowhere to land', size: 11, weight: 500, color: C.muted, x: nx, y: dy + 78 });
  });

principle('05', 'divider', 'Hairline dividers, inset',
  'A 1px border.base line, inset past the leading icon so it begins under the text. A full-bleed rule cuts through the icon column and re-boxes the list.',
  (dx, dy, nx, ny, k) => {
    row(k + '/a', dx, dy, 480, 'XDAI', 'Gnosis', '0.996');
    R(k + '/dv', { x: dx + 52, y: dy + 60, w: 428, h: 1, fill: C.line });
    row(k + '/b', dx, dy + 61, 480, 'pathUSD', 'Tempo', '0.0225');
    R(k + '/ind', { x: dx, y: dy + 60, w: 52, h: 2, fill: C.accent });
    T(k + '/indt', { text: '52 = icon 40 + gap 12', size: 10, weight: 600, zone: 'mono', color: C.accent, x: dx, y: dy + 128 });
    row(k + '/na', nx, dy, 480, 'XDAI', 'Gnosis', '0.996');
    R(k + '/ndv', { x: nx, y: dy + 60, w: 480, h: 1, fill: C.line });
    row(k + '/nb', nx, dy + 61, 480, 'pathUSD', 'Tempo', '0.0225');
    T(k + '/nnote', { text: 'the rule cuts the icon column', size: 10, weight: 600, zone: 'mono', color: C.muted, x: nx, y: dy + 128 });
  });

principle('06', 'iconbtn', 'Plain icon buttons',
  'A header icon carries no background, border or shadow — just the glyph, inside a ≥44×44 target. Chrome around a glyph adds a box to every header.',
  (dx, dy, nx, ny, k) => {
    R(k + '/hit', { x: dx, y: dy, w: 44, h: 44, radius: 8, fill: C.base, stroke: C.line });
    R(k + '/gl', { x: dx + 12, y: dy + 12, w: 20, h: 20, radius: 4, fill: C.base, stroke: C.ink, strokeWidth: 2 });
    T(k + '/t', { text: 'invisible 44×44 target', size: 11, weight: 500, color: C.muted, x: dx + 60, y: dy + 16 });
    const nb = R(k + '/nb', { x: nx, y: dy, w: 44, h: 44, radius: 12, fill: C.raised, stroke: C.strong });
    nb.shadows = [{ style: 'drop-shadow', offsetX: 0, offsetY: 1, blur: 3, color: { color: '#1A1A18', opacity: 0.06 } }];
    R(k + '/ng', { x: nx + 12, y: dy + 12, w: 20, h: 20, radius: 4, fill: C.raised, stroke: C.ink, strokeWidth: 2 });
    T(k + '/nt', { text: 'a box on every header', size: 11, weight: 500, color: C.muted, x: nx + 60, y: dy + 16 });
  });

board.resize(W, Y + 40);
lib.chip(board, 'note', 'composed page (not a DOM transcription); specimens use the file tokens and library typographies');
return lib.done('45-design-language-page', stats);
