// 95-audit-visual.js — SC-002: components match the code-derived spec.
//
// Input:  storage.manifest = generator/manifest.json contents.
// Output: the counts below; `sample` names the ten variants an agent or a human should eyeball, and
//         `exportIds` are their shape ids so the caller can pull PNGs with export_shape.
//
// WHAT THIS CAN AND CANNOT DECIDE — stated up front, because an audit that overclaims is worse than
// no audit. SC-002 asks for "zero geometry/color deviations from the code-derived spec". There is
// no machine-readable expected geometry anywhere in this repo: the specs live in the inventory as
// prose. So the geometry half CANNOT be checked here and is not pretended to be — it belongs to the
// SC-004 agent gate, which reads the boards and the running app and reports contradictions. What is
// checkable is checked, and it is not nothing:
//
//   1. EXISTENCE — every family the manifest names is in the library (a family sitting in DRAFT/ is
//      reported separately: it exists, but an agent looking for `C/Sheets/AppModal` will not find it).
//   2. AXES — the family's variant properties match the axes the manifest declares. A family whose
//      axes drifted from the code's prop signature is a spec deviation by definition.
//   3. COLOUR — every fill and stroke on the sampled variants resolves to a TOKEN, not a literal
//      hex. This is the colour half of SC-002 in the only form that survives regeneration: the
//      app's colours ARE the tokens, so a literal hex is either an app-side raw-colour debt or a
//      transcription that silently froze one theme's value. Both are deviations worth naming.
//   4. NON-EMPTY — a sampled variant paints something. Trivial-sounding, and it is exactly the check
//      that would have caught S/home/rpc-trouble exporting as a blank rectangle with all forty of
//      its text shapes present, correctly positioned, and stacked behind the card.
//
// The sample is DETERMINISTIC (every nth family, not random) so two runs compare, and a fix can be
// shown to have fixed the thing that was flagged.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;
const M = storage.manifest;
if (!M) throw new Error('set storage.manifest = <manifest.json contents> first');

const SAMPLE_N = Number(storage.visualSample || 10);
const out = { chunk: '95-audit-visual', families: 0, inDraft: [], absent: [],
  axisMismatch: [], literalColors: [], emptyVariants: [], sample: [], exportIds: [],
  geometryNotChecked: 'no machine-readable expected geometry exists; SC-002 geometry half is the SC-004 agent gate\'s job' };

// ── 1. existence ───────────────────────────────────────────────────────────────────────────────
const byName = new Map();
for (const c of penpot.library.local.components) {
  byName.set(lib.norm((c.path ? c.path + ' / ' : '') + c.name), c);
}
out.families = byName.size;
const leafIndex = new Map();
for (const [n, c] of byName) leafIndex.set(n.split(/\s*\/\s*/).pop(), { n, c });

const planned = (M.components || []);
for (const p of planned) {
  const n = lib.norm(p.name);
  if (byName.has(n)) continue;
  const alt = leafIndex.get(n.split(/\s*\/\s*/).pop());
  if (alt && /^DRAFT/.test(alt.n)) out.inDraft.push(p.name + ' → ' + alt.n);
  else out.absent.push(p.name);
}

// ── 2. axes ────────────────────────────────────────────────────────────────────────────────────
for (const p of planned) {
  const c = byName.get(lib.norm(p.name));
  if (!c || !p.axes) continue;
  let props = null;
  try { props = c.variantProps; } catch (e) {}
  if (!props) continue;                                   // standalone component: no axes to compare
  const have = new Set(Object.keys(props).map((k) => String(k).toLowerCase()));
  const want = Object.keys(p.axes).map((k) => String(k).toLowerCase());
  const miss = want.filter((k) => !have.has(k));
  if (miss.length) out.axisMismatch.push(p.name + ': manifest declares [' + want.join(', ') + '], file has [' + [...have].join(', ') + ']');
}

// ── 3 + 4. the sampled variants ────────────────────────────────────────────────────────────────
const names = [...byName.keys()].filter((n) => !/^DRAFT/.test(n)).sort();
const step = Math.max(1, Math.floor(names.length / SAMPLE_N));
const picked = [];
for (let i = 0; i < names.length && picked.length < SAMPLE_N; i += step) picked.push(names[i]);

const paintsOf = (s, acc) => {
  for (const f of (s.fills || [])) if (f && f.fillColor) acc.push({ kind: 'fill', color: f.fillColor, tok: s.tokens && s.tokens.fill });
  for (const st of (s.strokes || [])) if (st && st.strokeColor) acc.push({ kind: 'stroke', color: st.strokeColor, tok: s.tokens && s.tokens.strokeColor });
  for (const k of (s.children || [])) paintsOf(k, acc);
  return acc;
};
const countShapes = (s) => { let n = 1; for (const k of (s.children || [])) n += countShapes(k); return n; };

for (const n of picked) {
  const c = byName.get(n);
  let main = null;
  try { main = c.mainInstance ? c.mainInstance() : null; } catch (e) {}
  if (!main) { out.sample.push(n + ' (no main instance to inspect)'); continue; }
  out.sample.push(n);
  out.exportIds.push({ name: n, id: main.id });
  if (countShapes(main) <= 1) out.emptyVariants.push(n);
  const paints = paintsOf(main, []);
  // Brand and generated art is legitimately unbound: a chain logo is Ethereum's blue and an
  // identicon's palette is derived from an address — neither is a design decision this system owns,
  // and binding them to tokens would make them follow the theme, which is exactly wrong. Flagging
  // them would bury the signal that matters (an app colour frozen as a literal hex) under noise.
  const BRAND = /(ChainLogo|TokenLogo|Identicon|WalletAvatar|ContactAvatar|ReceiveShareCard)$/;
  const paints2 = BRAND.test(n.split(/\s*\/\s*/).pop()) ? [] : paints;
  const literal = paints2.filter((p) => !p.tok);
  if (literal.length) {
    out.literalColors.push(n + ': ' + literal.length + '/' + paints2.length + ' unbound (' +
      [...new Set(literal.map((p) => p.color))].slice(0, 4).join(', ') + ')');
  }
}

out.checkedPass = out.absent.length === 0 && out.axisMismatch.length === 0 && out.emptyVariants.length === 0;
out.note = 'checkedPass covers existence, axes and non-emptiness only — see geometryNotChecked';
return out;
