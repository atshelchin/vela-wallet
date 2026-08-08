<script lang="ts">
	import type { ChainRowModel } from '../model';
	import { UTILITY_ICONS } from '../icons';
	import Icon from './Icon.svelte';

	interface Props {
		rows: ChainRowModel[];
		onselect?: (name: string) => void;
	}

	let { rows, onselect }: Props = $props();
</script>

<ul class="chains">
	{#each rows as row (row.name)}
		<li>
			<button type="button" aria-pressed={row.selected} onclick={() => onselect?.(row.name)}>
				<span
					class="dot"
					class:all={row.dot === 'all'}
					style:background={row.dot === 'all' ? undefined : row.dot}
					aria-hidden="true"
				></span>
				<span class="name">{row.name}</span>
				{#if row.selected}
					<span class="checked"><Icon icon={UTILITY_ICONS.check} size="sm" /></span>
				{/if}
				<span class="count">{row.count}</span>
			</button>
		</li>
	{/each}
</ul>

<style>
	.chains {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	button {
		display: flex;
		align-items: center;
		gap: var(--space-lg);
		width: 100%;
		min-height: var(--size-hitTarget);
		padding-block: var(--space-sm);
		padding-inline: 0;
		border: none;
		background: none;
		font-family: var(--font-ui);
		font-size: calc(var(--text-lg) * var(--text-scale, 1));
		color: var(--color-fg-base);
		text-align: start;
		cursor: pointer;
		border-radius: var(--radius-md);
	}

	.dot {
		width: var(--icon-xs);
		height: var(--icon-xs);
		border-radius: var(--radius-full);
		flex-shrink: 0;
	}

	.dot.all {
		background: var(--color-fg-subtle);
	}

	.name {
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.checked {
		color: var(--color-accent-base);
		display: flex;
	}

	.count {
		font-family: var(--font-numeric);
		font-variant-numeric: tabular-nums;
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-subtle);
	}
</style>
