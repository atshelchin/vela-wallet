// Does a cached total survive a reload, so the rate-limited Home can show it?
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8083';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
const page = await ctx.newPage();

await page.goto(BASE + '/parallel', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(20000);
const after = await page.evaluate(() => ({
  shown: (document.body.innerText || '').match(/\$[\d.,]+/g),
  cache: localStorage.getItem('vela.balanceCache'),
}));
console.log('clean load  :', JSON.stringify(after));

await page.addInitScript(() => { globalThis.__VELA_FAULT_INIT__ = [['rateLimitRpc', 'all']]; });
await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(25000);
const r2 = await page.evaluate(() => ({
  shown: (document.body.innerText || '').match(/\$[\d.,]+/g),
  cache: localStorage.getItem('vela.balanceCache'),
  text: (document.body.innerText || '').replace(/\n+/g, ' | ').slice(0, 300),
}));
console.log('rate-limited:', JSON.stringify(r2));
await browser.close();
