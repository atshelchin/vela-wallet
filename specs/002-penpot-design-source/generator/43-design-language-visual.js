// 43-design-language-visual.js — turn `01 Design Language` from prose into SPECIMENS.
// Each principle is shown as a rendered do/don't pair built from the real tokens, with the rule
// stated in one line underneath. Reading rules is what Markdown is for; a design tool has to show
// the thing. Text-only boards from chunk 23 are removed by this chunk.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const PAGE = '01 Design Language';
await lib.open(PAGE);

const C = { ink: '#1A1A18', muted: '#6E6B62', subtle: '#8C887E', line: '#ECEBE4', strong: '#D8D6CE',
            accent: '#E8572A', raised: '#FFFFFF', sunken: '#F5F3EF', base: '#FAFAF8',
            good: '#2D8E5F', bad: '#C62828' };
const stats = { specimens: 0 };

const board = (await lib.upsertBoard(PAGE, 'D/design-language/specimens', { x: 0, y: 0, w: 1180, h: 2260, fill: C.base })).board;
let g = 0;
while (g++ < 900) {
  const old = penpotUtils.findShape((s) => s.name && s.name.startsWith('sp/'), board);
  if (!old) break;
  old.remove();
}

const T = (name, spec) => lib.upsertText(board, 'sp/' + name, spec).text;
const R = (name, spec) => lib.upsertRect(board, 'sp/' + name, spec).rect;

T('title', { text: 'Vela design language — shown, not described', size: 28, weight: 700, color: C.ink, x: 40, y: 36 });
T('sub', { text: 'Each rule below is a rendered specimen. Left = what we do. Right = the anti-pattern it replaces.', size: 12, weight: 500, color: C.subtle, x: 40, y: 76 });
R('title-bar', { x: 40, y: 104, w: 44, h: 4, radius: 2, fill: C.accent });

// one specimen block: heading, rule line, and two 340-wide stages
let Y = 150;
const block = (key, heading, rule, draw) => {
  T(key + '/h', { text: heading, size: 16, weight: 700, color: C.ink, x: 40, y: Y });
  T(key + '/r', { text: rule, size: 11, weight: 500, color: C.muted, x: 40, y: Y + 24 });
  const stageY = Y + 50;
  // do / don't stages
  const doX = 40, dontX = 620;
  R(key + '/stage-do', { x: doX, y: stageY, w: 400, h: 210, radius: 12, fill: C.base, stroke: C.line });
  R(key + '/stage-dont', { x: dontX, y: stageY, w: 400, h: 210, radius: 12, fill: C.base, stroke: C.line });
  R(key + '/dot-do', { x: doX + 16, y: stageY + 16, w: 8, h: 8, radius: 4, fill: C.good });
  T(key + '/lbl-do', { text: 'DO', size: 9, weight: 700, color: C.good, x: doX + 30, y: stageY + 15 });
  R(key + '/dot-dont', { x: dontX + 16, y: stageY + 16, w: 8, h: 8, radius: 4, fill: C.bad });
  T(key + '/lbl-dont', { text: "DON'T", size: 9, weight: 700, color: C.bad, x: dontX + 30, y: stageY + 15 });
  // +54, not +40: specimens that caption themselves with a section label draw it at (content − 18),
  // which at +40 landed on the DO/DON'T badge sitting at +15
  draw(doX + 24, stageY + 54, dontX + 24, stageY + 54, key);
  Y = stageY + 210 + 46;
  stats.specimens++;
};

// row helper used by several specimens
const row = (key, x, y, w, title, sub, right, opts) => {
  const o = opts || {};
  if (o.card) R(key + '/card', { x, y, w, h: 56, radius: 12, fill: C.raised, stroke: C.line });
  R(key + '/logo', { x: x + (o.card ? 12 : 0), y: y + 8, w: 40, h: 40, radius: 20, fill: C.sunken });
  const tx = x + (o.card ? 12 : 0) + 52;
  T(key + '/t', { text: title, size: 15, weight: 600, color: C.ink, x: tx, y: y + 10 });
  T(key + '/s', { text: sub, size: 11, weight: 400, color: C.subtle, x: tx, y: y + 32 });
  T(key + '/r', { text: right, size: 15, weight: 600, color: C.ink, x: x + w - (o.card ? 12 : 0) - 62, y: y + 10 });
};

