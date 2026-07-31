import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 950 }, deviceScaleFactor: 2 });
await p.goto('http://127.0.0.1:8083/parallel', { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(6000);
const tap = async (t) => p.evaluate((txt) => {
  const el = [...document.querySelectorAll('[role="button"],button,[tabindex]')]
    .find(e => (e.textContent||'').trim().toLowerCase().includes(String(txt).toLowerCase()));
  if (!el) return 'not found: ' + txt;
  for (const ev of ['pointerdown','mousedown','pointerup','mouseup','click'])
    el.dispatchEvent(new MouseEvent(ev, { bubbles:true, cancelable:true, view:window }));
  return 'ok';
}, t);
const texts = async () => p.evaluate(() => {
  const f = [...document.querySelectorAll('div')].find(d => { const r=d.getBoundingClientRect(); return Math.abs(r.width-390)<=2 && r.height>600; });
  return f ? [...f.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.textContent||'').trim()).map(e=>e.textContent.trim()).slice(0,28) : [];
});
console.log('vela?', await p.evaluate(() => typeof window.vela));
console.log('ASSETS tap:', await tap('Assets')); await p.waitForTimeout(2500);
console.log('assets texts:', JSON.stringify(await texts()));
await p.screenshot({ path: '/tmp/exp-assets.png' });
console.log('failRpc:', await p.evaluate(() => { try { window.vela.clear(); window.vela.failRpc('all'); return 'ok'; } catch(e){ return String(e); } }));
await tap('Activity'); await p.waitForTimeout(1200); await tap('Assets'); await p.waitForTimeout(6000);
console.log('after failRpc:', JSON.stringify(await texts()));
await p.screenshot({ path: '/tmp/exp-rpcfail.png' });
await b.close();
