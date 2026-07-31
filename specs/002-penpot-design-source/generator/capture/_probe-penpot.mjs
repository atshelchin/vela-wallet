import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
await p.goto('http://localhost:9001/#/auth/login', { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(2000);
if (await p.locator('input[type="email"]').count()) {
  await p.fill('input[type="email"]', 'claude-agent@vela.local');
  await p.fill('input[type="password"]', 'VelaPenpot2026-agent');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(8000);
}
console.log('dashboard url:', p.url());
const info = await p.evaluate(() => {
  const links = [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(h => /file|workspace/.test(h||''));
  const titles = [...document.querySelectorAll('*')].filter(e => e.children.length===0 && /Vela Wallet/.test(e.textContent||'')).map(e => e.textContent.trim());
  return { links: links.slice(0,6), titles: titles.slice(0,4), bodyHint: document.body.innerText.slice(0, 300) };
});
console.log(JSON.stringify(info, null, 1));
await b.close();