// 1 ── de-container
block('decon', '1 · De-container', 'Content sits on the page, grouped by whitespace + a section label + hairline dividers. Never one card per row.',
  (dx, dy, nx, ny, k) => {
    T(k + '/lab', { text: 'ASSETS', size: 11, weight: 600, color: C.subtle, x: dx, y: dy - 18, growType: 'auto-width' });
    row(k + '/r1', dx, dy, 350, 'BNB', 'BNB Chain', '0.0038');
    R(k + '/div', { x: dx + 52, y: dy + 56, w: 298, h: 1, fill: C.line });
    row(k + '/r2', dx, dy + 57, 350, 'XDAI', 'Gnosis', '0.996');
    row(k + '/n1', nx, ny, 350, 'BNB', 'BNB Chain', '0.0038', { card: true });
    row(k + '/n2', nx, ny + 66, 350, 'XDAI', 'Gnosis', '0.996', { card: true });
  });

// 2 ── subordinated symbol + tail
block('amount', '2 · The number is the hero', 'In big amounts the currency symbol scales 0.58 and the decimal tail 0.56, and the tail drops to fg.subtle.',
  (dx, dy, nx, ny, k) => {
    T(k + '/lab', { text: 'TOTAL BALANCE · USD', size: 11, weight: 600, color: C.subtle, x: dx, y: dy - 18 });
    T(k + '/sym', { text: '$', size: 27, weight: 700, color: C.ink, x: dx, y: dy + 18 });
    T(k + '/int', { text: '3', size: 47, weight: 700, color: C.ink, x: dx + 18, y: dy });
    T(k + '/tail', { text: '.20', size: 26, weight: 700, color: C.subtle, x: dx + 46, y: dy + 20 });
    R(k + '/m1', { x: dx + 120, y: dy + 6, w: 1, h: 46, fill: C.strong });
    T(k + '/m1t', { text: '47px · integer is the hero', size: 9, weight: 500, color: C.muted, x: dx + 128, y: dy + 24 });
    T(k + '/nsym', { text: '$3.20', size: 40, weight: 700, color: C.ink, x: nx, y: ny });
    T(k + '/nnote', { text: 'one flat size — symbol and cents compete with the number', size: 10, weight: 500, color: C.muted, x: nx, y: ny + 62 });
  });

// 3 ── light controls
block('controls', '3 · Light controls', 'Tabs are a transparent track with ONE floating chip (raised + hairline + shadow.sm). No filled control boxes.',
  (dx, dy, nx, ny, k) => {
    const segs = ['Activity', 'Assets', 'Connections'];
    let x = dx;
    segs.forEach((s, i) => {
      const w = 26 + s.length * 7.2;
      if (i === 1) R(k + '/chip', { x, y: dy, w, h: 40, radius: 20, fill: C.raised, stroke: C.strong });
      T(k + '/s' + i, { text: s, size: 13, weight: 600, color: i === 1 ? C.ink : C.muted, x: x + 14, y: dy + 12 });
      x += w + 2;
    });
    let nx2 = nx;
    segs.forEach((s, i) => {
      const w = 26 + s.length * 7.2;
      R(k + '/nb' + i, { x: nx2, y: ny, w, h: 40, radius: 8, fill: i === 1 ? C.accent : C.sunken, stroke: C.strong });
      T(k + '/ns' + i, { text: s, size: 13, weight: 600, color: i === 1 ? '#FFFFFF' : C.muted, x: nx2 + 14, y: ny + 12 });
      nx2 += w + 6;
    });
    T(k + '/nnote', { text: 'chunky filled boxes + accent spent on a tab', size: 10, weight: 500, color: C.muted, x: nx, y: ny + 56 });
  });

