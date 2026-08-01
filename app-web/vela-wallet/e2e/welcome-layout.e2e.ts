/**
 * Responsive gate (spec SC-003, FR-001/003): no horizontal overflow at any
 * checked width, the 1280px boundary switches layouts, and both CTAs reach
 * their destinations.
 */
import { expect, test } from '@playwright/test';

const WIDTHS = [320, 375, 768, 1279, 1280, 1440, 1920];

for (const width of WIDTHS) {
	test(`no horizontal overflow at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 900 });
		await page.goto('/en');
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBe(0);
		await expect(page.getByRole('link', { name: 'Create Wallet' })).toBeVisible();
	});
}

test('1279px renders the mobile layout: carousel + pager, no grid', async ({ page }) => {
	await page.setViewportSize({ width: 1279, height: 900 });
	await page.goto('/en');
	await expect(page.locator('.slides')).toBeVisible();
	await expect(page.locator('.dots .dot')).toHaveCount(6);
	await expect(page.locator('.grid')).toBeHidden();
});

test('1280px renders the desktop layout: 2×3 grid + action pane, no carousel', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto('/en');
	await expect(page.locator('.grid')).toBeVisible();
	await expect(page.locator('.grid article')).toHaveCount(6);
	await expect(page.locator('.slides')).toBeHidden();
	await expect(page.locator('.actions')).toBeVisible();
	await expect(page.locator('.quiet')).toBeVisible();
});

test('resizing across the boundary keeps the page intact', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/en');
	await expect(page.locator('.grid')).toBeVisible();
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.locator('.slides')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Create Wallet' })).toBeVisible();
});

test('mobile pager dots advance the carousel', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/en');
	const dots = page.locator('.dots .dot');
	await dots.nth(3).click();
	await expect(dots.nth(3)).toHaveAttribute('aria-current', 'true');
});

test('both CTAs and the quiet link navigate to their destinations', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/en');
	await page.getByRole('link', { name: 'Create Wallet' }).click();
	await expect(page).toHaveURL('/en/create');
	await expect(page.getByRole('heading', { name: 'Create Wallet' })).toBeVisible();
	await page.getByRole('link', { name: '← Vela Wallet' }).click();
	await expect(page).toHaveURL('/en');
	await page.getByRole('link', { name: 'I already have a wallet' }).click();
	await expect(page).toHaveURL('/en/import');
	await page.goBack();
	await page.getByRole('link', { name: 'Set up passkey index service' }).click();
	await expect(page).toHaveURL('/en/settings/passkey-index');
});
