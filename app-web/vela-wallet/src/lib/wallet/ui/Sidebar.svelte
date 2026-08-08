<script lang="ts">
	import type { SidebarModel } from '../model';
	import { navIcon, UTILITY_ICONS } from '../icons';
	import ChainFilterList from './ChainFilterList.svelte';
	import Icon from './Icon.svelte';
	import WalletHeader from './WalletHeader.svelte';

	interface Props {
		sidebar: SidebarModel;
		onnav?: (id: SidebarModel['nav'][number]['id']) => void;
	}

	let { sidebar, onnav }: Props = $props();
</script>

<aside class="sidebar">
	<div class="top">
		<WalletHeader header={sidebar.header} />
	</div>

	<nav>
		{#each sidebar.nav as item (item.id)}
			<button
				type="button"
				class="nav-item"
				class:selected={item.selected}
				aria-current={item.selected ? 'page' : undefined}
				onclick={() => onnav?.(item.id)}
			>
				<Icon icon={navIcon(item.id, item.selected)} size="lg" />
				<span>{item.label}</span>
			</button>
		{/each}
	</nav>

	<hr />

	<p class="networks-title">{sidebar.networksTitle}</p>
	<div class="networks">
		<ChainFilterList rows={sidebar.networks} />
	</div>

	<label class="search">
		<Icon icon={UTILITY_ICONS.search} size="sm" />
		<input type="text" placeholder={sidebar.searchPlaceholder} />
		<kbd>⌘K</kbd>
	</label>
</aside>

<style>
	.sidebar {
		display: flex;
		flex-direction: column;
		width: calc(var(--space-4xl) * 7 + var(--space-xl));
		flex-shrink: 0;
		height: 100%;
		padding: var(--space-xl);
		background: var(--color-bg-sunken);
		border-inline-end: var(--border-hairline) solid var(--color-border-base);
	}

	.top {
		padding-block: var(--space-lg) var(--space-2xl);
	}

	nav {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: var(--space-lg);
		height: var(--size-control-md);
		padding-inline: var(--space-lg);
		border: none;
		border-radius: var(--radius-lg);
		background: none;
		font-family: var(--font-ui);
		font-size: calc(var(--text-lg) * var(--text-scale, 1));
		color: var(--color-fg-muted);
		cursor: pointer;
		text-align: start;
	}

	.nav-item:hover {
		color: var(--color-fg-base);
	}

	.nav-item.selected {
		background: var(--color-bg-raised);
		color: var(--color-fg-base);
		font-weight: var(--weight-semibold);
	}

	hr {
		width: 100%;
		border: none;
		border-top: var(--border-hairline) solid var(--color-border-base);
		margin-block: var(--space-xl);
	}

	.networks-title {
		margin: 0 0 var(--space-md);
		padding-inline: var(--space-lg);
		font-size: calc(var(--text-sm) * var(--text-scale, 1));
		font-weight: var(--weight-semibold);
		letter-spacing: var(--letterSpacing-sectionLabel);
		color: var(--color-fg-subtle);
	}

	.networks {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding-inline: var(--space-lg);
	}

	.networks :global(button) {
		font-size: calc(var(--text-base) * var(--text-scale, 1));
	}

	.search {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		height: var(--size-control-md);
		padding-inline: var(--space-lg);
		border: var(--border-hairline) solid var(--color-border-base);
		border-radius: var(--radius-lg);
		background: var(--color-bg-raised);
		color: var(--color-fg-subtle);
	}

	input {
		flex: 1;
		min-width: 0;
		border: none;
		background: none;
		font-family: var(--font-ui);
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-base);
		outline: none;
	}

	input::placeholder {
		color: var(--color-fg-subtle);
	}

	kbd {
		font-family: var(--font-mono);
		font-size: calc(var(--text-xs) * var(--text-scale, 1));
		color: var(--color-fg-subtle);
	}
</style>
