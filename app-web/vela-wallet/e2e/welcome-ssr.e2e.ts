/**
 * SSR/i18n gate (spec SC-001, FR-008/009/013): the initial HTML — no client
 * JS — must carry the localized first screen for every locale, and `/` must
 * negotiate Accept-Language into a 307. Expectations come from the generated
 * corpus catalogs, so this is a differential against the translation source.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const APP_ROOT = join(import.meta.dirname, '..');
const LOCALES = [
	'en',
	'zh',
	'zh-TW',
	'zh-HK',
	'ja',
	'ko',
	'vi',
	'id',
	'tr',
	'es-MX',
	'pt-BR',
	'fr',
	'de',
	'ru',
	'it'
] as const;

interface WelcomeCorpus {
	tagline: string;
	createWallet: string;
	alreadyHaveWallet: string;
	metaTitle: string;
	featureTitles: string[];
}

function corpus(locale: string): WelcomeCorpus {
	const raw = JSON.parse(
		readFileSync(join(APP_ROOT, '..', '..', 'public', 'i18n', `${locale}.json`), 'utf8')
	);
	const onboarding = raw.onboarding;
	return {
		tagline: onboarding.welcomeWeb.tagline,
		createWallet: onboarding.welcome.createWallet,
		alreadyHaveWallet: onboarding.welcome.alreadyHaveWallet,
		metaTitle: onboarding.welcomeWeb.meta.title,
		featureTitles: Object.values(
			onboarding.welcomeWeb.features as Record<string, { title: string }>
		).map((f) => f.title)
	};
}

const escapeHtml = (s: string) =>
	s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

for (const locale of LOCALES) {
	test(`raw HTML of /${locale} is fully localized`, async ({ request }) => {
		const response = await request.get(`/${locale}`);
		expect(response.status()).toBe(200);
		const html = await response.text();
		const expected = corpus(locale);
		expect(html).toContain(`<html lang="${locale}" dir="ltr"`);
		expect(html).toContain(escapeHtml(expected.tagline));
		expect(html).toContain(escapeHtml(expected.createWallet));
		expect(html).toContain(escapeHtml(expected.alreadyHaveWallet));
		expect(html).toContain(`<title>${escapeHtml(expected.metaTitle)}</title>`);
		for (const title of expected.featureTitles) {
			expect(html).toContain(escapeHtml(title));
		}
		// 15 locale alternates + x-default
		expect(html.match(/hreflang=/g)).toHaveLength(16);
		expect(html).toContain('hreflang="x-default"');
		expect(html).toContain('rel="canonical"');
	});
}

test('/ negotiates Accept-Language into a 307 with Vary', async ({ request }) => {
	const response = await request.get('/', {
		headers: { 'accept-language': 'ja' },
		maxRedirects: 0
	});
	expect(response.status()).toBe(307);
	expect(response.headers()['location']).toBe('/ja');
	expect(response.headers()['vary']).toBe('Accept-Language');
});

test('/ maps regional and legacy tags through the RN table', async ({ request }) => {
	for (const [header, target] of [
		['zh-CN', '/zh'],
		['zh-Hant-TW', '/zh-TW'],
		['zh-MO', '/zh-HK'],
		['pt-PT', '/pt-BR'],
		['in', '/id']
	]) {
		const response = await request.get('/', {
			headers: { 'accept-language': header },
			maxRedirects: 0
		});
		expect(response.headers()['location'], header).toBe(target);
	}
});

test('/ with an unsupported language falls back to /en', async ({ request }) => {
	const response = await request.get('/', {
		headers: { 'accept-language': 'th' },
		maxRedirects: 0
	});
	expect(response.status()).toBe(307);
	expect(response.headers()['location']).toBe('/en');
});

test('unknown locale segment is a 404', async ({ request }) => {
	const response = await request.get('/xx');
	expect(response.status()).toBe(404);
});

test.describe('with JavaScript disabled', () => {
	test.use({ javaScriptEnabled: false });

	test('all six features and both CTAs are still readable', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/zh');
		const expected = corpus('zh');
		for (const title of expected.featureTitles) {
			// titles exist twice by design: desktop grid + mobile carousel
			await expect(page.getByText(title).first()).toBeAttached();
		}
		await expect(page.getByText(expected.createWallet)).toBeVisible();
		await expect(page.getByText(expected.alreadyHaveWallet)).toBeVisible();
	});
});

test('built worker contains no wasm (engine is build-time only)', () => {
	const worker = readFileSync(join(APP_ROOT, '.svelte-kit', 'cloudflare', '_worker.js'), 'utf8');
	expect(worker.includes('WASM_BASE64')).toBe(false);
});
