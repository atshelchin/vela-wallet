/**
 * Welcome-page message manifest (spec 006, data-model.md PageMessages).
 *
 * Keys live in the vela-core corpus (`onboarding.welcomeWeb.*` plus two reused
 * `onboarding.welcome.*` actions). This module is client-safe: it names keys
 * and shapes; resolution happens only in `engine.server.ts`.
 */

/** Order matches the reference designs: cards 01–06. */
export const FEATURE_SLUGS = [
	'noSeedPhrase',
	'oneAddress',
	'openSource',
	'keysInPasswordManager',
	'safeContracts',
	'stablecoinGas'
] as const;

export type FeatureSlug = (typeof FEATURE_SLUGS)[number];

export interface FeatureCardMessages {
	/** Zero-padded display number, '01'…'06'. */
	number: string;
	title: string;
	description: string;
}

export interface WelcomeMessages {
	metaTitle: string;
	metaDescription: string;
	tagline: string;
	createWallet: string;
	alreadyHaveWallet: string;
	passkeyIndexLink: string;
	features: FeatureCardMessages[];
}

/** Every corpus key the Welcome page consumes (tests iterate this). */
export const WELCOME_KEYS = [
	'onboarding.welcomeWeb.meta.title',
	'onboarding.welcomeWeb.meta.description',
	'onboarding.welcomeWeb.tagline',
	'onboarding.welcome.createWallet',
	'onboarding.welcome.alreadyHaveWallet',
	'onboarding.welcomeWeb.passkeyIndexLink',
	...FEATURE_SLUGS.flatMap((slug) => [
		`onboarding.welcomeWeb.features.${slug}.title`,
		`onboarding.welcomeWeb.features.${slug}.description`
	])
] as const;