// 4 ── accent discipline
block('accent', '4 · One accent, reserved', 'Accent #E8572A marks money-moving CTAs and truly-primary actions only. Everything else is ink or muted.',
  (dx, dy, nx, ny, k) => {
    R(k + '/recv', { x: dx, y: dy, w: 150, h: 56, radius: 16, fill: C.base, stroke: C.strong });
    T(k + '/recvt', { text: 'Receive', size: 17, weight: 600, color: C.ink, x: dx + 44, y: dy + 18 });
    R(k + '/send', { x: dx + 168, y: dy, w: 150, h: 56, radius: 16, fill: C.accent });
    T(k + '/sendt', { text: 'Send', size: 17, weight: 700, color: '#FFFFFF', x: dx + 222, y: dy + 18 });
    T(k + '/note', { text: 'only Send moves money → only Send is accent', size: 10, weight: 500, color: C.muted, x: dx, y: dy + 72 });
    ['Receive', 'Send', 'Scan'].forEach((s, i) => {
      R(k + '/n' + i, { x: nx + i * 110, y: ny, w: 100, h: 56, radius: 16, fill: C.accent });
      T(k + '/nt' + i, { text: s, size: 15, weight: 700, color: '#FFFFFF', x: nx + i * 110 + 24, y: ny + 18 });
    });
    T(k + '/nnote', { text: 'accent everywhere = accent means nothing', size: 10, weight: 500, color: C.muted, x: nx, y: ny + 72 });
  });

// 5 ── hairline divider inset
block('divider', '5 · Hairline dividers, inset', 'A 1px border.base line, inset past the leading icon so it starts under the text — Apple Wallet register.',
  (dx, dy, nx, ny, k) => {
    row(k + '/a', dx, dy, 350, 'XDAI', 'Gnosis', '0.996');
    R(k + '/dv', { x: dx + 52, y: dy + 56, w: 298, h: 1, fill: C.line });
    row(k + '/b', dx, dy + 57, 350, 'pathUSD', 'Tempo', '0.0225');
    R(k + '/ind', { x: dx, y: dy + 56, w: 52, h: 1, fill: C.accent });
    // below BOTH rows (they run to dy+113) — at dy+62 this caption sat on the second row
    T(k + '/indt', { text: '52 = icon 40 + gap 12', size: 9, weight: 600, color: C.accent, x: dx, y: dy + 118 });
    row(k + '/na', nx, ny, 350, 'XDAI', 'Gnosis', '0.996');
    R(k + '/ndv', { x: nx, y: ny + 56, w: 350, h: 1, fill: C.line });
    row(k + '/nb', nx, ny + 57, 350, 'pathUSD', 'Tempo', '0.0225');
    T(k + '/nnote', { text: 'full-bleed rule cuts the icon column', size: 10, weight: 500, color: C.muted, x: nx, y: ny + 118 });
  });

// 6 ── plain icon buttons
block('iconbtn', '6 · Plain icon buttons', 'Header icons carry no background, border or shadow — just the glyph, with a ≥44×44 target.',
  (dx, dy, nx, ny, k) => {
    R(k + '/hit', { x: dx, y: dy, w: 44, h: 44, radius: 8, fill: C.base, stroke: C.line });
    R(k + '/gl', { x: dx + 12, y: dy + 12, w: 20, h: 20, radius: 4, fill: C.base, stroke: C.ink, strokeWidth: 2 });
    T(k + '/t', { text: '44×44 target, invisible', size: 10, weight: 500, color: C.muted, x: dx + 56, y: dy + 16 });
    R(k + '/nb', { x: nx, y: ny, w: 44, h: 44, radius: 12, fill: C.raised, stroke: C.strong });
    R(k + '/ng', { x: nx + 12, y: ny + 12, w: 20, h: 20, radius: 4, fill: C.raised, stroke: C.ink, strokeWidth: 2 });
    T(k + '/nt', { text: 'chrome around a glyph adds a box to every header', size: 10, weight: 500, color: C.muted, x: nx + 56, y: ny + 16 });
  });

board.resize(1180, Y + 40);
lib.chip(board, 'note', 'specimens are drawn from the same tokens the app uses; the prose version of these rules lives in docs/DESIGN-LANGUAGE.md');

// Retire the text-wall boards this chunk replaces. Removed rather than parked off-canvas: an
// archived wall of prose still sits on the page and still competes with the specimens, and nothing
// is lost — chunk 23 regenerates that text verbatim, and the chunks are this file's source.
stats.removed = [];
for (const dead of ['D/design-language/principles', 'D/design-language/conflicts', 'D/design-language/a11y',
                    'ARCHIVE D/design-language/principles', 'ARCHIVE D/design-language/conflicts',
                    'ARCHIVE D/design-language/a11y']) {
  const b = lib.byName(dead);
  if (b) { b.remove(); stats.removed.push(dead); }
}
return lib.done('43-design-language-visual', stats);
