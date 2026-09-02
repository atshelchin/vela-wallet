<script lang="ts">
	/**
	 * ST15's "将要发送的内容" — a collapsible mono block. It defaults OPEN,
	 * because the point of the disclosure is that somebody can see what is
	 * about to leave their device before they press send, and a closed box
	 * would be a promise instead of a showing.
	 */
	import { untrack, type Snippet } from 'svelte';
	import { UTILITY_ICONS } from '$lib/wallet/icons';
	import Icon from '$lib/wallet/ui/Icon.svelte';

	interface Props {
		label: string;
		/** Seed only — the person's later toggling owns the state from then on. */
		initialOpen?: boolean;
		children: Snippet;
	}

	let { label, initialOpen = true, children }: Props = $props();
	// `untrack`: this is a SEED, not a binding. A caller re-rendering with the
	// same prop must not slam the box shut under somebody who just opened it.
	let expanded = $state(untrack(() => initialOpen));
</script>

<section class="disclosure">
	<button type="button" aria-expanded={expanded} onclick={() => (expanded = !expanded)}>
		<span>{label}</span>
		<span class="chevron" class:up={expanded}>
			<Icon icon={UTILITY_ICONS['chevron-down']} size="sm" />
		</span>
	</button>
	{#if expanded}
		<div class="body">{@render children()}</div>
	{/if}
</section>

<style>
	.disclosure {
		border-radius: var(--radius-lg);
		background: var(--color-bg-sunken);
		border: var(--border-hairline) solid var(--color-border-base);
		overflow: hidden;
	}

	button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: var(--space-lg);
		border: none;
		background: none;
		font-family: var(--font-ui);
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-muted);
		cursor: pointer;
	}

	.chevron {
		display: flex;
		transition: transform var(--motion-duration-fast) ease-out;
	}

	.chevron.up {
		transform: rotate(180deg);
	}

	.body {
		padding: 0 var(--space-lg) var(--space-lg);
		font-family: var(--font-mono);
		font-size: calc(var(--text-sm) * var(--text-scale, 1));
		line-height: var(--leading-relaxed);
		color: var(--color-fg-subtle);
	}

	@media (prefers-reduced-motion: reduce) {
		.chevron {
			transition: none;
		}
	}
</style>
