import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 950 }, deviceScaleFactor: 2 });
await p.goto('http://127.0.0.1:8083/parallel', { waitUntil: 'networkidle', timeout: 60000 });
for (const wait of [6000, 10000, 15000]) {
  await p.waitForTimeout(wait);
  const t = await p.evaluate(() => {
    const f = [...document.querySelectorAll('div')].find(d => { const r=d.getBoundingClientRect(); return Math.abs(r.width-390)<=2 && r.height>600; });
    return f ? [...f.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.textContent||'').trim()).map(e=>e.textContent.trim()) : [];
  });
  console.log('after', wait, ':', t.includes('No activity yet') ? 'EMPTY' : 'HAS ROWS', '|', JSON.stringify(t.filter(x=>/Sent|Received|ago|20\d\d/.test(x)).slice(0,6)));
}
await b.close();
