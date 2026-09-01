<script lang="ts">
	/**
	 * Where you are in a short sequence (spec 020).
	 *
	 * Dots, not a progress bar: three pages is a length you can hold in your
	 * head, and a bar would claim there is a task being completed.
	 *
	 * They are DECORATION with a label, not controls. The design draws them at a
	 * fifth of a comfortable tap target, so making them tappable would be
	 * offering a control nobody can hit — the carousel is driven by its button
	 * and by swiping. What they owe a screen reader is the one fact they carry,
	 * and `label` is that sentence already filled in by the caller.
	 */
	interface Props {
		total: number;
		/** Zero-based. */
		current: number;
		/** e.g. "Page 2 of 3" — resolved and filled by the caller. */
		label: string;
	}

	let { total, current, label }: Props = $props();
</script>

<p class="dots" role="status" aria-label={label}>
	{#each Array.from({ length: total }, (_, i) => i) as i (i)}
		<span class="dot" class:on={i === current} aria-hidden="true"></span>
	{/each}
</p>

<style>
	.dots {
		display: flex;
		gap: var(--size-introDot);
		align-items: center;
		justify-content: center;
		margin: 0;
	}

	.dot {
		width: var(--size-introDot);
		height: var(--size-introDot);
		border-radius: var(--radius-full);
		background: var(--color-border-strong);
		/* The page can change without a press — a swipe, or the button — so the
		   dot that fills has to be seen moving to read as "you moved". */
		transition: background var(--motion-duration-normal) ease;
	}

	.dot.on {
		background: var(--color-fg-base);
	}

	@media (prefers-reduced-motion: reduce) {
		.dot {
			transition: none;
		}
	}
</style>
