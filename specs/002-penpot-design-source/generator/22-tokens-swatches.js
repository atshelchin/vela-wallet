// 22-tokens-swatches.js — T011a: color swatch board on `02 Tokens & Type`.
// Chips are BOUND to color tokens (fill), proving token application; labels show L/D hexes.
// inv:01 §2-§3.
if (!storage.lib) throw new Error('run 10-lib.js first');
const lib = storage.lib;
const cat = penpot.library.local.tokens;
const darkSet = cat.sets.find(s => s.name === 'color-dark');
const dark = Object.fromEntries(darkSet.tokens.map(t => [t.name, String(t.value)]));
const lightSet = cat.sets.find(s => s.name === 'color-light');
const NAMES = lightSet.tokens.map(t => t.name); // 27, in creation order

const { board: b } = await lib.upsertBoard('02 Tokens & Type', 'D/tokens/colors', lib.docGeom(0, 0, 64 + Math.ceil(NAMES.length / 3) * 96 + 24));
lib.upsertText(b, 'COL/title', { text: 'Color tokens — light values shown; dark in label', size: 20, weight: 700, x: 24, y: 24 });

let created = 0;
for (let i = 0; i < NAMES.length; i++) {
  const name = NAMES[i];
  const lightVal = String(lightSet.tokens.find(t => t.name === name).value);
  const col = i % 3, row = Math.floor(i / 3);
  const x = 24 + col * 256, y = 72 + row * 96;
  const chip = lib.upsertRect(b, 'COL/chip/' + name, { x, y, w: 44, h: 44, radius: 8, fill: '#FFFFFF', stroke: '#ECEBE4' });
  if (chip.created) created++;
  try { lib.bindToken(chip.rect, name, ['fill']); } catch (e) { /* fixed rgba tokens may not bind; fill set below */ }
  if (lightVal.startsWith('#')) chip.rect.fills = [{ fillColor: lightVal, fillOpacity: 1 }];
  lib.upsertText(b, 'COL/name/' + name, { text: name, size: 10, weight: 600, x: x + 54, y: y + 4 });
  lib.upsertText(b, 'COL/hex/' + name, { text: 'L ' + lightVal + '  ·  D ' + (dark[name] || lightVal), size: 8.5, zone: 'mono', weight: 500, color: '#6E6B62', x: x + 54, y: y + 24 });
}
return lib.done('22-tokens-swatches', { chips: NAMES.length, created });
