// Pair 3: what does the harness's `scroll` act actually do on /settings?
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8083';
const OUT = '/private/tmp/claude-501/-Volumes-data-production-vela-wallet/8547bccd-7d8f-4d5b-a44a-869806429155/scratchpad';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
const page = await ctx.newPage();
// parallel first so Settings has a real account on it (matches the committed dump)
await page.goto(BASE + '/parallel', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(12000);
await page.goto(BASE + '/settings', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(4000);

const before = await page.evaluate(() => {
  const sc = [...document.querySelectorAll('div')].find((e) => e.scrollHeight > e.clientHeight + 40 && e.clientHeight > 300);
  const y = (t) => { const n = [...document.querySelectorAll('div')].find((e) => (e.innerText||'').trim() === t);
                     return n ? Math.round(n.getBoundingClientRect().y) : null; };
  return {
    scroller: sc ? { scrollHeight: sc.scrollHeight, clientHeight: sc.clientHeight, top: sc.scrollTop,
                     max: sc.scrollHeight - sc.clientHeight } : 'NONE FOUND',
    settingsTitleY: y('Settings'), signOutY: y('Sign Out'), developerY: y('Developer'),
  };
});
console.log('BEFORE:', JSON.stringify(before));
await page.screenshot({ path: `${OUT}/settings-top.png` });

// the harness's scroll act, verbatim: y === 'bottom'
const did = await page.evaluate(() => {
  const sc = [...document.querySelectorAll('div')].find((e) => e.scrollHeight > e.clientHeight + 40 && e.clientHeight > 300);
  if (sc) { sc.scrollTop = sc.scrollHeight; return 'scrolled element to ' + sc.scrollTop; }
  window.scrollTo(0, document.body.scrollHeight); return 'fell back to window.scrollTo';
});
await page.waitForTimeout(1200);
const after = await page.evaluate(() => {
  const sc = [...document.querySelectorAll('div')].find((e) => e.scrollHeight > e.clientHeight + 40 && e.clientHeight > 300);
  const y = (t) => { const n = [...document.querySelectorAll('div')].find((e) => (e.innerText||'').trim() === t);
                     return n ? Math.round(n.getBoundingClientRect().y) : null; };
  return {
    top: sc ? sc.scrollTop : null,
    settingsTitleY: y('Settings'), signOutY: y('Sign Out'), developerY: y('Developer'),
    text: (document.body.innerText || '').replace(/\n+/g, ' | ').slice(0, 400),
  };
});
console.log('SCROLL:', did);
console.log('AFTER :', JSON.stringify(after));
await page.screenshot({ path: `${OUT}/settings-bottom.png` });
await browser.close();
