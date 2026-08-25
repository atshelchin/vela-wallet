<script lang="ts">
	/**
	 * The v2 flow container: a full-page stepped journey.
	 *
	 * This replaces spec 014's two containers — the bottom sheet on mobile and
	 * the in-place action-column swap on desktop. The v2 design makes the flow
	 * the whole page at every width, and keeps the sheet for FAILURES only,
	 * where an interruption genuinely is modal.
	 *
	 * A back affordance, and nothing else. The stepped bar and the flow's name
	 * that used to sit here are gone (founder call, 2026-08-25): a
	 * three-segment meter over a journey whose every screen already says what
	 * it is measured decoration, not progress, and the label repeated the
	 * heading directly under it. Every screen inside decides its own content.
	 */
	import type { Snippet } from 'svelte';

	interface Props {
		backLabel: string;
		canGoBack: boolean;
		onBack: () => void;
		children: Snippet;
	}

	let { backLabel, canGoBack, onBack, children }: Props = $props();
</script>

<div class="shell">
	<header class="head">
		{#if canGoBack}
			<button class="back" type="button" onclick={onBack}>
				<span class="chevron" aria-hidden="true">‹</span>
				<span>{backLabel}</span>
			</button>
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
		align-items: center;
		/* Reserves the row's height whether or not the affordance is there, so
		   the screen below never jumps when back disappears. */
		min-height: var(--size-hitTarget);
		padding-block-end: var(--space-3xl);
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

	.body {
		display: flex;
		flex: 1;
		flex-direction: column;
	}
</style>
