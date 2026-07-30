import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 950 }, deviceScaleFactor: 2 });
await p.goto('http://127.0.0.1:8083/parallel', { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(5000);
const info = await p.evaluate(() => {
  const btns = [...document.querySelectorAll('[role="button"]')];
  return btns.map((e,i)=>({ i, label: e.getAttribute('aria-label'), text: (e.textContent||'').trim().slice(0,24) })).slice(0,12);
});
console.log(JSON.stringify(info, null, 1));
await b.close();
