/**
 * OutcomeKind → OutcomeSpec catalog (spec 014, data-model §4).
 *
 * The ONE authoritative mapping from each outcome kind to its scaffold
 * title, badge variant, copy keys and action set. Components never branch
 * on kind — they render the spec. Instance data (address, tech details,
 * body params) is merged in via `overrides`, because diagnostics are data,
 * not copy (research D1).
 *
 * All keys are dotted corpus keys per contracts/i18n-keys.md.
 */
import type {
	Action,
	CreatePanelState,
	CreateStatusKey,
	LoginPanelState,
	OutcomeKind,
	OutcomeSpec,
	TechDetails,
	TitleKey
} from './states';

/** Scaffold title selector → corpus key (contracts/i18n-keys.md). */
export const TITLE_KEY_I18N: Record<TitleKey, string> = {
	create: 'onboarding.create.headerDefault',
	login: 'onboarding.login.header',
	sync: 'onboarding.create.headerSyncFailed',
	shared: 'onboarding.common.headerShared'
};

/** Create working-status → headline corpus key (A4–A8, all EXISTS). */
export const CREATE_STATUS_I18N: Record<CreateStatusKey, string> = {
	setting_up_identity: 'onboarding.create.statusSettingUpIdentity',
	verifying_identity: 'onboarding.create.statusVerifyingIdentity',
	extracting_key: 'onboarding.create.statusExtractingKey',
	computing_address: 'onboarding.create.statusComputingAddress',
	syncing_key: 'onboarding.create.statusSyncingKey'
};

const primary = (id: Action['id'], labelKey: string): Action => ({ role: 'primary', id, labelKey });
const secondary = (id: Action['id'], labelKey: string): Action => ({
	role: 'secondary',
	id,
	labelKey
});

const BACK = secondary('back', 'onboarding.common.back');
const RETRY = primary('retry', 'onboarding.common.retry');
const EDIT_INDEX = secondary('edit_index_endpoint', 'onboarding.common.editIndexEndpoint');
const REPORT = secondary('report_error', 'onboarding.common.reportError');

type CatalogEntry = Omit<OutcomeSpec, 'address' | 'details' | 'detailsExpanded' | 'bodyParams'>;

