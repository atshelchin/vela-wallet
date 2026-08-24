<script lang="ts">
	/**
	 * The v2 flow container: a full-page stepped journey.
	 *
	 * This replaces spec 014's two containers — the bottom sheet on mobile and
	 * the in-place action-column swap on desktop. The v2 design makes the flow
	 * the whole page at every width, and keeps the sheet for FAILURES only,
	 * where an interruption genuinely is modal.
	 *
	 * A back affordance and a three-segment progress bar, and nothing else:
	 * every screen inside decides its own content.
	 */
	import type { Snippet } from 'svelte';

	interface Props {
		/** The flow's name, shown opposite the back control. */
		flowLabel: string;
		backLabel: string;
		/** 0-based; -1 hides the bar (the flow has not started stepping). */
		step: number;
		totalSteps?: number;
		canGoBack: boolean;
		onBack: () => void;
		children: Snippet;
	}

	let { flowLabel, backLabel, step, totalSteps = 3, canGoBack, onBack, children }: Props = $props();

	const percent = $derived(step < 0 ? 0 : Math.round(((step + 1) / totalSteps) * 100));
</script>

<div class="shell">
	<header class="head">
		<div class="bar">
			{#if canGoBack}
				<button class="back" type="button" onclick={onBack}>
					<span class="chevron" aria-hidden="true">‹</span>
					<span>{backLabel}</span>
				</button>
			{:else}
				<span></span>
			{/if}
			<span class="flow">{flowLabel}</span>
		</div>
		{#if step >= 0}
			<div
				class="track"
				role="progressbar"
				aria-valuemin={0}
				aria-valuemax={totalSteps}
				aria-valuenow={step + 1}
				aria-label={flowLabel}
			>
				<div class="fill" style="width: {percent}%"></div>
			</div>
		{/if}
	</header>

	<div class="body">
		{@render children()}
	</div>
</div>

<style>
	.shell {
		display: flex;
		flex: 1;
		flex-direction: column;
		width: 100%;
		max-width: var(--layout-flowColumn);
		margin-inline: auto;
	}

	.head {
		display: flex;
		flex-direction: column;
		gap: var(--space-xl);
		padding-block-end: var(--space-4xl);
	}

	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.back {
		display: flex;
		gap: var(--space-md);
		align-items: center;
		padding: 0;
		border: 0;
		background: none;
		color: var(--color-fg-muted);
		font-family: var(--font-ui);
		font-size: var(--text-base);
		font-weight: var(--weight-semibold);
		cursor: pointer;
		transition: color var(--motion-duration-fast) ease;
	}

	.back:hover {
		color: var(--color-fg-base);
	}

	.chevron {
		font-size: var(--text-lg);
		line-height: var(--leading-none);
	}

	.flow {
		color: var(--color-fg-muted);
		font-size: var(--text-base);
	}

	.track {
		height: var(--border-emphasis);
		border-radius: var(--radius-full);
		background: var(--color-border-base);
		overflow: hidden;
	}

	.fill {
		height: 100%;
		border-radius: var(--radius-full);
		background: var(--color-accent-base);
		transition: width var(--motion-duration-normal) ease;
	}

	.body {
		display: flex;
		flex: 1;
		flex-direction: column;
	}

	@media (prefers-reduced-motion: reduce) {
		.fill {
			transition: none;
		}
	}
</style>
