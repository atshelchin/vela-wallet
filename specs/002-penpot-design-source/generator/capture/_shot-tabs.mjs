import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 950 }, deviceScaleFactor: 2 });
await p.goto('http://127.0.0.1:8083/parallel', { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(7000);
const frame = await p.evaluate(() => {
  const el = [...document.querySelectorAll('div')].find(d => Math.abs(d.getBoundingClientRect().width - 390) <= 2 && d.getBoundingClientRect().height > 600);
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: 320 };
});
await p.screenshot({ path: '/tmp/home-tabs.png', clip: frame });
await b.close();
