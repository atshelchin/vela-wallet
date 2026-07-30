// 49-cover-identity.js — the two boards a human meets first (RESTRUCTURE-2026-07-30 §5, W4).
//
// `00 Start Here` held exactly one board: a machine consumption contract titled "CONSUMPTION
// CONTRACT". Correct for an agent, useless as a front door — the founder's "start here 看起来有，
// 但不能给人启发". Flagship kits open with a cover that answers what / which version / can I trust
// it, and the identity in one line.
//
//   D / cover           — name, one-line identity, version + status, page directory
//   D / identity        — the three traits, each shown with a real component instance, not described
//
// The traits are SHOWN because a principle a reader cannot see is a principle they will not follow;
// the exemplars are library instances, so if a component changes the cover changes with it.
//
// Input: storage.coverRev = short git revision string (optional), storage.coverDate = 'YYYY-MM-DD'
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const PAGE = '00 Start Here';
const C = { ink: '#1A1A18', muted: '#6E6B62', subtle: '#8C887E', line: '#ECEBE4', raised: '#FFFFFF',
  base: '#FAFAF8', accent: '#E8572A' };
const stats = { instances: [], missing: [], created: [] };

await lib.open(PAGE);

const PAGES_DIR = [
  ['00 Start Here', 'this cover, the identity, and the machine consumption contract'],
  ['01 Design Language', 'the ten principles, each shown against a real screen'],
  ['02 Tokens & Type', 'every token, both modes, and the specimen sheets'],
  ['03 Components', 'the library by category — each family with use-when, don\'t, and its code path'],
  ['04 IA & Flows', 'the whole route topology on one board'],
  ['05 Screens · Wallet', 'onboarding, home, send, receive — as journey walls'],
  ['06 Screens · Browser & Connect', 'the dApp surfaces and the pairing flow'],
  ['07 Screens · Settings & Onboarding', 'the settings tree and the account ceremony'],
  ['08 Overlays', 'sheets, alerts, pickers — and the 27 signing scenarios'],
  ['09 Patterns', 'motion, a11y, resilience, and the recipe for adding a feature'],
  ['10 Dev & Parallel Space', 'dev-only surfaces — excluded from the acceptance gate'],
  ['11 Changelog', 'what each regeneration changed'],
  ['12 Archive', 'non-canon; machine consumers ignore it'],
];

// ── cover ──────────────────────────────────────────────────────────────────────────────────────
const COVW = 1390, COVH = 930;    // 3:2, Penpot's own cover guidance
const { board: cov, created: c1 } = await lib.upsertBoard(PAGE, 'D / cover',
  { x: -1500, y: 0, w: COVW, h: COVH, fill: C.base });
if (c1) stats.created.push('cover');
try { lib.bindToken(cov, 'color.bg.base', ['fill']); } catch (e) {}
for (let g = 0; g < 300; g++) {
  const old = penpotUtils.findShape((s) => lib.norm(s.name || '').startsWith('cv / '), cov);
  if (!old) break;
  old.remove();
}
const cvt = (name, text, o) => lib.upsertText(cov, 'cv / ' + name, Object.assign({ text, size: 13, weight: 400, color: C.muted, x: 90, y: 0 }, o)).text;

const bar = lib.upsertRect(cov, 'cv / bar', { x: 90, y: 120, w: 64, h: 5, radius: 3, fill: C.accent }).rect;
try { lib.bindToken(bar, 'color.accent.base', ['fill']); } catch (e) {}
cvt('title', 'Vela Wallet', { size: 92, weight: 700, color: C.ink, y: 150 });
cvt('sub', 'Design source of truth', { size: 30, weight: 500, color: C.muted, y: 268 });
const idl = cvt('identity', 'quiet · typographic · de-containered', { size: 20, weight: 600, color: C.accent, y: 322 });
try { lib.bindToken(idl, 'color.accent.base', ['fill']); } catch (e) {}
cvt('blurb', 'Tokens, components, information architecture, and every screen and overlay in every state — captured from the running app, not described. Read `00 Start Here / contract` for the machine rules; page 09 for the rules that apply when you add a feature.',
  { size: 15, weight: 400, color: C.muted, y: 372, growType: 'auto-height' }).resize(620, 90);

