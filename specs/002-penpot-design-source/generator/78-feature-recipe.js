// 78-feature-recipe.js — "I am adding a feature. What do I reuse, and what rules bind me?"
// (RESTRUCTURE-2026-07-30 §5 · page 09, W4.)
//
// This is the question the file could not answer. `09 Patterns` held motion numbers, an a11y floor
// and resilience notes — all true, none of it usable as a starting point. Three blocks fix that:
//
//   1 PICK — a decision tree from "what am I building?" down to a named component. Its leaves cover
//            every Tier-1 family, so the common cases never fall off the tree.
//   2 OBEY — the constraints that bind any new surface, each pointing at where it is shown.
//   3 EXTEND — what to DO to this file afterwards, numbered, so the next feature does not rot it.
//
// Plus two worked examples, because a rule read once is a rule half-understood.
//
// Input: storage.recipePlan = _plan.json (fetched if absent) — the tree is checked against it, so a
// Tier-1 family missing from the tree is reported rather than silently uncovered.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const PAGE = '09 Patterns';
const plan = storage.recipePlan ||
  (storage.recipePlan = await (await fetch('/plugins/mcp/gen/_plan.json?v=' + Date.now(), { cache: 'reload' })).json());
const C = { ink: '#1A1A18', muted: '#6E6B62', subtle: '#8C887E', line: '#ECEBE4', raised: '#FFFFFF',
  base: '#FAFAF8', accent: '#E8572A', ok: '#2D8E5F', bad: '#C62828' };
const stats = { branches: 0, leaves: 0, tier1Covered: 0, tier1Uncovered: [], rules: 0, steps: 0 };

// [question, answer, component(s) it lands on]
const TREE = [
  ['A list of things the user scans', 'balances / tokens', ['C/Rows/TokenRow', 'C/Media/TokenLogo', 'C/Primitives/AmountText']],
  ['A list of things the user scans', 'transactions / history', ['C/Rows/ActivityRow', 'C/Primitives/TxStatusBadge']],
  ['A list of things the user scans', 'settings or navigation rows', ['C/Rows/DetailRow', 'C/Primitives/SectionLabel']],
  ['A list of things the user scans', 'people / addresses', ['C/Media/ContactAvatar', 'C/Primitives/RecipientName', 'C/Primitives/RecipientTrust']],
  ['A number the user reads', 'any money figure', ['C/Primitives/AmountText']],
  ['A number the user reads', 'a network fee', ['C/Rows/GasFeeCard', 'C/Rows/FeeTokenSelector']],
  ['Something to press', 'the committing action', ['C/Primitives/VelaButton']],
  ['Something to press', 'irreversible money movement', ['C/Controls/SlideToConfirmButton']],
  ['Something to press', 'switching between views of one thing', ['C/Controls/SegmentedToggle']],
  ['Something to press', 'the app\'s primary destinations', ['C/Controls/WaveDock']],
  ['A surface that interrupts', 'a sheet with content', ['C/Sheets/GroupEditor']],
  ['A surface that interrupts', 'a signing request', ['C/Signing/IntentHeader', 'C/Signing/ClearSignView', 'C/Signing/EditableApproveCard', 'C/Signing/BalanceChangePreview']],
  ['A surface that interrupts', 'a risk the user must read', ['C/Signing/WarningBanner']],
  ['An outcome to report', 'a submitted transaction', ['C/Primitives/TransactionReceipt']],
  ['Something that must float', 'genuinely elevated content', ['C/Primitives/VelaCard']],
];

