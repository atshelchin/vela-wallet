import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 950 }, deviceScaleFactor: 2 });
const texts = async () => p.evaluate(() => {
  const f = [...document.querySelectorAll('div')].find(d => { const r=d.getBoundingClientRect(); return Math.abs(r.width-390)<=2 && r.height>600; });
  return f ? [...f.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.textContent||'').trim()).map(e=>e.textContent.trim()) : [];
});
await p.goto('http://127.0.0.1:8083/parallel', { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(6000);
console.log('vela api:', await p.evaluate(() => Object.keys(window.vela||{})));
await p.evaluate(() => { window.vela.clear(); window.vela.rateLimitRpc('all'); });
for (const u of ['/parallel/connect', '/parallel']) {
  await p.evaluate((x) => { history.pushState({}, '', x); window.dispatchEvent(new PopStateEvent('popstate', {state:{}})); }, u);
  await p.waitForTimeout(2500);
}
await p.waitForTimeout(14000);
const t = await texts();
console.log('degraded words:', t.filter(x => /estimate|rate|limit|updated|couldn|unavailable|retry/i.test(x)));
console.log('status:', await p.evaluate(() => { try { return window.vela.status(); } catch(e){ return String(e); } }));
await p.screenshot({ path: '/tmp/exp4.png' });
await b.close();
