<script lang="ts">
	/**
	 * A1 / DA1L — the full history.
	 *
	 * The wallet home shows the last three; this shows all of them, grouped by
	 * day. Same `ActivityRow` as the home, same day headings — the difference
	 * is the network filter in the header and the fact that the list does not
	 * stop.
	 */
	import ActivityRow from '$lib/wallet/ui/ActivityRow.svelte';
	import SkeletonRow from '$lib/wallet/ui/SkeletonRow.svelte';
	import type { HistoryModel } from '../model';

	interface Props {
		model: HistoryModel;
		onselect?: (group: number, row: number) => void;
	}

	let { model, onselect }: Props = $props();
</script>

{#if model.mode === 'loading'}
	<SkeletonRow />
	<SkeletonRow />
	<SkeletonRow />
{:else if model.mode === 'empty'}
	<p class="empty">{model.emptyText}</p>
{:else}
	{#each model.groups as group, g (group.label)}
		<p class="day">{group.label}</p>
		<ul>
			{#each group.rows as row, r (r)}
				<li><ActivityRow {row} onclick={() => onselect?.(g, r)} /></li>
			{/each}
		</ul>
	{/each}
{/if}

<style>
	.day {
		margin: 0;
		padding-block: var(--space-sm);
		font-size: calc(var(--text-sm) * var(--text-scale, 1));
		color: var(--color-fg-subtle);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	/* A filtered-empty history is a narrowing, not a problem: one quiet line
	   rather than the illustrated empty state the home screen uses for a
	   wallet that has genuinely never done anything. */
	.empty {
		margin: 0;
		padding-block: var(--space-4xl);
		text-align: center;
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-subtle);
	}
</style>
