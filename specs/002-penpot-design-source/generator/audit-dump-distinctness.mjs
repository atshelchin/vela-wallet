#!/usr/bin/env node
// audit-dump-distinctness.mjs
//
// WHY: a text-only hash over the DOM dumps is a weak comparator. A dark-mode
// capture has the SAME text and different colours (correct). A "scrolled"
// capture has the same text and different geometry (correct). A tab-switch
// that silently no-op'd has the same text AND the same geometry AND the same
// colours (a DEFECT — three boards in the design file show one picture).
//
// So compare every pair of canonical dumps on THREE independent signals:
//   (a) TEXT  — the ordered list of rendered strings
//   (b) GEOM  — every node's x,y,w,h rounded, in tree order
//   (c) COLOR — every fill / background / border / icon / shadow colour, in order
// Two dumps are strictly identical only when all three match.
//
// Those three alone are still not enough to decide DEFECT, in both directions,
// which is why three more derived signals exist:
//   (b2) VGEOM  — GEOM restricted to nodes that PAINT. An extra empty wrapper
//        <div> changes GEOM without changing the picture; without VGEOM a real
//        duplicate escapes on a one-node structural accident (home-connections).
//   (d)  EXTRA  — opacity, icon/image identity, font. A checkbox icon swap plus
//        a disabled-button opacity is a REAL state change that text, geometry and
//        colour are all blind to (onboarding-create vs -create-form-ready).
//   (e)  TOLERANT — same painted-node count, same strings, every content box
//        equal within ±2px after ONE constant offset that the two frame heights
//        explain. Catches two captures of one screen taken by different extractor
//        generations (806px vs 844px frame), which the exact hashes call distinct.
// The verdict keys on TOLERANT + colour + assets + opacity ("same picture?"),
// and the three coarse signals are reported so the reasoning stays auditable.
//
// Also reported: BOARD-NAME COLLISIONS — two dumps that name the same board. Only
// one survives into the design file and load order decides which.
//
// Usage:
//   node generator/audit-dump-distinctness.mjs            # full report
//   node generator/audit-dump-distinctness.mjs --json     # machine-readable
//   node generator/audit-dump-distinctness.mjs --groups   # only the known groups

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DUMPS = path.join(ROOT, 'dom-dumps');

// The canonical design-source sets: every dump that becomes a board.
// (dom-dumps/signing-fix is a RE-capture of three signing boards, not a set of
// its own — it is loaded separately and reported as a supersede, see below.)
const SETS = ['screens', 'overlays', 'screens-dark', 'signing'];
const SUPERSEDE_SET = 'signing-fix';

// ---------------------------------------------------------------- fingerprints

const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const r = (n) => (typeof n === 'number' ? Math.round(n) : n);

// A dump's `children` may contain NESTED ARRAYS — React fragments survive the
// extractor. 70-board-from-dom.js flattens with .flat(Infinity); an audit that
// forgets to do the same silently sees a 17-node tree where there are 400 nodes,
// and then reports blank screens as "identical". Flatten here too.
function walk(nodes, visit) {
  for (const n of (nodes || []).flat(Infinity)) {
    if (!n || typeof n !== 'object') continue;
    visit(n);
    if (n.children) walk(n.children, visit);
  }
}

