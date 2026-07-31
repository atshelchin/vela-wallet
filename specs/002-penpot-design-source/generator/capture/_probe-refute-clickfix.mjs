// Does skipping zero-area elements in byText() make the tab actually switch?
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GEN = resolve(HERE, '..');
const harness = readFileSync(resolve(GEN, 'capture-states.js'), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 950 }, deviceScaleFactor: 2 });

const run = async (mode, label) => {
  await page.goto('http://127.0.0.1:8083/parallel', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(9000);
  await page.evaluate(harness);
  const r = await page.evaluate(async (mode) => {
    const all = () => [...document.querySelectorAll('[role="button"],button,[tabindex]')];
    // the harness's own visibility notion would be: does it occupy space
    const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const clickable = () => (mode === 'fixed' ? all().filter(visible) : all());
    const want = 'assets';
    const hits = clickable().filter((e) => {
      const s = (e.innerText || '').trim().toLowerCase();
      return s === want || s.startsWith(want + '\n') || s === want.toLowerCase();
    });
    const loose = hits.length ? hits : clickable().filter((e) => (e.innerText || '').toLowerCase().includes(want));
    const el = loose[0] || null;
    if (!el) return { picked: null };
    const rect = el.getBoundingClientRect();
    const target = el.querySelector('[role="button"],button') || el;
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      target.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    }
    await new Promise((r) => setTimeout(r, 1800));
    return {
      picked: `${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}x${Math.round(rect.height)}`,
      bodyHasTokenRows: /BNB Chain/.test(document.body.innerText),
      bodyHasEmptyActivity: /No activity yet/.test(document.body.innerText),
    };
  }, mode);
  console.log(label.padEnd(34), JSON.stringify(r));
};

await run('current', 'CURRENT byText (all elements)');
await run('fixed', 'FIXED byText (skip 0-area)');
await browser.close();
