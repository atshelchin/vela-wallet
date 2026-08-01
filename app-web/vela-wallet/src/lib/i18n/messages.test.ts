/**
 * Engine-integration gate (research.md D6): the real wasm engine must resolve
 * every Welcome key in every locale — no key-echo, no silent English where a
 * translation exists — and the page-facing resolver must agree with the raw
 * engine (the 004/005 differential spirit at this architecture's altitude).
 */
import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES, textDirectionOf } from './locales';
import { FEATURE_SLUGS, WELCOME_KEYS } from './messages';
import { rawResolve, resolveWelcomeMessages, textDirection } from './engine.server';

describe('welcome messages resolve through the vela-core engine', () => {
	for (const locale of SUPPORTED_LOCALES) {
		it(`${locale}: every key resolves to a non-empty string`, () => {
			const messages = resolveWelcomeMessages(locale);
			expect(messages.metaTitle.length).toBeGreaterThan(0);
			expect(messages.metaDescription.length).toBeGreaterThan(0);
			expect(messages.tagline.length).toBeGreaterThan(0);
			expect(messages.createWallet.length).toBeGreaterThan(0);
			expect(messages.alreadyHaveWallet.length).toBeGreaterThan(0);
			expect(messages.passkeyIndexLink.length).toBeGreaterThan(0);
			expect(messages.features).toHaveLength(FEATURE_SLUGS.length);
			for (const feature of messages.features) {
				expect(feature.title.length).toBeGreaterThan(0);
				expect(feature.description.length).toBeGreaterThan(0);
			}
		});
	}

	it('numbers cards 01–06 in design order', () => {
		const { features } = resolveWelcomeMessages('en');
		expect(features.map((f) => f.number)).toEqual(['01', '02', '03', '04', '05', '06']);
	});

	it('actually loads per-locale catalogs (en/zh/ja taglines all differ)', () => {
		const taglines = (['en', 'zh', 'ja'] as const).map(
			(locale) => resolveWelcomeMessages(locale).tagline
		);
		expect(new Set(taglines).size).toBe(3);
	});

	it('differential: resolveWelcomeMessages equals raw engine resolution', () => {
		for (const locale of ['en', 'zh', 'ru', 'zh-HK'] as const) {
			const messages = resolveWelcomeMessages(locale);
			expect(messages.tagline).toBe(rawResolve(locale, 'onboarding.welcomeWeb.tagline'));
			expect(messages.createWallet).toBe(rawResolve(locale, 'onboarding.welcome.createWallet'));
			expect(messages.features[0].title).toBe(
				rawResolve(locale, 'onboarding.welcomeWeb.features.noSeedPhrase.title')
			);
		}
	});

	it('no key echoes through the raw engine for any locale × key', () => {
		for (const locale of SUPPORTED_LOCALES) {
			for (const key of WELCOME_KEYS) {
				expect(rawResolve(locale, key), `${locale} ${key}`).not.toBe(key);
			}
		}
	});

	it('static direction registry agrees with the engine for all 15 locales', () => {
		for (const locale of SUPPORTED_LOCALES) {
			expect(textDirection(locale), locale).toBe(textDirectionOf(locale));
		}
	});
});
