// Probe 3: gas-estimate-failed via vela.failRpc, and what the parallel Connections
// panel holds (for the replay / connection-event reach). Read-only.
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
    if (!el.children.length) { const t = (el.textContent || '').trim(); if (t) out.push(t); }
    else for (const c of el.children) walk(c);
  };
  walk(root);
  return out.join(' | ');
};

const pageText = () => {
  const out = [];
  const walk = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    if (!el.children.length) { const t = (el.textContent || '').trim(); if (t) out.push(t); }
    else for (const c of el.children) walk(c);
  };
  walk(document.body);
  return out.join(' | ');
};

const tap = async (p, label, startsWith = true) => p.evaluate(([lab, sw]) => {
  const els = [...document.querySelectorAll('[role="button"],button,[tabindex]')]
    .filter((x) => { const t = (x.textContent || '').trim(); return sw ? t.startsWith(lab) : t === lab; });
  if (!els.length) return 'MISS';
  for (const ev of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
    els[0].dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true, view: window }));
  return 'ok';
}, [label, startsWith]);

const b = await chromium.launch();
const out = {};
const p = await b.newPage({ viewport: { width: 1280, height: 950 } });
p.on('console', () => {});
await p.goto('http://127.0.0.1:8083/parallel', { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(9000);

out.velaHelp = await p.evaluate(() => (typeof window.vela === 'object' ? Object.keys(window.vela) : 'NO-VELA'));
out.homeConnections = await (async () => {
  await tap(p, 'Connections');
  await p.waitForTimeout(2500);
  return p.evaluate(pageText);
})();

// arm an RPC failure on Ethereum (chain 1 — the clear-signing harness chain)
out.failRpc = await p.evaluate(() => { try { return String(window.vela.failRpc(1)); } catch (e) { return 'ERR ' + e.message; } });
await p.goto('http://127.0.0.1:8083/clear-signing-test', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(6000);
out.open = await tap(p, 'ERC-20 Transfer');
await p.waitForTimeout(9000);
out.sheet_failedRpc = await p.evaluate(sheetText);

console.log(JSON.stringify(out, null, 1));
await b.close();
