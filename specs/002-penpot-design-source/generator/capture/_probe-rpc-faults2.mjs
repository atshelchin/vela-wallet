// Probe 2: same three runs, but (a) real Playwright clicks on the Assets tab,
// (b) textContent (includes opacity-0 / clipped nodes) not just innerText.
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8083';
const OUT = '/private/tmp/claude-501/-Volumes-data-production-vela-wallet/8547bccd-7d8f-4d5b-a44a-869806429155/scratchpad';

const runs = [
  ['baseline', null],
  ['ratelimit', [['rateLimitRpc', 'all']]],
  ['fail', [['failRpc', 'all']]],
];

const browser = await chromium.launch();
for (const [name, seed] of runs) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const page = await ctx.newPage();
  if (seed) await page.addInitScript((s) => { globalThis.__VELA_FAULT_INIT__ = s; }, seed);
  await page.goto(BASE + '/parallel', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(20000);

  // real click (trusted event) on the Assets tab
  let clicked = 'n/a';
  try {
    const el = page.locator('div[role="button"]', { hasText: /^Assets$/ }).first();
    await el.click({ timeout: 5000 });
    clicked = 'ok';
  } catch (e) { clicked = 'FAILED ' + String(e).slice(0, 80); }
  await page.waitForTimeout(4000);

  const info = await page.evaluate(() => ({
    inner: (document.body.innerText || '').replace(/\n+/g, ' | ').slice(0, 1200),
    hasBannerTC: /RPC unavailable/i.test(document.body.textContent || ''),
    rpc: globalThis.__velaRpcState
      ? { failed: globalThis.__velaRpcState.failed().length, rateLimited: globalThis.__velaRpcState.rateLimited().length }
      : 'none',
  }));
  console.log('##### RUN', name, '| assets-click:', clicked);
  console.log('  rpc counts   :', JSON.stringify(info.rpc));
  console.log('  banner(inner):', /RPC unavailable/i.test(info.inner) ? 'YES' : 'no',
              '| banner(textContent):', info.hasBannerTC ? 'YES' : 'no');
  console.log('  text         :', info.inner);
  await page.screenshot({ path: `${OUT}/rpc2-${name}.png` });
  await ctx.close();
}
await browser.close();
