/**
 * Shared plumbing for the live-wiring e2e suites (spec 024 T040/T041).
 *
 * A fresh Playwright context is a first-run browser: no intro flag, no
 * wallet. These helpers make it a RETURNING one — the intro marked seen and
 * a minimal legacy-shape account seeded under the session core's own keys —
 * so the guarded routes rule `wallet` and the live screens render. The
 * account is storage-only test identity: nothing on these screens calls a
 * chain.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

const APP_ROOT = join(import.meta.dirname, '..');

/** Dotted-path reader over the generated EN catalog — assertions speak the
 *  corpus, never hardcoded copy. */
export function en(path: string): string {
	const raw = JSON.parse(
		readFileSync(join(APP_ROOT, '..', '..', 'public', 'i18n', 'en.json'), 'utf8')
	) as Record<string, unknown>;
	const value = path.split('.').reduce<unknown>((node, key) => {
		if (node === null || typeof node !== 'object') return undefined;
		return (node as Record<string, unknown>)[key];
	}, raw);
	if (typeof value !== 'string') throw new Error(`en corpus has no string at ${path}`);
	return value;
}

/** A legacy single-key account record, exactly the stored shape. */
const TEST_ACCOUNT = {
	id: 'e2e-credential-id',
	name: 'E2E Wallet',
	address: '0x14fb1f4e2b9c7a5d8e3f6a1b4c7d9e2f5a8b1d1e',
	public_key_hex: '04' + 'ab'.repeat(64),
	created_at_iso: '2026-01-01T00:00:00.000Z',
	keys: []
};

/** Runs before every document in the context: intro seen + wallet present. */
export async function seedSignedIn(page: Page): Promise<void> {
	await page.addInitScript((account) => {
		window.localStorage.setItem('vela.intro.seen', String(Date.now()));
		window.localStorage.setItem('vela.accounts', JSON.stringify([account]));
		window.localStorage.setItem('vela.activeAccountIndex', '0');
	}, TEST_ACCOUNT);
}
