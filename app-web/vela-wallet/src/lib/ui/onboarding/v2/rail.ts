/**
 * What the onboarding rail's one slot says.
 *
 * A plain module rather than types exported from `OnboardingRail.svelte`,
 * because every other shared type in this feature lives in a `.ts` and a
 * component's instance script is not where this codebase puts them.
 */

export interface RailStep {
	kind: 'step';
	ordinal: number;
	total: number;
	name: string;
	detail: string;
}

export interface RailTagline {
	kind: 'tagline';
	text: string;
}

export type RailSlot = RailStep | RailTagline;

/** The create journey's length, as the rail counts it. */
export const RAIL_STEPS = 3;
