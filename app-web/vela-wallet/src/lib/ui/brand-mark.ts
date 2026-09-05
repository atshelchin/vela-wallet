/**
 * The brand mark as data (design-system.md §Brand) — the same three paths
 * `BrandMark.svelte` draws, for surfaces that cannot mount a component: the
 * receive share image is composed as an SVG string and rasterised, so it
 * needs the geometry and the dark-UI asset's own colours as values. Asset
 * content, audit-whitelisted like the component is.
 */
export const BRAND_MARK = {
	viewBox: '0 0 258 260',
	width: 258,
	height: 260,
	paths: [
		{ d: 'M122,0C70,53,38,118,18,187L122,187L122,0Z', fill: '#ff6a45' },
		{ d: 'M142,42C193,75,225,128,240,187L142,187L142,42Z', fill: '#ffa98e' },
		{ d: 'M0,207L258,207C243,240,211,260,165,260L92,260C49,260,16,240,0,207Z', fill: '#ded5ce' }
	]
} as const;
