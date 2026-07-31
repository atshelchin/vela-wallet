// 25-library-assets.js — publish reusable LIBRARY assets (Assets panel), not just design tokens.
// Tokens live in the Tokens panel and drive values; library Colors and Typographies are what a
// designer actually clicks to apply, and what makes a change propagate instead of being retyped
// everywhere. Both must exist: tokens for the machine, library assets for the human.
//
// Idempotent: assets are matched by name and updated in place.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const local = penpot.library.local;
const cat = local.tokens;
const out = { colors: { created: 0, updated: 0 }, typographies: { created: 0, updated: 0 }, failed: [] };

// ---- Colors: one library colour per semantic token, from the ACTIVE light set -----------------
const lightSet = cat.sets.find((s) => s.name === 'color-light');
if (!lightSet) throw new Error('color-light token set missing — run 21-tokens-color.js first');

for (const t of lightSet.tokens) {
  const value = String(t.value);
  if (!/^#[0-9A-Fa-f]{6}$/.test(value)) continue;   // rgba()/fixed values have no library equivalent
  try {
    let c = local.colors.find((x) => x.name === t.name);
    if (!c) { c = local.createColor(); c.name = t.name; out.colors.created++; }
    else out.colors.updated++;
    c.color = value.toUpperCase();
  } catch (e) { out.failed.push('color ' + t.name + ': ' + (e && e.message)); }
}

// ---- Typographies: the app's real text styles ---------------------------------------------------
// Sizes are token bases (theme.ts), i.e. what native renders; web multiplies by 1.2 at runtime.
// Names mirror how the style is used, because that is how someone reaches for it.
const FONT = 'Plus Jakarta Sans';
const MONO = 'IBM Plex Mono';
const STYLES = [
  ['Display / Balance hero',   FONT, 700, 47, 1.12, 0],
  ['Display / Amount',         FONT, 700, 32, 1.12, 0],
  ['Title / Screen',           FONT, 700, 26, 1.2,  0],
  ['Title / Page',             FONT, 700, 20, 1.2,  0],
  ['Title / Nav',              FONT, 700, 17, 1.2,  0],
  ['Body / Row title',         FONT, 600, 15, 1.4,  0],
  ['Body / Button',            FONT, 600, 15, 1.4,  0],
  ['Body / Base',              FONT, 400, 13, 1.4,  0],
  ['Body / Value',             FONT, 600, 13, 1.4,  0],
  ['Label / Section',          FONT, 600, 11, 1.4,  0.6],   // SectionLabel: uppercase, tracked
  ['Label / Secondary',        FONT, 400, 11, 1.4,  0],
  ['Label / Badge',            FONT, 700, 10, 1.2,  0],
  ['Mono / Address',           MONO, 500, 13, 1.4,  0],
  ['Mono / Technical',         MONO, 400, 11, 1.4,  0],
];

const fontFor = (family) => {
  const f = penpot.fonts.findByName(family);
  if (!f) throw new Error('font not available: ' + family);
  return f;
};

for (const [name, family, weight, size, leading, tracking] of STYLES) {
  try {
    let ty = local.typographies.find((x) => x.name === name);
    if (!ty) { ty = local.createTypography(); out.typographies.created++; }
    else out.typographies.updated++;
    const f = fontFor(family);
    const variant = f.variants.find((v) => v.fontWeight === String(weight) && v.fontStyle === 'normal') || f.variants[0];
    ty.name = name;
    ty.fontId = f.fontId;
    ty.fontFamily = f.name;
    ty.fontVariantId = variant.id ?? variant.fontVariantId ?? undefined;
    ty.fontWeight = String(weight);
    ty.fontStyle = 'normal';
    ty.fontSize = String(size);
    ty.lineHeight = String(leading);
    ty.letterSpacing = String(tracking);
  } catch (e) { out.failed.push('typography ' + name + ': ' + (e && e.message)); }
}

out.totals = { colors: local.colors.length, typographies: local.typographies.length, components: local.components.length };
return lib.done('25-library-assets', out);