const RULES = [
  ['One accent', 'The accent is for moving money and committing. A decorative accent steals the signal from the button that spends.', '01 Design Language'],
  ['No new CTA', 'VelaButton is the only call-to-action control. A hand-rolled Pressable + rounded rect is a defect, however small.', '03 Components · Primitives'],
  ['One segmented control', 'SegmentedToggle, 2–4 segments. More segments scroll the track and clip neighbours mid-word.', '03 Components · Controls'],
  ['De-containered by default', 'Rows and hairlines, not cards. Reach for VelaCard only when content must genuinely float.', '01 Design Language'],
  ['44×44 minimum', 'Every tappable thing, with hitSlop 8 where the visual is smaller. Not a suggestion.', '09 Patterns · a11y'],
  ['Money is AmountText', 'Never format a figure with plain text — the subordinated symbol/tail and the masked state are part of the language.', '02 Tokens & Type'],
  ['Estimate before you ask', 'No surface may present a fee it has not estimated, and no confirm control stays enabled while a quote is in flight.', '03 Components · Rows'],
  ['Never unlimited by default', 'Any allowance-granting flow defaults to the amount actually needed, with Revoke one tap away.', '03 Components · Signing'],
  ['One overlay at a time', 'Swap a sheet\'s content; never stack a second overlay. A stacked modal once rendered invisibly on iOS and the send silently did nothing.', '08 Overlays'],
  ['Tokens, never hex', 'Colour, spacing, radius and type come from the token sets so the mode switch keeps working.', '02 Tokens & Type'],
  ['Survive the extremes', 'Text scales 0.82×–1.35× and ships in 15 locales; a layout that only works at 1.0× English is unfinished.', '09 Patterns · i18n'],
];

const STEPS = [
  'Find the journey your feature belongs to on pages 05–08, or start a new wall in generator/journeys.json.',
  'Compose the screen from library instances — if you need something the library lacks, add it to the library FIRST (a /design-gallery cell, then 72-components-from-cells), never inline on a screen.',
  'Drive the real app into every state that matters and capture it (screenshot + DOM dump). Boards are captured, never drawn from imagination.',
  'Give the board its regions in generator/region-maps/<slug>.json so its layer tree reads.',
  'Add every transition to generator/edges.json — the pointer ones AND the conditions. That one file feeds both the prototype wiring and the visible arrows.',
  'Write the component docs into dom-dumps/cells/_plan.json (use-when, don\'t, code ref) if you added a family.',
  'Re-run the pipeline in order (72 → 70/73 → 74 → audits) and make audits 93/96/97 pass. A green audit is the only thing that lets you tick a box.',
  'Add a line to `11 Changelog` saying what changed and at which revision.',
];

const EXAMPLES = [
  ['"I am adding a token list with per-token actions."',
   'PICK: C/Rows/TokenRow for the row (it already has the checkbox mode if you need multi-select), C/Media/TokenLogo inside it, C/Primitives/AmountText for the figures, C/Primitives/SectionLabel to open the section. Actions live in a sheet, not inline: C/Sheets/GroupEditor is the in-sheet editing pattern.\n' +
   'OBEY: no card around the list; selection is a check, not an accent border; 44×44 on the row and on anything inside it; the fiat value uses AmountText so hide-balance keeps working.\n' +
   'EXTEND: the list is part of the home hub wall — add the board to that wall in journeys.json, region-map it (header / hero / list / dock), and add the row → token-detail edge to edges.json.'],
  ['"I am adding a new dApp permission request."',
   'PICK: the signing sheet vocabulary — C/Signing/IntentHeader says what it WILL DO in plain language, C/Signing/ClearSignView for the understood case, C/Signing/EditableApproveCard if an allowance is involved, C/Signing/BalanceChangePreview for the after-state, C/Signing/WarningBanner for the risk, C/Controls/SlideToConfirmButton to commit.\n' +
   'OBEY: never open with a method name or calldata; never default to unlimited; simulated INCOMING assets are not authenticated — do not act on them until the confirmed receipt.\n' +
   'EXTEND: add the scenario to the signing matrix on 08 Overlays, and add its board to the 27-scenario family so the clear-signing harness and this file stay in step.'],
];

const stats2 = {};
await lib.open(PAGE);

// where the existing pattern boards end, so the recipe lands below them rather than on top
let baseY = 0;
for (const b of (penpot.currentPage.root.children || [])) baseY = Math.max(baseY, b.y + b.height);
baseY = Math.round(baseY + 220);

const W = 1500;
const { board: rec } = await lib.upsertBoard(PAGE, 'D / patterns / adding-a-feature',
  { x: 0, y: baseY, w: W, h: 2600, fill: C.raised });
try { lib.bindToken(rec, 'color.bg.raised', ['fill']); } catch (e) {}
for (let g = 0; g < 700; g++) {
  const old = penpotUtils.findShape((s) => lib.norm(s.name || '').startsWith('rp / '), rec);
  if (!old) break;
  old.remove();
}
const t = (name, text, o) => lib.upsertText(rec, 'rp / ' + name, Object.assign({ text, size: 12, weight: 400, color: C.muted, x: 60, y: 0 }, o)).text;

