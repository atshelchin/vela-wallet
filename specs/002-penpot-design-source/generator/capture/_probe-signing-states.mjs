// Probe: does the SigningSheet show a GasFeeCard in the harness? and what does
// the approval editor look like after tapping Revoke? Read-only — writes nothing.
import { chromium } from 'playwright';

const sheetText = () => {
  const backdrop = [...document.querySelectorAll('div')]
    .find((d) => /rgba\(0, 0, 0, 0\.3/.test(getComputedStyle(d).backgroundColor));
  const root = backdrop && backdrop.parentElement;
  if (!root) return 'NO-SHEET';
  const out = [];
  const walk = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    if (!el.children.length) {
      const t = (el.textContent || '').trim();
      if (t) out.push(t);
    } else for (const c of el.children) walk(c);
  };
  walk(root);
  return out.join(' | ');
};

const openScenario = async (p, label) => {
  const hit = await p.evaluate((lab) => {
    const el = [...document.querySelectorAll('[role="button"],button,[tabindex]')]
      .find((x) => (x.textContent || '').trim().startsWith(lab));
    if (!el) return 'MISS';
    for (const ev of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
      el.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true, view: window }));
    return 'ok';
  }, label);
  await p.waitForTimeout(4000);
  return hit;
};

const tapInSheet = async (p, label) => p.evaluate((lab) => {
  const backdrop = [...document.querySelectorAll('div')]
    .find((d) => /rgba\(0, 0, 0, 0\.3/.test(getComputedStyle(d).backgroundColor));
  const root = backdrop && backdrop.parentElement;
  if (!root) return 'NO-SHEET';
  const el = [...root.querySelectorAll('[role="button"],button,[tabindex],div')]
    .filter((x) => (x.textContent || '').trim() === lab)
    .pop();
  if (!el) return 'MISS';
  for (const ev of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
    el.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true, view: window }));
  return 'ok';
}, label);

const b = await chromium.launch();
const out = {};

// --- Pass A: straight to /clear-signing-test, exactly as recapture-signing.mjs did
{
  const p = await b.newPage({ viewport: { width: 1280, height: 950 } });
  await p.goto('http://127.0.0.1:8083/clear-signing-test', { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(6000);
  out.A_open = await openScenario(p, 'ERC-20 Transfer');
  out.A_sheet = await p.evaluate(sheetText);
  await p.close();
}

// --- Pass B: arm the parallel wallet first, then the same scenario
{
  const p = await b.newPage({ viewport: { width: 1280, height: 950 } });
  await p.goto('http://127.0.0.1:8083/parallel', { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(9000);
  out.B_url = p.url();
  await p.goto('http://127.0.0.1:8083/clear-signing-test', { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(7000);
  out.B_open = await openScenario(p, 'ERC-20 Transfer');
  out.B_sheet = await p.evaluate(sheetText);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(1500);

  // unlimited approve → tap Revoke preset
  out.B_open2 = await openScenario(p, 'Unlimited');
  out.B_approve_before = await p.evaluate(sheetText);
  out.B_tapRevoke = await tapInSheet(p, 'Revoke');
  await p.waitForTimeout(1200);
  out.B_approve_after = await p.evaluate(sheetText);
  await p.close();
}

console.log(JSON.stringify(out, null, 1));
await b.close();
