<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';

	interface Props {
		items: T[];
		/** Accessible name for the carousel region. */
		label: string;
		slide: Snippet<[T, number]>;
	}

	let { items, label, slide }: Props = $props();

	let track = $state<HTMLElement | undefined>();
	let active = $state(0);

	/* Dot state follows scroll position — works for swipe, keys, and goTo alike.
	   Without JS the track is still a plain scrollable list: all slides remain
	   in flow (crawlable, readable); only the dots stop reflecting position. */
	function onscroll(): void {
		if (track && track.clientWidth > 0) {
			active = Math.round(track.scrollLeft / track.clientWidth);
		}
	}

	function goTo(index: number): void {
		track?.scrollTo({ left: index * track.clientWidth, behavior: 'smooth' });
	}
</script>

<div class="carousel">
	<div
		class="track"
		bind:this={track}
		{onscroll}
		role="group"
		aria-roledescription="carousel"
		aria-label={label}
	>
		{#each items as item, i (i)}
			<div
				class="slide"
				role="group"
				aria-roledescription="slide"
				aria-label={`${i + 1} / ${items.length}`}
			>
				{@render slide(item, i)}
			</div>
		{/each}
	</div>

	<div class="dots">
		{#each items.keys() as i (i)}
			<button
				class="dot"
				class:active={i === active}
				type="button"
				aria-label={`${i + 1} / ${items.length}`}
				aria-current={i === active}
				onclick={() => goTo(i)}
			></button>
		{/each}
	</div>
</div>

<style>
	.carousel {
		display: flex;
		flex-direction: column;
		gap: var(--space-xl);
		min-width: 0;
	}

	.track {
		display: flex;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		overscroll-behavior-x: contain;
		scrollbar-width: none;
		gap: var(--space-lg);
	}

	.track::-webkit-scrollbar {
		display: none;
	}

	.slide {
		flex: 0 0 100%;
		min-width: 0;
		scroll-snap-align: center;
	}

	.dots {
		display: flex;
		justify-content: center;
		gap: var(--space-md);
	}

	/* The visible dot stays space-md sized, but the tap target grows to the
	   WCAG 2.5.8 minimum (24×24): content-box sizing + hit-slop padding +
	   content-clipped background keep the visual identical to the mock. */
	.dot {
		box-sizing: content-box;
		width: var(--space-md);
		height: var(--space-md);
		padding: var(--size-hitSlop);
		border: none;
		border-radius: var(--radius-full);
		background: var(--color-fg-subtle);
		background-clip: content-box;
		cursor: pointer;
		transition:
			width var(--motion-duration-fast) ease,
			background-color var(--motion-duration-fast) ease;
	}

	.dot.active {
		width: var(--space-3xl);
		background: var(--color-accent-base);
		background-clip: content-box;
	}
</style>
