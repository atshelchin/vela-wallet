// _probe-qr-minsize.mjs — the extractor already takes `minSize`; is dropping it to 0 enough to get
// past the react-native <Modal> portal's zero-size wrappers, with no source change at all?
// Prints the overlay subtree and the node-count cost of the looser gate.
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
const SLUG = process.env.SLUG || ('_probe-qr-minsize-' + W);

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
  await page.waitForTimeout(1500);
}

const res = await page.evaluate(async () => {
  await window.preloadAssets();
  const count = (t) => { let n = 0; (function w(x) { if (Array.isArray(x)) return x.forEach(w); n++; (x.children || []).forEach(w); })(t); return n; };
  const a = window.extractLayout();
  const b = window.extractLayout({ minSize: 0 });
  return { defaultNodes: count(a.tree), looseNodes: count(b.tree), loose: b };
});
console.log('viewport', W + 'x' + H, '· nodes default(minSize 2):', res.defaultNodes, '· minSize 0:', res.looseNodes);
const lines = [];
(function walk(n, d) {
  if (Array.isArray(n)) return n.forEach((c) => walk(c, d));
  lines.push('  '.repeat(d) + (n.text ? JSON.stringify(n.text) : '·') +
    ' [' + Math.round(n.x) + ' ' + Math.round(n.y) + ' ' + Math.round(n.w) + ' ' + Math.round(n.h) + ']' +
    (n.bg ? ' bg=' + n.bg : '') + (n.label ? ' label="' + n.label + '"' : ''));
  (n.children || []).forEach((c) => walk(c, d + 1));
})(res.loose.tree, 0);
const i = lines.findIndex((l) => l.includes('bg=#000000'));
console.log(lines.slice(Math.max(0, i - 1)).join('\n'));
writeFileSync(resolve(OUT, SLUG + '.json'), JSON.stringify(res.loose));
await browser.close();
