#!/usr/bin/env node
// gen-region-maps.mjs — derive the semantic layer's region maps from the captured dumps
// (RESTRUCTURE-2026-07-30 §6 rule 1 / §7, W2).
//
// A DOM-derived board is a flat pile of `r/<dom-path>` shapes: pixel-true and unreadable. The
// semantic floor says the top level must be NAMED REGIONS. Those names could be hand-typed per
// screen, but they would rot the moment a capture changed — and the DOM already answers the
// question: a Vela screen's root has 2–4 children which ARE the regions (header / content / dock),
// and their geometry says which is which. So the map is GENERATED from the dumps, committed, and
// reviewed — data, not a hand-list.
//
// Output: generator/region-maps/<slug>.json = { slug, frame, regions: [{ name, paths }] }
// Regions are ordered SPECIFIC-FIRST: 70 groups matching top-level shapes and a grouped shape stops
// being a candidate, so `hero` must be offered before the `content` band that contains it.
//
// Usage: node specs/002-penpot-design-source/generator/gen-region-maps.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DUMPS = resolve(HERE, '../dom-dumps');
const OUT = resolve(HERE, 'region-maps');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

// `signing` and `signing-fix` hold the 25-scenario signing matrix. They were missing from this list
// at first, which left every signing board flat — the file's highest-stakes surface, and the one a
// reader is most likely to open. They are overlay captures (backdrop + sheet), so they take the
// overlay treatment.
const SETS = [
  { dir: 'screens', index: '_index.json' },
  { dir: 'screens-dark', index: '_index.json' },
  { dir: 'overlays', index: '_index.json' },
  { dir: 'signing', index: '_index.json', overlay: true },
  // `signing-fix` was a repair pass for three scenarios that failed the original sweep. All 25 are
  // now captured fresh and scoped, so it is superseded — and while it was still listed it ran LAST
  // and silently overwrote three fresh maps with its older structure, leaving those boards with
  // zero regions. See the collision check below: a slug in two sets is now reported, not resolved
  // by whoever writes last.
  // { dir: 'signing-fix', index: '_index.json', overlay: true },
];

const kidsOf = (n) => (n.children || []).flat(Infinity).filter(Boolean);

// expo-router keeps every screen in the stack mounted, so a route's root can carry a run of
// full-frame siblings that have no children, no text and no paint. They are invisible in the app
// and produce no shape in Penpot — but classify() sees `h >= 35% of frame` and hands each one a
// `content` region, so a 4-text error screen came out with eight regions of which seven claimed
// nothing (`regionUnmatched: 8`). A node that paints nothing is not a region.
const paintsNothing = (n) =>
  !kidsOf(n).length && !n.text && !n.bg && !n.border && !n.borderColor &&
  !n.shadow && !n.assetKey && !n.dataUri && !n.src;

// Wrapper chains (expo-router / react-navigation / safe-area views) are one-child nodes that paint
// nothing: walk through them to the first node that actually branches — that is the screen's own
// top-level layout, and its children are the regions.
// Those phantom siblings also have to be invisible HERE, or the descent stops one level too early:
// a root holding [the real screen] + [7 empty stack layers] does not look like a wrapper, so the
// walk halts at the root and the screen's own header / hero / list / dock are never reached. Every
// freshly captured screen came out with exactly ONE region because of this.
const descendToBranch = (root, path) => {
  let n = root, p = path, guard = 0;
  while (guard++ < 12) {
    const live = kidsOf(n).map((c, i) => ({ c, i })).filter((x) => !paintsNothing(x.c));
    if (live.length !== 1) break;
    n = live[0].c;
    p = p + '.' + live[0].i;          // the ORIGINAL index — region paths are DOM indices
  }
  return { node: n, path: p };
};

// `band-3` is structural but says nothing, and 42 of them across the screens would leave the layer
// tree almost as mute as the DOM paths it replaces. A band's own content answers what it is: a run
// of same-height children is a LIST, a strip containing tappables is ACTIONS, text with no controls
// is COPY.
const contentName = (child) => {
  const kids = kidsOf(child);
  const inner = kids.length === 1 ? kidsOf(kids[0]) : kids;
  if (inner.length >= 3) {
    const hs = inner.map((c) => Math.round(c.h || 0)).filter((h) => h > 8);
    if (hs.length >= 3) {
      const min = Math.min(...hs), max = Math.max(...hs);
      if (max - min <= 8) return 'list';
    }
  }
  let hasTap = false, hasText = false;
  const scan = (n, d) => {
    if (!n || d > 6) return;
    if (n.tap) hasTap = true;
    if (n.text) hasText = true;
    for (const k of kidsOf(n)) scan(k, d + 1);
  };
  scan(child, 0);
  if (hasTap) return 'actions';
  if (hasText) return 'copy';
  return null;
};

const classify = (child, i, frameH, isFirst, isLast) => {
  const y = child.y || 0, h = child.h || 0;
  const bottom = y + h;
  if (isFirst && y <= 10 && h <= 130) return 'header';
  if (isLast && bottom >= frameH - 12 && h <= 200) return 'dock';
  if (h >= frameH * 0.35) return 'content';
  if (bottom >= frameH - 12) return 'footer';
  return contentName(child) || 'band-' + i;
};

// Inside the content band, the opening block (balance hero, QR plate, amount editor) is what a
// reader looks for first, so it earns its own region when it is a distinct top slice.
const heroInside = (contentNode, contentPath, frameH) => {
  const { node, path } = descendToBranch(contentNode, contentPath);
  const k = kidsOf(node);
  if (!k.length) return null;
  const first = k[0];
  const h = first.h || 0;
  if (h > 0 && h <= frameH * 0.45 && (first.y || 0) <= (contentNode.y || 0) + 8) {
    return { name: 'hero', paths: [path + '.0'] };
  }
  return null;
};

