import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 950 }, deviceScaleFactor: 2 });
await p.goto('http://127.0.0.1:8083/clear-signing-test', { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(5000);
await p.evaluate(() => {
  const el = [...document.querySelectorAll('[role="button"],button,[tabindex]')]
    .find(x => (x.textContent||'').trim().startsWith('ERC-20 Approve (Unlimited)'));
  for (const ev of ['pointerdown','mousedown','pointerup','mouseup','click'])
    el.dispatchEvent(new MouseEvent(ev, {bubbles:true,cancelable:true,view:window}));
});
await p.waitForTimeout(3500);
const info = await p.evaluate(() => {
  const all = [...document.querySelectorAll('div')];
  const backdrops = all.filter(d => /rgba\(0, 0, 0, 0\.3/.test(getComputedStyle(d).backgroundColor));
  const describe = (d) => { const r=d.getBoundingClientRect(); return { w:Math.round(r.width), h:Math.round(r.height), top:Math.round(r.top), kids:d.children.length, bg:getComputedStyle(d).backgroundColor }; };
  return {
    backdrops: backdrops.map(describe),
    parents: backdrops.map(d => d.parentElement ? describe(d.parentElement) : null),
    parentTexts: backdrops.map(d => (d.parentElement?.innerText||'').slice(0,70).replace(/\n/g,' | ')),
  };
});
console.log(JSON.stringify(info, null, 1));
await b.close();
