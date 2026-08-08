/**
 * Presentation state model for the onboarding create/login flows (spec 014).
 *
 * Pure renderable shapes — NO business behaviour lives here or behind here
 * (FR-010/FR-011): no passkey ceremony, no network, no storage, no timers.
 * Field vocabulary follows `specs/014-onboarding-flow-ui/data-model.md`
 * (casing per platform convention → camelCase fields, snake_case enum
 * values, which are the authoritative cross-platform vocabulary). A later
 * wiring feature maps the spec-011 crux ViewModels onto these shapes.
 */

/** Badge circle variants (data-model §3). */
export type BadgeVariant = 'success' | 'warning' | 'neutral' | 'error' | 'timeout' | 'info';

/** Scaffold title selector (data-model §3); mapped to i18n keys in outcomes.ts. */
export type TitleKey = 'create' | 'login' | 'sync' | 'shared';

/**
 * Every action press emits one of these to the host-provided sink
 * (contracts/presentation-states.md §2). Components never decide what
 * happens next.
 */
export type ActionId =
	| 'submit_create'
	| 'enter_wallet'
	| 'finish_verify'
	| 'start_over_new_passkey'
	| 'retry'
	| 'retry_upload'
	| 'retry_verify'
	| 'retry_login'
	| 'recreate_wallet'
	| 'create_new_wallet'
	| 'recover_now'
	| 'not_now'
	| 'edit_index_endpoint'
	| 'report_error'
	| 'open_biometric_settings'
	| 'open_credential_manager_settings'
	| 'back'
	| 'cancel'
	| 'close'
	| 'copy_address'
	| 'toggle_details'
	| 'open_privacy_policy'
	| 'open_terms';

export type ActionRole = 'primary' | 'secondary';

/** One stacked action: 1 primary + 0..2 secondary per outcome (data-model §3). */
export interface Action {
	role: ActionRole;
	/** Dotted corpus key; resolved by the host/panel, never hard-coded copy. */
	labelKey: string;
	id: ActionId;
}

/**
 * Runtime diagnostics shown by the 技术详情 disclosure (E2x anatomy).
 * Content is data, not copy (research D1) — only the disclosure label is
 * localized.
 */
export interface TechDetails {
	/** e.g. "E_SERVER" — rendered in the error color. */
	code: string;
	/** e.g. "第 5 步同步公钥；以及登录". */
	context: string;
	/** e.g. "HTTP 503 · p256-index.getvela.app". */
	endpoint?: string;
}

/** One shape renders every result/error state (data-model §3). */
export interface OutcomeSpec {
	scaffoldTitle: TitleKey;
	badge: BadgeVariant;
	headlineKey: string;
	bodyKey: string;
	/** `{{var}}` fills for the body (e.g. timeout `{seconds: 60}`, created `{count: 12}`). */
	bodyParams?: Record<string, string | number>;
	/** Sub-caption under the address strip (A11 verify line). Web extension of data-model §3. */
	captionKey?: string;
	/** Present → copyable address strip (A11 only). */
	address?: string;
	/** Present → 技术详情 disclosure rendered. */
	details?: TechDetails;
	/** Default false; the E2x fixture sets true. Requires `details`. */
	detailsExpanded: boolean;
	/** Exactly 1 primary + 0..=2 secondary, top-to-bottom. */
	actions: Action[];
}

/** Mock-driven outcome taxonomy, 18 kinds (data-model §4). */
export type OutcomeKind =
	| 'created'
	| 'sync_failed'
	| 'verify_stuck'
	| 'network'
	| 'server'
	| 'timeout'
	| 'cancelled_setup'
	| 'cancelled_verify'
	| 'unsupported'
	| 'incompatible'
	| 'not_discoverable'
	| 'account_not_found'
	| 'unknown'
	| 'recover_offer'
	| 'recover_failed'
	| 'sign_in_failed'
	| 'signed_in'
	| 'login_cancelled';

/** Mirrors the spec-011 `StatusKey` working subset (data-model §2). */
export type CreateStatusKey =
	| 'setting_up_identity'
	| 'verifying_identity'
	| 'extracting_key'
	| 'computing_address'
	| 'syncing_key';

export type CreateStep = 1 | 2 | 3 | 4 | 5;

export type CreatePanelState =
	| {
			kind: 'form';
			name: string;
			/** spec011 `name_too_long` — red inline hint (A3). */
			nameTooLong: boolean;
			/** Three acknowledgment rows (design consolidates spec011's four flags). */
			acks: [boolean, boolean, boolean];
			/** Derived rule: `!nameTooLong && name nonempty && all acks`. */
			canSubmit: boolean;
			/** spec011 `busy` — reserved; not exercised in this feature. */
			busy: boolean;
	  }
	| {
			kind: 'working';
			/** Drives the 5-segment bar + "第 N/5 步". */
			step: CreateStep;
			status: CreateStatusKey;
			/** A4 sub-caption 请在系统弹窗中确认 (step 1 only in mocks). */
			showHint: boolean;
			/** Set → renders the frozen countdown ring (`c` variants). */
			elapsedSecs?: number;
	  }
	| { kind: 'outcome'; spec: OutcomeSpec };

export type LoginPanelState =
	| {
			kind: 'waiting';
			/** B1 → undefined, B1c → 41. */
			elapsedSecs?: number;
	  }
	| { kind: 'outcome'; spec: OutcomeSpec };

export type PanelState = CreatePanelState | LoginPanelState;

/**
 * How resolved copy reaches the panels: the host (gallery today, Welcome
 * later) supplies a resolver over serialized strings — components never call
 * a t() of their own. Implementations MUST fall back to the key itself when
 * a key is missing (new corpus keys may land in parallel).
 */
export type StringResolver = (key: string, params?: Record<string, string | number>) => string;
