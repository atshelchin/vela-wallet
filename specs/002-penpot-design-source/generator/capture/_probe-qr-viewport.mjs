// _probe-qr-viewport.mjs — the QR scanner's react-native `Modal` portals to document.body, OUTSIDE
// the 390px #root frame, so at the harness's 1280x950 viewport the overlay is a 1280x950 rectangle
// at (-445,-53) relative to the frame and its header/footer fall outside the board.
// This probe measures the same overlay at a 390x844 viewport (where global.css's >=500px phone-frame
// rule does not apply and #root is full-bleed) to see whether the capture comes out phone-shaped.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GEN = resolve(HERE, '..');
const OUT = resolve(GEN, '../dom-dumps/_probe');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const BASE = 'http://127.0.0.1:8083';
const W = Number(process.env.VW || 390), H = Number(process.env.VH || 844);
const SLUG = process.env.SLUG || ('_probe-qr-vp' + W);

const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true });
await ctx.grantPermissions(['camera'], { origin: BASE });
const page = await ctx.newPage();
await page.goto(BASE + '/parallel', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(9000);
await page.evaluate(readFileSync(resolve(GEN, 'extract-dom-layout.js'), 'utf8') +
  '\nwindow.preloadAssets = preloadAssets; window.extractLayout = extractLayout;');

await page.evaluate(() => {
  const el = [...document.querySelectorAll('[role="button"],button,[tabindex]')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .find((e) => /^Scan$/.test(e.getAttribute('aria-label') || ''));
  if (!el) throw new Error('no Scan FAB');
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
  }
});
await page.waitForTimeout(6000);
if (process.env.TORCH) {
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('[role="button"],button,[tabindex]')]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .find((e) => /flashlight/i.test(e.getAttribute('aria-label') || ''));
    if (!el) throw new Error('no torch button');
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    }
  });
  await page.waitForTimeout(1200);
}

const dump = await page.evaluate(async () => { await window.preloadAssets(); return window.extractLayout(); });
writeFileSync(resolve(OUT, SLUG + '.json'), JSON.stringify(dump));
console.log('frame', JSON.stringify(dump.frame));
for (const n of dump.tree) console.log(' top:', Math.round(n.x), Math.round(n.y), Math.round(n.w), Math.round(n.h), 'kids', (n.children || []).length);
await page.screenshot({ path: resolve(OUT, SLUG + '.png') });
await browser.close();
