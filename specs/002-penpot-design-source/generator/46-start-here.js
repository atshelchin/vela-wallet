// 46-start-here.js — `00 Start Here`: the in-file copy of the consumption contract.
//
// This page is the first thing a rebuild agent reads, and for a while it was the only page that
// did not exist — the contract promised it in the repo while the file itself said nothing. It is
// laid out as cards rather than a wall of prose: an agent reads it over MCP by shape name, and a
// human opening the file should be able to see the shape of the rules at a glance.
// Source of truth: contracts/consumption-contract.md (repo copy governs the generator, this copy
// governs consumers).
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const PAGE = '00 Start Here';
await lib.open(PAGE);

const C = { ink: '#1A1A18', muted: '#6E6B62', subtle: '#8C887E', line: '#ECEBE4',
            accent: '#E8572A', raised: '#FFFFFF', canvas: '#EDEDEC', mono: '#2D8E5F' };
const W = 1180, M = 56, CARD = W - M * 2;
const { board } = await lib.upsertBoard(PAGE, 'D/start-here/contract', { x: 0, y: 0, w: W, h: 2400, fill: C.canvas });
let guard = 0;
while (guard++ < 900) {
  const old = penpotUtils.findShape((s) => s.name && lib.norm(s.name).startsWith('sh / '), board);
  if (!old) break;
  old.remove();
}
const stats = { cards: 0, lines: 0 };
let Y = 0;
// auto-height text keeps whatever width Penpot gave it, which for a multi-line paragraph is a
// ~40px column — the lede came out as one word per line down the side of the page. A wrapped
// paragraph must be told its measure.
const T = (n, spec) => {
  const { text } = lib.upsertText(board, 'sh/' + n, spec);
  if (spec.growType === 'auto-height' && spec.w) {
    text.resize(spec.w, Math.max(20, spec.h || 48));
    penpotUtils.setParentXY(text, spec.x, spec.y);
  }
  stats.lines++;
};
const R = (n, spec) => lib.upsertRect(board, 'sh/' + n, spec).rect;

// ── masthead ───────────────────────────────────────────────────────────────────────────────────
Y = 64;
T('eyebrow', { text: 'CONSUMPTION CONTRACT', size: 11, weight: 700, color: C.accent, x: M, y: Y });
Y += 26;
T('title', { text: 'Start here', size: 46, weight: 700, color: C.ink, x: M, y: Y });
Y += 62;
T('lede', { text: 'This file is the design source of truth for Vela Wallet. Everything below is normative for a rebuild:\nread it before reading any other page. Names are stable across regenerations; shape IDs are not.',
  size: 15, weight: 400, color: C.muted, x: M, y: Y, growType: 'auto-height', w: CARD, h: 48 });
Y += 62;

// ── card helper ────────────────────────────────────────────────────────────────────────────────
const card = (key, heading, rows, kind) => {
  const rowH = 30, padY = 22, headH = 40;
  const h = padY * 2 + headH + rows.length * rowH;
  R(key + '/bg', { x: M, y: Y, w: CARD, h, radius: 14, fill: C.raised });
  T(key + '/h', { text: heading, size: 17, weight: 700, color: C.ink, x: M + 26, y: Y + padY });
  R(key + '/rule', { x: M + 26, y: Y + padY + 30, w: CARD - 52, h: 1, fill: C.line });
  rows.forEach(([a, b], i) => {
    const ry = Y + padY + headH + i * rowH;
    T(key + '/k' + i, { text: a, size: 12.5, weight: 600, color: kind === 'code' ? C.mono : C.ink,
      zone: kind === 'code' ? 'mono' : 'sans', x: M + 26, y: ry });
    T(key + '/v' + i, { text: b, size: 12.5, weight: 400, color: C.muted, x: M + 330, y: ry });
  });
  Y += h + 24;
  stats.cards++;
};

card('entry', 'Entry protocol', [
  ['1 · high_level_overview', 'learn the plugin API before touching anything'],
  ['2 · penpotUtils.getPages()', 'expect 13 numbered pages (00–12); read this one first'],
  ['3 · resolve by NAME', 'never navigate by shape ID across sessions'],
], 'code');

