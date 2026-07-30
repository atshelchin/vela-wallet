import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
await p.goto('http://127.0.0.1:8083/parallel/wallet', { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(6000);
const info = await p.evaluate(() => {
  const frame = Array.from(document.querySelectorAll('div')).find(d => {
    const r = d.getBoundingClientRect(); return Math.abs(r.width - 390) <= 2 && r.height > 600;
  });
  const t = frame ? Array.from(frame.querySelectorAll('*')).filter(e => e.children.length===0 && (e.textContent||'').trim()).map(e=>e.textContent.trim()) : [];
  return { hasFrame: !!frame, texts: t.slice(0, 40),
    velaKeys: typeof window.vela === 'object' && window.vela ? Object.keys(window.vela) : (typeof window.vela) };
});
console.log(JSON.stringify(info, null, 1));
await p.screenshot({ path: '/tmp/probe-parallel.png' });
await b.close();
