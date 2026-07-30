import { chromium } from 'playwright';
const TEAM='bb9958c3-f40f-800b-8008-65a58816ff52', FILE='bb9958c3-f40f-800b-8008-65a678768caa';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
await p.goto('http://localhost:9001/#/auth/login', { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(2000);
if (await p.locator('input[type="email"]').count()) {
  await p.fill('input[type="email"]', 'claude-agent@vela.local');
  await p.fill('input[type="password"]', 'VelaPenpot2026-agent');
  await p.keyboard.press('Enter'); await p.waitForTimeout(8000);
}
for (const url of [
  `http://localhost:9001/#/workspace?team-id=${TEAM}&file-id=${FILE}`,
  `http://localhost:9001/#/workspace/${FILE}`,
]) {
  await p.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await p.waitForTimeout(9000);
  const t = await p.evaluate(() => document.body.innerText.slice(0, 120).replace(/\n/g, ' | '));
  console.log(url.split('#')[1], '→', p.url().includes('workspace') ? 'WORKSPACE' : 'redirected', '|', t);
}
await b.close();
