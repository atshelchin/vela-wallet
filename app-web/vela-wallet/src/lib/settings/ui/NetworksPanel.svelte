<script lang="ts">
	/**
	 * ST9 / DST4 — the network list.
	 *
	 * The phone pushes a detail page per row; the desktop expands one in place.
	 * Both are this component: `expandable` picks the trailing affordance, and
	 * the expanded row's editor is rendered by the caller through `detail`, so
	 * the list does not have to know what an editor is.
	 */
	import type { Snippet } from 'svelte';
	import type { NetworkRowModel } from '../model';
	import { UTILITY_ICONS } from '$lib/wallet/icons';
	import Icon from '$lib/wallet/ui/Icon.svelte';
	import NetworkRow from './NetworkRow.svelte';

	interface Props {
		rows: NetworkRowModel[];
		addLabel: string;
		deleteLabel?: string;
		expandable?: boolean;
		/** Rendered under the expanded row (desktop only). */
		detail?: Snippet;
		onselect?: (id: string) => void;
		ondelete?: (id: string) => void;
		onadd?: () => void;
	}

	let {
		rows,
		addLabel,
		deleteLabel,
		expandable = false,
		detail,
		onselect,
		ondelete,
		onadd
	}: Props = $props();
</script>

<div class="list">
	{#each rows as row (row.id)}
		<NetworkRow
			{row}
			trailing={expandable ? 'caret' : 'chevron'}
			{deleteLabel}
			{onselect}
			{ondelete}
		/>
		{#if row.expanded && detail !== undefined}
			<div class="detail">{@render detail()}</div>
		{/if}
	{/each}
</div>

{#if !expandable}
	<button type="button" class="add" onclick={onadd}>
		<Icon icon={UTILITY_ICONS.plus} size="md" />
		<span>{addLabel}</span>
	</button>
{/if}

<style>
	.list {
		display: flex;
		flex-direction: column;
	}

	.detail {
		padding: var(--space-xl);
		margin-block: var(--space-lg);
		border-radius: var(--radius-lg);
		background: var(--color-bg-sunken);
		border: var(--border-hairline) solid var(--color-border-base);
	}

	/* A link, not a CTA: adding a network is navigation, and accent is
	   reserved for actions that move value. */
	.add {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-md);
		width: 100%;
		min-height: var(--size-control-md);
		margin-block-start: var(--space-3xl);
		border: none;
		background: none;
		font-family: var(--font-ui);
		font-size: calc(var(--text-lg) * var(--text-scale, 1));
		font-weight: var(--weight-semibold);
		color: var(--color-info-base);
		cursor: pointer;
	}
</style>
