// _probe-qr-chain.mjs — walk from the QR-scanner modal's body-level portal down to its content and
// print each wrapper's box + the computed styles extract-dom-layout.js gates on, to find exactly
// which node stops the descent.
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8083';
const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 }, deviceScaleFactor: 2, hasTouch: true });
await ctx.grantPermissions(['camera'], { origin: BASE });
const page = await ctx.newPage();
await page.goto(BASE + '/parallel', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(9000);
await page.evaluate(() => {
  const el = [...document.querySelectorAll('[role="button"],button,[tabindex]')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .find((e) => /^Scan$/.test(e.getAttribute('aria-label') || ''));
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
  }
});
await page.waitForTimeout(6000);
const rows = await page.evaluate(() => {
  const title = [...document.querySelectorAll('div,span')].filter((e) => (e.textContent || '').trim() === 'Scan QR').pop();
  const chain = [];
  for (let e = title; e && e !== document.body; e = e.parentElement) chain.unshift(e);
  return chain.map((e, i) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return { i, tag: e.tagName, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top),
      display: cs.display, visibility: cs.visibility, opacity: cs.opacity, position: cs.position, bg: cs.backgroundColor };
  });
});
for (const r of rows) console.log(JSON.stringify(r));
await browser.close();
