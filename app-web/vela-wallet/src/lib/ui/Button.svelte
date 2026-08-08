<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		variant: 'primary' | 'secondary';
		/** Renders an <a> when set (and not disabled), else a <button>. */
		href?: string;
		disabled?: boolean;
		onclick?: () => void;
		children: Snippet;
	}

	let { variant, href, disabled = false, onclick, children }: Props = $props();
</script>

{#if href !== undefined && !disabled}
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- generic component; callers pass resolve()d paths -->
	<a class="button {variant}" {href}>{@render children()}</a>
{:else}
	<button class="button {variant}" {disabled} {onclick} type="button">
		{@render children()}
	</button>
{/if}

<style>
	.button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		/* Minimum, not fixed: long-locale labels wrap and grow the pill
		   instead of overflowing it (spec 014 long-label fix). */
		min-height: var(--size-control-lg);
		min-width: var(--size-control-md);
		padding-inline: var(--space-3xl);
		padding-block: var(--space-md);
		border: none;
		border-radius: var(--radius-full);
		font-family: var(--font-ui);
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
		line-height: var(--leading-tight);
		text-align: center;
		text-decoration: none;
		cursor: pointer;
		user-select: none;
		transition:
			opacity var(--motion-duration-fast) ease,
			transform var(--motion-duration-fast) ease;
	}

	.button:hover:not(:disabled) {
		opacity: var(--opacity-hover);
	}

	.button:active:not(:disabled) {
		transform: scale(var(--motion-press-button));
	}

	.button:disabled {
		opacity: var(--opacity-disabled);
		cursor: default;
	}

	.primary {
		background: var(--color-accent-base);
		color: var(--color-onAccent);
	}

	.secondary {
		background: transparent;
		border: var(--border-hairline) solid var(--color-border-strong);
		color: var(--color-fg-muted);
	}
</style>
