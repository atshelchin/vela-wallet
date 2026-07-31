// Probe 2: approval editor Revoke choice, batch leg with an uncapped approve,
// and the read-only / pending / error variants of the signing sheet. Read-only.
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
  await p.waitForTimeout(4500);
  return hit;
};

const tapInSheet = async (p, label) => p.evaluate((lab) => {
  const backdrop = [...document.querySelectorAll('div')]
    .find((d) => /rgba\(0, 0, 0, 0\.3/.test(getComputedStyle(d).backgroundColor));
  const root = backdrop && backdrop.parentElement;
  if (!root) return 'NO-SHEET';
  const el = [...root.querySelectorAll('*')]
    .filter((x) => (x.textContent || '').trim() === lab && !x.children.length);
  if (!el.length) return 'MISS';
  const target = el[0].closest('[role="button"],[tabindex]') || el[0].parentElement;
  for (const ev of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
    target.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true, view: window }));
  return 'ok';
}, label);

const b = await chromium.launch();
const out = {};
const p = await b.newPage({ viewport: { width: 1280, height: 950 } });
await p.goto('http://127.0.0.1:8083/parallel', { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(9000);
await p.goto('http://127.0.0.1:8083/clear-signing-test', { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(7000);

out.open_approve = await openScenario(p, 'ERC-20 Approve (Unlimited)');
out.approve_before = await p.evaluate(sheetText);
out.tapRevoke = await tapInSheet(p, 'Revoke');
await p.waitForTimeout(1500);
out.approve_after_revoke = await p.evaluate(sheetText);
await p.keyboard.press('Escape');
await p.waitForTimeout(1500);

out.open_nft = await openScenario(p, 'NFT Approve All');
out.nft_before = await p.evaluate(sheetText);
out.tapRevokeAccess = await tapInSheet(p, 'Revoke access');
await p.waitForTimeout(1200);
out.nft_after = await p.evaluate(sheetText);
await p.keyboard.press('Escape');
await p.waitForTimeout(1500);

out.open_batch = await openScenario(p, 'EIP-5792 batch');
out.batch = await p.evaluate(sheetText);
await p.keyboard.press('Escape');
await p.waitForTimeout(1500);

// Loading fallback: reopen a descriptor-resolving scenario and read immediately.
out.open_1inch = await p.evaluate((lab) => {
  const el = [...document.querySelectorAll('[role="button"],button,[tabindex]')]
    .find((x) => (x.textContent || '').trim().startsWith(lab));
  if (!el) return 'MISS';
  for (const ev of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
    el.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true, view: window }));
  return 'ok';
}, '1inch Swap');
await p.waitForTimeout(120);
out.loading_120ms = await p.evaluate(sheetText);
await p.waitForTimeout(400);
out.loading_520ms = await p.evaluate(sheetText);

console.log(JSON.stringify(out, null, 1));
await b.close();
