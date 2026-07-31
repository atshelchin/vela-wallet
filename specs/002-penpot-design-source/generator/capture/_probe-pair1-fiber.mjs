// Pair 1, decisive: read RpcTroubleBanner's ACTUAL props out of the React fiber tree
// (Metro dev build is unminified, so component function names survive).
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8083';
const OUT = '/private/tmp/claude-501/-Volumes-data-production-vela-wallet/8547bccd-7d8f-4d5b-a44a-869806429155/scratchpad';

const READ = () => {
  const key = Object.keys(document.body).find((k) => k.startsWith('__reactContainer$'))
    || Object.keys(document.querySelector('#root') || {}).find((k) => k.startsWith('__reactContainer$'));
  let root = document.body[key];
  if (!root) {
    const el = document.querySelector('#root') || document.body.firstElementChild;
    const k2 = Object.keys(el || {}).find((k) => k.startsWith('__reactContainer$') || k.startsWith('__reactFiber$'));
    root = el ? el[k2] : null;
  }
  if (!root) return { err: 'no fiber root' };
  while (root.return) root = root.return;
  const found = [];
  const seen = new Set();
  const walk = (f, d) => {
    if (!f || seen.has(f) || d > 400) return;
    seen.add(f);
    const t = f.elementType || f.type;
    const n = typeof t === 'function' ? (t.displayName || t.name) : null;
    if (n && /RpcTroubleBanner|HomeScreen|SegmentedToggle/.test(n)) {
      const p = f.memoizedProps || {};
      found.push({
        comp: n,
        chainIds: p.chainIds,
        value: p.value,
        options: Array.isArray(p.options) ? p.options.map((o) => o.key) : undefined,
        rendered: !!f.child,
      });
    }
    walk(f.child, d + 1);
    walk(f.sibling, d + 1);
  };
  walk(root, 0);
  return { found };
};

const runs = [
  ['parallel-fail-all', '/parallel', [['failRpc', 'all']]],
  ['parallel-fail-gnosis', '/parallel', [['failRpc', 100]]],
  ['parallel-ratelimit-all', '/parallel', [['rateLimitRpc', 'all']]],
  ['wallet-fail-all', '/wallet', [['failRpc', 'all']]],
];

const browser = await chromium.launch();
for (const [name, url, seed] of runs) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const page = await ctx.newPage();
  await page.addInitScript((s) => { globalThis.__VELA_FAULT_INIT__ = s; }, seed);
  await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(35000);
  const r = await page.evaluate(READ);
  const txt = await page.evaluate(() => ({
    inner: (document.body.innerText || '').replace(/\n+/g, ' | ').slice(0, 500),
    banner: /RPC unavailable/i.test(document.body.textContent || ''),
    rpc: globalThis.__velaRpcState ? globalThis.__velaRpcState.failed().length : -1,
  }));
  console.log('#####', name);
  console.log('  fiber :', JSON.stringify(r).slice(0, 700));
  console.log('  banner:', txt.banner ? 'YES' : 'no', '| failedRpcChains:', txt.rpc);
  console.log('  text  :', txt.inner);
  await page.screenshot({ path: `${OUT}/fiber-${name}.png` });
  await ctx.close();
}
await browser.close();
