// _probe-refute9-reconnect.mjs — is S/connect/reconnecting really unreachable?
//
// Claim under test: "Reaching it needs a live WalletPair wss relay peer that accepts a join and
// then drops, which this repo does not ship."
//
// The repo ships the whole wallet-side protocol (src/services/walletpair-protocol.ts). The relay
// half a wallet needs to reach 'connected' is ONE frame: `channel_joined` echoing the ch+pubkey the
// wallet sent in its own connect query (walletpair-protocol.ts:817-824). So: 40 lines of `ws`
// (already in node_modules), accept the join, then drop the socket → handleSocketClose sets phase
// 'disconnected' (:903-909) → WalletPairTransport emits 'reconnecting' (:532) → provider flips
// status after the 4s grace (dapp-connection.tsx:433-444).
//
// READ-ONLY w.r.t. the design source: writes nothing to dom-dumps/.
import { chromium } from 'playwright';
import { WebSocketServer } from 'ws';

const PORT = 8899;
let accepting = true;
const live = new Set();

const wss = new WebSocketServer({ port: PORT, host: '127.0.0.1' });
wss.on('connection', (sock, req) => {
  if (!accepting) { console.log('[relay] refusing (closed for test)'); sock.terminate(); return; }
  const q = new URL(req.url, 'http://127.0.0.1').searchParams;
  const joined = {
    type: 'channel_joined',
    ch: q.get('ch'),
    pubkey: q.get('pubkey'),
    name: q.get('name'),
    url: q.get('url'),
    icon: q.get('icon'),
  };
  console.log('[relay] join from wallet pubkey=%s… ch=%s…', String(joined.pubkey).slice(0, 8), String(joined.ch).slice(0, 8));
  live.add(sock);
  sock.on('close', () => live.delete(sock));
  sock.send(JSON.stringify(joined));
});
console.log('[relay] stub WalletPair relay listening on ws://127.0.0.1:%d', PORT);

const rfc3986 = (v) => encodeURIComponent(v).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const URI = 'walletpair:?' + [
  ['ch', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'],
  ['pubkey', 'jCYIRGVbVzh1AXEPb9mfbAQ23zWxwBrWCCTyE1AmCV0'],
  ['relay', 'ws://127.0.0.1:' + PORT + '/ws'],
  ['name', 'Demo dApp'],
  ['url', 'https://demo.invalid'],
  ['icon', 'https://demo.invalid/icon.png'],
].map(([k, v]) => k + '=' + rfc3986(v)).join('&');
console.log('URI:', URI);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 950 }, deviceScaleFactor: 1, hasTouch: true });
page.on('pageerror', (e) => console.error('PAGE ERROR:', String(e).slice(0, 160)));
page.on('console', (m) => { const t = m.text(); if (/WalletPair|reconnect/i.test(t)) console.log('  [app]', t.slice(0, 160)); });

// Rendered text only — react-navigation keeps the previous route mounted under display:none.
const visible = () => page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('div,span,p')) {
    if (el.children.length) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') continue;
    const t = (el.textContent || '').trim();
    if (t) out.push(t);
  }
  return [...new Set(out)];
});
const show = async (label) => {
  const t = await visible();
  console.log(`\n--- ${label} ---\n` + t.join(' | ').slice(0, 700));
  return t;
};

await page.goto('http://127.0.0.1:8083/parallel', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.goto('http://127.0.0.1:8083/connect', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await show('t0 /connect');

// exact harness semantics (capture-states.js:178-189 type, :114-118 fire, :128-129 clickable)
await page.evaluate(() => {
  window.__fire = (el) => {
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    }
  };
  window.__clickable = () => [...document.querySelectorAll('[role="button"],button,[tabindex]')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  window.__byText = (t) => window.__clickable().find((e) => (e.innerText || '').trim().toLowerCase() === String(t).toLowerCase());
});
console.log('clickables:', JSON.stringify(await page.evaluate(() => window.__clickable().map((e) => (e.innerText || '').trim().slice(0, 24)))));
await page.evaluate((uri) => {
  const inp = [...document.querySelectorAll('input,textarea')].find((i) => (i.placeholder || '').includes('walletpair'));
  if (!inp) throw new Error('no pairing input');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(inp, uri);
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new Event('change', { bubbles: true }));
}, URI);
await page.waitForTimeout(900);

// clickNth 2 = the unlabelled ArrowRight submit (proven in state-specs-4.json)
await page.evaluate(() => window.__fire(window.__clickable()[2]));
await page.waitForTimeout(2000);
await show('t1 after submit (expect the 4-digit verify gate)');

console.log('clickables:', JSON.stringify(await page.evaluate(() => window.__clickable().map((e) => (e.innerText || '').trim().slice(0, 24)))));
await page.evaluate(() => { const el = window.__byText('Confirm'); if (!el) throw new Error('no Confirm'); window.__fire(el); });
await page.waitForTimeout(3000);
const connected = await show('t2 after Confirm (expect CONNECTED)');

console.log('\n[relay] dropping the socket and refusing reconnects…');
accepting = false;
for (const s of live) s.terminate();
for (const wait of [2000, 3000, 3000, 4000]) {
  await page.waitForTimeout(wait);
  const t = await visible();
  const hit = t.filter((x) => /Reconnect|Connected|Disconnect|Scan QR/i.test(x));
  console.log(`  +${wait}ms →`, hit.join(' | ').slice(0, 200));
}
const final = await show('t3 after the relay dropped');
await page.screenshot({ path: '/private/tmp/claude-501/-Volumes-data-production-vela-wallet/8547bccd-7d8f-4d5b-a44a-869806429155/scratchpad/connect-reconnecting.png' });

// Same status, viewed from Home's Connections tab: does the ReconnectButton render? The exclusion
// calls it circular ("renders ONLY when status is already 'reconnecting'").
await page.goto('http://127.0.0.1:8083/wallet', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
await page.evaluate(() => {
  window.__fire = (el) => { for (const t of ['pointerdown','mousedown','pointerup','mouseup','click']) el.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,view:window})); };
  window.__clickable = () => [...document.querySelectorAll('[role="button"],button,[tabindex]')].filter((e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;});
  const el = window.__clickable().find((e)=>/^connections/i.test((e.innerText||'').trim()));
  if (el) window.__fire(el);
});
await page.waitForTimeout(2000);
const homeConn = await show('t4 /wallet Connections tab while reconnecting');
await page.screenshot({ path: '/private/tmp/claude-501/-Volumes-data-production-vela-wallet/8547bccd-7d8f-4d5b-a44a-869806429155/scratchpad/home-connections-reconnecting.png' });
console.log('RESULT reconnect-button-seen:', homeConn.some((t)=>/Reconnect now|立即重连|Reconnect/i.test(t)));

console.log('\nRESULT connected-seen:', connected.some((t) => /^Connected$/i.test(t)));
console.log('RESULT reconnecting-seen:', final.some((t) => /Reconnecting/i.test(t)));
await browser.close();
wss.close();
process.exit(0);
