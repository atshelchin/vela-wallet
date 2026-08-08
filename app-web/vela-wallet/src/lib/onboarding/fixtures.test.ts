/**
 * Fixture coverage + reuse gates (spec 014 T029, SC-001/SC-003).
 *
 * Mechanical guarantee that no design state can silently drop out of the
 * gallery: the exact 34-code set (35 mocks; E10's login-directory file is a
 * duplicate rendering), the per-flow grouping contract, and the action-shape
 * invariant of every OutcomeSpec.
 *
 * One-authority spot check (US3): pattern layout lives ONLY under
 * `src/lib/ui/onboarding/`. Verified by grep — each of these must match only
 * files inside that directory:
 *
 *   grep -rln "OutcomeBody\|ActionStack\|StatusBadge\|TechDetails\|AddressStrip" src/lib src/routes --include='*.svelte'
 *   grep -rln "StepProgress\|ElapsedRing\|NameField\|AckRow\|FlowScaffold" src/lib src/routes --include='*.svelte'
 *
 * except the two hosts (`src/routes/dev/gallery/+page.svelte`,
 * `src/routes/[locale]/+page.svelte`), which may import only the assembled
 * CreatePanel/LoginPanel/Sheet — never the atoms.
 */
import { describe, expect, it } from 'vitest';
import { FIXTURES, fixturesForFlow } from './fixtures';
import { outcomeSpec } from './outcomes';
import type { OutcomeKind, OutcomeSpec } from './states';

/** Contract §1: fixture ids are the design codes verbatim — 34 unique. */
const ALL_CODES = [
	'A1',
	'A2',
	'A3',
	'A4',
	'A4c',
	'A5',
	'A5c',
	'A6',
	'A6c',
	'A7',
	'A7c',
	'A8',
	'A8c',
	'A11',
	'A12',
	'A13',
	'E1',
	'E2',
	'E2x',
	'E3',
	'E4',
	'E5',
	'E6',
	'E7',
	'E8',
	'E9',
	'E10',
	'B1',
	'B1c',
	'B2',
	'B3',
	'B4',
	'B5',
	'B6'
] as const;

const CREATE_GROUP = ALL_CODES.filter(
	(code) => code.startsWith('A') || code.startsWith('E')
).filter((code) => code !== 'E9');
const LOGIN_GROUP = ALL_CODES.filter(
	(code) => code.startsWith('B') || code === 'E9' || code === 'E10'
);

const sorted = (codes: readonly string[]) => [...codes].sort();

describe('fixture inventory (contract §1)', () => {
	it('carries exactly the 34 unique design codes', () => {
		expect(FIXTURES).toHaveLength(34);
		expect(new Set(FIXTURES.map((f) => f.code)).size).toBe(34);
		expect(sorted(FIXTURES.map((f) => f.code))).toEqual(sorted(ALL_CODES));
	});

	it('groups create: A1–A13, E1–E8 (+E2x) and shared E10', () => {
		expect(sorted(fixturesForFlow('create').map((f) => f.code))).toEqual(sorted(CREATE_GROUP));
	});

	it('groups login: B1–B6 (+B1c), E9 and shared E10', () => {
		expect(sorted(fixturesForFlow('login').map((f) => f.code))).toEqual(sorted(LOGIN_GROUP));
	});

	it('E10 is reachable from BOTH flow groups via one shared fixture entry', () => {
		expect(FIXTURES.filter((f) => f.code === 'E10')).toHaveLength(1);
		expect(FIXTURES.find((f) => f.code === 'E10')?.flow).toBe('shared');
		expect(fixturesForFlow('create').some((f) => f.code === 'E10')).toBe(true);
		expect(fixturesForFlow('login').some((f) => f.code === 'E10')).toBe(true);
	});

	it('flows are per-code: A*/E1–E8 create, B*/E9 login, E10 shared', () => {
		for (const fixture of FIXTURES) {
			const expected =
				fixture.code === 'E10'
					? 'shared'
					: fixture.code.startsWith('B') || fixture.code === 'E9'
						? 'login'
						: 'create';
			expect(fixture.flow, fixture.code).toBe(expected);
		}
	});
});

describe('OutcomeSpec action shape (data-model §3: 1 primary + 0..=2 secondary)', () => {
	const ALL_KINDS: readonly OutcomeKind[] = [
		'created',
		'sync_failed',
		'verify_stuck',
		'network',
		'server',
		'timeout',
		'cancelled_setup',
		'cancelled_verify',
		'unsupported',
		'incompatible',
		'not_discoverable',
		'account_not_found',
		'unknown',
		'recover_offer',
		'recover_failed',
		'sign_in_failed',
		'signed_in',
		'login_cancelled'
	];

	const assertShape = (spec: OutcomeSpec, label: string) => {
		const primaries = spec.actions.filter((action) => action.role === 'primary');
		const secondaries = spec.actions.filter((action) => action.role === 'secondary');
		expect(primaries, label).toHaveLength(1);
		expect(spec.actions[0].role, `${label}: primary comes first`).toBe('primary');
		expect(secondaries.length, label).toBeLessThanOrEqual(2);
		expect(spec.actions).toHaveLength(primaries.length + secondaries.length);
	};

	it('holds for every kind in the catalog', () => {
		for (const kind of ALL_KINDS) assertShape(outcomeSpec(kind), kind);
	});

	it('holds for every outcome fixture as instantiated', () => {
		const outcomes = FIXTURES.filter((f) => f.state.kind === 'outcome');
		expect(outcomes.length).toBeGreaterThanOrEqual(18);
		for (const fixture of outcomes) {
			if (fixture.state.kind !== 'outcome') continue;
			assertShape(fixture.state.spec, fixture.code);
		}
	});
});
