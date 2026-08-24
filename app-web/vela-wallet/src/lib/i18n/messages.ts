/**
 * Welcome-page message manifest (spec 006, data-model.md PageMessages) plus
 * the onboarding-flow message manifest (spec 014, contracts/i18n-keys.md).
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

/**
 * The v2 name screen. Two gates, not four (spec 019): the legal line kept its
 * inline link fragments but moved from `ack3` to `ack1`, and the recovery line
 * became the assurance beside them rather than a third box.
 */
const FLOW_FORM_KEYS = [
	'onboarding.create.headerDefault',
	'onboarding.create.accountNameLabel',
	'onboarding.create.accountNamePlaceholder',
	'onboarding.create.accountNameHint',
	'onboarding.create.nameTooLong',
	'onboarding.create.ack0',
	'onboarding.create.ack1',
	'onboarding.create.ack1PrivacyPolicy',
	'onboarding.create.ack1And',
	'onboarding.create.ack1Terms',
	'onboarding.create.ack1Period',
	'onboarding.create.assuranceRecovery',
	'onboarding.create.nextBtn',
	'onboarding.create.finishVerifyBtn',
	'onboarding.create.startOverBtn',
	'onboarding.create.createWalletBtn'
] as const;

/** The founding-key list and its three add methods (spec 019). */
const FLOW_KEYS_SCREEN_KEYS = [
	'onboarding.create.keysTitle',
	'onboarding.create.keysTitleBlocked',
	'onboarding.create.keysSubtitle',
	'onboarding.create.keysSubtitleBlocked',
	'onboarding.create.keysSubtitleFull',
	'onboarding.create.keysLabel',
	'onboarding.create.keysHint',
	'onboarding.create.keyCount',
	'onboarding.create.keyLimitReached',
	'onboarding.create.keySyncedBadge',
	'onboarding.create.keyDeviceOnlyBadge',
	'onboarding.create.keyHardwareBadge',
	'onboarding.create.needSecondKeyHint',
	'onboarding.create.addKeyBtn',
	'onboarding.create.addSecondKeyBtn',
	'onboarding.create.addMethodLabel',
	'onboarding.create.confirmKeyBtn',
	'onboarding.create.removeKeyBtn',
	'onboarding.create.methodPlatformTitle',
	'onboarding.create.methodPlatformBody',
	'onboarding.create.methodHybridTitle',
	'onboarding.create.methodHybridBody',
	'onboarding.create.methodHybridUnavailable',
	'onboarding.create.methodSecurityKeyTitle',
	'onboarding.create.methodSecurityKeyBody'
] as const;

/** The progress, retry and done screens (spec 019). */
const FLOW_OUTCOME_SCREEN_KEYS = [
	'onboarding.create.progressTitle',
	'onboarding.create.progressSubtitle',
	'onboarding.create.progressMeterLabel',
	'onboarding.create.taskVerifyKey',
	'onboarding.create.taskDeriveAddress',
	'onboarding.create.taskWriteIndex',
	'onboarding.create.syncFailedTitle',
	'onboarding.create.syncFailedMessage',
	'onboarding.create.syncFailedHint',
	'onboarding.create.retryUploadBtn',
	'onboarding.create.successTitle',
	'onboarding.create.successMessage',
	'onboarding.create.walletAddressLabel',
	'onboarding.create.identiconHint',
	'onboarding.create.enterWalletBtn'
] as const;

/** Every prompt the two machines can raise (spec 019). */
const FLOW_PROMPT_KEYS = [
	'onboarding.create.alertErrorTitle',
	'onboarding.create.alertNotSupportedTitle',
	'onboarding.create.alertNotSupportedBody',
	'onboarding.common.notDiscoverableTitle',
	'onboarding.common.notDiscoverableBody',
	'onboarding.common.recreateWallet',
	'onboarding.common.retry',
	'onboarding.common.back',
	'onboarding.login.alertNotSupportedTitle',
	'onboarding.login.alertNotSupportedBody',
	'onboarding.login.alertIncompatibleTitle',
	'onboarding.login.alertIncompatibleBody',
	'onboarding.login.alertIncompatibleBodyCreate',
	'onboarding.login.alertSignInFailedTitle',
	'onboarding.login.alertSignInFailedBody',
	'onboarding.login.recoverOfferTitle',
	'onboarding.login.recoverOfferBody',
	'onboarding.login.recoverConfirm',
	'onboarding.login.recoverCancel',
	'onboarding.login.recoverFailedTitle',
	'onboarding.login.recoverFailedBody',
	'onboarding.login.switchDeviceBtn',
	'onboarding.login.statusCancelledTitle',
	'onboarding.login.statusCancelledBody',
	'onboarding.settings.warningText'
] as const;

/** The transient status line the create machine reports. */
const FLOW_STATUS_KEYS = [
	'onboarding.create.statusSettingUpIdentity',
	'onboarding.create.statusVerifyingIdentity',
	'onboarding.create.statusExtractingKey',
	'onboarding.create.statusComputingAddress',
	'onboarding.create.statusSyncingKey',
	'onboarding.create.statusSetupCancelled',
	'onboarding.create.statusVerifyCancelled'
] as const;

/** Login waiting pattern. */
const FLOW_LOGIN_WAIT_KEYS = [
	'onboarding.login.statusAwaitingPasskey',
	'onboarding.login.statusAwaitingPasskeyHint'
] as const;

/**
 * Every corpus key the v2 onboarding screens can resolve at runtime.
 *
 * Spelled out rather than derived from a catalog, because the catalog it used
 * to be derived from is gone: spec 014's eighteen `OutcomeKind`s were a design
 * taxonomy the core does not express. A transport failure and a 503 both reach
 * a shell as `CreateFailed { detail }` with the platform's own words, so
 * rendering them as distinct screens would mean classifying error strings in
 * TypeScript — the one thing the architecture exists to prevent. What the core
 * actually emits is nine prompts, and those are listed above.
 */
export const FLOW_KEYS: readonly string[] = [
	...new Set([
		...FLOW_CHROME_KEYS,
		...FLOW_FORM_KEYS,
		...FLOW_KEYS_SCREEN_KEYS,
		...FLOW_OUTCOME_SCREEN_KEYS,
		...FLOW_PROMPT_KEYS,
		...FLOW_STATUS_KEYS,
		...FLOW_LOGIN_WAIT_KEYS
	])
];

/**
 * Serialized flow copy: dotted corpus key → resolved template. Interpolation
 * placeholders (`{{seconds}}`, `{{current}}`…) ship raw and are filled
 * client-side by `fillTemplate` from frozen presentation state (FR-011).
 */
export type FlowMessages = Readonly<Record<string, string>>;
