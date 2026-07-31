// Pair 1, timeline: is the RPC-trouble banner ever on screen, and for how long?
// Sample RpcTroubleBanner's props once a second for 60s under failRpc('all').
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8083';
const OUT = '/private/tmp/claude-501/-Volumes-data-production-vela-wallet/8547bccd-7d8f-4d5b-a44a-869806429155/scratchpad';

const READ = () => {
  let el = document.querySelector('#root') || document.body.firstElementChild;
  const k = Object.keys(el || {}).find((x) => x.startsWith('__reactContainer$') || x.startsWith('__reactFiber$'));
  let root = el ? el[k] : null;
  if (!root) return { err: 'no fiber' };
  while (root.return) root = root.return;
  const seen = new Set();
  let chainIds = null, rendered = false;
  const walk = (f, d) => {
    if (!f || seen.has(f) || d > 400) return;
    seen.add(f);
    const t = f.elementType || f.type;
    const n = typeof t === 'function' ? (t.displayName || t.name) : null;
    if (n === 'RpcTroubleBanner') { chainIds = (f.memoizedProps || {}).chainIds; rendered = rendered || !!f.child; }
    walk(f.child, d + 1); walk(f.sibling, d + 1);
  };
  walk(root, 0);
  return {
    chainIds, rendered,
    onScreen: /RPC unavailable/i.test(document.body.textContent || ''),
    failedPool: globalThis.__velaRpcState ? globalThis.__velaRpcState.failed().length : -1,
  };
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
const page = await ctx.newPage();
await page.addInitScript(() => { globalThis.__VELA_FAULT_INIT__ = [['failRpc', 100]]; });
await page.goto(BASE + '/parallel', { waitUntil: 'commit', timeout: 60000 });

let shotTaken = false;
for (let s = 0; s <= 60; s++) {
  await page.waitForTimeout(1000);
  let r;
  try { r = await page.evaluate(READ); } catch (e) { r = { err: String(e).slice(0, 40) }; }
  const cid = r.chainIds === null || r.chainIds === undefined ? 'n/a' : JSON.stringify(r.chainIds);
  console.log(`t=${String(s).padStart(2)}s chainIds=${cid} rendered=${r.rendered} onScreen=${r.onScreen} pool=${r.failedPool}`);
  if (r.onScreen && !shotTaken) {
    shotTaken = true;
    await page.screenshot({ path: `${OUT}/pair1-banner-visible-gnosis.png` });
    console.log('   >>> screenshot taken while banner on screen');
  }
}
await browser.close();