// The gate's finding: this card listed six forms while the file used thirteen, so a consumer given
// only the contract could not classify most of what it read. Every prefix that exists is here now.
card('grammar', 'Naming grammar — every prefix in the file', [
  ['C/<Group>/<Name>', 'library component. Identity is Penpot path + name; `name` alone is the LEAF'],
  ['S/<route>/<state>', 'screen board, 390 wide, one per state'],
  ['O/<overlay>/<state>', 'overlay board — backdrop plus sheet, as presented'],
  ['D/<topic>/<name>', 'documentation board (cover, identity, tokens, IA, patterns, changelog)'],
  ['W/<journey>', 'journey-wall band header on a screens page'],
  ['SEC/<Cat>  DOC/<comp>', 'component-shelf section header and its docs block (page 03)'],
  ['region/<name>', 'semantic region group inside a board: header / hero / content / list /'],
  ['↳', 'actions / dock — backdrop / sheet on overlays'],
  ['swap/<path> <Comp>', 'a subtree replaced by a library instance'],
  ['e/<from> → <to>', 'VISIBLE edge layer (arrow + trigger label). Humans only —'],
  ['↳', 'machines read the interaction or vela.edge instead'],
  ['r/<dom-path> …', 'a shape transcribed from the capture; the path is its DOM position'],
  ['DRAFT/<Group>/<Name>', 'NOT CANON — pre-pivot draft, quarantined on page 03, indexed on 12'],
  ['Z/*  n/*  lg/*  sh/*', 'page furniture: band labels, IA nodes, legends, this page\'s own cards'],
  ['icon:<Lucide> <size>/<st>', 'implement THAT icon at that size — not the placeholder'],
  ['icon:glyph <W>x<H>', 'the capture could NOT resolve a name: an unnamed glyph at that box.'],
  ['↳', 'A real gap, not a name to look up — take the icon from the RN source'],
], 'code');

card('system', 'Reading the design system', [
  ['Tokens', 'sets core + color-light + color-dark; NO theme objects in this deployment'],
  ['Dark mode', 'activate color-dark, deactivate color-light — exactly one is ever active'],
  ['Read token.value', 'NEVER resolvedValue: it resolves against the ACTIVE sets, so an inactive'],
  ['↳', 'set reports the other mode — and if neither is active, it returns null'],
  ['Components', 'penpot.library.local.components; geometry from the main instance'],
  ['Screens & overlays', 'built 1:1 from the running app’s DOM, not from source reading'],
  ['Motion, a11y, i18n', 'not visual — read `09 Patterns` (D/patterns/*)'],
]);

card('annot', 'Annotations live in plugin data', [
  ['vela.note', 'provenance and generator notes'],
  ['vela.edge', 'non-pointer transition: <condition> → <board name>'],
  ['vela.platform', 'platform divergence; overrides the generic depiction'],
  ['vela.motion', 'motion pattern reference'],
  ['vela.source', 'the route this board was captured from'],
  ['board.getPluginData(k)', 'read them here — no note:/edge: text shapes remain on canvas'],
], 'code');

card('interp', 'Interpretation rules (normative)', [
  // The acceptance gate called this the single most dangerous omission in the file: the boards are
  // WEB captures, so their type is already multiplied by 1.2 while every geometric value is 1:1.
  // A team measuring 56px off the balance hero and shipping it would make every label 20% too big.
  // kept to one line per row: the card's value column has no measure, so a long string runs off
  // the card edge (it did, and the export showed it truncated mid-word)
  ['TYPE ON BOARDS IS ×1.2', 'screen boards are WEB captures — DIVIDE every font size by 1.2 to get'],
  ['↳', 'the native value: 56 → 47 (Balance hero), 13 → 11 (text.sm)'],
  ['↳', 'GEOMETRY IS 1:1 — widths, padding, 44×44, icon sizes, the 390 frame'],
  ['↳', 'are NOT divided. Measuring type off a board ships it 20% too large'],
  ['Tokens beat boards', 'where the two disagree the text.* ladder and the library typographies'],
  ['↳', 'win; a board number is only a rendering of them at ×1.2'],
  ['Light, 1.0×, English', 'the depicted baseline; dark is a token-set switch'],
  ['Brand artwork is not bound', 'token/chain logos and identicons stay constant across modes'],
  ['44×44 hit targets', 'a requirement, not a suggestion'],
  ['Mono is a stand-in', 'depicted in IBM Plex Mono; implement the platform mono stack'],
  ['Text must survive 0.82–1.35×', 'and the 15-locale expansion rules'],
  ['Boards win over the legacy app', 'where the RN app drifts from the design language'],
]);

card('stability', 'Stability guarantees', [
  ['Names are stable', 'across regenerations; IDs are not'],
  ['Additions are non-breaking', 'renames and removals are breaking'],
  ['Coverage matrix', 'regenerated with any breaking change (repo: generator/coverage.json)'],
]);

board.resize(W, Y + 48);
lib.chip(board, 'note', 'in-file copy of contracts/consumption-contract.md; the repo copy governs the generator, this one governs consumers');
return lib.done('46-start-here', stats);
