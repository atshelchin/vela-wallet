#!/usr/bin/env node
// PROBE ONLY — is S/onboarding/create-success reachable without touching production?
//
// Same as _probe-onboarding.mjs, but instead of ABORTING the identity index it STUBS it:
// /api/create is fulfilled locally with the record the client just sent, and /api/query answers
// with the same public key. Nothing leaves the machine, no on-chain commit-reveal is triggered,
// and the app walks its real success path (uploadPublicKey verify step included).
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

let sent = null;
await page.route('**/api/create', (route) => {
  try { sent = JSON.parse(route.request().postData() || '{}'); } catch {}
  console.log('  [stubbed /api/create] publicKey=', String(sent && sent.publicKey).slice(0, 18) + '…');
  route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ ...sent, createdAt: Date.now() }) });
});
await page.route('**/api/query*', (route) => {
  const u = route.request().url();
  console.log('  [stubbed /api/query]', u.includes('walletRef') ? 'walletRef' : 'credentialId');
  if (!sent) return route.fulfill({ status: 404, body: 'not found' });
  route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ ...sent, createdAt: Date.now() }) });
});

const install = async () => {
  await page.evaluate(extractor + '\nwindow.preloadAssets = preloadAssets; window.extractLayout = extractLayout;');
  await page.evaluate(harness + '\nwindow.captureStates = captureStates; window.captureAll = captureAll;');
};
const shot = async (slug) => {
  await install();
  const res = await page.evaluate(async () => { await window.preloadAssets(); return window.extractLayout(); });
  writeFileSync(resolve(OUT, slug + '.json'), JSON.stringify(res));
  const inFrame = [];
  (function walk(ns) { for (const n of ns) { if (n.text) inFrame.push(n.text); walk(n.children || []); } })(res.tree);
  console.log('\n== ' + slug + ' (INSIDE the 390px frame)\n' + inFrame.join(' | ').slice(0, 900));
};

await page.goto(BASE + '/parallel', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(8000);
await page.goto(BASE + '/onboarding?mode=create', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(4000);
await install();

await page.evaluate(async (s) => {
  const g = { url: location.pathname, states: [{ slug: 'x', board: 'x', page: 'x', steps: s }] };
  return await window.captureStates(g, {});
}, [
  { act: 'type', placeholder: 'Enter a name', value: 'Probe Wallet' },
  { act: 'click', text: 'This is a self-custodial wallet' },
  { act: 'click', text: 'If you lose your device' },
  { act: 'click', text: 'If your iCloud or Google account is compromised' },
  { act: 'click', text: 'I agree to the' },
  { act: 'wait', ms: 500 },
]);
await install();
await page.evaluate(() => {
  const el = [...document.querySelectorAll('[role="button"],button')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .filter((e) => (e.innerText || '').trim() === 'Create Wallet').pop();
  if (!el) throw new Error('no Create Wallet button');
  for (const ev of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    el.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true, view: window }));
  }
});
await page.waitForTimeout(6000);
await shot('_probe-onb-create-success');
await browser.close();