let y = 56;
t('kicker', 'ADDING A FEATURE', { size: 10, weight: 700, color: C.accent, y }).letterSpacing = '0.6';
y += 22;
t('title', 'Pick · Obey · Extend', { size: 40, weight: 700, color: C.ink, y });
y += 62;
t('lead', 'Read this before you design a new surface. It is the shortest path from "what am I building?" to a screen that belongs in this app — and to a file that is still true afterwards.',
  { size: 14, weight: 400, color: C.muted, y, growType: 'auto-height' }).resize(900, 44);
y += 76;

// ---- 1 PICK
t('s1', '1 · PICK — what does the app already have?', { size: 20, weight: 700, color: C.ink, y });
y += 34;
let lastQ = null;
for (const [q, a, comps] of TREE) {
  if (q !== lastQ) {
    t('q-' + stats.branches, q, { size: 14, weight: 700, color: C.ink, x: 60, y });
    y += 24;
    lastQ = q;
    stats.branches++;
  }
  t('a-' + stats.leaves, '→ ' + a, { size: 12, weight: 500, color: C.muted, x: 84, y });
  t('c-' + stats.leaves, comps.join('   '), { size: 11, weight: 500, zone: 'mono', color: C.accent, x: 400, y });
  y += 22;
  stats.leaves++;
}
y += 26;

// coverage check: a Tier-1 family the tree never mentions is a hole in the recipe
const inTree = new Set(TREE.flatMap(([, , comps]) => comps));
for (const f of plan.families) {
  if (f.tier !== 1) continue;
  if (inTree.has(f.component)) stats.tier1Covered++;
  else stats.tier1Uncovered.push(f.component);
}
t('cover', stats.tier1Uncovered.length
  ? 'COVERAGE GAP — Tier-1 families this tree does not reach: ' + stats.tier1Uncovered.join(', ')
  : 'Every Tier-1 family in the library is reachable from this tree (' + stats.tier1Covered + '/' + stats.tier1Covered + ').',
  { size: 11, weight: 600, color: stats.tier1Uncovered.length ? C.bad : C.ok, y, growType: 'auto-height' }).resize(1380, 30);
y += 56;

// ---- 2 OBEY
t('s2', '2 · OBEY — the constraints that bind any new surface', { size: 20, weight: 700, color: C.ink, y });
y += 36;
for (const [rule, why, where] of RULES) {
  t('r-k-' + stats.rules, rule, { size: 13, weight: 700, color: C.ink, x: 60, y });
  t('r-w-' + stats.rules, why, { size: 11.5, weight: 400, color: C.muted, x: 300, y, growType: 'auto-height' }).resize(880, 34);
  t('r-p-' + stats.rules, where, { size: 9, weight: 600, zone: 'mono', color: C.subtle, x: 60, y: y + 18 });
  y += 46;
  stats.rules++;
}
y += 24;

// ---- 3 EXTEND
t('s3', '3 · EXTEND — leave the file true', { size: 20, weight: 700, color: C.ink, y });
y += 36;
STEPS.forEach((s, i) => {
  t('st-n-' + i, String(i + 1), { size: 12, weight: 700, color: C.accent, x: 60, y });
  t('st-t-' + i, s, { size: 12, weight: 400, color: C.ink, x: 88, y, growType: 'auto-height' }).resize(1100, 34);
  y += 40;
  stats.steps++;
});
y += 30;

// ---- worked examples
t('s4', 'Worked examples', { size: 20, weight: 700, color: C.ink, y });
y += 36;
EXAMPLES.forEach(([q, a], i) => {
  t('ex-q-' + i, q, { size: 14, weight: 700, color: C.ink, x: 60, y, growType: 'auto-height' }).resize(1300, 24);
  y += 30;
  t('ex-a-' + i, a, { size: 11.5, weight: 400, color: C.muted, x: 60, y, growType: 'auto-height' }).resize(1300, 130);
  y += 150;
});

rec.resize(W, Math.round(y + 60));
lib.chip(rec, 'note', 'the PICK tree is checked against the library on every run: a Tier-1 family it cannot reach is printed as a coverage gap, not silently omitted');
stats.height = Math.round(y + 60);
return lib.done('78-feature-recipe', stats);
