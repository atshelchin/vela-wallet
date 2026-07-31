// _probe-qr-root.mjs — does the QR-scanner overlay become capturable if the extractor is pointed at
// the modal's portal wrapper (`opts.root`, the same escape hatch prune-overlays.py documents), and
// what geometry does it come out with at a given viewport?
//   VW/VH  viewport (default 1280x950 — the harness's own)
//   TORCH=1 also tap the flashlight button first
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GEN = resolve(HERE, '..');
const OUT = resolve(GEN, '../dom-dumps/_probe');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const BASE = 'http://127.0.0.1:8083';
const W = Number(process.env.VW || 1280), H = Number(process.env.VH || 950);
const SLUG = process.env.SLUG || ('_probe-qr-root' + W);

const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true });
await ctx.grantPermissions(['camera'], { origin: BASE });
const page = await ctx.newPage();
await page.goto(BASE + '/parallel', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(9000);
await page.evaluate(readFileSync(resolve(GEN, 'extract-dom-layout.js'), 'utf8') +
  '\nwindow.preloadAssets = preloadAssets; window.extractLayout = extractLayout;');

const tap = (re) => page.evaluate((r) => {
  const el = [...document.querySelectorAll('[role="button"],button,[tabindex]')]
    .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; })
    .find((e) => new RegExp(r).test(e.getAttribute('aria-label') || ''));
  if (!el) throw new Error('no element matching ' + r);
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
  }
  return true;
}, re);

await tap('^Scan$');
await page.waitForTimeout(6000);
if (process.env.TORCH) { await tap('flashlight'); await page.waitForTimeout(1200); }

const res = await page.evaluate(async () => {
  await window.preloadAssets();
  // The modal portal: the body child that owns the "Scan QR" title.
  const title = [...document.querySelectorAll('div,span')].filter((e) => (e.textContent || '').trim() === 'Scan QR').pop();
  let portal = title;
  while (portal && portal.parentElement !== document.body) portal = portal.parentElement;
  const pr = portal.getBoundingClientRect();
  const inner = portal.children[0];
  const ir = inner.getBoundingClientRect();
  return {
    portal: { w: pr.width, h: pr.height, x: pr.left, y: pr.top, pos: getComputedStyle(portal).position, display: getComputedStyle(portal).display },
    inner: { w: ir.width, h: ir.height, x: ir.left, y: ir.top, bg: getComputedStyle(inner).backgroundColor },
    whole: window.extractLayout(),
    rooted: window.extractLayout({ root: portal }),
  };
});
console.log('viewport', W + 'x' + H);
console.log('portal wrapper  ', JSON.stringify(res.portal));
console.log('its first child ', JSON.stringify(res.inner));
console.log('whole-document dump tops:', res.whole.tree.map((n) => [Math.round(n.x), Math.round(n.y), Math.round(n.w), Math.round(n.h), (n.children || []).length].join('/')).join('  '));
console.log('rooted dump frame', JSON.stringify(res.rooted.frame));
const flat = [];
(function walk(n, d) {
  if (Array.isArray(n)) return n.forEach((c) => walk(c, d));
  flat.push('  '.repeat(d) + (n.text ? JSON.stringify(n.text) : '·') +
    ' [' + Math.round(n.x) + ' ' + Math.round(n.y) + ' ' + Math.round(n.w) + ' ' + Math.round(n.h) + ']' +
    (n.bg ? ' bg=' + n.bg : '') + (n.label ? ' label=' + n.label : ''));
  (n.children || []).forEach((c) => walk(c, d + 1));
})(res.rooted.tree, 0);
console.log(flat.slice(0, 60).join('\n'));
writeFileSync(resolve(OUT, SLUG + '.json'), JSON.stringify(res.rooted));
await page.screenshot({ path: resolve(OUT, SLUG + '.png') });
await browser.close();
