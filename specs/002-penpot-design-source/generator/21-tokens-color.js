// 21-tokens-color.js — T010: `color-light` + `color-dark` sets and Light/Dark themes.
// Values from inv:01 §2 (semantic, WCAG-fixed) + §3 (fixed/mode-independent).
if (!storage.lib) throw new Error('run 10-lib.js first');
const lib = storage.lib;
const cat = penpot.library.local.tokens;

// [name, light, dark] — dark === light where a single value is listed in inv:01
const C = [
  ['color.fg.base',      '#1A1A18', '#E8E6E1'],
  ['color.fg.muted',     '#6E6B62', '#9A9790'],
  ['color.fg.subtle',    '#8C887E', '#85827A'],
  ['color.fg.inverse',   '#FFFFFF', '#1A1A18'],
  ['color.bg.base',      '#FAFAF8', '#141412'],
  ['color.bg.raised',    '#FFFFFF', '#1E1E1B'],
  ['color.bg.sunken',    '#F5F3EF', '#0F0F0D'],
  ['color.accent.base',  '#E8572A', '#E8572A'],
  ['color.accent.soft',  '#FFF0EB', '#2C1A12'],
  ['color.success.base', '#2D8E5F', '#3DA872'],
  ['color.success.soft', '#EDFAF2', '#132A1E'],
  ['color.warning.base', '#92600A', '#D4A54A'],
  ['color.warning.soft', '#FFF8F0', '#2A2010'],
  ['color.warning.border','#F0DCC8', '#3D3020'],
  ['color.error.base',   '#C62828', '#F87171'],
  ['color.error.soft',   '#FEF2F2', '#2D1515'],
  ['color.info.base',    '#4267F4', '#5A7CF6'],
  ['color.info.soft',    '#EDF0FF', '#131B33'],
  ['color.border.base',  '#ECEBE4', '#2C2C28'],
  ['color.border.strong','#D8D6CE', '#3E3E38'],
  // fixed (mode-independent) — inv:01 §3
  ['color.fixed.shadowInk',      '#1A1A18', '#1A1A18'],
  ['color.fixed.backdrop',       'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.35)'],
  ['color.fixed.focusRingInner', '#FAFAF8', '#141412'],
  ['color.fixed.focusRingOuter', '#E8572A', '#E8572A'],
  ['color.fixed.desktopCanvas',  '#E8E8E8', '#E8E8E8'],
  ['color.fixed.splashBg',       '#1A1A18', '#1A1A18'],
  ['color.fixed.androidAdaptiveIconBg', '#0A1929', '#0A1929'], // off-palette legacy, flagged inv:01 §3
];

const getSet = (name) => cat.sets.find(s => s.name === name) || cat.addSet({ name });
const upsert = (set, name, value) => {
  const ex = set.tokens.find(t => t.name === name);
  if (ex) {
    if (String(ex.value) !== value) { ex.value = value; return 'updated'; }
    return 'kept';
  }
  set.addToken({ type: 'color', name, value });
  return 'created';
};

const counts = { created: 0, updated: 0, kept: 0, failed: [] };
const lightSet = getSet('color-light');
const darkSet = getSet('color-dark');
for (const [name, light, dark] of C) {
  try { counts[upsert(lightSet, name, light)]++; } catch (e) { counts.failed.push('L ' + name + ': ' + e.message); }
  try { counts[upsert(darkSet, name, dark)]++; } catch (e) { counts.failed.push('D ' + name + ': ' + e.message); }
}

// MODES VIA SET ACTIVATION, NOT THEMES. TokenTheme.addSet() is a silent no-op in this
// deployment (mcp:2.16 plugin vs Penpot 2.16.2 — see audit-report.md deviation 1), and an
// empty active theme deactivates every set. Light = core + color-light active;
// to view Dark: deactivate color-light, activate color-dark.
const core = getSet('core');
for (const s of [core, lightSet]) { if (!s.active) s.toggleActive(); }
if (darkSet.active) darkSet.toggleActive();

return lib.done('21-tokens-color', { pairs: C.length, ...counts, setsActive: cat.sets.map(s => s.name + ':' + s.active) });
