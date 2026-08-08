<script lang="ts">
	interface Props {
		caption: string;
	}

	let { caption }: Props = $props();

	// Deterministic 21×21 demo pattern (data-model.md): three standard finder
	// squares + xorshift32-seeded noise. Identical on every platform so
	// screenshots diff cleanly. Never encodes data.
	const N = 21;

	function pattern(): boolean[][] {
		let s = 0x5eed;
		const next = () => {
			s ^= s << 13;
			s ^= s >>> 17;
			s ^= s << 5;
			s >>>= 0;
			return s;
		};
		const inFinder = (r: number, c: number) =>
			(r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7);
		const finderOn = (r: number, c: number) => {
			const lr = r < 7 ? r : r - (N - 7);
			const lc = c < 7 ? c : c - (N - 7);
			const ring = Math.min(lr, lc, 6 - lr, 6 - lc);
			return ring !== 1;
		};
		return Array.from({ length: N }, (_, r) =>
			Array.from({ length: N }, (_, c) =>
				inFinder(r, c) ? finderOn(r, c) : (next() & 3) === 0 ? false : next() % 2 === 0
			)
		);
	}

	const cells = pattern();
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
