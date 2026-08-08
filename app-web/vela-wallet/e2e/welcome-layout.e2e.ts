/**
 * Responsive gate (spec SC-003, FR-001/003): no horizontal overflow at any
 * checked width, the 1280px boundary switches layouts, and both CTAs open
 * the correct flow container per form factor (spec 014 US2: in-place swap at
 * ≥ 1280px, bottom sheet below — no navigation).
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
		await expect(page.getByRole('button', { name: 'Create Wallet' })).toBeVisible();
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
});

test('resizing across the boundary keeps the page intact', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/en');
	await expect(page.locator('.grid')).toBeVisible();
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.locator('.slides')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Create Wallet' })).toBeVisible();
});

test('mobile pager dots advance the carousel', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/en');
	const dots = page.locator('.dots .dot');
	await dots.nth(3).click();
	await expect(dots.nth(3)).toHaveAttribute('aria-current', 'true');
});

test('desktop CTAs swap the action pane in place — no navigation, hero stable', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/en');
	const brandBefore = (await page.locator('.brand').boundingBox())!;

	await page.getByRole('button', { name: 'Create Wallet' }).click();
	await expect(page).toHaveURL('/en');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(
		page.locator('.actions').getByRole('heading', { name: 'Create Wallet' })
	).toBeVisible();

	// FR-008: the hero column must not reflow when the column swaps.
	const brandAfter = (await page.locator('.brand').boundingBox())!;
	expect(brandAfter.x).toBe(brandBefore.x);
	expect(brandAfter.y).toBe(brandBefore.y);
	expect(brandAfter.width).toBe(brandBefore.width);

	// Close × restores the CTA stack.
	await page.getByRole('button', { name: 'Close' }).click();
	await expect(page.getByRole('button', { name: 'Create Wallet' })).toBeVisible();

	await page.getByRole('button', { name: 'I already have a wallet' }).click();
	await expect(page).toHaveURL('/en');
	await expect(page.locator('.actions').getByRole('heading', { name: 'Sign In' })).toBeVisible();
	await page.getByRole('button', { name: 'Close' }).click();
	await expect(page.getByRole('button', { name: 'I already have a wallet' })).toBeVisible();
});

test('mobile CTAs open the bottom sheet — no navigation', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/en');
	await page.getByRole('button', { name: 'I already have a wallet' }).click();
	const dialog = page.getByRole('dialog', { name: 'Sign In' });
	await expect(dialog).toBeVisible();
	await expect(page).toHaveURL('/en');
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Create Wallet' })).toBeVisible();
});

test('mobile brand mark and wordmark share one row', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/en');
	const mark = page.locator('.brand svg');
	const wordmark = page.locator('.wordmark');
	const markBox = (await mark.boundingBox())!;
	const wordBox = (await wordmark.boundingBox())!;
	const markMid = markBox.y + markBox.height / 2;
	expect(markMid).toBeGreaterThan(wordBox.y);
	expect(markMid).toBeLessThan(wordBox.y + wordBox.height);
});
