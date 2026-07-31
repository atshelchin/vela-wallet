// _probe-tabs.mjs — why do the Home tab clicks in capture-states.js silently do nothing?
//
// Opens /parallel at 1280x950, resolves "Assets"/"Connections" exactly the way capture-states.js
// does (byText over [role=button],button,[tabindex] matching innerText), then tries each click
// method against a DOM signature taken before and after. Read-only: writes no dumps.
//
//   node specs/002-penpot-design-source/generator/capture/_probe-tabs.mjs
import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:8083/parallel';
const SETTLE = 9000;

// ── page-side helpers, injected once per load ──────────────────────────────────────────────────
const HELPERS = () => {
  const clickable = () => [...document.querySelectorAll('[role="button"],button,[tabindex]')];
  // verbatim copy of capture-states.js byText()
  const byText = (t, nth) => {
    const want = String(t).toLowerCase();
    const hits = clickable().filter((e) => {
      const s = (e.innerText || '').trim().toLowerCase();
      return s === want || s.startsWith(want + '\n') || s === want.toLowerCase();
    });
    const loose = hits.length ? hits : clickable().filter((e) => (e.innerText || '').toLowerCase().includes(want));
    return loose[nth || 0] || null;
  };
  const describe = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
    const top = document.elementFromPoint(cx, cy);
    const chain = [];
    for (let n = top; n && n !== document.body && chain.length < 6; n = n.parentElement) {
      chain.push(n.tagName.toLowerCase() + (n.getAttribute('role') ? '[role=' + n.getAttribute('role') + ']' : '') +
        (n.getAttribute('aria-label') ? '[al=' + n.getAttribute('aria-label') + ']' : ''));
    }
    return {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      ariaLabel: el.getAttribute('aria-label'),
      ariaSelected: el.getAttribute('aria-selected'),
      tabindex: el.getAttribute('tabindex'),
      className: (el.getAttribute('class') || '').slice(0, 120),
      innerText: (el.innerText || '').trim(),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      center: { cx, cy },
      // is the resolved node the thing a real pointer at its centre would hit?
      hitTestTop: top ? top.tagName.toLowerCase() + (top.getAttribute('role') ? '[role=' + top.getAttribute('role') + ']' : '') : null,
      hitIsSelfOrDescendant: !!(top && (top === el || el.contains(top))),
      hitChain: chain,
      descendantButtons: el.querySelectorAll('[role="button"],button').length,
      // what capture-states.js actually fires at: el.querySelector('[role=button],button') || el
      fireTargetIsSelf: !el.querySelector('[role="button"],button'),
      pointerEvents: getComputedStyle(el).pointerEvents,
      clickableIndex: clickable().indexOf(el),
    };
  };
  // Signature of "which tab is showing". Deliberately several independent cues.
  const sig = () => {
    const segs = [...document.querySelectorAll('[role="button"]')]
      .filter((e) => ['Activity', 'Assets', 'Connections'].includes((e.innerText || '').trim().split('\n')[0]))
      .map((e) => (e.innerText || '').trim().split('\n')[0] + '=' + e.getAttribute('aria-selected'));
    const frame = [...document.querySelectorAll('div')].find((d) => {
      const r = d.getBoundingClientRect();
      return Math.abs(r.width - 390) <= 2 && r.height > 600;
    });
    const leaves = frame
      ? [...frame.querySelectorAll('*')].filter((e) => e.children.length === 0 && (e.textContent || '').trim())
        .map((e) => e.textContent.trim())
      : [];
    const body = (document.body.innerText || '');
    return {
      selected: segs,
      noActivityYet: /No activity yet/i.test(body),
      hasAdd: /\+\s*Add|Add token/i.test(body),
      hasAssetsHeader: /\bASSETS\b/.test(body),
      hasNoConnections: /No (active )?connections?|Nothing connected|not connected/i.test(body),
      leafCount: leaves.length,
      leaves: leaves.slice(0, 24),
      hash: leaves.join('|').length + ':' + leaves.join('|').slice(0, 80),
    };
  };
  window.__p = { clickable, byText, describe, sig };
};

const boot = async (p) => {
  await p.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(SETTLE);
  await p.evaluate(HELPERS);
};

const sigOf = (p) => p.evaluate(() => window.__p.sig());
const diff = (a, b) => {
  const keys = ['selected', 'noActivityYet', 'hasAdd', 'hasAssetsHeader', 'hasNoConnections', 'leafCount', 'hash'];
  const d = {};
  for (const k of keys) {
    const av = JSON.stringify(a[k]), bv = JSON.stringify(b[k]);
    if (av !== bv) d[k] = av + ' -> ' + bv;
  }
  return d;
};

