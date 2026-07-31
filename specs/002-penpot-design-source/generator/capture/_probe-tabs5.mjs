// _probe-tabs5.mjs — regression check: run EVERY group of state-specs-8.json through the patched
// harness (and, for comparison, the unpatched one). Nothing is written to disk; slugs are prefixed.
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

const spec = JSON.parse(readFileSync(resolve(GEN, 'state-specs-8.json'), 'utf8'));
const groups = (Array.isArray(spec) ? spec : spec.groups).map((g) => ({
  ...g, states: g.states.map((s) => ({ ...s, slug: '_probe-' + s.slug })),
}));

const variant = process.argv.includes('--unpatched') ? 'UNPATCHED' : 'PATCHED';
const src = variant === 'PATCHED' ? harness.replace(OLD, NEW) : harness;

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 950 }, deviceScaleFactor: 2 });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).split('\n')[0].slice(0, 120)));
const seen = {};
console.log('===== ' + variant + ' =====');
for (const g of groups) {
  await p.goto('http://127.0.0.1:8083' + g.url, { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(g.settle || 6000);
  await p.evaluate(extractor + '\nwindow.preloadAssets = preloadAssets; window.extractLayout = extractLayout;');
  await p.evaluate(src + '\nwindow.captureStates = captureStates;');
  const r = await p.evaluate(async ([g, seen]) => {
    const res = await window.captureStates(g, seen);
    return { ok: Object.keys(res.captured), failed: res.failed, fps: res.fingerprints };
  }, [g, seen]);
  Object.assign(seen, r.fps);
  console.log('\n' + g.url, '→', r.ok.length, 'ok,', Object.keys(r.failed).length, 'failed');
  for (const s of r.ok) console.log('   ok   ', s, r.fps[s]);
  for (const [s, why] of Object.entries(r.failed)) console.log('   FAIL ', s, '—', why.slice(0, 140));
}
console.log('\npage errors:', JSON.stringify([...new Set(errs)]));
await b.close();
