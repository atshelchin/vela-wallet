import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => {
	if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300));
});
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
page.on('requestfailed', (r) =>
	console.log('REQFAIL', r.url().slice(0, 160), r.failure()?.errorText)
);
await page.goto('http://localhost:5199/dev/gallery', { waitUntil: 'networkidle' });
await page
	.getByRole('button', { name: /Done · one key/i })
	.first()
	.click();
await page.waitForTimeout(6000);
await browser.close();