const CATALOG: Record<OutcomeKind, CatalogEntry> = {
	created: {
		scaffoldTitle: 'create',
		badge: 'success',
		headlineKey: 'onboarding.create.successTitle',
		bodyKey: 'onboarding.create.successMessage',
		captionKey: 'onboarding.create.verifyHint',
		actions: [primary('enter_wallet', 'onboarding.create.enterWalletBtn')]
	},
	sync_failed: {
		scaffoldTitle: 'sync',
		badge: 'warning',
		headlineKey: 'onboarding.create.syncFailedTitle',
		bodyKey: 'onboarding.common.syncFailedBody',
		actions: [primary('retry_upload', 'onboarding.create.retryUploadBtn'), EDIT_INDEX, REPORT]
	},
	verify_stuck: {
		scaffoldTitle: 'create',
		badge: 'warning',
		headlineKey: 'onboarding.common.verifyStuckTitle',
		bodyKey: 'onboarding.common.verifyStuckBody',
		actions: [
			primary('finish_verify', 'onboarding.create.finishVerifyBtn'),
			secondary('start_over_new_passkey', 'onboarding.create.startOverBtn'),
			BACK
		]
	},
	network: {
		scaffoldTitle: 'create',
		badge: 'error',
		headlineKey: 'onboarding.common.networkTitle',
		bodyKey: 'onboarding.common.networkBody',
		// Root `common.cancel` is reused deliberately (contracts/i18n-keys.md, E1 note).
		actions: [RETRY, secondary('cancel', 'common.cancel')]
	},
	server: {
		scaffoldTitle: 'create',
		badge: 'error',
		headlineKey: 'onboarding.common.serverTitle',
		bodyKey: 'onboarding.common.serverBody',
		actions: [RETRY, EDIT_INDEX, REPORT]
	},
	timeout: {
		scaffoldTitle: 'create',
		badge: 'timeout',
		headlineKey: 'onboarding.common.timeoutTitle',
		bodyKey: 'onboarding.common.timeoutBody',
		actions: [RETRY, BACK]
	},
	cancelled_setup: {
		scaffoldTitle: 'create',
		badge: 'neutral',
		headlineKey: 'onboarding.common.cancelledSetupTitle',
		bodyKey: 'onboarding.common.cancelledSetupBody',
		actions: [primary('recreate_wallet', 'onboarding.common.recreateWallet'), BACK]
	},
	cancelled_verify: {
		scaffoldTitle: 'create',
		badge: 'neutral',
		headlineKey: 'onboarding.common.cancelledVerifyTitle',
		bodyKey: 'onboarding.common.cancelledVerifyBody',
		actions: [primary('retry_verify', 'onboarding.create.retryVerifyBtn'), BACK]
	},
	unsupported: {
		scaffoldTitle: 'create',
		badge: 'error',
		headlineKey: 'onboarding.common.unsupportedTitle',
		bodyKey: 'onboarding.common.unsupportedBody',
		actions: [primary('open_biometric_settings', 'onboarding.common.openBiometricSettings'), BACK]
	},
	incompatible: {
		scaffoldTitle: 'create',
		badge: 'error',
		headlineKey: 'onboarding.common.incompatibleTitle',
		bodyKey: 'onboarding.common.incompatibleBody',
		actions: [
			primary(
				'open_credential_manager_settings',
				'onboarding.common.openCredentialManagerSettings'
			),
			BACK
		]
	},
	not_discoverable: {
		scaffoldTitle: 'create',
		badge: 'warning',
		headlineKey: 'onboarding.common.notDiscoverableTitle',
		bodyKey: 'onboarding.common.notDiscoverableBody',
		actions: [
			primary('recreate_wallet', 'onboarding.common.recreateWallet'),
			secondary(
				'open_credential_manager_settings',
				'onboarding.common.openCredentialManagerSettings'
			),
			BACK
		]
	},
	account_not_found: {
		scaffoldTitle: 'login',
		badge: 'error',
		headlineKey: 'onboarding.common.notFoundTitle',
		bodyKey: 'onboarding.common.notFoundBody',
		actions: [primary('create_new_wallet', 'onboarding.login.createNewWalletBtn'), EDIT_INDEX, BACK]
	},
	unknown: {
		scaffoldTitle: 'shared',
		badge: 'error',
		headlineKey: 'onboarding.common.unknownTitle',
		bodyKey: 'onboarding.common.unknownBody',
		actions: [RETRY, REPORT, BACK]
	},
	recover_offer: {
		scaffoldTitle: 'login',
		badge: 'info',
		headlineKey: 'onboarding.login.recoverOfferTitle',
		bodyKey: 'onboarding.login.recoverOfferBody',
		actions: [
			primary('recover_now', 'onboarding.login.recoverConfirm'),
			secondary('not_now', 'onboarding.login.recoverCancel')
		]
	},
	recover_failed: {
		scaffoldTitle: 'login',
		badge: 'error',
		headlineKey: 'onboarding.login.recoverFailedTitle',
		bodyKey: 'onboarding.login.recoverFailedBody',
		actions: [RETRY, BACK]
	},
	sign_in_failed: {
		scaffoldTitle: 'login',
		badge: 'error',
		headlineKey: 'onboarding.login.alertSignInFailedTitle',
		bodyKey: 'onboarding.login.signInFailedBody',
		actions: [RETRY, REPORT, BACK]
	},
	signed_in: {
		scaffoldTitle: 'login',
		badge: 'success',
		headlineKey: 'onboarding.login.successTitle',
		bodyKey: 'onboarding.login.successMessage',
		actions: [primary('enter_wallet', 'onboarding.create.enterWalletBtn')]
	},
	login_cancelled: {
		scaffoldTitle: 'login',
		badge: 'neutral',
		headlineKey: 'onboarding.login.statusCancelledTitle',
		bodyKey: 'onboarding.login.statusCancelledBody',
		actions: [primary('retry_login', 'onboarding.login.retryLoginBtn'), BACK]
	}
};

export interface OutcomeOverrides {
	address?: string;
	details?: TechDetails;
	detailsExpanded?: boolean;
	bodyParams?: Record<string, string | number>;
}

/** Pure `kind → OutcomeSpec`, instance data merged from `overrides`. */
export function outcomeSpec(kind: OutcomeKind, overrides: OutcomeOverrides = {}): OutcomeSpec {
	return {
		...CATALOG[kind],
		address: overrides.address,
		details: overrides.details,
		detailsExpanded: overrides.detailsExpanded ?? false,
		bodyParams: overrides.bodyParams
	};
}

/**
 * Every corpus key the outcome catalog can resolve at runtime — scaffold
 * titles, headlines, bodies, captions and action labels. Derived from the
 * catalog itself so the flow-message manifest (`$lib/i18n/messages.ts`) can
 * never drift from it.
 */
export function catalogI18nKeys(): string[] {
	const keys = new Set<string>(Object.values(TITLE_KEY_I18N));
	for (const entry of Object.values(CATALOG)) {
		keys.add(entry.headlineKey);
		keys.add(entry.bodyKey);
		if (entry.captionKey !== undefined) keys.add(entry.captionKey);
		for (const action of entry.actions) keys.add(action.labelKey);
	}
	return [...keys];
}

/** Scaffold title corpus key for any renderable state of a given flow. */
export function scaffoldTitleI18nKey(
	state: CreatePanelState | LoginPanelState,
	flow: 'create' | 'login'
): string {
	if (state.kind === 'outcome') return TITLE_KEY_I18N[state.spec.scaffoldTitle];
	return flow === 'create' ? TITLE_KEY_I18N.create : TITLE_KEY_I18N.login;
}
