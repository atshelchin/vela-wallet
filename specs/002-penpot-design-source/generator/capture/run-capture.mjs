#!/usr/bin/env node
// run-capture.mjs — drive the running web app with Playwright and dump captures to disk.
//
// The capture harness (`capture-states.js` + `state-specs*.json`) already existed but was executed
// by hand through chrome-devtools' evaluate_script. That browser is also the one holding the Penpot
// plugin session, so it cannot be driven and used at the same time — and a capture pass that only a
// human can run is a capture pass that stops happening. This wrapper runs the SAME harness in its
// own Playwright browser, so a recapture is one command.
//
// Usage:
//   node run-capture.mjs --spec state-specs-2.json                 # a whole spec file
//   node run-capture.mjs --spec state-specs.json --group /wallet   # one URL group
//   node run-capture.mjs --url /wallet --slug home-activity --board S/home/activity \
//        --page '05 Screens · Wallet' --pre "vela.failRpc('all')"  # one ad-hoc state
//
// Output: dom-dumps/<dir>/<slug>.json (default dir: screens) + a merged _global.assets.json.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GEN = resolve(HERE, '..');
const DUMPS = resolve(GEN, '../dom-dumps');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.includes('--' + k);

const BASE = arg('base', 'http://127.0.0.1:8083');
const OUTDIR = resolve(DUMPS, arg('dir', 'screens'));
if (!existsSync(OUTDIR)) mkdirSync(OUTDIR, { recursive: true });

const extractor = readFileSync(resolve(GEN, 'extract-dom-layout.js'), 'utf8');
const harness = readFileSync(resolve(GEN, 'capture-states.js'), 'utf8');

const browser = await chromium.launch();
// The phone frame only appears at desktop width — at a narrow viewport the app renders full-bleed
// and `extractLayout` finds no 390px frame to measure against.
const page = await browser.newPage({ viewport: { width: 1280, height: 950 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('PAGE ERROR:', String(e).slice(0, 200)));

const install = async () => {
  await page.evaluate(extractor + '\nwindow.preloadAssets = preloadAssets; window.extractLayout = extractLayout;');
  await page.evaluate(harness + '\nwindow.captureStates = captureStates; window.captureAll = captureAll;');
};

const out = { captured: [], failed: [], assets: {} };

const dumpOne = async (slug, board, pageName, note) => {
  const res = await page.evaluate(async () => {
    await window.preloadAssets();
    return window.extractLayout();
  });
  if (!res || !res.tree || !res.tree.length) { out.failed.push(slug + ': empty tree'); return null; }
  writeFileSync(resolve(OUTDIR, slug + '.json'), JSON.stringify(res));
  out.captured.push({ slug, board, page: pageName, note: note || '', w: res.frame.w, h: res.frame.h });
  return res;
};

const goto = async (path, settle) => {
  await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(settle || 4000);
  await install();
};

if (arg('spec')) {
  const spec = JSON.parse(readFileSync(resolve(GEN, arg('spec')), 'utf8'));
  const groups = Array.isArray(spec) ? spec : (spec.groups || []);
  const only = arg('group');
  for (const group of groups) {
    if (only && group.url !== only) continue;
    await goto(group.url, group.settle);
    const r = await page.evaluate(async (g) => await window.captureStates(g), group);
    for (const [slug, dump] of Object.entries(r.captured || {})) {
      writeFileSync(resolve(OUTDIR, slug + '.json'), JSON.stringify(dump));
      const st = (group.states || []).find((s) => s.slug === slug) || {};
      out.captured.push({ slug, board: st.board, page: st.page, note: st.note || '', w: dump.frame.w, h: dump.frame.h });
    }
    for (const [slug, why] of Object.entries(r.failed || {})) out.failed.push(slug + ': ' + why);
    console.log(group.url, '→', Object.keys(r.captured || {}).length, 'ok,', Object.keys(r.failed || {}).length, 'failed');
  }
} else {
  // ad-hoc single state
  const url = arg('url', '/wallet');
  await goto(url, Number(arg('settle', 4000)));
  const pre = arg('pre');
  if (pre) {
    await page.evaluate((code) => { try { eval(code); } catch (e) { console.error('pre failed', e); } }, pre);
    await page.waitForTimeout(Number(arg('after', 3500)));
  }
  for (const step of (arg('click') ? arg('click').split('|') : [])) {
    // report the hit: a click that silently found nothing produced a dump of the PREVIOUS state,
    // which is indistinguishable from a correct capture of a screen that never changed
    const hit = await page.evaluate((t) => {
      const cands = [...document.querySelectorAll('[role="button"],button,[tabindex]')]
        .filter((e) => (e.textContent || '').trim().toLowerCase().includes(String(t).toLowerCase()));
      if (!cands.length) return 'MISS: ' + t;
      const el = cands[cands.length - 1];   // innermost match wins: the label, not its container
      for (const ev of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        el.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true, view: window }));
      }
      return 'hit(' + cands.length + '): ' + (el.textContent || '').trim().slice(0, 30);
    }, step);
    console.error('  click', JSON.stringify(step), '→', hit);
    await page.waitForTimeout(Number(arg("clickwait", 3200)));
  }
  if (has('shot')) await page.screenshot({ path: resolve(OUTDIR, arg('slug', 'adhoc') + '.png') });
  await dumpOne(arg('slug', 'adhoc'), arg('board', ''), arg('page', ''), arg('note', ''));
}

// merge the asset registry the extractor collected across every state in this run
const assets = await page.evaluate(() => {
  const map = window.__ASSETMAP || {};
  const o = {};
  for (const [url, uri] of Object.entries(map)) o[url] = uri;
  return o;
});
out.assetCount = Object.keys(assets).length;
writeFileSync(resolve(OUTDIR, '_run-assets.json'), JSON.stringify(assets));

await browser.close();
console.log(JSON.stringify({ captured: out.captured, failed: out.failed, assets: out.assetCount }, null, 1));
