// _probe-tabs6.mjs — does the rendered-only filter renumber clickNth on the routes that use it?
// clickNth appears only under /wallet (n:1) and /connect (n:2). Read-only.
import { chromium } from 'playwright';
const b = await chromium.launch();
for (const path of ['/wallet', '/connect', '/parallel']) {
  const p = await b.newPage({ viewport: { width: 1280, height: 950 }, deviceScaleFactor: 1 });
  await p.goto('http://127.0.0.1:8083' + path, { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(9000);
  const r = await p.evaluate(() => {
    const raw = [...document.querySelectorAll('[role="button"],button,[tabindex]')];
    const vis = raw.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    const d = (e) => e ? ((e.getAttribute('aria-label') || (e.innerText || '').trim().split('\n')[0] || '(no label)').slice(0, 34)
      + (e.getBoundingClientRect().width > 0 ? '' : '  [HIDDEN]')) : '(none)';
    return {
      counts: { raw: raw.length, rendered: vis.length },
      before: [0, 1, 2, 3].map((i) => i + ': ' + d(raw[i])),
      after: [0, 1, 2, 3].map((i) => i + ': ' + d(vis[i])),
    };
  });
  console.log('\n' + path, JSON.stringify(r.counts));
  console.log('  clickable() TODAY   ', JSON.stringify(r.before, null, 0));
  console.log('  clickable() FILTERED', JSON.stringify(r.after, null, 0));
  await p.close();
}
await b.close();
