// 96-audit-semantic-floor.js — SC-010 guard (RESTRUCTURE-2026-07-30 §7/§9).
// Every canon screen/overlay board must meet the semantic floor:
//   1. top-level children are `region/*` groups (or `swap/*` instances / `e/*` edge decor) —
//      never a flat pile of `r/*` DOM shapes;
//   2. its position matches the committed journey manifest (screen pages only);
//   3. its `swap/*` instances still resolve to a live library component (a family rebuild that
//      orphaned them must fail the run, not ship silently).
// This audit is part of the MANDATORY tail of every regen (72 → 70/73 → swaps → 74 → audits).
// It is EXPECTED to fail until W2 authors the region/swap maps — that failure is what keeps
// tasks.md checkboxes honest (the 勾不回滚 guard).
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;

const J = storage.journeysJson ||
  (storage.journeysJson = await (await fetch('/plugins/mcp/gen/journeys.json?v=' + Date.now(), { cache: 'reload' })).json());
const L = J.layout;
const expectedPos = {};   // per page: norm(name) -> {x, y}
for (const [pageName, def] of Object.entries(J.pages)) {
  const m = (expectedPos[pageName] = {});
  let bandY = 0;
  for (const wall of (def.walls || [])) {
    const cols = wall.kind === 'hub' ? [wall.hub].concat(wall.spokes || []) : wall.steps;
    let maxStack = 0;
    cols.forEach((b, ci) => {
      m[lib.norm(b)] = { x: L.originX + ci * L.colW, y: bandY + L.headerH };
      const st = (wall.states || {})[b] || [];
      st.forEach((s, si) => { m[lib.norm(s)] = { x: L.originX + ci * L.colW, y: bandY + L.headerH + (si + 1) * L.rowH }; });
      maxStack = Math.max(maxStack, st.length);
    });
    bandY += L.headerH + (1 + maxStack) * L.rowH + L.bandGap;
  }
}

const CANON = ['05 Screens · Wallet', '06 Screens · Browser & Connect',
  '07 Screens · Settings & Onboarding', '08 Overlays'];
const out = { boards: 0, flat: [], positionMismatch: [], brokenSwaps: [], unwalled: [],
  regionCounts: {}, swapCounts: {}, tapUnwired: 0 };

const okPrefix = (n) => ['region / ', 'swap / ', 'e / '].some((p) => n.startsWith(p));
for (const pageName of CANON) {
  if (!penpotUtils.getPageByName(pageName)) continue;
  await lib.open(pageName);
  for (const b of penpot.currentPage.root.children) {
    if (b.type !== 'board') continue;
    const bn = lib.norm(b.name || '');
    if (!bn.startsWith('S / ') && !bn.startsWith('O / ')) continue;
    out.boards++;
    // rule 1 — the layer tree reads. The test is NOT "zero loose shapes": a region map groups the
    // screen-root branch, while shapes drawn from a portal root or from wrapper nodes above that
    // branch legitimately stay at the top level. What makes a tree unreadable is having no regions
    // at all, or a pile of DOM-path leaves next to them. So: at least one region, and no more than
    // LOOSE_MAX strays — with both numbers reported, so the bar is auditable rather than asserted.
    const LOOSE_MAX = 6;
    const loose = (b.children || []).filter((c) => !okPrefix(lib.norm(c.name || '')));
    const regionCount = (b.children || []).filter((c) => lib.norm(c.name || '').startsWith('region / ')).length;
    out.regionCounts[bn] = regionCount;
    if (!regionCount || loose.length > LOOSE_MAX) {
      out.flat.push(bn + ' (' + regionCount + ' regions, ' + loose.length + ' loose top-level shapes)');
    }
    // rule 2 — walls are reproducible from the manifest
    const exp = (expectedPos[pageName] || {})[bn];
    if (exp) {
      if (Math.abs(b.x - exp.x) > 1 || Math.abs(b.y - exp.y) > 1) {
        out.positionMismatch.push(bn + ' at (' + Math.round(b.x) + ',' + Math.round(b.y) + ') expected (' + exp.x + ',' + exp.y + ')');
      }
    } else if (pageName !== '08 Overlays') {
      out.unwalled.push(bn);
    }
    // rule 3 — swapped instances resolve
    const swaps = penpotUtils.findShapes((s) => lib.norm(s.name || '').startsWith('swap / '), b);
    out.swapCounts[bn] = swaps.length;
    for (const s of swaps) {
      try { if (!s.component || !s.component()) out.brokenSwaps.push(bn + ' :: ' + s.name); }
      catch (e) { out.brokenSwaps.push(bn + ' :: ' + s.name); }
    }
    // info — tappable shapes not yet carrying an interaction (93 owns the hard check)
    const taps = penpotUtils.findShapes((s) => { try { return !!s.getPluginData('vela.role'); } catch (e) { return false; } }, b);
    out.tapUnwired += taps.filter((s) => !(s.interactions || []).length).length;
  }
}

out.pass = !out.flat.length && !out.positionMismatch.length && !out.brokenSwaps.length;
return lib.done('96-audit-semantic-floor', out);
