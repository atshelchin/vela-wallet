/**
 * Sanctioned geometry constants for the onboarding flow atoms (spec 014).
 *
 * New numeric geometry lives HERE, never inline in components (FR-016 /
 * design-system rule 1). Values are unitless SVG user-space numbers or pure
 * ratios — all CSS sizing in the components comes from tokens.css vars.
 */

/** ElapsedRing SVG user-space viewBox edge (rendered at var(--size-hitTarget)). */
export const RING_VIEWBOX = 48;

/** ElapsedRing arc stroke width, SVG user-space units. */
export const RING_STROKE = 4;

/**
 * ElapsedRing frozen arc sweep (fraction of the full circle). The ring
 * renders a static number from state — no elapsed-time measurement exists in
 * this feature (FR-011, research D8) — so the arc is a fixed decorative
 * sweep matching the mocks (A4c/A8c/B1c).
 */
export const RING_ARC_FRACTION = 0.75;

/** Login waiting bar fill (single track, ~40% filled — contract §5). */
export const LOGIN_BAR_FRACTION = 0.4;

/** Create flow segmented progress: total steps. */
export const CREATE_TOTAL_STEPS = 5;

/** How long the address strip shows its "copied" confirmation (UI feedback only). */
export const COPIED_FEEDBACK_MS = 1800;
