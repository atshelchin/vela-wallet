/**
 * Welcome-page message manifest (spec 006, data-model.md PageMessages) plus
 * the onboarding-flow message manifest (spec 014, contracts/i18n-keys.md).
 *
 * Keys live in the vela-core corpus (`onboarding.welcomeWeb.*` plus two reused
 * `onboarding.welcome.*` actions). This module is client-safe: it names keys
 * and shapes; resolution happens only in `engine.server.ts`.
 */
import { catalogI18nKeys, CREATE_STATUS_I18N } from '$lib/onboarding/outcomes';

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
	features: FeatureCardMessages[];
}

/**
 * Every corpus key the Welcome page consumes (tests iterate this).
 * `onboarding.welcomeWeb.passkeyIndexLink` stays in the corpus for the future
 * settings screen but left the page per founder direction (2026-08-01).
 */
export const WELCOME_KEYS = [
	'onboarding.welcomeWeb.meta.title',
	'onboarding.welcomeWeb.meta.description',
	'onboarding.welcomeWeb.tagline',
	'onboarding.welcome.createWallet',
	'onboarding.welcome.alreadyHaveWallet',
	...FEATURE_SLUGS.flatMap((slug) => [
		`onboarding.welcomeWeb.features.${slug}.title`,
		`onboarding.welcomeWeb.features.${slug}.description`
	])
] as const;

/* ------------------------------------------------------------------------ */
/* Onboarding flow messages (spec 014, T025)                                 */
/* ------------------------------------------------------------------------ */

/** Scaffold chrome + pattern furniture the panels resolve outside the outcome catalog. */
const FLOW_CHROME_KEYS = [
	'onboarding.common.close',
	'onboarding.common.copyAddress',
	'onboarding.common.copied',
	'onboarding.create.technicalDetails',
	'onboarding.common.stepCounter',
	'onboarding.common.confirmInPrompt',
	'onboarding.common.waitedSeconds'
] as const;

/** Form pattern (A1–A3) — all EXISTS keys per contracts/i18n-keys.md. */
const FLOW_FORM_KEYS = [
	'onboarding.create.accountNameLabel',
	'onboarding.create.accountNamePlaceholder',
	'onboarding.create.accountNameHint',
	'onboarding.create.nameTooLong',
	'onboarding.create.ack0',
	'onboarding.create.ack1',
	'onboarding.create.ack3',
	'onboarding.create.ack3PrivacyPolicy',
	'onboarding.create.ack3And',
	'onboarding.create.ack3Terms',
	'onboarding.create.ack3Period',
	'onboarding.create.createWalletBtn'
] as const;

/** Login waiting pattern (B1/B1c). */
const FLOW_LOGIN_WAIT_KEYS = [
	'onboarding.login.statusAwaitingPasskey',
	'onboarding.login.statusAwaitingPasskeyHint'
] as const;

/**
 * Every corpus key `CreatePanel`/`LoginPanel` can resolve at runtime
 * (contracts/i18n-keys.md per-state map). Outcome copy — titles, headlines,
 * bodies, captions, action labels — is derived from the one authoritative
 * catalog in `$lib/onboarding/outcomes.ts` so this manifest cannot drift.
 */
export const FLOW_KEYS: readonly string[] = [
	...new Set([
		...FLOW_CHROME_KEYS,
		...FLOW_FORM_KEYS,
		...Object.values(CREATE_STATUS_I18N),
		...FLOW_LOGIN_WAIT_KEYS,
		...catalogI18nKeys()
	])
];

/**
 * Serialized flow copy: dotted corpus key → resolved template. Interpolation
 * placeholders (`{{seconds}}`, `{{current}}`…) ship raw and are filled
 * client-side by `fillTemplate` from frozen presentation state (FR-011).
 */
export type FlowMessages = Readonly<Record<string, string>>;
