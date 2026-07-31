// _probe-refute9-browser.mjs — confirm the /browser web short-circuit for all three URL variants,
// and check whether ANY browser chrome (top bar host, bottom bar, account pill) mounts on web.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 950 }, deviceScaleFactor: 1, hasTouch: true });
page.on('pageerror', (e) => console.error('PAGE ERROR:', String(e).slice(0, 160)));
const visible = () => page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('div,span,p,input')) {
    if (el.children.length) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') continue;
    const t = (el.textContent || '').trim();
    if (t) out.push(t);
  }
  return [...new Set(out)];
});
await page.goto('http://127.0.0.1:8083/parallel', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
for (const u of [
  '/browser?url=https%3A%2F%2Fapp.uniswap.org',
  '/browser',
  '/browser?url=javascript%3Aalert(1)',
  '/browser?url=http%3A%2F%2Fexample.com',
]) {
  await page.goto('http://127.0.0.1:8083' + u, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const t = await visible();
  const svgs = await page.evaluate(() => document.querySelectorAll('svg').length);
  console.log(`\n${u}\n  text: ${t.join(' | ').slice(0, 300)}\n  svg icons on page: ${svgs}`);
}
await browser.close();
