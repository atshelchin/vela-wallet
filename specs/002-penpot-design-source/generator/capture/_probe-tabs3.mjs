// _probe-tabs3.mjs — confirm the mechanism and validate the fix.
//
//  A) fire() on the FIRST byText match (a display:none copy of HomeScreen kept by the router)
//  B) fire() on the VISIBLE match
//  C) the proposed fix: byText() restricted to elements that are actually rendered
//  D) same fix for Connections, and the /send screen's own duplicate count
//
// Truth signal is document.body.innerText — innerText EXCLUDES display:none subtrees, which is the
// whole point: el.innerText on a display:none element falls back to textContent, so the hidden copy
// still matches byText while contributing nothing to the rendered screen.
import { chromium } from 'playwright';
const SHOT = process.env.SHOT_DIR || '/tmp';

const b = await chromium.launch();

const boot = async (path = '/parallel') => {
  const p = await b.newPage({ viewport: { width: 1280, height: 950 }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).split('\n')[0]));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 160)); });
  await p.goto('http://127.0.0.1:8083' + path, { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(9000);
  errs.length = 0;                       // ignore boot-time noise
  return { p, errs };
};

// visible-only truth about which tab is showing
const visibleState = (p) => p.evaluate(() => {
  const t = document.body.innerText || '';
  return {
    tab: /No activity yet/i.test(t) ? 'activity'
      : /\+\s*Add/.test(t) ? 'assets'
      : /No active connection/i.test(t) ? 'connections' : 'unknown',
    logbox: /Uncaught Error|Call Stack/i.test(t),
    snippet: t.replace(/\s+/g, ' ').slice(0, 150),
  };
});

const CASES = {
  'A fire() on FIRST byText match (today)': async (p, label) => p.evaluate((label) => {
    const all = [...document.querySelectorAll('[role="button"],button,[tabindex]')];
    const el = all.filter((e) => (e.innerText || '').trim() === label)[0];
    const r = el.getBoundingClientRect();
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    return { idx: all.indexOf(el), rect: [r.width, r.height], hidden: !el.offsetParent };
  }, label),

  'B fire() on the VISIBLE match': async (p, label) => p.evaluate((label) => {
    const all = [...document.querySelectorAll('[role="button"],button,[tabindex]')];
    const el = all.filter((e) => (e.innerText || '').trim() === label && e.getBoundingClientRect().width > 0)[0];
    const r = el.getBoundingClientRect();
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    return { idx: all.indexOf(el), rect: [r.width, r.height], hidden: !el.offsetParent };
  }, label),

  'C PROPOSED FIX: clickable() filtered to rendered elements': async (p, label) => p.evaluate((label) => {
    // the exact proposed replacement for capture-states.js clickable()
    const clickable = () => [...document.querySelectorAll('[role="button"],button,[tabindex]')]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    const byText = (t, nth) => {
      const want = String(t).toLowerCase();
      const hits = clickable().filter((e) => {
        const s = (e.innerText || '').trim().toLowerCase();
        return s === want || s.startsWith(want + '\n');
      });
      const loose = hits.length ? hits : clickable().filter((e) => (e.innerText || '').toLowerCase().includes(want));
      return loose[nth || 0] || null;
    };
    const el = byText(label);
    const r = el.getBoundingClientRect();
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    return { rect: [r.width, r.height], hidden: !el.offsetParent, clickableCount: clickable().length };
  }, label),
};

for (const label of ['Assets', 'Connections']) {
  for (const [name, run] of Object.entries(CASES)) {
    const { p, errs } = await boot();
    const before = await visibleState(p);
    let info = null, thrown = null;
    try { info = await run(p, label); } catch (e) { thrown = String(e).split('\n')[0]; }
    await p.waitForTimeout(4000);
    const after = await visibleState(p);
    console.log(`\n--- ${label} / ${name}`);
    console.log('   target:', JSON.stringify(info), thrown ? ('THREW ' + thrown) : '');
    console.log('   tab:', before.tab, '->', after.tab, after.tab === label.toLowerCase() ? '  ✅ SWITCHED' : '  ❌ NOT SWITCHED');
    console.log('   logbox overlay on screen:', after.logbox);
    console.log('   errors:', JSON.stringify(errs.slice(0, 3)));
    console.log('   body:', after.snippet);
    if (name.startsWith('C')) await p.screenshot({ path: SHOT + '/tabs3-fix-' + label + '.png' });
    await p.close();
  }
}

// how widespread are these hidden duplicates?
for (const path of ['/parallel', '/send', '/wallet']) {
  const { p } = await boot(path);
  const n = await p.evaluate(() => {
    const all = [...document.querySelectorAll('[role="button"],button,[tabindex]')];
    const hidden = all.filter((e) => { const r = e.getBoundingClientRect(); return r.width === 0 || r.height === 0; });
    return {
      total: all.length,
      hidden: hidden.length,
      firstHiddenIdx: all.indexOf(hidden[0]),
      hiddenLabels: hidden.slice(0, 8).map((e) => (e.innerText || '').trim().slice(0, 24)),
    };
  });
  console.log('\nDUPLICATE CENSUS ' + path + ':', JSON.stringify(n));
  await p.close();
}

await b.close();
