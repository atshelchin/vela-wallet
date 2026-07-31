// _probe-qr-patched.mjs — PROOF-OF-REMEDY probe (changes nothing on disk in the generator).
//
// The QR scanner is a raw react-native <Modal>: on RNW it portals to document.body under wrappers
// measuring 0x0 and 1280x0 (see _probe-qr-chain.mjs). extract-dom-layout.js prunes anything smaller
// than `minSize` BEFORE descending, so the whole overlay is invisible to every capture path.
// Here the extractor source is patched IN MEMORY so a zero-size wrapper passes its children through
// (exactly what it already does for `display: contents`), and the overlay is captured at a chosen
// viewport so we can compare the geometry the design file would get.
//
//   VW/VH   viewport (390x844 = phone; 1280x950 = the harness's own)
//   TORCH=1 tap the flashlight before dumping
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
const URLPATH = process.env.URLPATH || '/parallel';
const SLUG = process.env.SLUG || ('_probe-qr-patched-' + W);

const NEEDLE = `    const r = el.getBoundingClientRect();
    if (r.width < O.minSize || r.height < O.minSize) return null;`;
const PATCH = `    const r = el.getBoundingClientRect();
    if (r.width < O.minSize || r.height < O.minSize) {
      const outZ = [];
      for (const child of Array.from(el.children)) {
        const c = walk(child, depth);
        if (c) outZ.push(...(Array.isArray(c) ? c : [c]));
      }
      return outZ.length ? outZ : null;
    }`;
let src = readFileSync(resolve(GEN, 'extract-dom-layout.js'), 'utf8');
if (!src.includes(NEEDLE)) throw new Error('extract-dom-layout.js size gate not found — patch needs updating');
src = src.replace(NEEDLE, PATCH);

const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true });
await ctx.grantPermissions(['camera'], { origin: BASE });
const page = await ctx.newPage();
await page.goto(BASE + URLPATH, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(9000);
await page.evaluate(src + '\nwindow.preloadAssets = preloadAssets; window.extractLayout = extractLayout;');

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
if (process.env.TORCH) { await tap('flashlight'); await page.waitForTimeout(1500); }

const dump = await page.evaluate(async () => { await window.preloadAssets(); return window.extractLayout(); });
writeFileSync(resolve(OUT, SLUG + '.json'), JSON.stringify(dump));
console.log('viewport', W + 'x' + H, '· frame', JSON.stringify(dump.frame));
const lines = [];
(function walk(n, d) {
  if (Array.isArray(n)) return n.forEach((c) => walk(c, d));
  const box = '[' + Math.round(n.x) + ' ' + Math.round(n.y) + ' ' + Math.round(n.w) + ' ' + Math.round(n.h) + ']';
  lines.push('  '.repeat(d) + (n.text ? JSON.stringify(n.text) : '·') + ' ' + box +
    (n.bg ? ' bg=' + n.bg : '') + (n.label ? ' label="' + n.label + '"' : '') + (n.border ? ' border' : ''));
  (n.children || []).forEach((c) => walk(c, d + 1));
})(dump.tree, 0);
// print only the overlay half: everything after the last top-level Home node
const start = lines.findIndex((l, i) => i > 0 && /^· \[0 0 /.test(l) && lines.slice(i).some((x) => x.includes('Scan QR')));
console.log(lines.slice(start >= 0 ? start : 0).join('\n'));
await page.screenshot({ path: resolve(OUT, SLUG + '.png') });
await browser.close();
