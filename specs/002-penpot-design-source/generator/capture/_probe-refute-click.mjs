// Which element does each of the two click implementations actually hit for text "Assets"?
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GEN = resolve(HERE, '..');
const extractor = readFileSync(resolve(GEN, 'extract-dom-layout.js'), 'utf8');
const harness = readFileSync(resolve(GEN, 'capture-states.js'), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 950 }, deviceScaleFactor: 2 });
await page.goto('http://127.0.0.1:8083/parallel', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(9000);
await page.evaluate(extractor + '\nwindow.preloadAssets = preloadAssets; window.extractLayout = extractLayout;');
await page.evaluate(harness + '\nwindow.captureStates = captureStates; window.captureAll = captureAll;');

const report = await page.evaluate(() => {
  const clickable = () => [...document.querySelectorAll('[role="button"],button,[tabindex]')];
  const want = 'assets';

  // ---- capture-states.js byText(), copied verbatim from the harness ----
  const hits = clickable().filter((e) => {
    const s = (e.innerText || '').trim().toLowerCase();
    return s === want || s.startsWith(want + '\n') || s === want.toLowerCase();
  });
  const loose = hits.length ? hits : clickable().filter((e) => (e.innerText || '').toLowerCase().includes(want));
  const harnessEl = loose[0] || null;
  // and what fire() would actually dispatch on:
  const harnessTarget = harnessEl ? (harnessEl.querySelector('[role="button"],button') || harnessEl) : null;

  // ---- run-capture.mjs ad-hoc click, copied verbatim from the driver ----
  const cands = clickable().filter((e) => (e.textContent || '').trim().toLowerCase().includes(want));
  const driverEl = cands.length ? cands[cands.length - 1] : null;

  const describe = (el) => el ? {
    tag: el.tagName,
    role: el.getAttribute('role'),
    aria: el.getAttribute('aria-label'),
    innerText: (el.innerText || '').replace(/\n/g, '\\n').slice(0, 60),
    rect: (() => { const r = el.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`; })(),
  } : null;

  return {
    url: location.pathname,
    totalClickable: clickable().length,
    allClickableTexts: clickable().map((e) => (e.innerText || '').replace(/\n/g, '\\n').slice(0, 40)),
    strictHits: hits.length,
    looseCandidates: loose.length,
    driverCandidates: cands.length,
    HARNESS_picks: describe(harnessEl),
    HARNESS_fires_on: describe(harnessTarget),
    DRIVER_picks: describe(driverEl),
    same: harnessTarget === driverEl,
  };
});
console.log(JSON.stringify(report, null, 1));
await browser.close();
