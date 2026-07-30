// recapture-signing.mjs — re-shoot every clear-signing scenario with the current extractor.
// The scenarios live behind the /clear-signing-test harness: each row opens its sheet, and the
// sheet is dismissed with Escape before the next one. Runs the whole matrix in ONE page context.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const GEN = resolve(HERE, '..');
const OUT = resolve(GEN, '../dom-dumps/signing');
const index = JSON.parse(readFileSync(resolve(OUT, '_index.json'), 'utf8'));
const extractor = readFileSync(resolve(GEN, 'extract-dom-layout.js'), 'utf8');

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 950 }, deviceScaleFactor: 2 });
await p.goto('http://127.0.0.1:8083/clear-signing-test', { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(5000);
await p.evaluate(extractor + '\nwindow.preloadAssets = preloadAssets; window.extractLayout = extractLayout;');

const ok = [], bad = [];
for (const e of index) {
  const hit = await p.evaluate((label) => {
    const el = [...document.querySelectorAll('[role="button"],button,[tabindex]')]
      .find((x) => (x.textContent || '').trim().startsWith(label));
    if (!el) return 'MISS';
    for (const ev of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
      el.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true, view: window }));
    return 'ok';
  }, e.note);
  if (hit === 'MISS') { bad.push(e.slug + ': row not found (' + e.note + ')'); continue; }
  await p.waitForTimeout(3200);
  const dump = await p.evaluate(async () => { await window.preloadAssets(); return window.extractLayout(); });
  const runs = JSON.stringify(dump).match(/"textRuns"/g);
  if (dump && dump.tree && dump.tree.length) {
    writeFileSync(resolve(OUT, e.slug + '.json'), JSON.stringify(dump));
    ok.push(e.slug + (runs ? ' (' + runs.length + ' run-groups)' : ''));
  } else bad.push(e.slug + ': empty tree');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(1200);
}
console.log(JSON.stringify({ ok: ok.length, bad, captured: ok }, null, 1));
await b.close();
