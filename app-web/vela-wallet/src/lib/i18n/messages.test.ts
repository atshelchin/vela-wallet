/**
 * Engine-integration gate (research.md D6): the real wasm engine must resolve
 * every Welcome key in every locale — no key-echo, no silent English where a
 * translation exists — and the page-facing resolver must agree with the raw
 * engine (the 004/005 differential spirit at this architecture's altitude).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES, textDirectionOf } from './locales';
import { FEATURE_SLUGS, FLOW_KEYS, WELCOME_KEYS } from './messages';
import { fillTemplate } from './fill';
import {
	rawResolve,
	resolveFlowMessages,
	resolveWelcomeMessages,
	textDirection
} from './engine.server';

describe('welcome messages resolve through the vela-core engine', () => {
	for (const locale of SUPPORTED_LOCALES) {
		it(`${locale}: every key resolves to a non-empty string`, () => {
			const messages = resolveWelcomeMessages(locale);
			expect(messages.metaTitle.length).toBeGreaterThan(0);
			expect(messages.metaDescription.length).toBeGreaterThan(0);
			expect(messages.tagline.length).toBeGreaterThan(0);
			expect(messages.createWallet.length).toBeGreaterThan(0);
			expect(messages.alreadyHaveWallet.length).toBeGreaterThan(0);
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

describe('onboarding flow messages resolve through the vela-core engine (spec 014 T033)', () => {
	it('FLOW_KEYS covers the whole per-state key map, without duplicates', () => {
		expect(new Set(FLOW_KEYS).size).toBe(FLOW_KEYS.length);
		// Sentinels from each contract section: chrome, form, progress,
		// outcome copy, action labels, and the deliberate root-common reuse.
		for (const sentinel of [
			'onboarding.common.close',
			'onboarding.create.accountNameLabel',
			'onboarding.common.stepCounter',
			'onboarding.create.statusSyncingKey',
			'onboarding.login.statusAwaitingPasskey',
			'onboarding.common.networkTitle',
			'onboarding.common.headerShared',
			'onboarding.create.retryVerifyBtn',
			'onboarding.login.retryLoginBtn',
			'common.cancel'
		]) {
			expect(FLOW_KEYS, sentinel).toContain(sentinel);
		}
	});

	it('no key echoes through the raw engine for any locale × flow key', () => {
		for (const locale of SUPPORTED_LOCALES) {
			for (const key of FLOW_KEYS) {
				expect(rawResolve(locale, key), `${locale} ${key}`).not.toBe(key);
			}
		}
	});

	it('resolveFlowMessages serializes every key, agreeing with the raw engine', () => {
		for (const locale of ['en', 'zh', 'ru', 'zh-HK'] as const) {
			const flow = resolveFlowMessages(locale);
			expect(Object.keys(flow)).toHaveLength(FLOW_KEYS.length);
			for (const key of FLOW_KEYS) {
				expect(flow[key].length, `${locale} ${key}`).toBeGreaterThan(0);
				expect(flow[key], `${locale} ${key}`).toBe(rawResolve(locale, key));
			}
		}
	});

	it('zh copy is the mocks’ verbatim source (contracts/i18n-keys.md)', () => {
		const flow = resolveFlowMessages('zh');
		expect(flow['onboarding.common.networkTitle']).toBe('网络连接不稳定');
		expect(flow['onboarding.common.headerShared']).toBe('创建钱包 / 登录');
		expect(flow['onboarding.login.statusAwaitingPasskey']).toBe('正在等待通行密钥');
		expect(flow['onboarding.create.retryVerifyBtn']).toBe('重试验证');
	});

	it('interpolation templates ship raw and fill client-side (FR-011 frozen numbers)', () => {
		const flow = resolveFlowMessages('en');
		expect(flow['onboarding.common.stepCounter']).toContain('{{current}}');
		expect(flow['onboarding.common.timeoutBody']).toContain('{{seconds}}');
		const filled = fillTemplate(flow['onboarding.common.stepCounter'], { current: 1, total: 5 });
		expect(filled).not.toContain('{{');
		expect(filled).toContain('1');
	});
});

describe('mock annotation strings never ship (spec 014 FR-002 / SC-006)', () => {
	// The designer directives visible in some mocks. Assembled from halves so
	// this test file itself can never trip its own scan.
	const NEEDLES = ['新增' + ' i18n', '展开' + '态', '兜底' + '集合'];

	const SRC_ROOT = join(import.meta.dirname, '..', '..');

	const collect = (dir: string): string[] =>
		readdirSync(dir).flatMap((name) => {
			const path = join(dir, name);
			return statSync(path).isDirectory() ? collect(path) : [path];
		});

	it('appear nowhere under src/', () => {
		const files = collect(SRC_ROOT);
		expect(files.length).toBeGreaterThan(50);
		for (const file of files) {
			const text = readFileSync(file, 'utf8');
			for (const needle of NEEDLES) {
				expect(text.includes(needle), `${relative(SRC_ROOT, file)} contains "${needle}"`).toBe(
					false
				);
			}
		}
	});
});