// The painted nodes of a dump, in tree order, with only what a viewer can see.
// Used by the TOLERANT comparator below.
function paintedNodes(dump) {
  const out = [];
  const fw = (dump.frame && dump.frame.w) || 390;
  const fh = (dump.frame && dump.frame.h) || 844;
  walk(dump.tree, (n) => {
    const hasText = typeof n.text === 'string' && n.text.length;
    if (!(hasText || n.bg || n.border || n.svg || n.src || n.dataUri || n.assetKey)) return;
    // Full-bleed backdrops are the viewport, not content: their height IS the
    // frame height, which legitimately differs between capture eras (844 vs 806).
    const fullBleed = n.w >= fw - 1 && n.h >= fh - 1;
    out.push({
      x: n.x, y: n.y, w: n.w, h: n.h, fullBleed,
      text: hasText ? n.text : null,
      bg: n.bg || null,
      fg: n.color || null,
      bd: n.border ? `${n.border.w}:${n.border.color}` : null,
      svgColor: n.svgColor || null,
      // Asset identity is recorded differently by different extractor
      // generations: the old one inlined src + dataUri, the new one stores an
      // assetKey into a shared asset file. Keep the SCHEME alongside the value
      // so a cross-era pair reports "unknown", never a false "different".
      assetScheme: n.assetKey ? 'key' : (n.dataUri || n.src || n.svg) ? 'inline' : null,
      asset: n.assetKey || (n.dataUri ? sha(String(n.dataUri)) : null) || (n.svg ? sha(String(n.svg)) : null) || n.src || null,
      opacity: n.opacity === undefined ? 1 : n.opacity,
    });
  });
  return out;
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

// TOLERANT comparator — "is this the same picture?" rather than "are these the
// same bytes?". Two captures taken by different extractor generations sit in a
// 844px frame and an 806px frame: every box shifts by a constant ~19px and text
// heights round differently. An exact geometry hash calls them distinct; a human
// looking at the two boards sees one screen twice. So: same painted-node count,
// same strings, every content box equal within `tol` px after one constant Δy.
function tolerantSame(a, b, tol = 2) {
  const A = a.painted.filter((n) => !n.fullBleed);
  const B = b.painted.filter((n) => !n.fullBleed);
  if (!A.length || A.length !== B.length) return null;
  for (let i = 0; i < A.length; i++) if (A[i].text !== B[i].text) return null;
  const dy = median(A.map((n, i) => B[i].y - n.y));
  const dx = median(A.map((n, i) => B[i].x - n.x));

  // The constant offset is only forgivable when it is EXPLAINED by the two
  // captures sitting in different-sized viewports. A scroll produces a large
  // offset inside the SAME viewport and must stay a real difference — otherwise
  // this comparator would happily declare a scrolled board a duplicate.
  const fa = a.frame || { w: 390, h: 844 };
  const fb = b.frame || { w: 390, h: 844 };
  if (Math.abs(dy) > Math.abs(fa.h - fb.h) + tol) return null;
  if (Math.abs(dx) > Math.abs(fa.w - fb.w) + tol) return null;

  for (let i = 0; i < A.length; i++) {
    if (Math.abs((B[i].y - A[i].y) - dy) > tol) return null;
    if (Math.abs((B[i].x - A[i].x) - dx) > tol) return null;
    if (Math.abs(B[i].w - A[i].w) > tol || Math.abs(B[i].h - A[i].h) > tol) return null;
  }
  let colorSame = true, opacitySame = true;
  let assetSame = true, assetUnknown = false;
  for (let i = 0; i < A.length; i++) {
    if (A[i].bg !== B[i].bg || A[i].fg !== B[i].fg || A[i].bd !== B[i].bd) colorSame = false;
    // svgColor only became a field in a later extractor generation: compare it
    // only when both sides recorded one, or every cross-era pair reads "differs".
    if (A[i].svgColor && B[i].svgColor && A[i].svgColor !== B[i].svgColor) colorSame = false;
    if (A[i].opacity !== B[i].opacity) opacitySame = false;
    if (A[i].assetScheme !== B[i].assetScheme) assetUnknown = true;
    else if (A[i].asset !== B[i].asset) assetSame = false;
  }
  return { dx, dy, colorSame, assetSame, assetUnknown, opacitySame, nodes: A.length };
}

function fingerprint(dump) {
  const text = [];
  const geom = [];
  const vgeom = [];
  const color = [];
  const extra = [];
  let nodes = 0;

  walk(dump.tree, (n) => {
    nodes += 1;

    // (a) TEXT — rendered strings in tree order.
    if (typeof n.text === 'string' && n.text.length) text.push(n.text);
    if (Array.isArray(n.textRuns) && n.textRuns.length) text.push('␟' + n.textRuns.join('␟'));

    // (b) GEOM — every node's box, rounded.
    geom.push(`${r(n.x)},${r(n.y)},${r(n.w)},${r(n.h)}`);

    // (b2) VGEOM — the boxes of nodes that actually PAINT something. An extra
    // empty wrapper <div> changes GEOM without changing the picture, so GEOM
    // alone lets a genuine duplicate escape on a one-node structural accident.
    const paints = (typeof n.text === 'string' && n.text.length) || n.bg || n.border ||
      n.svg || n.src || n.dataUri || n.assetKey;
    if (paints) vgeom.push(`${r(n.x)},${r(n.y)},${r(n.w)},${r(n.h)}`);

    // (c) COLOR — every paint encountered, in order.
    if (n.bg) color.push(`bg:${n.bg}`);
    if (n.color) color.push(`fg:${n.color}`);
    if (n.border && n.border.color) color.push(`bd:${n.border.w}:${n.border.color}`);
    if (n.svgColor) color.push(`svg:${n.svgColor}`);
    if (n.shadow) color.push(`sh:${n.shadow}`);

    // (d) EXTRA — non-colour visual identity (not part of the verdict).
    if (n.opacity !== undefined) extra.push(`op:${n.opacity}`);
    if (n.assetKey) extra.push(`ak:${n.assetKey}`);
    if (n.src) extra.push(`src:${n.src}`);
    if (n.dataUri) extra.push(`du:${sha(String(n.dataUri))}`);
    if (n.svg) extra.push(`sv:${sha(String(n.svg))}`);
    if (n.font) extra.push(`ft:${n.font.size}/${n.font.weight}/${n.font.family}`);
  });

  const join = (a) => a.join(' ');
  return {
    nodes,
    text: sha(join(text)),
    geom: sha(join(geom)),
    vgeom: sha(join(vgeom)),
    color: sha(join(color)),
    extra: sha(join(extra)),
    _text: text,
    _geom: geom,
    _vgeom: vgeom,
    _color: color,
    _extra: extra,
  };
}

// ---------------------------------------------------------------- load

function loadSet(set) {
  const dir = path.join(DUMPS, set);
  const idxPath = path.join(dir, '_index.json');
  const idx = fs.existsSync(idxPath) ? JSON.parse(fs.readFileSync(idxPath, 'utf8')) : [];
  const out = [];
  for (const e of idx) {
    const file = path.join(dir, `${e.slug}.json`);
    if (!fs.existsSync(file)) {
      console.error(`!! ${set}/${e.slug}: indexed but no dump file`);
      continue;
    }
    const dump = JSON.parse(fs.readFileSync(file, 'utf8'));
    out.push({
      set,
      slug: e.slug,
      id: `${set}/${e.slug}`,
      board: e.board || '(no board)',
      page: e.page || '',
      note: e.note || '',
      url: dump.url || '',
      file,
      frame: dump.frame || null,
      painted: paintedNodes(dump),
      fp: fingerprint(dump),
    });
  }
  return out;
}

const items = SETS.flatMap(loadSet);
const superseded = loadSet(SUPERSEDE_SET);
const byId = new Map(items.map((i) => [i.id, i]));

// Two dumps that name the SAME board are a different kind of duplicate: only one
// of them can survive into the design file, and which one wins is decided by
// whatever order the generator happens to load them in.
const boardCollisions = [];
{
  const byBoard = new Map();
  for (const i of items) {
    if (!byBoard.has(i.board)) byBoard.set(i.board, []);
    byBoard.get(i.board).push(i);
  }
  for (const [board, group] of byBoard) {
    if (group.length > 1) boardCollisions.push({ board, dumps: group.map((g) => g.id) });
  }
}

// ---------------------------------------------------------------- journeys

const journeys = JSON.parse(fs.readFileSync(path.join(HERE, 'journeys.json'), 'utf8'));
// board -> {page, journey, role}
const boardRole = new Map();
for (const [page, cfg] of Object.entries(journeys.pages || {})) {
  for (const wall of cfg.walls || []) {
    const j = wall.journey;
    if (wall.hub) boardRole.set(wall.hub, { page, journey: j, role: 'hub' });
    for (const s of wall.spokes || []) boardRole.set(s, { page, journey: j, role: 'spoke' });
    for (const s of wall.steps || []) boardRole.set(s, { page, journey: j, role: 'step' });
    for (const [anchor, states] of Object.entries(wall.states || {})) {
      for (const s of states) boardRole.set(s, { page, journey: j, role: `state-of ${anchor}`, anchor });
    }
  }
}

// ---------------------------------------------------------------- pair scan

function match(a, b) {
  const m = {
    text: a.fp.text === b.fp.text,
    geom: a.fp.geom === b.fp.geom,
    vgeom: a.fp.vgeom === b.fp.vgeom,
    color: a.fp.color === b.fp.color,
    extra: a.fp.extra === b.fp.extra,
  };
  m.n = (m.text ? 1 : 0) + (m.geom ? 1 : 0) + (m.color ? 1 : 0);
  // Strict: every painted box in the same place, same strings, same paints.
  m.samePicture = m.text && m.vgeom && m.color;
  // Tolerant: the same screen, allowing one constant offset and ±2px, and only
  // then also requiring the icons and opacities to agree. This is the signal the
  // verdict keys on — a swapped checkbox icon or a disabled-button opacity is a
  // real difference the three coarse signals cannot see, and a 19px shift from a
  // different viewport height is not.
  const t = tolerantSame(a, b);
  m.tol = t;
  m.sameScreen = !!(t && t.colorSame && t.assetSame && t.opacitySame);
  return m;
}

const N = items.length;
const pairs = [];
for (let i = 0; i < N; i++) {
  for (let k = i + 1; k < N; k++) {
    const a = items[i];
    const b = items[k];
    const m = match(a, b);
    if (m.n >= 2 || m.samePicture || m.sameScreen) pairs.push({ a, b, m, n: m.n });
  }
}
pairs.sort((p, q) => (q.m.sameScreen - p.m.sameScreen) || q.n - p.n || p.a.id.localeCompare(q.a.id));

const identical = pairs.filter((p) => p.m.sameScreen);
const near = pairs.filter((p) => !p.m.sameScreen);

// ---------------------------------------------------------------- verdicts

// A pair is EXPECTED to be indistinguishable only in narrow, nameable cases.
// Everything else that matches on all three signals is a DEFECT: two boards in
// the design file carry the same picture when the design intends two.
function verdict(p) {
  const { a, b, m } = p;
  const names = `${a.board} | ${b.board}`;
  const dark = /-dark$/.test(a.board) || /-dark$/.test(b.board) || a.set.endsWith('-dark') || b.set.endsWith('-dark');
  const scrolled = /scroll/i.test(names) || /scroll/i.test(a.slug + b.slug);

  if (m.sameScreen) {
    const bits = [];
    if (!m.geom) bits.push('differ only by unpainted wrapper nodes');
    if (m.tol && (m.tol.dy || m.tol.dx)) bits.push(`offset by Δx=${m.tol.dx} Δy=${m.tol.dy}px, explained by different capture-era viewport heights`);
    if (m.tol && m.tol.assetUnknown) bits.push("icon/image identity NOT comparable across capture eras — confirm by eye");
    const struct = bits.length ? ` (${bits.join('; ')})` : '';
    if (a.board === b.board) {
      return ['DUPLICATE-BOARD', `both dumps target the same board ${a.board} and render the same picture${struct} — one is a redundant re-capture`];
    }
    if (dark) {
      return ['DEFECT', `dark twin renders the same picture as its light twin${struct}: the theme never switched`];
    }
    if (scrolled) {
      return ['DEFECT', `scrolled state renders the same picture as its unscrolled twin${struct}: the scroll never happened`];
    }
    return ['DEFECT', `two boards meant to depict different screens carry one identical picture${struct}`];
  }
  if (m.samePicture) {
    // All three coarse signals matched but the tolerant compare found a real
    // difference: icons swapped or opacity changed. NOT a duplicate.
    const d = [];
    if (m.tol && !m.tol.assetSame) d.push('different icon/image assets');
    if (m.tol && !m.tol.opacitySame) d.push('different opacity (enabled vs disabled)');
    if (!d.length) d.push('a difference outside text/geometry/colour');
    return ['EXPECTED', `text, geometry and colour all match, but the boards differ by ${d.join(' and ')} — a genuine state change the three coarse signals cannot see`];
  }
  if (m.text && m.vgeom && !m.color) {
    if (dark) return ['EXPECTED', 'same layout and copy, different palette — exactly what a dark twin is'];
    return ['REVIEW', 'same copy and layout, colours differ — only correct if the pair is a theme/emphasis variant'];
  }
  if (m.text && m.color && !m.vgeom) {
    if (scrolled) return ['EXPECTED', 'same copy and palette, painted geometry moved — the scroll did happen'];
    return ['EXPECTED', 'same copy and palette, painted geometry differs — a real layout difference'];
  }
  if (m.vgeom && m.color && !m.text) {
    return ['REVIEW', 'identical layout and palette, only the strings differ — check the copy difference is intentional'];
  }
  return ['REVIEW', 'partial match'];
}

// ---------------------------------------------------------------- known groups

const KNOWN_GROUPS = [
  ['screens/settings-root', 'screens/settings-scrolled', 'screens/theme-reset-light', 'screens-dark/dark-settings'],
  ['screens/home-activity', 'screens/home-assets', 'screens/home-connections'],
  ['screens/add-token-erc20', 'overlays/addtokensheet'],
  ['screens/home-rate-limited', 'screens/home-rpc-trouble'],
  ['screens/onboarding-create', 'screens/onboarding-create-form-ready'],
  ['screens/send-select-token', 'screens-dark/dark-send-select'],
  ['screens/web-request-error-no-session', 'screens/web-request-unavailable'],
];

// ---------------------------------------------------------------- report

const argv = process.argv.slice(2);
const wantJson = argv.includes('--json');
const groupsOnly = argv.includes('--groups');

function sig(m) {
  return [m.text ? 'TEXT' : '·   ', m.geom ? 'GEOM' : '·   ', m.color ? 'COLOR' : '·    '].join(' ');
}

function firstDiff(a, b, key) {
  const A = a.fp['_' + key];
  const B = b.fp['_' + key];
  if (A.length !== B.length) return `length ${A.length} vs ${B.length}`;
  for (let i = 0; i < A.length; i++) {
    if (A[i] !== B[i]) return `#${i}: ${JSON.stringify(A[i])} vs ${JSON.stringify(B[i])}`;
  }
  return '(identical)';
}

const report = {
  dumps: N,
  sets: Object.fromEntries(SETS.map((s) => [s, items.filter((i) => i.set === s).length])),
  identical: [],
  near: [],
  groups: [],
  superseded: [],
  boardCollisions,
};

const sigList = (m) => [m.text && 'TEXT', m.geom && 'GEOM', m.vgeom && 'VGEOM', m.color && 'COLOR']
  .filter(Boolean).join('+') || '(none)';

for (const p of identical) {
  const [v, why] = verdict(p);
  report.identical.push({
    a: p.a.id, b: p.b.id, aBoard: p.a.board, bBoard: p.b.board,
    aPage: p.a.page, bPage: p.b.page, aNote: p.a.note, bNote: p.b.note,
    aUrl: p.a.url, bUrl: p.b.url, aNodes: p.a.fp.nodes, bNodes: p.b.fp.nodes,
    signals: sigList(p.m), extraMatch: p.m.extra, verdict: v, why,
    aRole: boardRole.get(p.a.board) || null, bRole: boardRole.get(p.b.board) || null,
  });
}
for (const p of near) {
  const [v, why] = verdict(p);
  report.near.push({
    a: p.a.id, b: p.b.id, aBoard: p.a.board, bBoard: p.b.board,
    signals: sigList(p.m),
    diff: {
      text: p.m.text ? null : firstDiff(p.a, p.b, 'text'),
      vgeom: p.m.vgeom ? null : firstDiff(p.a, p.b, 'vgeom'),
      color: p.m.color ? null : firstDiff(p.a, p.b, 'color'),
    },
    verdict: v, why,
  });
}

for (const g of KNOWN_GROUPS) {
  const members = g.map((id) => byId.get(id)).filter(Boolean);
  const rows = [];
  for (let i = 0; i < members.length; i++) {
    for (let k = i + 1; k < members.length; k++) {
      const a = members[i], b = members[k];
      const m = match(a, b);
      const [v, why] = verdict({ a, b, m, n: m.n });
      rows.push({
        pair: `${a.id} ↔ ${b.id}`,
        boards: `${a.board} ↔ ${b.board}`,
        signals: sigList(m),
        extraMatch: m.extra,
        verdict: v,
        why,
        diff: {
          text: m.text ? null : firstDiff(a, b, 'text'),
          vgeom: m.vgeom ? null : firstDiff(a, b, 'vgeom'),
          color: m.color ? null : firstDiff(a, b, 'color'),
        },
      });
    }
  }
  report.groups.push({ members: g, rows });
}

for (const s of superseded) {
  const orig = byId.get(`signing/${s.slug}`);
  if (!orig) continue;
  const m = match(orig, s);
  report.superseded.push({
    slug: s.slug, board: s.board,
    same: m.samePicture,
    signals: sigList(m),
  });
}

if (wantJson) {
  console.log(JSON.stringify(report, null, 1));
  process.exit(0);
}

const line = (s = '') => console.log(s);

line(`# dump distinctness audit — ${N} canonical dumps`);
line(`sets: ${SETS.map((s) => `${s}=${report.sets[s]}`).join('  ')}`);
line();

line('## known text-hash groups, re-tested on all signals');
for (const g of report.groups) {
  line();
  line(`### ${g.members.join('  +  ')}`);
  for (const row of g.rows) {
    line(`  ${row.verdict.padEnd(8)} ${row.signals.padEnd(17)} ${row.pair}`);
    line(`           ${row.why}`);
    for (const [k, d] of Object.entries(row.diff)) {
      if (d) line(`           first ${k} diff → ${d}`);
    }
  }
}

if (!groupsOnly) {
  line();
  line(`## every pair that renders the SAME PICTURE — ${identical.length}`);
  for (const p of report.identical) {
    line(`  ${p.verdict.padEnd(8)} ${p.a}  ↔  ${p.b}`);
    line(`           boards: ${p.aBoard}  ↔  ${p.bBoard}`);
    line(`           url:    ${p.aUrl}  ↔  ${p.bUrl}`);
    line(`           nodes: ${p.aNodes} vs ${p.bNodes}   signals: ${p.signals}   extra(opacity/assets/font) matches: ${p.extraMatch}`);
    line(`           ${p.why}`);
  }

  line();
  line(`## pairs that share signals but render DIFFERENT pictures — ${near.length}`);
  for (const p of report.near) {
    line(`  ${p.verdict.padEnd(8)} ${p.signals.padEnd(17)} ${p.a}  ↔  ${p.b}`);
    line(`           ${p.why}`);
    for (const [k, d] of Object.entries(p.diff)) {
      if (d) line(`           first ${k} diff → ${d}`);
    }
  }

  line();
  line('## signing-fix re-captures vs the signing originals they supersede');
  for (const s of report.superseded) {
    line(`  ${s.slug.padEnd(24)} ${s.same ? 'STILL IDENTICAL' : 'differs'} (${s.signals || 'no signal matched'})`);
  }
}

line();
line(`## board-name collisions (two dumps claiming one board) — ${boardCollisions.length}`);
for (const c of boardCollisions) {
  const pics = c.dumps.map((d) => byId.get(d));
  const m = pics.length === 2 ? match(pics[0], pics[1]) : null;
  line(`  ${c.board}  ←  ${c.dumps.join("  +  ")}`);
  if (m) line(`           same picture? ${m.sameScreen ? "YES — one is redundant" : "NO — they show different states, so ONE OF THEM IS MIS-NAMED"}   signals: ${sigList(m)}`);
}

line();
const defects = report.identical.filter((p) => p.verdict === 'DEFECT');
line(`## VERDICT: ${defects.length} defective identical pairs`);
const slugs = new Set();
for (const p of defects) { slugs.add(p.a); slugs.add(p.b); }
line(`   dumps involved (${slugs.size}): ${[...slugs].sort().join(', ')}`);
