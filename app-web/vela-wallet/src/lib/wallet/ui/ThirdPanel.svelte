<script lang="ts">
	import type { Snippet } from 'svelte';
	import { UTILITY_ICONS } from '../icons';
	import Icon from './Icon.svelte';

	interface Props {
		title: string;
		closeLabel: string;
		onclose?: () => void;
		children: Snippet;
	}

	let { title, closeLabel, onclose, children }: Props = $props();

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') onclose?.();
	}
</script>

<svelte:window {onkeydown} />

<aside class="panel">
	<header>
		<h2>{title}</h2>
		<button type="button" aria-label={closeLabel} onclick={onclose}>
			<Icon icon={UTILITY_ICONS.x} size="lg" />
		</button>
	</header>
	<div class="content">
		{@render children()}
	</div>
</aside>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		width: calc(var(--layout-maxContentWidth) / 2);
		flex-shrink: 0;
		height: 100%;
		background: var(--color-bg-base);
		border-inline-start: var(--border-hairline) solid var(--color-border-base);
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-xl) var(--space-3xl);
	}

	h2 {
		margin: 0;
		font-size: calc(var(--text-2xl) * var(--text-scale, 1));
		font-weight: var(--weight-bold);
		color: var(--color-fg-base);
	}

	button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--size-control-sm);
		height: var(--size-control-sm);
		border: none;
		border-radius: var(--radius-full);
		background: none;
		color: var(--color-fg-muted);
		cursor: pointer;
	}

	button:hover {
		background: var(--color-bg-sunken);
		color: var(--color-fg-base);
	}

	.content {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 0 var(--space-3xl) var(--space-3xl);
	}
</style>
