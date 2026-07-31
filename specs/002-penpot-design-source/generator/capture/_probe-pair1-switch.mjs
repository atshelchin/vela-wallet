// Last chance for the banner: a path that CANNOT hit the 5-min token cache —
// load clean, arm the fault at runtime, then switch account (new address =>
// fresh fetch with the failure callback wired). Sample the fiber throughout.
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
  let chainIds = null;
  const walk = (f, d) => {
    if (!f || seen.has(f) || d > 400) return;
    seen.add(f);
    const t = f.elementType || f.type;
    const n = typeof t === 'function' ? (t.displayName || t.name) : null;
    if (n === 'RpcTroubleBanner') chainIds = (f.memoizedProps || {}).chainIds;
    walk(f.child, d + 1); walk(f.sibling, d + 1);
  };
  walk(root, 0);
  return {
    chainIds,
    onScreen: /RPC unavailable/i.test(document.body.textContent || ''),
    stale: /still updating|couldn.t be priced/i.test(document.body.textContent || ''),
    who: ((document.body.innerText || '').match(/Parallel \w+/) || [''])[0],
    total: ((document.body.innerText || '').match(/\$[\d.,]+/) || [''])[0],
  };
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
const page = await ctx.newPage();
await page.goto(BASE + '/parallel', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(18000);
console.log('clean:', JSON.stringify(await page.evaluate(READ)));

// arm the hard failure at runtime, then open the account switcher and pick another account
console.log('arm  :', await page.evaluate(() => window.vela.failRpc('all')));
const opened = await page.evaluate(() => {
  const el = [...document.querySelectorAll('[role="button"],button,[tabindex]')]
    .find((e) => /Parallel One/.test(e.innerText || ''));
  if (!el) return 'no account chip';
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
    el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
  return 'tapped account chip';
});
await page.waitForTimeout(2500);
console.log('open :', opened, '|', (await page.evaluate(() => (document.body.innerText || '').replace(/\n+/g, ' | '))).slice(0, 300));

const picked = await page.evaluate(() => {
  const el = [...document.querySelectorAll('[role="button"],button,[tabindex]')]
    .filter((e) => /Parallel (Two|2|Second)/i.test(e.innerText || ''));
  if (!el.length) return 'no second account';
  const t2 = el[el.length - 1];
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
    t2.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
  return 'picked ' + (t2.innerText || '').trim().slice(0, 30).replace(/\n/g, '/');
});
console.log('pick :', picked);

let everShown = false;
for (let s = 1; s <= 40; s++) {
  await page.waitForTimeout(1000);
  const r = await page.evaluate(READ);
  console.log(`t=${String(s).padStart(2)}s chainIds=${JSON.stringify(r.chainIds)} onScreen=${r.onScreen} stale=${r.stale} who=${r.who} total=${r.total}`);
  if (r.onScreen && !everShown) {
    everShown = true;
    await page.screenshot({ path: `${OUT}/pair1-banner-after-switch.png` });
    console.log('   >>> BANNER ON SCREEN — screenshot saved');
  }
}
console.log('banner ever shown:', everShown);
await browser.close();
