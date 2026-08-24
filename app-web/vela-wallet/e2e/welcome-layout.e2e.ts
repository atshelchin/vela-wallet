/**
 * Responsive gate (spec 006 SC-003, FR-001/003): no horizontal overflow at any
 * checked width, the 1280px boundary switches layouts, and both CTAs reach the
 * flow they own.
 *
 * The container assertions changed with spec 019. Creating a wallet is a
 * stepped journey and now has its own route, so it NAVIGATES rather than
 * swapping a column — a reload mid-ceremony strands nobody and back works.
 * Signing in has no steps, so it still happens in place and speaks only
 * through the button's busy state.
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
		// A LINK since spec 019: creating a wallet is a route, not a panel swap.
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

for (const width of [1440, 390]) {
	test(`Create Wallet navigates to the flow at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 900 });
		await page.goto('/en');

		await page.getByRole('link', { name: 'Create Wallet' }).click();
		await expect(page).toHaveURL('/en/create');
		// The flow's own chrome: a back affordance and the stepped bar. Which
		// step is showing is the core's to say, so this asserts arrival, not
		// contents.
		await expect(page.getByRole('progressbar')).toBeVisible();

		await page.goBack();
		await expect(page).toHaveURL('/en');
		await expect(page.getByRole('link', { name: 'Create Wallet' })).toBeVisible();
	});
}

test('sign-in stays on Welcome — it has no steps to show', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/en');

	// No virtual authenticator here, so the ceremony will fail — the assertion
	// is only that activating it does not navigate away. What the failure looks
	// like is e2e/onboarding-signin.spec.ts's job, with an authenticator.
	await page.getByRole('button', { name: 'I already have a wallet' }).click();
	await expect(page).toHaveURL('/en');
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
