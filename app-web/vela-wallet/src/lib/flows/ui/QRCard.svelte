<script lang="ts">
	/**
	 * The receive QR card (spec 021 component 18) — R2, R3, R4 and DR2L.
	 *
	 * Two decisions carried from the SPEC sheet:
	 *
	 * - **344 square, fixed.** The card does not scale with the text. At 1.35×
	 *   the copy around it grows and the panel scrolls; the code stays the size
	 *   it was, because a code that shrinks to make room for its caption is a
	 *   code that stops scanning.
	 * - **Something in the middle.** The network mark on R2, the token on R3,
	 *   the account's own identicon on the share card — R4's centre is an
	 *   anti-forgery mark: a share card someone doctored to swap the address
	 *   would carry an identicon that no longer matches it.
	 */
	import type { Snippet } from 'svelte';
	import { RECEIVE_MODULES, RECEIVE_SEED, qrPattern } from '$lib/wallet/qr-pattern';

	interface Props {
		label: string;
		/** Drawn over the centre of the code, on its own white cut-out. */
		centre?: Snippet;
	}

	let { label, centre }: Props = $props();

	const N = RECEIVE_MODULES;
	const cells = qrPattern(N, RECEIVE_SEED);
</script>

<div class="card">
	<svg viewBox="0 0 {N} {N}" role="img" aria-label={label} shape-rendering="crispEdges">
		{#each cells as row, r (r)}
			{#each row as on, c (c)}
				{#if on}<rect x={c} y={r} width="1" height="1" />{/if}
			{/each}
		{/each}
	</svg>
	{#if centre}
		<span class="centre">{@render centre()}</span>
	{/if}
</div>

<style>
	.card {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--size-qrCard);
		height: var(--size-qrCard);
		/* Never scales with --text-scale, and never grows past the screen. */
		max-width: 100%;
		aspect-ratio: 1;
		padding: var(--space-2xl);
		/* White in BOTH appearances: a code is read by a camera, and inverting
		   it in dark mode is the classic way to make one unscannable. */
		background: var(--color-onAccent);
		border-radius: var(--radius-xl);
	}

	svg {
		width: 100%;
		height: 100%;
		fill: var(--color-fixed-shadowInk);
	}

	.centre {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
		/* The cut-out reads as part of the card, so it takes the card's white
		   rather than a theme surface that would flip underneath it. */
		background: var(--color-onAccent);
		border-radius: var(--radius-full);
		padding: var(--space-xs);
	}
</style>
