import { chromium } from 'playwright';
const URL = process.argv[2] || 'http://127.0.0.1:8083/wallet';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
await p.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(4500);
const info = await p.evaluate(() => {
  const frame = Array.from(document.querySelectorAll('div')).find(d => {
    const r = d.getBoundingClientRect();
    return Math.abs(r.width - 390) <= 2 && r.height > 600;
  });
  const inFrame = frame ? Array.from(frame.querySelectorAll('*')).filter(e => e.children.length === 0 && (e.textContent||'').trim()) : [];
  return { hasFrame: !!frame,
    size: frame ? [Math.round(frame.getBoundingClientRect().width), Math.round(frame.getBoundingClientRect().height)] : null,
    texts: inFrame.map(e => (e.textContent||'').trim()).slice(0, 45) };
});
console.log(JSON.stringify(info, null, 1));
await p.screenshot({ path: '/tmp/probe-home.png', fullPage: false });
await b.close();
