// Probe: does rateLimitRpc('all') vs failRpc('all') produce a VISIBLY different Home?
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
  await page.waitForTimeout(22000);
  const info = await page.evaluate(() => ({
    text: (document.body.innerText || '').replace(/\n+/g, ' | ').slice(0, 900),
    rpc: globalThis.__velaRpcState
      ? { failed: globalThis.__velaRpcState.failed(), rateLimited: globalThis.__velaRpcState.rateLimited() }
      : 'no __velaRpcState',
    faults: globalThis.vela ? globalThis.vela.status() : 'no vela',
  }));
  console.log('##### RUN', name);
  console.log('  faults :', info.faults);
  console.log('  rpc    :', JSON.stringify(info.rpc));
  console.log('  banner?:', /RPC unavailable/i.test(info.text) ? 'YES' : 'no');
  console.log('  stale? :', /still updating|couldn.t be priced/i.test(info.text) ? 'YES' : 'no');
  console.log('  text   :', info.text);
  await page.screenshot({ path: `${OUT}/rpc-${name}.png` });
  await ctx.close();
}
await browser.close();