// ── the click methods under test ───────────────────────────────────────────────────────────────
const METHODS = {
  // 1. exactly what capture-states.js does today
  'M1 fire() MouseEvent seq, no coords (capture-states.js today)': async (p, label) =>
    p.evaluate((label) => {
      const el = window.__p.byText(label);
      const t = el.querySelector('[role="button"],button') || el;
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        t.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      }
      return t.tagName;
    }, label),

  // 2. a REAL trusted pointer sequence from the browser
  'M2 playwright locator.click() (real trusted pointer)': async (p, label) => {
    await p.locator(`[role="button"]:has-text("${label}")`).first().click({ timeout: 5000 });
    return 'real';
  },

  // 3. PointerEvent instead of MouseEvent for the pointer phases
  'M3 PointerEvent(pointerId,isPrimary) + mouse + click, no coords': async (p, label) =>
    p.evaluate((label) => {
      const el = window.__p.byText(label);
      const t = el.querySelector('[role="button"],button') || el;
      const pi = { bubbles: true, cancelable: true, view: window, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0, buttons: 1 };
      t.dispatchEvent(new PointerEvent('pointerdown', pi));
      t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1 }));
      t.dispatchEvent(new PointerEvent('pointerup', { ...pi, buttons: 0 }));
      t.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, button: 0, buttons: 0 }));
      t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, button: 0 }));
      return t.tagName;
    }, label),

  // 4. same MouseEvent sequence but WITH the element's centre coordinates
  'M4 MouseEvent seq WITH clientX/clientY at centre': async (p, label) =>
    p.evaluate((label) => {
      const el = window.__p.byText(label);
      const t = el.querySelector('[role="button"],button') || el;
      const r = t.getBoundingClientRect();
      const c = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        t.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0, ...c }));
      }
      return t.tagName;
    }, label),

  // 5. the plain DOM click() — no pointer phases at all
  'M5 el.click() only': async (p, label) =>
    p.evaluate((label) => {
      const el = window.__p.byText(label);
      const t = el.querySelector('[role="button"],button') || el;
      t.click();
      return t.tagName;
    }, label),

  // 6. fire at a DIFFERENT node in the chain: the deepest text node's element
  'M6 same seq fired on the deepest text descendant': async (p, label) =>
    p.evaluate((label) => {
      const el = window.__p.byText(label);
      const leaf = [...el.querySelectorAll('*')].filter((e) => e.children.length === 0 && (e.textContent || '').trim())[0] || el;
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        leaf.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      }
      return leaf.tagName + ':' + leaf.textContent.trim();
    }, label),

  // 7. fire at whatever a real pointer at the centre would actually hit
  'M7 same seq fired on document.elementFromPoint(centre)': async (p, label) =>
    p.evaluate((label) => {
      const el = window.__p.byText(label);
      const r = el.getBoundingClientRect();
      const t = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)) || el;
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        t.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      }
      return t.tagName;
    }, label),
};

const b = await chromium.launch();
const results = {};

for (const label of ['Assets', 'Connections']) {
  console.log('\n================ ' + label + ' ================');
  const p = await b.newPage({ viewport: { width: 1280, height: 950 }, deviceScaleFactor: 1 });
  await boot(p);

  // ── 1. what byText resolves to ──
  const desc = await p.evaluate((l) => {
    const el = window.__p.byText(l);
    const all = window.__p.clickable()
      .map((e, i) => ({ i, text: (e.innerText || '').trim().slice(0, 40), role: e.getAttribute('role'), al: e.getAttribute('aria-label') }))
      .filter((x) => x.text.toLowerCase().includes(l.toLowerCase()) || (x.al || '').toLowerCase().includes(l.toLowerCase()));
    return { resolved: window.__p.describe(el), candidates: all, clickableTotal: window.__p.clickable().length };
  }, label);
  console.log('byText resolves to:\n', JSON.stringify(desc.resolved, null, 2));
  console.log('candidates containing the label:', JSON.stringify(desc.candidates, null, 1));
  const base = await sigOf(p);
  console.log('baseline sig:', JSON.stringify(base, null, 1));
  await p.close();
  results[label] = { resolve: desc, baseline: base, methods: {} };

  // ── 2..4. each method on a FRESH page ──
  for (const [name, run] of Object.entries(METHODS)) {
    const pp = await b.newPage({ viewport: { width: 1280, height: 950 }, deviceScaleFactor: 1 });
    let fired = null, err = null;
    try {
      await boot(pp);
      const before = await sigOf(pp);
      try { fired = await run(pp, label); } catch (e) { err = String(e).split('\n')[0]; }
      await pp.waitForTimeout(3500);
      const after = await sigOf(pp);
      const d = diff(before, after);
      const changed = Object.keys(d).length > 0;
      results[label].methods[name] = { fired, err, changed, diff: d, after: { selected: after.selected, hash: after.hash, leaves: after.leaves } };
      console.log(`\n[${changed ? 'SWITCHED' : 'NO CHANGE'}] ${name}`);
      console.log('   fired at:', fired, err ? ('ERR: ' + err) : '');
      console.log('   diff:', JSON.stringify(d));
      if (changed) console.log('   after leaves:', JSON.stringify(after.leaves.slice(0, 14)));
    } catch (e) {
      results[label].methods[name] = { err: String(e).split('\n')[0] };
      console.log(`\n[ERROR] ${name}: ${String(e).split('\n')[0]}`);
    }
    await pp.close();
  }
}

console.log('\n\n=== JSON ===\n' + JSON.stringify(results, null, 1));
await b.close();
