/**
 * What the intro is, as data (spec 020).
 *
 * Three slides, each an illustration and two corpus keys. The order is the
 * argument the product makes to somebody who has never heard of it — you keep
 * nothing on paper, you keep the keys, and the address you get works
 * everywhere — so it lives here once and all four apps read the same sequence.
 */
import type { IntroArtId } from './art';

export interface IntroSlideSpec {
	art: IntroArtId;
	titleKey: string;
	bodyKey: string;
}

export const INTRO_SLIDES: readonly IntroSlideSpec[] = [
	{
		art: 'no-seed-phrase',
		titleKey: 'onboarding.intro.noSeedTitle',
		bodyKey: 'onboarding.intro.noSeedBody'
	},
	{
		art: 'keys-are-yours',
		titleKey: 'onboarding.intro.custodyTitle',
		bodyKey: 'onboarding.intro.custodyBody'
	},
	{
		art: 'one-address',
		titleKey: 'onboarding.intro.chainsTitle',
		bodyKey: 'onboarding.intro.chainsBody'
	}
];

/** Every corpus key the intro resolves — the chrome plus the six slide strings. */
export const INTRO_KEYS: readonly string[] = [
	'onboarding.intro.skip',
	'onboarding.intro.next',
	'onboarding.intro.pageOf',
	...INTRO_SLIDES.flatMap((slide) => [slide.titleKey, slide.bodyKey]),
	'onboarding.welcome.createWallet',
	'onboarding.welcome.alreadyHaveWallet'
];
