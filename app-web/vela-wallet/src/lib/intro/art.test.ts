import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { INTRO_ART, INTRO_ART_VIEWBOX, type IntroArtId } from './art';
import { INTRO_SLIDES, INTRO_KEYS } from './slides';

/**
 * The drift gate for the hand-port (spec 020).
 *
 * `art.ts` is a transcription of the generated contract, and a transcription
 * that nothing checks is a copy that will diverge. Reading the contract here
 * costs one file read and makes `node scripts/gen-intro-art.mjs` the only way
 * the artwork can change — the same guarantee the token pipeline has.
 */
const CONTRACT = JSON.parse(
	readFileSync(
		fileURLToPath(
			new URL(
				'../../../../../specs/020-intro-carousel/contracts/intro-illustrations.json',
				import.meta.url
			)
		),
		'utf8'
	)
) as {
	viewBox: { width: number; height: number };
	illustrations: {
		id: string;
		elements: { role: string; mode: string; width?: number; opacity: number; d: string }[];
	}[];
};

describe('intro illustrations', () => {
	it('draws in the contract viewBox', () => {
		expect(INTRO_ART_VIEWBOX).toEqual(CONTRACT.viewBox);
	});

	it('carries every illustration the contract defines, and no others', () => {
		expect(Object.keys(INTRO_ART).sort()).toEqual(CONTRACT.illustrations.map((i) => i.id).sort());
	});

	for (const illustration of CONTRACT.illustrations) {
		it(`matches the contract for "${illustration.id}"`, () => {
			const ported = INTRO_ART[illustration.id as IntroArtId];
			expect(ported).toBeDefined();
			// Order matters: the compass's southern half is drawn AFTER the
			// northern one because the board shows it winning at their shared
			// corners, and `outline` elements hide what is behind them.
			expect(
				ported.map((el) => ({
					role: el.role,
					mode: el.mode,
					width: el.width,
					opacity: el.opacity,
					d: el.d
				}))
			).toEqual(
				illustration.elements.map((el) => ({
					role: el.role,
					mode: el.mode,
					width: el.width,
					opacity: el.opacity,
					d: el.d
				}))
			);
		});
	}

	it('gives every slide an illustration that exists', () => {
		for (const slide of INTRO_SLIDES) expect(INTRO_ART[slide.art]).toBeDefined();
	});

	it('resolves each slide string exactly once, plus the chrome', () => {
		// A duplicate would resolve the same key twice at build time — harmless,
		// but it means two places believe they own the same string.
		expect(new Set(INTRO_KEYS).size).toBe(INTRO_KEYS.length);
		for (const slide of INTRO_SLIDES) {
			expect(INTRO_KEYS).toContain(slide.titleKey);
			expect(INTRO_KEYS).toContain(slide.bodyKey);
		}
	});
});
