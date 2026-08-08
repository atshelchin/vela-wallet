/**
 * Gallery fixtures — 34 unique design codes (spec 014, contracts §1).
 *
 * One named, selectable instantiation per state inventory code, carrying the
 * mock's representative data. E10 is a single fixture listed under BOTH flow
 * groups (the 35th mock file is its login-directory duplicate). Fixtures are
 * gallery data only — production code paths never read this module.
 */
import { outcomeSpec } from './outcomes';
import type { CreatePanelState, LoginPanelState, TechDetails } from './states';

export type FixtureFlow = 'create' | 'login' | 'shared';

export interface StateFixture {
	/** Design code, verbatim (A1 … E10). */
	code: string;
	flow: FixtureFlow;
	state: CreatePanelState | LoginPanelState;
}

/** A11 fixture address — full 42 chars; display truncates, copy copies all. */
export const FIXTURE_ADDRESS = '0x44EEC06897ff7ab8C7f16819511A64bA168A6D33';

/** E2/E2x TechDetails, pinned by contracts/presentation-states.md §1. */
const SERVER_DETAILS: TechDetails = {
	code: 'E_SERVER',
	context: '第 5 步同步公钥；以及登录',
	endpoint: 'HTTP 503 · p256-index.getvela.app'
};

const emptyForm: CreatePanelState = {
	kind: 'form',
	name: '',
	nameTooLong: false,
	acks: [false, false, false],
	canSubmit: false,
	busy: false
};

const working = (
	step: 1 | 2 | 3 | 4 | 5,
	status: Extract<CreatePanelState, { kind: 'working' }>['status'],
	elapsedSecs?: number
): CreatePanelState => ({
	kind: 'working',
	step,
	status,
	showHint: step === 1,
	elapsedSecs
});

