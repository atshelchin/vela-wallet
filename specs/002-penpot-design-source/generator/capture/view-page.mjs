// view-page.mjs — screenshot a page of the design file EXACTLY as a human sees it.
//
// Exports show a board in isolation; they cannot show whether two boards collide, whether the
// canvas is painting a stale tile, or what someone actually meets when they open the file. This
// opens the workspace headlessly, waits for the canvas to settle, zooms to fit, and saves a PNG.
//
// It deliberately does NOT click the MCP control — that is reconnect-penpot.mjs's job, and a second
// tab grabbing the plugin bridge would drop the session the generator is running on.
//
// Usage: node view-page.mjs --page-id <uuid> --out /tmp/page.png [--zoom fit|<n>] [--wait 20000]
import { chromium } from 'playwright';

const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k);
  return i > -1 ? process.argv[i + 1] : d;
};
const BASE = process.env.PENPOT_URL || 'http://localhost:9001';
const EMAIL = process.env.PENPOT_EMAIL || 'claude-agent@vela.local';
const PASS = process.env.PENPOT_PASS || 'VelaPenpot2026-agent';
const TEAM = process.env.PENPOT_TEAM || 'bb9958c3-f40f-800b-8008-65a58816ff52';
const FILE_ID = process.env.PENPOT_FILE_ID || 'bb9958c3-f40f-800b-8008-65a678768caa';
const PAGE_ID = arg('page-id');
const OUT = arg('out', '/tmp/penpot-page.png');
const WAIT = Number(arg('wait', 22000));
if (!PAGE_ID) throw new Error('--page-id is required');

const log = (...a) => console.log('[view]', ...a);
const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1800, height: 1100 }, deviceScaleFactor: 2 });

await page.goto(BASE + '/#/auth/login', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);
if (await page.locator('input[type="email"], input[name="email"]').count()) {
  await page.fill('input[type="email"], input[name="email"]', EMAIL);
  await page.fill('input[type="password"], input[name="password"]', PASS);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(7000);
  log('signed in');
}

await page.goto(`${BASE}/#/workspace?team-id=${TEAM}&file-id=${FILE_ID}&page-id=${PAGE_ID}`,
  { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(WAIT);

// Shift+1 is Penpot's zoom-to-fit-all. Click the canvas first so the shortcut lands there and not
// in a panel, and press Escape so nothing is selected (a selection draws handles over the shot).
await page.mouse.click(900, 600);
await page.keyboard.press('Escape');
const zoom = arg('zoom', 'fit');
if (zoom === 'fit') await page.keyboard.press('Shift+1');
await page.waitForTimeout(6000);

// --find zooms to one board by name. The layers panel is virtualised, so the entry usually is not
// in the DOM until its search filter narrows the list; that filter is the only reliable way to
// reach a named board without hand-computing canvas coordinates.
const find = arg('find');
if (find) {
  const opened = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button,[role="button"]')].find((b) =>
      /search/i.test(b.getAttribute('aria-label') || '') ||
      /search/i.test(b.getAttribute('title') || '') ||
      (b.className && /search/i.test(String(b.className))));
    if (btn) { btn.click(); return 'clicked search control'; }
    return 'no search control found';
  });
  log('layer search:', opened);
  await page.waitForTimeout(1200);
  const input = page.locator('input[placeholder], input[type="text"]').last();
  if (await input.count()) {
    await input.fill(find);
    await page.waitForTimeout(2500);
  }
  const row = page.getByText(find, { exact: false }).last();
  if (await row.count()) {
    await row.click();
    await page.waitForTimeout(1500);
    await page.keyboard.press('Shift+2');       // zoom to selection
    await page.waitForTimeout(2500);
    await page.keyboard.press('Escape');        // drop the selection handles before the shot
    await page.waitForTimeout(1500);
    log('zoomed to', find);
  } else {
    log('NOT FOUND in layer list:', find);
  }
}

await page.screenshot({ path: OUT });
log('saved', OUT, '|', page.url());
await browser.close();
