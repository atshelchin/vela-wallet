import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 950 }, deviceScaleFactor: 2 });
const texts = async () => p.evaluate(() => {
  const f = [...document.querySelectorAll('div')].find(d => { const r=d.getBoundingClientRect(); return Math.abs(r.width-390)<=2 && r.height>600; });
  return f ? [...f.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.textContent||'').trim()).map(e=>e.textContent.trim()) : [];
});
await p.goto('http://127.0.0.1:8083/wallet', { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(5000);
await p.evaluate(() => { window.vela.clear(); window.vela.failRpc('all'); });
await p.evaluate(() => { history.pushState({}, '', '/receive'); window.dispatchEvent(new PopStateEvent('popstate', {state:{}})); });
await p.waitForTimeout(2000);
await p.evaluate(() => { history.pushState({}, '', '/wallet'); window.dispatchEvent(new PopStateEvent('popstate', {state:{}})); });
await p.waitForTimeout(14000);
const t = await texts();
console.log('texts:', JSON.stringify(t.slice(0,26)));
console.log('banner-ish:', t.filter(x => /rpc|unavailable|fix|couldn|retry|failing|trouble/i.test(x)));
await p.screenshot({ path: '/tmp/exp3-wallet-rpcfail.png' });
await b.close();
