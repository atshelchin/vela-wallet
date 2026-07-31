// Pairs 2 & 4 live.
//  2) /onboarding?mode=create — what makes the CTA leave its disabled state, using the
//     harness's OWN byText/fire so the answer is expressible as spec steps.
//  4) /web-request with and without ?session= — one screen or two?
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8083';
const OUT = '/private/tmp/claude-501/-Volumes-data-production-vela-wallet/8547bccd-7d8f-4d5b-a44a-869806429155/scratchpad';

// verbatim from capture-states.js
const HARNESS = `
window.__clickable = () => [...document.querySelectorAll('[role="button"],button,[tabindex]')];
window.__byText = (t, nth) => {
  const want = String(t).toLowerCase();
  const hits = window.__clickable().filter((e) => {
    const s = (e.innerText || '').trim().toLowerCase();
    return s === want || s.startsWith(want + '\\n') || s === want.toLowerCase();
  });
  const loose = hits.length ? hits : window.__clickable().filter((e) => (e.innerText || '').toLowerCase().includes(want));
  return loose[nth || 0] || null;
};
window.__fire = (el) => { for (const t of ['pointerdown','mousedown','pointerup','mouseup','click'])
  el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window })); };
window.__ctaState = () => {
  const btns = [...document.querySelectorAll('[role="button"],button,[tabindex]')]
    .filter((e) => /create wallet/i.test((e.innerText || '').trim()));
  return btns.map((e) => {
    const r = e.getBoundingClientRect();
    // the disabled look is an opacity on the button (or an ancestor wrapper)
    let op = getComputedStyle(e).opacity;
    let p = e.parentElement, chain = [op];
    for (let i = 0; i < 3 && p; i++, p = p.parentElement) chain.push(getComputedStyle(p).opacity);
    return { txt: (e.innerText||'').trim().slice(0,20), box: [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)],
             ariaDisabled: e.getAttribute('aria-disabled'), disabled: e.disabled, opChain: chain,
             bg: getComputedStyle(e).backgroundColor };
  });
};
window.__ticks = () => [...document.querySelectorAll('svg')].map((s) => (s.outerHTML.match(/<path|<rect|<polyline/g)||[]).length + ':' + (s.getAttribute('stroke')||''));
`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
const page = await ctx.newPage();

// ---------------- pair 2 ----------------
await page.goto(BASE + '/onboarding?mode=create', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(4000);
await page.evaluate(HARNESS);
console.log('=== PAIR 2: /onboarding?mode=create ===');
console.log('  resting CTA :', JSON.stringify(await page.evaluate(() => window.__ctaState())));
console.log('  ticks       :', JSON.stringify(await page.evaluate(() => window.__ticks())));
await page.screenshot({ path: `${OUT}/onb-resting.png` });

// step 1: type the name
const typed = await page.evaluate(() => {
  const inp = [...document.querySelectorAll('input,textarea')].find((i) => (i.placeholder || '').includes('Enter a name'));
  if (!inp) return 'NO INPUT — placeholders: ' + [...document.querySelectorAll('input,textarea')].map((i) => i.placeholder).join(' / ');
  const proto = inp.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(inp, 'Design Capture');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  return 'typed into placeholder=' + inp.placeholder;
});
await page.waitForTimeout(900);
console.log('  type        :', typed);
console.log('  CTA now     :', JSON.stringify(await page.evaluate(() => window.__ctaState())));

// step 2: the three acknowledgments, via the harness's byText
for (const label of ['This is a self-custodial wallet', 'If you lose your device',
                     'If your iCloud or Google account is compromised', 'I agree to the']) {
  const hit = await page.evaluate((t) => {
    const el = window.__byText(t);
    if (!el) return 'MISS';
    window.__fire(el);
    return 'hit <' + el.tagName + ' role=' + el.getAttribute('role') + ' tabindex=' + el.getAttribute('tabindex') + '>';
  }, label);
  await page.waitForTimeout(700);
  console.log(`  ack ${JSON.stringify(label).slice(0, 40).padEnd(42)} -> ${hit}`);
}
await page.waitForTimeout(1200);
console.log('  READY CTA   :', JSON.stringify(await page.evaluate(() => window.__ctaState())));
console.log('  ticks       :', JSON.stringify(await page.evaluate(() => window.__ticks())));
console.log('  unique text?:', JSON.stringify(await page.evaluate(() => (document.body.innerText || '').replace(/\n+/g, ' | ').slice(0, 600))));
await page.screenshot({ path: `${OUT}/onb-ready.png` });

// ---------------- pair 4 ----------------
console.log('');
console.log('=== PAIR 4: /web-request ===');
for (const u of ['/web-request', '/web-request?session=vela-probe-1']) {
  await page.goto(BASE + u, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3500);
  const t = await page.evaluate(() => ({
    txt: (document.body.innerText || '').replace(/\n+/g, ' | '),
    opener: !!window.opener,
  }));
  console.log(`  ${u.padEnd(34)} opener=${t.opener} :: ${t.txt}`);
  await page.screenshot({ path: `${OUT}/webreq-${u.includes('session') ? 'session' : 'nosession'}.png` });
}
await browser.close();
