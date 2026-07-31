#!/usr/bin/env node
// audit-boards-distinct.mjs — no two canon boards may be the same picture.
//
// This is the standing gate. `audit-dump-distinctness.mjs` next to it is the DIAGNOSTIC: when this
// fails, that one tells you which signals matched and why. Keep the jobs separate — a gate that
// also explains itself grows options, and options grow ways to pass.
//
// WHY IT EXISTS. On 2026-07-31 the founder opened the file and said the screens looked like they
// were overlapping. They were not overlapping: S/home/activity, S/home/assets and S/home/connections
// were three copies of one picture. `/parallel` keeps the previous route mounted under
// `display:none`, that ghost comes FIRST in document order, and the harness's byText() resolved
// every tab click to it — so the click flipped an invisible screen, threw nothing, and the harness
// wrote the Activity tab to disk three times reporting success. Earlier the same morning a second
// pair (S/home/activity and S/home/activity-empty) had been caught by eye. Twice in one day is a
// class, not an accident, and a class needs a gate rather than a more careful reader.
//
// ONE DEFINITION OF "SAME PICTURE". The fingerprint is lifted out of capture-states.js rather than
// reimplemented, so the in-page harness, the capture driver and this audit can never disagree —
// the first symptom of that kind of drift is a board one of them rejects and another accepts.
//
// Usage: node specs/002-penpot-design-source/generator/audit-boards-distinct.mjs
// Exit code 1 on any unexpected collision.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DUMPS = resolve(HERE, '../dom-dumps');
const SETS = ['screens', 'screens-dark', 'overlays', 'signing'];

const fingerprintDump = new Function(
  readFileSync(resolve(HERE, 'capture-states.js'), 'utf8') + '\nreturn fingerprintDump;')();

// Boards that are ALLOWED to be identical, each with the reason. An entry here is a claim that two
// boards depicting one picture is the intended design, and it should be rare enough to argue about.
const ALLOWED = [
  // ['screens/foo', 'screens/bar', 'why this pair is intentionally the same picture'],
];
const allowed = (a, b) => ALLOWED.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

const fps = new Map();
for (const set of SETS) {
  const idx = resolve(DUMPS, set, '_index.json');
  if (!existsSync(idx)) continue;
  for (const e of JSON.parse(readFileSync(idx, 'utf8'))) {
    const f = resolve(DUMPS, set, e.slug + '.json');
    if (!existsSync(f)) continue;
    const fp = fingerprintDump(JSON.parse(readFileSync(f, 'utf8')));
    if (!fps.has(fp)) fps.set(fp, []);
    fps.get(fp).push({ id: set + '/' + e.slug, board: e.board });
  }
}

const collisions = [];
for (const [fp, members] of fps) {
  if (members.length < 2) continue;
  const ids = members.map((m) => m.id);
  const unexplained = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) if (!allowed(ids[i], ids[j])) unexplained.push([ids[i], ids[j]]);
  }
  if (unexplained.length) collisions.push({ fp, boards: members.map((m) => m.board || m.id), pairs: unexplained });
}

const total = [...fps.values()].reduce((a, v) => a + v.length, 0);
console.log(JSON.stringify({
  chunk: 'audit-boards-distinct',
  dumps: total,
  distinctPictures: fps.size,
  collisions,
  pass: collisions.length === 0,
}, null, 1));
process.exit(collisions.length ? 1 : 0);