export const FIXTURES: readonly StateFixture[] = [
	{ code: 'A1', flow: 'create', state: emptyForm },
	{
		code: 'A2',
		flow: 'create',
		state: {
			kind: 'form',
			name: '大表哥',
			nameTooLong: false,
			acks: [true, true, true],
			canSubmit: true,
			busy: false
		}
	},
	{
		code: 'A3',
		flow: 'create',
		state: {
			kind: 'form',
			name: '一个特别特别特别长的账户名称示例',
			nameTooLong: true,
			acks: [false, false, false],
			canSubmit: false,
			busy: false
		}
	},
	{ code: 'A4', flow: 'create', state: working(1, 'setting_up_identity') },
	{ code: 'A4c', flow: 'create', state: working(1, 'setting_up_identity', 19) },
	{ code: 'A5', flow: 'create', state: working(2, 'verifying_identity') },
	{ code: 'A5c', flow: 'create', state: working(2, 'verifying_identity', 6) },
	{ code: 'A6', flow: 'create', state: working(3, 'extracting_key') },
	{ code: 'A6c', flow: 'create', state: working(3, 'extracting_key', 9) },
	{ code: 'A7', flow: 'create', state: working(4, 'computing_address') },
	{ code: 'A7c', flow: 'create', state: working(4, 'computing_address', 12) },
	{ code: 'A8', flow: 'create', state: working(5, 'syncing_key') },
	{ code: 'A8c', flow: 'create', state: working(5, 'syncing_key', 8) },
	{
		code: 'A11',
		flow: 'create',
		state: {
			kind: 'outcome',
			spec: outcomeSpec('created', { address: FIXTURE_ADDRESS, bodyParams: { count: 12 } })
		}
	},
	{
		code: 'A12',
		flow: 'create',
		state: {
			kind: 'outcome',
			spec: outcomeSpec('sync_failed', {
				details: {
					code: 'E_SYNC',
					context: '第 5 步同步公钥',
					endpoint: 'HTTP 503 · p256-index.getvela.app'
				}
			})
		}
	},
	{
		code: 'A13',
		flow: 'create',
		state: {
			kind: 'outcome',
			spec: outcomeSpec('verify_stuck', {
				details: { code: 'E_VERIFY_STUCK', context: '第 2 步验证身份' }
			})
		}
	},
	{
		code: 'E1',
		flow: 'create',
		state: {
			kind: 'outcome',
			spec: outcomeSpec('network', {
				details: {
					code: 'E_NETWORK',
					context: '第 1 步设置安全身份',
					endpoint: 'p256-index.getvela.app'
				}
			})
		}
	},
	{
		code: 'E2',
		flow: 'create',
		state: { kind: 'outcome', spec: outcomeSpec('server', { details: SERVER_DETAILS }) }
	},
	{
		code: 'E2x',
		flow: 'create',
		state: {
			kind: 'outcome',
			spec: outcomeSpec('server', { details: SERVER_DETAILS, detailsExpanded: true })
		}
	},
	{
		code: 'E3',
		flow: 'create',
		state: {
			kind: 'outcome',
			spec: outcomeSpec('timeout', {
				bodyParams: { seconds: 60 },
				details: {
					code: 'E_TIMEOUT',
					context: '第 5 步同步公钥',
					endpoint: 'p256-index.getvela.app'
				}
			})
		}
	},
	{
		code: 'E4',
		flow: 'create',
		state: {
			kind: 'outcome',
			spec: outcomeSpec('cancelled_setup', {
				details: { code: 'E_CANCELLED', context: '第 1 步设置安全身份' }
			})
		}
	},
	{
		code: 'E5',
		flow: 'create',
		state: {
			kind: 'outcome',
			spec: outcomeSpec('cancelled_verify', {
				details: { code: 'E_CANCELLED', context: '第 2 步验证身份' }
			})
		}
	},
	{
		code: 'E6',
		flow: 'create',
		state: {
			kind: 'outcome',
			spec: outcomeSpec('unsupported', {
				details: { code: 'E_NOT_SUPPORTED', context: '平台认证器不可用' }
			})
		}
	},
	{
		code: 'E7',
		flow: 'create',
		state: {
			kind: 'outcome',
			spec: outcomeSpec('incompatible', {
				details: { code: 'E_INCOMPATIBLE', context: '密码管理器不支持所需算法' }
			})
		}
	},
	{
		code: 'E8',
		flow: 'create',
		state: {
			kind: 'outcome',
			spec: outcomeSpec('not_discoverable', {
				details: { code: 'E_NOT_DISCOVERABLE', context: '通行密钥仅存于本机' }
			})
		}
	},
	{
		code: 'E9',
		flow: 'login',
		state: {
			kind: 'outcome',
			spec: outcomeSpec('account_not_found', {
				details: {
					code: 'E_NOT_FOUND',
					context: '登录查询公钥索引',
					endpoint: 'HTTP 404 · p256-index.getvela.app'
				}
			})
		}
	},
	{
		code: 'E10',
		flow: 'shared',
		state: {
			kind: 'outcome',
			spec: outcomeSpec('unknown', {
				details: { code: 'E_UNKNOWN', context: '未归类异常' }
			})
		}
	},
	{ code: 'B1', flow: 'login', state: { kind: 'waiting' } },
	{ code: 'B1c', flow: 'login', state: { kind: 'waiting', elapsedSecs: 41 } },
	{
		code: 'B2',
		flow: 'login',
		state: {
			kind: 'outcome',
			spec: outcomeSpec('recover_offer', {
				details: {
					code: 'E_NO_RECORD',
					context: '登录查询公钥索引',
					endpoint: 'HTTP 404 · p256-index.getvela.app'
				}
			})
		}
	},
	{
		code: 'B3',
		flow: 'login',
		state: {
			kind: 'outcome',
			spec: outcomeSpec('recover_failed', {
				details: { code: 'E_RECOVER', context: '两次签名重建公钥失败' }
			})
		}
	},
	{
		code: 'B4',
		flow: 'login',
		state: {
			kind: 'outcome',
			spec: outcomeSpec('sign_in_failed', {
				details: { code: 'E_SIGN_IN', context: '通行密钥断言失败' }
			})
		}
	},
	{
		code: 'B5',
		flow: 'login',
		state: {
			kind: 'outcome',
			spec: outcomeSpec('signed_in', {
				details: {
					code: 'OK',
					context: '通行密钥断言已验证',
					endpoint: 'p256-index.getvela.app'
				}
			})
		}
	},
	{
		code: 'B6',
		flow: 'login',
		state: {
			kind: 'outcome',
			spec: outcomeSpec('login_cancelled', {
				details: { code: 'E_CANCELLED', context: '通行密钥弹窗被关闭' }
			})
		}
	}
];

/** Gallery grouping: `shared` fixtures (E10) appear in BOTH flow groups. */
export function fixturesForFlow(flow: 'create' | 'login'): StateFixture[] {
	return FIXTURES.filter((fixture) => fixture.flow === flow || fixture.flow === 'shared');
}
