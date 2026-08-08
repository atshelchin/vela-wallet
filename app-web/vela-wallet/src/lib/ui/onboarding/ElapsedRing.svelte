<script lang="ts">
	/**
	 * Elapsed-seconds ring (spec 014, research D8): static open SVG arc +
	 * centered 1–2 digit number, rendered FROZEN from state — no timer, no
	 * animation (FR-011). 1- and 2-digit values fit without resizing.
	 */
	import { RING_ARC_FRACTION, RING_STROKE, RING_VIEWBOX } from './geometry';

	interface Props {
		seconds: number;
		/** Resolved a11y label (onboarding.common.waitedSeconds). */
		label: string;
	}

	let { seconds, label }: Props = $props();

	const center = RING_VIEWBOX / 2;
	const radius = (RING_VIEWBOX - RING_STROKE) / 2;
	const circumference = 2 * Math.PI * radius;
</script>

<span class="ring" role="img" aria-label={label}>
	<svg viewBox="0 0 {RING_VIEWBOX} {RING_VIEWBOX}" aria-hidden="true">
		<circle class="ring-track" cx={center} cy={center} r={radius} stroke-width={RING_STROKE} />
		<circle
			class="ring-arc"
			cx={center}
			cy={center}
			r={radius}
			stroke-width={RING_STROKE}
			stroke-dasharray="{circumference * RING_ARC_FRACTION} {circumference}"
			transform="rotate(-90 {center} {center})"
		/>
	</svg>
	<span class="count" aria-hidden="true">{seconds}</span>
</span>

<style>
	.ring {
		position: relative;
		display: inline-grid;
		place-items: center;
		flex: none;
		width: var(--size-hitTarget);
		height: var(--size-hitTarget);
	}

	svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	circle {
		fill: none;
	}

	.ring-track {
		stroke: var(--color-border-base);
	}

	.ring-arc {
		stroke: var(--color-warning-base);
		stroke-linecap: round;
	}

	.count {
		font-size: var(--text-base);
		font-weight: var(--weight-semibold);
		font-variant-numeric: tabular-nums;
		color: var(--color-fg-base);
	}
</style>
