import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 460, height: 900 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:5199/dev/gallery', { waitUntil: 'networkidle' });
await page
	.getByRole('button', { name: /Done · one key/i })
	.first()
	.click();
await page.waitForTimeout(6000);
const done = page.locator('section').filter({ hasText: /0x/ }).first();
if (await done.count()) {
	await done.scrollIntoViewIfNeeded();
	await page.waitForTimeout(300);
	await done.screenshot({ path: process.argv[2] });
} else {
	await page.screenshot({ path: process.argv[2], fullPage: true });
}
await browser.close();
