// _probe-tabs2.mjs — there are TWO "Assets" buttons on /parallel. Which one does byText() pick,
// which one is on screen, and what does a screenshot say after clicking each?
// Read-only except for screenshots written to the scratchpad. No dumps.
import { chromium } from 'playwright';
const SHOT = process.env.SHOT_DIR || '/tmp';
const URL = 'http://127.0.0.1:8083/parallel';

const boot = async (b) => {
  const p = await b.newPage({ viewport: { width: 1280, height: 950 }, deviceScaleFactor: 1 });
  await p.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(9000);
  return p;
};

const b = await chromium.launch();

// ── 1. census of every tab button ──────────────────────────────────────────────────────────────
const p = await boot(b);
const census = await p.evaluate(() => {
  const clickable = () => [...document.querySelectorAll('[role="button"],button,[tabindex]')];
  const all = clickable();
  const hiddenAncestor = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none') return 'display:none <' + n.tagName.toLowerCase() + ' class="' + (n.getAttribute('class') || '').slice(0, 60) + '">';
      if (cs.visibility === 'hidden') return 'visibility:hidden <' + n.tagName.toLowerCase() + '>';
      if (n.getAttribute('aria-hidden') === 'true') return 'aria-hidden <' + n.tagName.toLowerCase() + '>';
    }
    return null;
  };
  // every 390-wide frame candidate, in DOM order
  const frames = [...document.querySelectorAll('div')].filter((d) => {
    const r = d.getBoundingClientRect();
    return Math.abs(r.width - 390) <= 2 && r.height > 600;
  });
  const rows = [];
  all.forEach((el, i) => {
    const t = (el.innerText || '').trim();
    if (!['Activity', 'Assets', 'Connections'].includes(t)) return;
    const r = el.getBoundingClientRect();
    rows.push({
      i, text: t,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      offsetParent: !!el.offsetParent,
      hiddenBy: hiddenAncestor(el),
      inFrame0: frames[0] ? frames[0].contains(el) : null,
      ariaSelected: el.getAttribute('aria-selected'),
    });
  });
  return {
    rows,
    frameCount: frames.length,
    frame0Rect: frames[0] ? (() => { const r = frames[0].getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })() : null,
    // how many HomeScreen copies: count "Total balance" occurrences
    balanceLabels: [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && /Total balance/i.test(e.textContent || '')).length,
  };
});
console.log('CENSUS', JSON.stringify(census, null, 1));
await p.screenshot({ path: SHOT + '/tabs2-baseline.png' });
await p.close();

// ── 2. click the FIRST match (what byText does) vs the LAST match (what run-capture --click does) ──
for (const which of ['first', 'last']) {
  const pp = await boot(b);
  const info = await pp.evaluate((which) => {
    const clickable = () => [...document.querySelectorAll('[role="button"],button,[tabindex]')];
    const hits = clickable().filter((e) => (e.innerText || '').trim() === 'Assets');
    const el = which === 'first' ? hits[0] : hits[hits.length - 1];
    const r = el.getBoundingClientRect();
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    }
    return { hits: hits.length, idx: clickable().indexOf(el), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
  }, which);
  await pp.waitForTimeout(4000);
  await pp.screenshot({ path: SHOT + '/tabs2-assets-' + which + '.png' });
  // what does the VISIBLE frame say? read the frame that has non-zero on-screen area
  const visible = await pp.evaluate(() => {
    const frames = [...document.querySelectorAll('div')].filter((d) => {
      const r = d.getBoundingClientRect();
      return Math.abs(r.width - 390) <= 2 && r.height > 600;
    });
    return frames.map((f) => {
      const r = f.getBoundingClientRect();
      const leaves = [...f.querySelectorAll('*')].filter((e) => e.children.length === 0 && (e.textContent || '').trim()).map((e) => e.textContent.trim());
      return { rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, n: leaves.length, leaves: leaves.slice(0, 16) };
    });
  });
  console.log('\nCLICK ' + which.toUpperCase() + ':', JSON.stringify(info));
  console.log('  frames after:', JSON.stringify(visible, null, 1));
  await pp.close();
}

await b.close();