// An overlay dump is a backdrop plus the sheet itself; naming those two is the whole story.
const overlayRegions = (branch, frameH) => {
  const k = kidsOf(branch.node);
  const regions = [];
  k.forEach((c, i) => {
    const h = c.h || 0, y = c.y || 0;
    const p = branch.path + '.' + i;
    if (h >= frameH * 0.85 && y <= 4) regions.push({ name: 'backdrop', paths: [p] });
    else regions.push({ name: k.length === 2 ? 'sheet' : 'sheet-' + i, paths: [p] });
  });
  return regions;
};

const summary = { written: 0, perSet: {}, noBranch: [], regionNames: {}, slugCollisions: [] };
const slugOwner = new Map();   // slug -> the set that wrote its map

for (const set of SETS) {
  const idxPath = resolve(DUMPS, set.dir, set.index);
  if (!existsSync(idxPath)) continue;
  const index = JSON.parse(readFileSync(idxPath, 'utf8'));
  summary.perSet[set.dir] = 0;
  for (const entry of index) {
    const dumpPath = resolve(DUMPS, set.dir, entry.slug + '.json');
    if (!existsSync(dumpPath)) continue;
    // Two sets holding the same slug means one map silently overwrites the other, and the loser is
    // whichever set is listed first — a difference no output made visible until three signing
    // boards came out with no regions at all.
    if (slugOwner.has(entry.slug)) {
      summary.slugCollisions.push(entry.slug + ': ' + slugOwner.get(entry.slug) + ' vs ' + set.dir);
      continue;
    }
    slugOwner.set(entry.slug, set.dir);
    const dump = JSON.parse(readFileSync(dumpPath, 'utf8'));
    const frameH = (dump.frame && dump.frame.h) || 844;
    const roots = (dump.tree || []).flat(Infinity).filter(Boolean);
    if (!roots.length) continue;

    const regions = [];
    const isOverlay = set.dir === 'overlays' || set.overlay;

    // A dump SCOPED to the overlay root (see capture/recapture-signing.mjs) has the backdrop and the
    // sheet as its own top-level roots — there is nothing to descend into, and descending lands on
    // the backdrop, which has no children. That path has to be taken BEFORE the branchless guard
    // below, or every scoped overlay capture is skipped as unmappable (it was: signing went to 0).
    if (isOverlay && roots.length >= 2 && !kidsOf(roots[0]).length) {
      roots.forEach((r, i) => {
        const h = r.h || 0, y = r.y || 0;
        const name = (h >= frameH * 0.85 && y <= 4 && !kidsOf(r).length) ? 'backdrop'
          : (roots.length === 2 ? 'sheet' : 'sheet-' + i);
        regions.push({ name, paths: [String(i)] });
      });
      for (const r of regions) summary.regionNames[r.name] = (summary.regionNames[r.name] || 0) + 1;
      writeFileSync(resolve(OUT, entry.slug + '.json'),
        JSON.stringify({ slug: entry.slug, board: entry.board, frame: dump.frame, regions }, null, 1) + '\n');
      summary.written++; summary.perSet[set.dir]++;
      continue;
    }

    // one screen per dump: the first root is the screen; extra roots (portals) get their own region
    const branch = descendToBranch(roots[0], '0');
    const kids = kidsOf(branch.node);
    if (!kids.length) { summary.noBranch.push(entry.slug); continue; }

    if (isOverlay) {
      regions.push(...overlayRegions(branch, frameH));
    } else {
      // filter AFTER indexing: region paths are DOM indices, so the original `i` must survive
      const live = kids.map((c, i) => ({ c, i })).filter((x) => !paintsNothing(x.c));
      const named = live.map(({ c, i }, li) =>
        ({ c, i, name: classify(c, i, frameH, li === 0, li === live.length - 1) }));
      // hero first (it lives inside content), then the bands in visual order
      const content = named.find((x) => x.name === 'content');
      if (content) {
        const hero = heroInside(content.c, branch.path + '.' + content.i, frameH);
        if (hero) regions.push(hero);
      }
      // de-duplicate repeated names (two 'content' bands → content, content-2)
      const seen = {};
      for (const x of named) {
        seen[x.name] = (seen[x.name] || 0) + 1;
        const name = seen[x.name] === 1 ? x.name : x.name + '-' + seen[x.name];
        regions.push({ name, paths: [branch.path + '.' + x.i] });
      }
    }
    for (let r = 1; r < roots.length; r++) regions.push({ name: 'portal-' + r, paths: [String(r)] });

    // LAST, and only for screens: a catch-all for the wrapper chain above the layout (expo-router /
    // safe-area boxes that paint the screen background). 70 groups regions in the order given and a
    // grouped shape stops being a candidate, so by the time this one is offered the named regions
    // have taken their shapes and only the wrappers are left. Offered any earlier, its path prefix
    // would swallow the whole screen. Without it every board's layer tree opens with three or four
    // `r / 0.0.0`-style shapes standing next to the named regions — see 73c, which applies the same
    // grouping to boards that are already drawn.
    if (!isOverlay) regions.push({ name: 'surface', paths: ['0'] });

    for (const r of regions) summary.regionNames[r.name] = (summary.regionNames[r.name] || 0) + 1;
    writeFileSync(resolve(OUT, entry.slug + '.json'),
      JSON.stringify({ slug: entry.slug, board: entry.board, frame: dump.frame, regions }, null, 1) + '\n');
    summary.written++;
    summary.perSet[set.dir]++;
  }
}

console.log(JSON.stringify(summary, null, 1));
