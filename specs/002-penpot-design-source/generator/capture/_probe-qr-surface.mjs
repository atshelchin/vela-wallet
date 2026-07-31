// _probe-qr-surface.mjs — what does the QR scanner overlay look like in the DOM on web?
// Answers three questions the recipe author needs:
//   1. is the scanner portalled OUTSIDE the 390px phone frame? (rootBg/theme check reads the frame)
//   2. does getUserMedia resolve in this browser? (torch button only appears once cameraReady)
//   3. what clickable controls does the header expose?
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8083';
const FAKE = process.argv.includes('--fake-camera');
const browser = await chromium.launch({
  args: FAKE ? ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] : [],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 }, deviceScaleFactor: 2, hasTouch: true });
if (FAKE) await ctx.grantPermissions(['camera'], { origin: BASE });
const page = await ctx.newPage();
page.on('console', (m) => { const t = m.text(); if (/QR|camera|getUserMedia/i.test(t)) console.log('  console:', t.slice(0, 140)); });
await page.goto(BASE + '/parallel', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(9000);

await page.evaluate(() => {
  const el = [...document.querySelectorAll('[role="button"],button,[tabindex]')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .find((e) => /^Scan$/.test(e.getAttribute('aria-label') || ''));
  if (!el) throw new Error('no Scan FAB');
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
  }
});
await page.waitForTimeout(Number(process.env.WAIT || 5000));

const info = await page.evaluate(() => {
  const frames = [...document.querySelectorAll('div')]
    .filter((e) => { const r = e.getBoundingClientRect(); return Math.abs(r.width - 390) <= 2 && r.height > 600; })
    .map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), bg: getComputedStyle(e).backgroundColor }; });
  const bodyKids = [...document.body.children].map((e) => {
    const r = e.getBoundingClientRect();
    return { tag: e.tagName, id: e.id, cls: String(e.className).slice(0, 40), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), txt: (e.innerText || '').replace(/\n/g, ' | ').slice(0, 90) };
  });
  // where does "Scan QR" actually live?
  const title = [...document.querySelectorAll('div,span')].filter((e) => (e.textContent || '').trim() === 'Scan QR').pop();
  let chain = [];
  for (let e = title; e && e !== document.body; e = e.parentElement) {
    const r = e.getBoundingClientRect();
    chain.push(e.tagName + '[' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' bg=' + getComputedStyle(e).backgroundColor + ']');
  }
  const buttons = [...document.querySelectorAll('[role="button"],button,[tabindex]')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .map((e) => { const r = e.getBoundingClientRect(); return { al: e.getAttribute('aria-label'), txt: (e.innerText || '').trim().slice(0, 24), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; });
  const video = [...document.querySelectorAll('video')].map((v) => ({ ready: v.readyState, hasStream: !!v.srcObject, w: v.videoWidth, h: v.videoHeight }));
  return { frames, bodyKids, chain, buttons, video, body: (document.body.innerText || '').replace(/\n/g, ' | ').slice(0, 400) };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
