// Pair 1 root cause: call the app's OWN fetchTokens through the Metro module
// registry with an onFailedChains spy, under failRpc('all') and failRpc(100).
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8083';

const PROBE = async (seedLabel) => {
  const g = globalThis;
  if (typeof g.__r !== 'function' || !g.__c) return { err: 'no metro registry (__r/__c)' };
  const mods = g.__c();
  let walletApi = null, rpcPool = null;
  for (const [id, m] of Object.entries(mods)) {
    const e = m && m.publicModule && m.publicModule.exports;
    if (!e) continue;
    if (typeof e.fetchTokens === 'function' && !walletApi) walletApi = { id, e };
    if (typeof e.getFailedRpcChains === 'function' && !rpcPool) rpcPool = { id, e };
  }
  if (!walletApi) return { err: 'fetchTokens module not found', n: Object.keys(mods).length };
  const addr = (g.__velaProbeAddr || '');
  const seen = { onFailed: 'NOT CALLED', threw: null, tokens: -1 };
  try {
    const toks = await walletApi.e.fetchTokens(addr, {
      forceRefresh: true,
      onFailedChains: (ids) => { seen.onFailed = ids; },
    });
    seen.tokens = toks.length;
  } catch (err) {
    seen.threw = String((err && err.message) || err).slice(0, 160);
  }
  seen.poolFailed = rpcPool ? [...rpcPool.e.getFailedRpcChains()] : 'n/a';
  seen.label = seedLabel;
  return seen;
};

const runs = [
  ['failRpc-all', [['failRpc', 'all']]],
  ['failRpc-100', [['failRpc', 100]]],
];

const browser = await chromium.launch();
for (const [name, seed] of runs) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const page = await ctx.newPage();
  await page.addInitScript((s) => { globalThis.__VELA_FAULT_INIT__ = s; }, seed);
  await page.goto(BASE + '/parallel', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(18000);
  // grab the active account address off the rendered header
  await page.evaluate(() => {
    const m = (document.body.innerText || '').match(/0x[0-9a-fA-F]{6}/);
    globalThis.__velaProbeAddr = '0xD40086Ce7B0F5A9C0d9dC2C41E5CD0Ce4Fde130b';
    return m && m[0];
  });
  const r = await page.evaluate(PROBE, name);
  console.log('#####', name, '=>', JSON.stringify(r));
  await ctx.close();
}
await browser.close();
