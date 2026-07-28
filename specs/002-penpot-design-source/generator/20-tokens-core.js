// 20-tokens-core.js — T009: `core` token set (mode-independent). // inv:01 throughout.
// Upsert discipline: existing token with same value untouched; changed value updated.
if (!storage.lib) throw new Error('run 10-lib.js first');
const lib = storage.lib;
const cat = penpot.library.local.tokens;
const set = cat.sets.find(s => s.name === 'core') || cat.addSet({ name: 'core' });

const upsert = (type, name, value) => {
  const v = String(value);
  const ex = set.tokens.find(t => t.name === name);
  if (ex) {
    if (String(ex.value) !== v) { ex.value = v; return 'updated'; }
    return 'kept';
  }
  set.addToken({ type, name, value: v });
  return 'created';
};

const T = [];
// spacing — inv:01 §10 (4px grid)
[['space.0',0],['space.xs',2],['space.sm',4],['space.md',8],['space.lg',12],['space.xl',16],
 ['space.2xl',20],['space.3xl',24],['space.4xl',32],['space.5xl',48],
 ['layout.screenPaddingX',24]].forEach(([n,v]) => T.push(['spacing', n, v]));
// radius — inv:01 §11
[['radius.none',0],['radius.sm',4],['radius.md',8],['radius.lg',12],['radius.xl',16],
 ['radius.2xl',20],['radius.full',9999]].forEach(([n,v]) => T.push(['borderRadius', n, v]));
// border widths — inv:01 §12
[['border.hairline',1],['border.emphasis',1.5]].forEach(([n,v]) => T.push(['borderWidth', n, v]));
// type scale — inv:01 §6 (base px before user scaling)
[['text.xs',10],['text.sm',11],['text.base',13],['text.lg',15],['text.xl',17],
 ['text.2xl',20],['text.3xl',26],['text.4xl',32],['text.5xl',40]].forEach(([n,v]) => T.push(['fontSizes', n, v]));
// weights — inv:01 §7
[['weight.regular',400],['weight.medium',500],['weight.semibold',600],['weight.bold',700]]
  .forEach(([n,v]) => T.push(['fontWeights', n, v]));
// families — inv:01 §5; mono is a DEPICTION stand-in (runtime: iOS Menlo / Android monospace)
[['font.sans','Plus Jakarta Sans'],['font.display','Plus Jakarta Sans'],
 ['font.numeric','Plus Jakarta Sans'],['font.mono','IBM Plex Mono']].forEach(([n,v]) => T.push(['fontFamilies', n, v]));
// letter spacing — inv:01 §9 (SectionLabel is the canonical uppercase heading)
T.push(['letterSpacing', 'letterSpacing.sectionLabel', 0.6]);
// opacity — inv:01 §16
[['opacity.disabled',0.45],['opacity.dim',0.4],['opacity.backdrop',0.35]].forEach(([n,v]) => T.push(['opacity', n, v]));
// numbers: leading, motion, text-scale, amount constants — inv:01 §8 §14 §15 §20
[['leading.none',1],['leading.tight',1.2],['leading.normal',1.4],['leading.relaxed',1.6],['leading.amountHero',1.12],
 ['motion.duration.fast',150],['motion.duration.normal',250],['motion.duration.slow',400],
 ['motion.sheet.in',220],['motion.sheet.out',180],['motion.sheet.drag',200],
 ['motion.press.button',0.97],['motion.press.row',0.98],['motion.press.fab',0.92],
 ['motion.spring.damping',15],['motion.spring.stiffness',150],['motion.spring.mass',0.8],
 ['motion.springGentle.damping',20],['motion.springGentle.stiffness',120],['motion.springGentle.mass',1],
 ['motion.entrance.fade',300],['motion.entrance.fadeUp',400],['motion.entrance.stagger',50],
 ['textScale.min',0.82],['textScale.max',1.35],['textScale.webBoost',1.2],
 ['amount.tailScale',0.56],['amount.symbolScale',0.58],['amount.minScale',0.6],
 ['icon.stroke.light',1.5],['icon.stroke.base',2],['icon.stroke.bold',2.2],['icon.stroke.heavy',3]]
  .forEach(([n,v]) => T.push(['number', n, v]));
// sizing: icons, hit targets, layout — inv:01 §17 §18 §19
[['icon.xs',12],['icon.sm',14],['icon.base',16],['icon.md',18],['icon.lg',20],['icon.xl',26],
 ['icon.2xl',30],['icon.3xl',36],
 ['size.hitTarget',44],['size.hitSlop',8],['size.emptyStateCircle',56],
 ['layout.maxContentWidth',800],['layout.dockBarHeight',86],['layout.scanFabSize',56],
 ['layout.frameW',390],['layout.frameH',844]].forEach(([n,v]) => T.push(['sizing', n, v]));

const counts = { created: 0, updated: 0, kept: 0, failed: [] };
for (const [type, name, value] of T) {
  try { counts[upsert(type, name, value)]++; }
  catch (e) { counts.failed.push(name + ': ' + e.message); }
}

// shadows — inv:01 §13 (fixed dark ink #1A1A18 both modes; alpha in the color)
const SHADOWS = [
  ['shadow.sm', '0 1 3 0 rgba(26,26,24,0.04)'],
  ['shadow.md', '0 2 8 0 rgba(26,26,24,0.06)'],
  ['shadow.lg', '0 4 16 0 rgba(26,26,24,0.08)'],
];
for (const [name, value] of SHADOWS) {
  try { counts[upsert('shadow', name, value)]++; }
  catch (e) { counts.failed.push(name + ': ' + e.message); }
}

if (!set.active) set.toggleActive();
return lib.done('20-tokens-core', { total: T.length + SHADOWS.length, ...counts });
