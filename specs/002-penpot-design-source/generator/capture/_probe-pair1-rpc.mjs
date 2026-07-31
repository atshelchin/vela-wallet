// Pair 1: home-rate-limited vs home-rpc-trouble.
// Load /parallel CLEAN first so balance-cache persists a last-known-good total,
// THEN reload the same context with the fault pre-armed at module load
// (__VELA_FAULT_INIT__) so the very first balance read runs under the fault.
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8083';
const OUT = '/private/tmp/claude-501/-Volumes-data-production-vela-wallet/8547bccd-7d8f-4d5b-a44a-869806429155/scratchpad';

const runs = [
  ['ratelimit', [['rateLimitRpc', 'all']]],
  ['fail', [['failRpc', 'all']]],
];

const browser = await chromium.launch();
for (const [name, seed] of runs) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const page = await ctx.newPage();

  // pass 1: clean, so a good total lands in balance-cache (localStorage)
  await page.goto(BASE + '/parallel', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(18000);
  const clean = await page.evaluate(() => (document.body.innerText || '').replace(/\n+/g, ' | '));
  console.log('#####', name, '| pass1 clean:', clean.slice(0, 120));

  // pass 2: same profile, fault armed BEFORE the first render
  await page.addInitScript((s) => { globalThis.__VELA_FAULT_INIT__ = s; }, seed);
  await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(30000);

  const info = await page.evaluate(() => {
    const tc = document.body.textContent || '';
    return {
      inner: (document.body.innerText || '').replace(/\n+/g, ' | ').slice(0, 700),
      banner: /RPC unavailable/i.test(tc),
      fixLink: /(^|\W)Fix(\W|$)/.test(tc),
      stale: /still updating/i.test(tc),
      rpc: globalThis.__velaRpcState
        ? { failed: globalThis.__velaRpcState.failed(), rateLimited: globalThis.__velaRpcState.rateLimited() }
        : 'none',
    };
  });
  console.log('  rpc     :', JSON.stringify(info.rpc));
  console.log('  BANNER  :', info.banner ? 'YES ("... RPC unavailable")' : 'no',
              '| Fix link:', info.fixLink ? 'YES' : 'no',
              '| stale notice:', info.stale ? 'YES' : 'no');
  console.log('  text    :', info.inner);
  await page.screenshot({ path: `${OUT}/pair1-${name}.png` });
  await ctx.close();
}
await browser.close();
