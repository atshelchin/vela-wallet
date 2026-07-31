#!/usr/bin/env node
// PROBE ONLY — is the create-wallet ceremony tail reachable headlessly?
//
// Uses the same extractor + harness as capture/run-capture.mjs, but adds the one thing the spec
// format cannot express: a network route that ABORTS the identity index's /api/create POST.
// /api/health stays live (so the onboarding health check does not auto-open the settings modal),
// and nothing is ever written to the production index — the whole point of the probe.
//
// Prereq: /parallel is visited first, which installs the fixed-key passkey signer
// (parallel-space.ts installMockPasskey), so Passkey.register/sign resolve with no device dialog.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const GEN = '/Volumes/data/production/vela-wallet/specs/002-penpot-design-source/generator';
const OUT = '/Volumes/data/production/vela-wallet/specs/002-penpot-design-source/dom-dumps/_probe';
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:8083';

const extractor = readFileSync(resolve(GEN, 'extract-dom-layout.js'), 'utf8');
const harness = readFileSync(resolve(GEN, 'capture-states.js'), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 950 }, deviceScaleFactor: 2, hasTouch: true });
page.on('pageerror', (e) => console.error('PAGE ERROR:', String(e).slice(0, 200)));

let createAttempts = 0;
await page.route('**/api/create', (route) => { createAttempts++; console.log('  [blocked /api/create #' + createAttempts + ']'); route.abort(); });

const install = async () => {
  await page.evaluate(extractor + '\nwindow.preloadAssets = preloadAssets; window.extractLayout = extractLayout;');
  await page.evaluate(harness + '\nwindow.captureStates = captureStates; window.captureAll = captureAll;');
};
const shot = async (slug) => {
  await install();
  const res = await page.evaluate(async () => { await window.preloadAssets(); return window.extractLayout(); });
  writeFileSync(resolve(OUT, slug + '.json'), JSON.stringify(res));
  const txt = await page.evaluate(() => document.body.innerText.replace(/\n+/g, ' | ').slice(0, 700));
  console.log('\n== ' + slug + '\n' + txt);
};

// 1 — arm the parallel space (fixed-key signer + fixture wallet)
await page.goto(BASE + '/parallel', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(8000);
console.log('parallel armed:', await page.evaluate(() => document.body.innerText.slice(0, 60).replace(/\n/g, ' ')));

// 2 — the create form
await page.goto(BASE + '/onboarding?mode=create', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(4000);
await install();

const run = async (steps) => page.evaluate(async (s) => {
  const g = { url: location.pathname, states: [{ slug: 'x', board: 'x', page: 'x', steps: s }] };
  return await window.captureStates(g, {});
}, steps);

// fill the form exactly as state-specs-4 does
await run([
  { act: 'type', placeholder: 'Enter a name', value: 'Probe Wallet' },
  { act: 'click', text: 'This is a self-custodial wallet' },
  { act: 'click', text: 'If you lose your device' },
  { act: 'click', text: 'If your iCloud or Google account is compromised' },
  { act: 'click', text: 'I agree to the' },
  { act: 'wait', ms: 500 },
]);
await install();

// 3 — press Create Wallet, then grab the in-flight beat and the settled one
await page.evaluate(() => {
  const els = [...document.querySelectorAll('[role="button"],button')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .filter((e) => (e.innerText || '').trim() === 'Create Wallet');
  const el = els[els.length - 1];
  if (!el) throw new Error('no Create Wallet button');
  for (const ev of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    el.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true, view: window }));
  }
});
await page.waitForTimeout(900);
await shot('_probe-onb-ceremony');

await page.waitForTimeout(9000);
await shot('_probe-onb-sync-failure');

console.log('\n/api/create attempts blocked:', createAttempts);
await browser.close();
