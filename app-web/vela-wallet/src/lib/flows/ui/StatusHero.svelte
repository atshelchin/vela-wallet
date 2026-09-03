<script lang="ts">
	/**
	 * The send receipt's centrepiece (spec 021 component 20) — SD4a's spinner,
	 * SD4b's clock, SD4c's tick, and the failure cross.
	 *
	 * One disc size for all four so the mark does not resize as the
	 * transaction moves between them: the person is watching this circle, and
	 * a circle that jumps when the state changes reads as a new screen rather
	 * than as progress on the one they were already looking at.
	 */
	import { UTILITY_ICONS } from '$lib/wallet/icons';
	import Icon from '$lib/wallet/ui/Icon.svelte';
	import type { ReceiptStage } from '../model';

	interface Props {
		stage: ReceiptStage;
		title: string;
		captions: string[];
	}

	let { stage, title, captions }: Props = $props();
</script>

<div class="hero">
	<span class="disc {stage}" aria-hidden="true">
		{#if stage === 'submitting'}
			<span class="spinner"></span>
		{:else if stage === 'submitted'}
			<Icon icon={UTILITY_ICONS.clock} size="xl" />
		{:else if stage === 'confirmed'}
			<Icon icon={UTILITY_ICONS.check} size="xl" />
		{:else}
			<Icon icon={UTILITY_ICONS.x} size="xl" />
		{/if}
	</span>
	<p class="title">{title}</p>
	{#each captions as caption, i (i)}
		<p class="caption" class:faint={i > 0}>{caption}</p>
	{/each}
</div>

<style>
	.hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: var(--space-sm);
		padding-block: var(--space-5xl) var(--space-3xl);
	}

	.disc {
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--size-statusHero);
		height: var(--size-statusHero);
		border-radius: var(--radius-full);
		margin-bottom: var(--space-xl);
	}

	.submitting {
		background: var(--color-bg-sunken);
		color: var(--color-accent-base);
	}

	.submitted {
		background: var(--color-bg-sunken);
		color: var(--color-fg-muted);
	}

	.confirmed {
		background: var(--color-success-soft);
		color: var(--color-success-base);
	}

	.failed {
		background: var(--color-error-soft);
		color: var(--color-error-base);
	}

	.spinner {
		width: var(--icon-2xl);
		height: var(--icon-2xl);
		border: var(--border-emphasis) solid currentColor;
		border-top-color: transparent;
		border-radius: var(--radius-full);
		/* The same 800ms revolution the CTA spinner turns at: one wait speed
		   in the product, not one per surface. */
		animation: spin 800ms linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(1turn);
		}
	}

	@keyframes pulse {
		50% {
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.spinner {
			border-top-color: currentColor;
			opacity: var(--opacity-dim);
			animation: pulse 1.2s ease-in-out infinite;
		}
	}

	p {
		margin: 0;
	}

	.title {
		font-size: calc(var(--text-2xl) * var(--text-scale, 1));
		font-weight: var(--weight-bold);
		color: var(--color-fg-base);
	}

	.caption {
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-muted);
	}

	/* The second caption is the one that says "you can leave" — true, useful,
	   and not what the person is waiting to read. */
	.faint {
		font-size: calc(var(--text-sm) * var(--text-scale, 1));
		color: var(--color-fg-subtle);
	}
</style>