// version block — the "can I trust this?" answer
const vy = 500;
lib.upsertRect(cov, 'cv / vline', { x: 90, y: vy, w: 620, h: 1, fill: C.line });
const meta = [
  ['SOURCE REVISION', storage.coverRev || '(set storage.coverRev)'],
  ['CAPTURED', storage.coverDate || '(set storage.coverDate)'],
  ['METHOD', 'rendered DOM + screenshots of the running app'],
  ['STATUS', 'tokens + library + IA complete · screens rebuilding on journey walls'],
];
meta.forEach(([k, v], i) => {
  cvt('meta-k-' + i, k, { size: 9, weight: 700, color: C.subtle, y: vy + 22 + i * 46 });
  cvt('meta-v-' + i, v, { size: 14, weight: 500, color: C.ink, y: vy + 34 + i * 46 });
});

// page directory — the reader's map of the file
const dx = 760, dy = 150;
cvt('dir-k', 'WHAT IS ON EACH PAGE', { size: 9, weight: 700, color: C.subtle, x: dx, y: dy });
PAGES_DIR.forEach(([name, what], i) => {
  const y = dy + 24 + i * 54;
  cvt('dir-n-' + i, name, { size: 13, weight: 700, color: C.ink, x: dx, y });
  cvt('dir-w-' + i, what, { size: 11, weight: 400, color: C.muted, x: dx, y: y + 18, growType: 'auto-height' }).resize(540, 26);
});

// ── identity: the three traits, SHOWN ──────────────────────────────────────────────────────────
const { board: idb, created: c2 } = await lib.upsertBoard(PAGE, 'D / identity',
  { x: -1500, y: 1030, w: COVW, h: 430, fill: C.raised });
if (c2) stats.created.push('identity');
try { lib.bindToken(idb, 'color.bg.raised', ['fill']); } catch (e) {}
for (let g = 0; g < 300; g++) {
  const old = penpotUtils.findShape((s) => lib.norm(s.name || '').startsWith('id / '), idb);
  if (!old) break;
  old.remove();
}
const idt = (name, text, o) => lib.upsertText(idb, 'id / ' + name, Object.assign({ text, size: 13, weight: 400, color: C.muted, x: 90, y: 0 }, o)).text;
idt('kicker', 'THE LANGUAGE IN THREE WORDS', { size: 10, weight: 700, color: C.subtle, y: 60 }).letterSpacing = '0.6';
idt('lead', 'Every board in this file obeys these three. If a new screen fights them, the screen is wrong.',
  { size: 15, weight: 400, color: C.muted, y: 84 });

// The exemplar names a VARIANT, not just a family: `lib.instance` with no props takes whichever
// variant comes first, which put AmountText's `text-unit` cell here — a unit label sitting under the
// digits, i.e. the opposite of the point being made.
const TRAITS = [
  ['quiet', 'One accent, spent only on moving money and committing. Everything else is ink, muted ink, and a hairline.',
    'C/Primitives/SectionLabel', { state: 'default' }],
  ['typographic', 'Hierarchy comes from size and weight, not from boxes. Money subordinates its symbol and decimal tail so the digits lead.',
    'C/Primitives/AmountText', { state: 'value-hero' }],
  ['de-containered', 'A row, not a card, is the unit of content. Dividers are hairlines; elevation is reserved for things that genuinely float.',
    'C/Rows/DetailRow', { state: 'plain' }],
];
TRAITS.forEach(([word, rule, comp, variant], i) => {
  const x = 90 + i * 420;
  const y = 170;
  const num = idt('t-num-' + i, String(i + 1), { size: 11, weight: 700, color: C.accent, x, y });
  try { lib.bindToken(num, 'color.accent.base', ['fill']); } catch (e) {}
  idt('t-word-' + i, word, { size: 34, weight: 700, color: C.ink, x, y: y + 20 });
  idt('t-rule-' + i, rule, { size: 12, weight: 400, color: C.muted, x, y: y + 70, growType: 'auto-height' }).resize(340, 70);
  // the exemplar is a real library instance: if the component changes, this page changes with it
  const inst = lib.instance(comp, variant, idb, x, y + 170);
  if (inst) { inst.name = 'id / t-exemplar-' + i + ' ' + comp; stats.instances.push(comp); }
  else stats.missing.push(comp);
  idt('t-cap-' + i, 'shown: ' + comp + ' · ' + Object.entries(variant).map(([k, v]) => k + '=' + v).join(' '),
    { size: 9, weight: 500, zone: 'mono', color: C.subtle, x, y: y + 220 });
});
lib.chip(idb, 'note', 'exemplars are live library instances, not drawings — a component change propagates here');
lib.chip(cov, 'note', 'cover: set storage.coverRev / storage.coverDate before running so the version block is real');

return lib.done('49-cover-identity', stats);
