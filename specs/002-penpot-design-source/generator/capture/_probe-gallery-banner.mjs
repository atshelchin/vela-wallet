// Where CAN the RPC-trouble banner be seen? design-gallery renders it with fixed props.
import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:8083';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
const page = await ctx.newPage();
await page.goto(BASE + '/design-gallery', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(6000);
const r = await page.evaluate(() => {
  const tc = document.body.textContent || '';
  const hits = [...document.querySelectorAll('*')]
    .filter((e) => /RPC unavailable/i.test(e.textContent || '') && e.children.length === 0)
    .map((e) => (e.textContent || '').trim());
  return { present: /RPC unavailable/i.test(tc), samples: [...new Set(hits)].slice(0, 6) };
});
console.log('design-gallery banner:', JSON.stringify(r));
await browser.close();
