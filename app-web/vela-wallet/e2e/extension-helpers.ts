/**
 * Standing up the packaged extension in a test (spec 027).
 *
 * Three facts had to be measured before any of this worked (spec 027 D39), and
 * they are the reason these helpers exist rather than a line of setup per file:
 *
 *   - Playwright's `headless: true` loads NO extension; `headless: false` with
 *     `--headless=new` in `args` does;
 *   - `chrome://extensions` is not navigable from Playwright, so the extension
 *     id cannot be discovered — it is PINNED by the manifest `key` and
 *     recomputed here from it, so the manifest and the tests can never disagree;
 *   - a CDP virtual authenticator is scoped to the target it was added to, so a
 *     second page has none and any ceremony there simply hangs.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from '@playwright/test';

const APP_ROOT = join(import.meta.dirname, '..');
export const EXTENSION_DIST = join(APP_ROOT, 'extension/dist');

/** Has `pnpm build:extension` run? Suites skip rather than fail obscurely. */
export const extensionBuilt = (): boolean => existsSync(join(EXTENSION_DIST, 'manifest.json'));

/**
 * Chrome's id for an unpacked extension with a `key`: the first 32 hex digits
 * of SHA-256 over the DER public key, with 0–f mapped onto a–p.
 */
export function extensionId(): string {
	const { key } = JSON.parse(readFileSync(join(APP_ROOT, 'extension/manifest.json'), 'utf8'));
	const digest = createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex');
	return [...digest.slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

/** A browser with the packaged extension installed. */
export function loadExtension(options: { viewport?: { width: number; height: number } } = {}) {
	return chromium.launchPersistentContext('', {
		headless: false,
		args: [
			'--headless=new',
			`--disable-extensions-except=${EXTENSION_DIST}`,
			`--load-extension=${EXTENSION_DIST}`
		],
		...(options.viewport ? { viewport: options.viewport } : {})
	});
}

/** Refuse every request that is not to the extension's own origin. */
export async function hermetic(context: BrowserContext): Promise<void> {
	await context.route('**/*', (route) =>
		route.request().url().startsWith('chrome-extension://') ? route.continue() : route.abort()
	);
}

/** The request window this extension opened, once it is showing something. */
export async function requestWindow(context: BrowserContext, timeoutMs = 15_000): Promise<Page> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const found = context.pages().find((p) => p.url().includes('/request.html'));
		if (found) {
			await found.waitForLoadState('domcontentloaded');
			return found;
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error('no request window opened');
}

/** Is any request window open right now? */
export const requestWindowOpen = (context: BrowserContext): boolean =>
	context.pages().some((p) => p.url().includes('/request.html'));

/**
 * Wait until no request window is open.
 *
 * A settled window closes on a short delay, so that the answer reaches the page
 * before the document goes away. A test that fires its NEXT request without
 * waiting can therefore grab the previous, closing window — which then never
 * shows what it was looking for. Found exactly that way.
 */
export async function noRequestWindow(context: BrowserContext, timeoutMs = 15_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (!requestWindowOpen(context)) return;
		await new Promise((r) => setTimeout(r, 100));
	}
	throw new Error('a request window stayed open');
}

/**
 * Confirm the slide control — by keyboard.
 *
 * The control commits on a pointer drag past 88% of its travel, and it also
 * commits on Enter, because a slider a keyboard user cannot operate is a
 * signature they cannot give. The keyboard path is what this drives: it is the
 * SAME `onconfirm`, and it is the half that would otherwise never be exercised.
 *
 * (A synthesized pointer drag was tried first and does not commit here — the
 * control captures the pointer, and Playwright's synthesized moves do not
 * reach the captured element. Worth knowing before spending an hour on it.)
 */
export async function slideToConfirm(page: Page): Promise<void> {
	const slider = page.getByRole('button', { name: /^Slide to confirm/ });
	await slider.waitFor({ state: 'visible', timeout: 30_000 });
	await slider.focus();
	await slider.press('Enter');
}
