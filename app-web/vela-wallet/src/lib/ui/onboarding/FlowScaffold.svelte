<script lang="ts">
	/**
	 * Shared scaffold anatomy (spec 014, contract §3): [handle (sheet only)] →
	 * header row: title (leading) + close × (trailing) → divider → content.
	 */
	import type { Snippet } from 'svelte';

	interface Props {
		/** Resolved scaffold title (varies by state). */
		title: string;
		/** Resolved a11y label for the close × (onboarding.common.close). */
		closeLabel: string;
		/** Drag handle: sheet presentation only. */
		showHandle?: boolean;
		onClose: () => void;
		children: Snippet;
	}

	let { title, closeLabel, showHandle = false, onClose, children }: Props = $props();
</script>

<section class="scaffold">
	{#if showHandle}
		<div class="handle" aria-hidden="true"></div>
	{/if}
	<header class="header">
		<h2 class="title">{title}</h2>
		<button class="close" type="button" aria-label={closeLabel} onclick={onClose}>
			<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
				<path d="M18 6 6 18" />
				<path d="m6 6 12 12" />
			</svg>
		</button>
	</header>
	<div class="content">
		{@render children()}
	</div>
</section>

<style>
	.scaffold {
		display: flex;
		flex-direction: column;
	}

	.handle {
		width: var(--space-5xl);
		height: var(--space-sm);
		margin: var(--space-md) auto 0;
		border-radius: var(--radius-full);
		background: var(--color-border-strong);
	}

	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-xl);
		padding: var(--space-xl) var(--layout-screenPaddingX);
		border-bottom: var(--border-hairline) solid var(--color-border-base);
	}

	.title {
		margin: 0;
		font-size: var(--text-2xl);
		font-weight: var(--weight-semibold);
		color: var(--color-fg-base);
	}

	.close {
		display: grid;
		place-items: center;
		width: var(--size-hitTarget);
		height: var(--size-hitTarget);
		margin-inline-end: calc(-1 * var(--size-hitSlop));
		padding: 0;
		border: none;
		background: none;
		color: var(--color-fg-muted);
		cursor: pointer;
		border-radius: var(--radius-full);
		transition: opacity var(--motion-duration-fast) ease;
	}

	.close:hover {
		opacity: var(--opacity-hover);
		color: var(--color-fg-base);
	}

	.glyph {
		width: var(--icon-lg);
		height: var(--icon-lg);
		fill: none;
		stroke: currentColor;
		stroke-width: var(--icon-stroke-base);
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.content {
		padding: var(--space-3xl) var(--layout-screenPaddingX) var(--space-4xl);
	}
</style>
