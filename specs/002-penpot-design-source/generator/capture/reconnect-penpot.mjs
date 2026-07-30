// reconnect-penpot.mjs — bring the Penpot MCP plugin session back without a human.
//
// The plugin bridge holds ONE connection per user token, owned by whichever browser tab has the
// design file open. When that tab dies — a crash, a discard under memory pressure, someone closing
// it — every execute_code call fails with "No plugin instance connected", and the documented
// recovery is for a PERSON to open the file and click the toolbar MCP button. That makes the whole
// generator pipeline dependent on someone being at a keyboard. This does the same thing headlessly.
//
// Usage: node reconnect-penpot.mjs        (leave it running; closing the browser drops the session)
//        PENPOT_EMAIL=… PENPOT_PASS=… node reconnect-penpot.mjs
import { chromium } from 'playwright';

const BASE = process.env.PENPOT_URL || 'http://localhost:9001';
const EMAIL = process.env.PENPOT_EMAIL || 'claude-agent@vela.local';
const PASS = process.env.PENPOT_PASS || 'VelaPenpot2026-agent';
const FILE = process.env.PENPOT_FILE || 'Vela Wallet — Design Source of Truth';
const HOLD_MS = Number(process.env.HOLD_MS || 0);   // 0 = keep the browser open until killed

const log = (...a) => console.log('[reconnect]', ...a);
const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', (e) => log('page error:', String(e).slice(0, 140)));

await page.goto(BASE + '/#/auth/login', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);

const needsLogin = await page.locator('input[type="email"], input[name="email"]').count();
if (needsLogin) {
  await page.fill('input[type="email"], input[name="email"]', EMAIL);
  await page.fill('input[type="password"], input[name="password"]', PASS);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(7000);
  log('signed in as', EMAIL);
} else {
  log('already authenticated');
}

// Go straight to the workspace. Hunting for the file's card on the dashboard does not work: the
// account's Drafts reads "0 files" and the file is reached by id, not by browsing. The URL shape was
// determined empirically — `#/workspace?team-id=…&file-id=…` loads it, while
// `#/workspace/<file-id>` renders "You don't have access to this file."
const TEAM = process.env.PENPOT_TEAM || 'bb9958c3-f40f-800b-8008-65a58816ff52';
const FILE_ID = process.env.PENPOT_FILE_ID || 'bb9958c3-f40f-800b-8008-65a678768caa';
await page.goto(BASE + '/#/workspace?team-id=' + TEAM + '&file-id=' + FILE_ID,
  { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(15000);
const opened = { ok: page.url().includes('workspace') };
log('workspace:', page.url());

// The workspace auto-connects the MCP plugin on load in the integrated 2.16 build; if a button is
// present (older builds), click it.
const clicked = await page.evaluate(() => {
  const el = [...document.querySelectorAll('button,[role="button"],a')]
    .find((e) => /(^|\s)mcp(\s|$)/i.test((e.textContent || '').trim()) || /mcp/i.test(e.getAttribute('aria-label') || ''));
  if (!el) return 'no MCP control (integrated build auto-connects)';
  el.click();
  return 'clicked MCP control';
});
log(clicked);
await page.waitForTimeout(6000);
console.log(JSON.stringify({ url: page.url(), opened, mcp: clicked }));

if (HOLD_MS) { await page.waitForTimeout(HOLD_MS); await browser.close(); }
else { log('holding the session open — kill this process to release it'); await new Promise(() => {}); }
