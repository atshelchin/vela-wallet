// 26-tokens-dtcg-check.js — verify docs/design-tokens.json against the LIVE Penpot token sets,
// both directions (RESTRUCTURE-2026-07-30 §5, W3a; supports SC-001).
//
// The repo export is hand-transcribed from the file (see export-tokens-dtcg.mjs), so it is verified
// rather than trusted: any name present on one side only, any differing value, any differing type
// is reported. Values compare on Penpot's `value` — NEVER `resolvedValue`, which resolves against
// the ACTIVE sets and therefore reports the light palette for the inactive dark set.
//
// Prereq: the export must be served to the sandbox —
//   docker cp docs/design-tokens.json penpot-penpot-frontend-1:/var/www/app/plugins/mcp/gen/
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;

const doc = await (await fetch('/plugins/mcp/gen/design-tokens.json?v=' + Date.now(), { cache: 'reload' })).json();

// flatten the nested export back to set → name → {type, value}
const flatDoc = {};
const walk = (node, prefix, bag) => {
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('$')) continue;
    if (v && typeof v === 'object' && '$value' in v) bag[prefix ? prefix + '.' + k : k] = { type: v.$type, value: v.$value };
    else if (v && typeof v === 'object') walk(v, prefix ? prefix + '.' + k : k, bag);
  }
};
for (const setName of (doc.$metadata || {}).tokenSetOrder || []) {
  flatDoc[setName] = {};
  if (doc[setName]) walk(doc[setName], '', flatDoc[setName]);
}

const norm = (v) => (Array.isArray(v) ? v.join(', ') : String(v == null ? '' : v)).trim();
const out = { sets: {}, missingInDoc: [], missingInPenpot: [], valueDiff: [], typeDiff: [], setDiff: [] };

const liveSets = penpot.library.local.tokens.sets;
const liveNames = liveSets.map((s) => s.name);
const docNames = Object.keys(flatDoc);
for (const n of liveNames) if (!docNames.includes(n)) out.setDiff.push('set only in Penpot: ' + n);
for (const n of docNames) if (!liveNames.includes(n)) out.setDiff.push('set only in export: ' + n);

for (const s of liveSets) {
  const d = flatDoc[s.name] || {};
  const live = {};
  for (const t of s.tokens) live[t.name] = { type: t.type, value: t.value };
  out.sets[s.name] = { penpot: Object.keys(live).length, doc: Object.keys(d).length };
  for (const [name, lt] of Object.entries(live)) {
    const dt = d[name];
    if (!dt) { out.missingInDoc.push(s.name + '/' + name); continue; }
    if (norm(dt.value) !== norm(lt.value)) out.valueDiff.push(s.name + '/' + name + ': penpot=' + norm(lt.value) + ' doc=' + norm(dt.value));
    if (dt.type !== lt.type) out.typeDiff.push(s.name + '/' + name + ': penpot=' + lt.type + ' doc=' + dt.type);
  }
  for (const name of Object.keys(d)) if (!live[name]) out.missingInPenpot.push(s.name + '/' + name);
}

out.tokenCountDoc = Object.values(flatDoc).reduce((a, b) => a + Object.keys(b).length, 0);
out.pass = !out.missingInDoc.length && !out.missingInPenpot.length && !out.valueDiff.length &&
  !out.typeDiff.length && !out.setDiff.length;
return lib.done('26-tokens-dtcg-check', out);
