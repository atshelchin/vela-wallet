// _probe-tabs4.mjs — end-to-end A/B of the one-line fix, through the REAL harness.
// Runs state-specs-8.json's /parallel group with capture-states.js as-is, then with clickable()
// restricted to rendered elements. Nothing is written to disk: dumps stay in the page and are
// reduced to the harness's own fingerprint, and slugs are prefixed _probe- regardless.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const GEN = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extractor = readFileSync(resolve(GEN, 'extract-dom-layout.js'), 'utf8');
const harness = readFileSync(resolve(GEN, 'capture-states.js'), 'utf8');

const OLD = `const clickable = () => [...document.querySelectorAll('[role="button"],button,[tabindex]')];`;
const NEW = `const clickable = () => [...document.querySelectorAll('[role="button"],button,[tabindex]')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });`;
if (!harness.includes(OLD)) { console.error('patch anchor not found — capture-states.js changed'); process.exit(2); }

const spec = JSON.parse(readFileSync(resolve(GEN, 'state-specs-8.json'), 'utf8'));
const group = JSON.parse(JSON.stringify((Array.isArray(spec) ? spec : spec.groups).find((g) => g.url === '/parallel')));
group.states = group.states.map((s) => ({ ...s, slug: '_probe-' + s.slug }));

const b = await chromium.launch();
for (const [name, src] of [['UNPATCHED (today)', harness], ['PATCHED (rendered-only clickable)', harness.replace(OLD, NEW)]]) {
  const p = await b.newPage({ viewport: { width: 1280, height: 950 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).split('\n')[0].slice(0, 120)));
  await p.goto('http://127.0.0.1:8083' + group.url, { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(group.settle || 9000);
  await p.evaluate(extractor + '\nwindow.preloadAssets = preloadAssets; window.extractLayout = extractLayout;');
  await p.evaluate(src + '\nwindow.captureStates = captureStates;');
  const r = await p.evaluate(async (g) => {
    const res = await window.captureStates(g, {});
    return { ok: Object.keys(res.captured), failed: res.failed, fps: res.fingerprints };
  }, group);
  console.log('\n===== ' + name + ' =====');
  console.log(' captured:', JSON.stringify(r.ok));
  console.log(' failed  :', JSON.stringify(r.failed, null, 1));
  console.log(' fps     :', JSON.stringify(r.fps, null, 1));
  console.log(' page errors:', JSON.stringify([...new Set(errs)]));
  await p.close();
}
await b.close();
