import { chromium } from 'playwright';
const b = await chromium.launch();
for (const path of ['/parallel', '/wallet', '/send', '/connect']) {
  const p = await b.newPage({ viewport: { width: 1280, height: 950 } });
  await p.goto('http://127.0.0.1:8083' + path, { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(9000);
  const r = await p.evaluate(() => {
    const raw = [...document.querySelectorAll('[role="button"],button,[tabindex]')];
    const rect = raw.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    const cv = raw.filter((e) => typeof e.checkVisibility === 'function'
      ? e.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true, opacityProperty: true })
      : true);
    const off = raw.filter((e) => e.offsetParent !== null);
    return { raw: raw.length, rect: rect.length, checkVisibility: cv.length, offsetParent: off.length,
             sameSet: rect.length === cv.length && rect.every((e, i) => e === cv[i]) };
  });
  console.log(path, JSON.stringify(r));
  await p.close();
}
await b.close();
