<script lang="ts">
	import { PLACEHOLDER_MODULES, PLACEHOLDER_SEED, qrPattern } from '../qr-pattern';

	interface Props {
		caption: string;
	}

	let { caption }: Props = $props();

	// Spec 015's deterministic demo pattern. The generator moved to
	// `qr-pattern.ts` in spec 021 so the receive card draws the same code;
	// the modules and seed here are unchanged, so this stays pixel-identical.
	const N = PLACEHOLDER_MODULES;
	const cells = qrPattern(N, PLACEHOLDER_SEED);
</script>

<figure class="qr">
	<svg viewBox="0 0 {N} {N}" role="img" aria-label={caption} shape-rendering="crispEdges">
		{#each cells as row, r (r)}
			{#each row as on, c (c)}
				{#if on}<rect x={c} y={r} width="1" height="1" />{/if}
			{/each}
		{/each}
	</svg>
	<figcaption>{caption}</figcaption>
</figure>

<style>
	.qr {
		margin: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-lg);
		padding: var(--space-2xl);
		/* White card in BOTH appearances (mock D2) — onAccent is the
		   mode-invariant white, where fg.inverse flips. */
		background: var(--color-onAccent);
		border-radius: var(--radius-xl);
	}

	svg {
		width: 100%;
		max-width: calc(var(--layout-maxContentWidth) / 4);
		aspect-ratio: 1;
		fill: var(--color-fixed-shadowInk);
	}

	figcaption {
		font-size: calc(var(--text-sm) * var(--text-scale, 1));
		/* On the always-white card, so mode-invariant ink at reduced strength. */
		color: var(--color-fixed-shadowInk);
		opacity: var(--opacity-dim);
	}
</style>
