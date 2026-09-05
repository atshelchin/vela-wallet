/**
 * Preferences that do what they say (spec 028 T436 — SC-406/SC-407).
 *
 * These rows were drawn in 023 and inert until now, which is the worst kind of
 * control: a person taps 深色, nothing happens, and they conclude the wallet is
 * broken rather than that the row is. So each assertion here is "the thing the
 * row NAMES actually changed", and then again after a reload — a preference
 * that does not survive is a preference that was never set.
 *
 * The erase pair is the destructive one, and it is asserted from both ends:
 * confirmed, nothing of ours is left in the browser; cancelled, everything is.
 * Nobody exercises a cancel path by hand, which is exactly why it is here.
 *
 * ×3 engines, because storage is the promise being made (`STORAGE_SUITES` in
 * playwright.config.ts).
 */
import { expect, test, type Page } from '@playwright/test';
import { en, seedSignedIn } from './live-helpers';

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
	await seedSignedIn(page);
});

async function openSettings(page: Page): Promise<void> {
	await page.goto('/en/settings');
	await expect(page.getByText('E2E Wallet').first()).toBeVisible();
}

/** Every `vela.` key this browser holds in localStorage, sorted. */
function velaKeys(page: Page): Promise<string[]> {
	return page.evaluate(() =>
		Object.keys(localStorage)
			.filter((key) => key.startsWith('vela.'))
			.sort()
	);
}

/**
 * The IndexedDB KV's `vela.` keys — the other store the sweep has to reach.
 *
 * Opened the way `services/storage.ts` opens it (database `vela`, store `kv`,
 * version 1), so the test reads the same place the app writes.
 */
function kvKeys(page: Page): Promise<string[]> {
	return page.evaluate(
		() =>
			new Promise<string[]>((resolve, reject) => {
				const open = indexedDB.open('vela', 1);
				open.onupgradeneeded = () => open.result.createObjectStore('kv');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const request = open.result.transaction('kv', 'readonly').objectStore('kv').getAllKeys();
					request.onsuccess = () =>
						resolve(
							(request.result as IDBValidKey[])
								.filter((key): key is string => typeof key === 'string')
								.filter((key) => key.startsWith('vela.'))
								.sort()
						);
					request.onerror = () => reject(request.error);
				};
			})
	);
}

/** Put one record in the KV, so the sweep has something there to remove. */
function seedKv(page: Page, key: string): Promise<void> {
	return page.evaluate(
		(k) =>
			new Promise<void>((resolve, reject) => {
				const open = indexedDB.open('vela', 1);
				open.onupgradeneeded = () => open.result.createObjectStore('kv');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const tx = open.result.transaction('kv', 'readwrite');
					tx.objectStore('kv').put('seeded', k);
					tx.oncomplete = () => resolve();
					tx.onerror = () => reject(tx.error);
				};
			}),
		key
	);
}

test('a chosen date format is what the app then prints, and it survives a reload', async ({
	page
}) => {
	await openSettings(page);
	await page.getByText(en('settings.localization.dateTitle'), { exact: true }).click();

	// The sheet's labels ARE the formats doing their job, so the row is picked
	// by the date it would print.
	await page.getByText('2026-06-13', { exact: true }).click();

	// The list row now shows the same sample under the new preset.
	await expect(page.getByText('2026-06-13', { exact: true })).toBeVisible();
	await page.reload();
	await expect(page.getByText('E2E Wallet').first()).toBeVisible();
	await expect(page.getByText('2026-06-13', { exact: true })).toBeVisible();
});

test('a chosen number format changes how a figure is grouped, and survives', async ({ page }) => {
	await openSettings(page);
	await page.getByText(en('settings.localization.numberTitle'), { exact: true }).click();
	await page.getByText('1.234.567,89', { exact: true }).click();

	await expect(page.getByText('1.234.567,89', { exact: true })).toBeVisible();
	await page.reload();
	await expect(page.getByText('E2E Wallet').first()).toBeVisible();
	await expect(page.getByText('1.234.567,89', { exact: true })).toBeVisible();
});

test('choosing a theme pins the palette the whole app already reads', async ({ page }) => {
	await openSettings(page);
	// `isDarkTheme()` resolves a pinned `data-theme` first (spec 012 FR-009);
	// this writes exactly what that already reads, rather than a second answer.
	await page.getByRole('radio', { name: en('settings.appearance.themeLight') }).click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

	await page.reload();
	// Applied before first paint by the inline script in app.html — a theme that
	// arrives in `onMount` shows the OS palette first and then flips.
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

	// `auto` UNPINS rather than writing a resolved value, or a wallet set to
	// follow the system would stop following it at sunset.
	await expect(page.getByText('E2E Wallet').first()).toBeVisible();
	await page.getByRole('radio', { name: en('settings.appearance.themeAuto') }).click();
	await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light');
});

test('erasing leaves nothing of this wallet in the browser (SC-407)', async ({ page }) => {
	await openSettings(page);
	// Something to lose in BOTH stores — including a key no feature has written
	// yet, which is the whole reason this is a namespace sweep and not a
	// delete-list.
	await page.evaluate(() => {
		localStorage.setItem('vela.somethingNobodyHasWrittenYet', 'x');
		localStorage.setItem('vela.pendingUploads', '[{"unconfirmed":true}]');
	});
	await seedKv(page, 'vela.contacts');
	expect(await velaKeys(page)).toContain('vela.accounts');
	expect(await kvKeys(page)).toContain('vela.contacts');

	await page.getByText(en('settings.eraseDevice.title'), { exact: true }).click();
	await page.getByRole('button', { name: en('settings.eraseDevice.confirm') }).click();

	// First run: the guard sends a browser with no wallet back to Welcome.
	await page.waitForURL(/\/en$/, { timeout: 20_000 });

	// The IndexedDB store is empty of ours, and so is localStorage — except the
	// passkey outbox, because a deleted upload can never be retried and that
	// credential would then be unfindable at login on ANY device.
	expect(await kvKeys(page)).toEqual([]);
	expect(await velaKeys(page)).toContain('vela.pendingUploads');
	expect(await velaKeys(page)).not.toContain('vela.somethingNobodyHasWrittenYet');
	// `vela.accounts` and `vela.intro.seen` are back on this page, and that is
	// the TEST harness rather than the app: `seedSignedIn` re-imposes a wallet
	// before every document (see live-helpers.ts). What the erase did is
	// measured on the keys the harness does not write.
});

test('cancelling an erase changes nothing at all', async ({ page }) => {
	await openSettings(page);
	const before = await velaKeys(page);
	expect(before).toContain('vela.accounts');

	await page.getByText(en('settings.eraseDevice.title'), { exact: true }).click();
	await page.getByRole('button', { name: en('settings.eraseDevice.cancel') }).click();

	// Still here, still signed in. A destructive action's cancel path is the
	// one nobody exercises by hand.
	await expect(page.getByText('E2E Wallet').first()).toBeVisible();
	expect(await velaKeys(page)).toEqual(before);
});
