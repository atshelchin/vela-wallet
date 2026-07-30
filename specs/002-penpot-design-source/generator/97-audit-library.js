// 97-audit-library.js — SC-009 guard (RESTRUCTURE-2026-07-30 §7/§9).
// The library must be semantically merged:
//   1. no two DISTINCT variant containers (or standalone components) share a name — variant
//      components INSIDE one container legitimately share the container's name (lib.instance
//      depends on that), so identity is judged by container, not by the name list;
//   2. variant axes are semantic: no default 'Property 1' axis survives, and no axis VALUE looks
//      like captured button copy (multi-word values such as 'Confirm & Send' are the fingerprint
//      of the pre-merge cell-name axes);
//   3. no variant carries a variantError (colliding coordinates).
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;

const out = { components: 0, families: 0, duplicateNames: [], defaultAxes: [], copyValues: [],
  variantErrors: [], singletons: 0 };

const byName = new Map();
for (const c of penpot.library.local.components) {
  out.components++;
  const key = lib.norm(c.name || '');
  if (!byName.has(key)) byName.set(key, []);
  byName.get(key).push(c);
}
out.families = byName.size;

for (const [name, comps] of byName.entries()) {
  // container identity: a variant component's main instance lives inside its container board;
  // standalone components have no variant container at all.
  const containers = new Set();
  let standalone = 0;
  for (const c of comps) {
    let isVar = false;
    try { isVar = typeof c.isVariant === 'function' ? c.isVariant() : false; } catch (e) {}
    if (!isVar) { standalone++; continue; }
    try {
      const main = c.mainInstance();
      containers.add(main && main.parent ? main.parent.id : 'orphan:' + c.id);
    } catch (e) { containers.add('unresolvable:' + c.id); }
  }
  if (containers.size + (standalone ? 1 : 0) > 1 || standalone > 1) {
    out.duplicateNames.push(name + ' (' + comps.length + ' components, ' + containers.size + ' containers, ' + standalone + ' standalone)');
  }
  if (comps.length === 1 && standalone === 1) out.singletons++;
  for (const c of comps) {
    let props = null;
    try { props = c.variantProps; } catch (e) {}
    if (!props || typeof props !== 'object') continue;
    for (const [axis, value] of Object.entries(props)) {
      if (/^property\s*\d+$/i.test(axis)) out.defaultAxes.push(name + ' :: ' + axis);
      if (/\s/.test(String(value || ''))) out.copyValues.push(name + ' :: ' + axis + '=' + value);
    }
    try { if (c.variantError) out.variantErrors.push(name + ': ' + c.variantError); } catch (e) {}
  }
}

// keep the report readable — full lists only when small, else counts + head
for (const k of ['duplicateNames', 'defaultAxes', 'copyValues', 'variantErrors']) {
  if (out[k].length > 20) out[k] = { count: out[k].length, head: out[k].slice(0, 12) };
}
out.pass = !((out.duplicateNames.count || out.duplicateNames.length) ||
  (out.defaultAxes.count || out.defaultAxes.length) ||
  (out.copyValues.count || out.copyValues.length) ||
  (out.variantErrors.count || out.variantErrors.length));
return lib.done('97-audit-library', out);
