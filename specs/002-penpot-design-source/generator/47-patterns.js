// 47-patterns.js — `09 Patterns`: the rules a board cannot show.
//
// Motion, haptics, the accessibility floor, platform divergence and i18n resilience are invisible
// in a static board, and the consumption contract sends readers here for them. Every number is
// anchored to inventory/08-motion-states.md (which is itself anchored to the source), so this page
// is a transcription of measured behaviour, not a set of recommendations.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const PAGE = '09 Patterns';
await lib.open(PAGE);

const C = { ink: '#1A1A18', muted: '#6E6B62', accent: '#E8572A', line: '#ECEBE4',
            raised: '#FFFFFF', canvas: '#EDEDEC', mono: '#2D8E5F', warn: '#C62828' };
const stats = { boards: 0, rows: 0 };

const makeBoard = async (name, title, eyebrow, groups, x) => {
  const W = 620, M = 40;
  const { board } = await lib.upsertBoard(PAGE, name, { x, y: 0, w: W, h: 400, fill: C.canvas });
  let guard = 0;
  while (guard++ < 600) {
    const old = penpotUtils.findShape((s) => s.name && lib.norm(s.name).startsWith('p / '), board);
    if (!old) break;
    old.remove();
  }
  const pfx = 'p/' + name.split('/').pop() + '/';
  const T = (n, spec) => { lib.upsertText(board, pfx + n, spec); stats.rows++; };
  const R = (n, spec) => lib.upsertRect(board, pfx + n, spec);
  let Y = 44;
  T('eyebrow', { text: eyebrow, size: 10.5, weight: 700, color: C.accent, x: M, y: Y });
  Y += 22;
  T('title', { text: title, size: 30, weight: 700, color: C.ink, x: M, y: Y });
  Y += 52;
  groups.forEach(([heading, rows], gi) => {
    const h = 30 + rows.length * 28 + 26;
    R('bg' + gi, { x: M, y: Y, w: W - M * 2, h, radius: 12, fill: C.raised });
    T('h' + gi, { text: heading, size: 14, weight: 700, color: C.ink, x: M + 20, y: Y + 16 });
    R('rule' + gi, { x: M + 20, y: Y + 40, w: W - M * 2 - 40, h: 1, fill: C.line });
    rows.forEach(([k, v], i) => {
      const ry = Y + 52 + i * 28;
      T('k' + gi + '_' + i, { text: k, size: 11.5, weight: 600, color: C.mono, zone: 'mono', x: M + 20, y: ry });
      T('v' + gi + '_' + i, { text: v, size: 11.5, weight: 400, color: C.muted, x: M + 250, y: ry });
    });
    Y += h + 18;
  });
  board.resize(W, Y + 24);
  stats.boards++;
  return board;
};

// numbers: inventory/08-motion-states.md §motion tokens, §press feedback, §sheets, §a11y
const motion = await makeBoard('D/patterns/motion', 'Motion', 'PATTERNS · 1', [
  ['Springs', [
    ['damping 15 · stiff 150 · mass 0.8', 'motion.spring — ALL press feedback, toggle chip, refresh settle'],
    ['damping 20 · stiff 120 · mass 1', 'motion.springGentle — reserved, rarely used'],
    ['damping 16 · stiff 320', 'SlideToConfirm knob grow ×1.06 while grabbed'],
    ['damping 18 · stiff 260', 'under-threshold release springs back'],
  ]],
  ['Press feedback (scale)', [
    ['0.97', 'VelaButton all variants; WaveDock Send/Receive pills'],
    ['0.98', 'TokenRow; ActivityRow (only when onPress is given)'],
    ['0.92', 'WaveDock Scan FAB — deeper dip because it is a round FAB'],
    ['opacity 0.45', 'disabled and loading; loading swaps label for a spinner'],
  ]],
  ['Sheets and transitions', [
    ['enter 220 / exit 180 ms', 'sheet translate over the measured height'],
    ['backdrop rgba(0,0,0,0.35)', 'single-overlay rule: never stack two'],
    ['220 ms up / Easing.out(quad)', 'balance pulse — hero scale 1 + 0.03×p'],
    ['110 ms', 'slide-to-confirm knob glide to the end once armed'],
  ]],
], 0);
lib.chip(motion, 'note', 'values transcribed from inventory/08-motion-states.md; entrance animations are iOS-ONLY — Android and web settle without them');

const a11y = await makeBoard('D/patterns/a11y', 'Accessibility floor', 'PATTERNS · 2', [
  ['Touch targets', [
    ['≥ 44 × 44', 'by size (avatars 44, rows minHeight 44) or by hitSlop'],
    ['hitSlop 8', 'default; 6 on a few dense headers; 10 on the slide track'],
  ]],
  ['Requirements', [
    ['roles + labels', 'every interactive element; not optional'],
    ['focus ring', 'visible on web keyboard focus'],
    ['contrast', 'text meets WCAG AA against its own surface'],
    ['0.82× – 1.35×', 'text must survive 6 user-scale levels'],
  ]],
  ['Web divergence', [
    ['×1.2 text boost', 'web renders type 20% larger than native — same tokens'],
    ['no entrance animation', 'iOS animates in; Android and web arrive settled'],
  ]],
], 680);
lib.chip(a11y, 'platform', 'iOS: entrance animations. Android + web: settled arrival. Web: ×1.2 text boost.');

const resil = await makeBoard('D/patterns/resilience', 'Degraded states', 'PATTERNS · 3', [
  ['Rate limiting (429)', [
    ['keep the cached balance', 'a 429 is transient — never blank the hero'],
    ['no swap-RPC banner', 'rate limiting is NOT an RPC fault; do not offer to switch'],
    ['see S/home/rate-limited', 'the board that depicts it'],
  ]],
  ['Hard RPC failure', [
    ['banner + retry', 'this is the case that DOES offer an RPC fix'],
    ['see S/home/rpc-trouble', 'and O/rpc-fix/default for the repair sheet'],
  ]],
  ['Missing price', [
    ['show the token amount', 'never a zero fiat figure — absence is not zero'],
  ]],
  ['i18n resilience', [
    ['15 locales', 'labels must not truncate mid-word in any of them'],
    ['min-widths', 'VelaButton and AppAlert reserve room for the longest locale'],
    ['truncate the tail', 'addresses truncate in the middle; names at the end'],
  ]],
], 1360);
lib.chip(resil, 'note', 'the rate-limit vs RPC-fault distinction is the one most often collapsed — they are different states with different affordances');

return lib.done('47-patterns', stats);
