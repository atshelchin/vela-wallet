<script lang="ts">
	/**
	 * ST13 / DST7 — how much of this device Vela is using, and what can be
	 * given back. The headline splits the number from its unit so the number
	 * carries the display type; the bar and the three groups follow.
	 */
	import type { StorageModel } from '../model';
	import StorageBar from './StorageBar.svelte';
	import StorageGroup from './StorageGroup.svelte';

	interface Props {
		panel: StorageModel;
		onclear?: (id: string) => void;
		onclearcaches?: () => void;
	}

	let { panel, onclear, onclearcaches }: Props = $props();
</script>

<div class="headline">
	<span class="amount">{panel.amount}</span>
	<span class="unit">{panel.unit}</span>
	<span class="summary">{panel.summary}</span>
</div>

<StorageBar segments={panel.segments} />

{#each panel.groups as group (group.label)}
	<StorageGroup {group} {onclear} ongroupaction={onclearcaches} />
{/each}

<style>
	.headline {
		display: flex;
		align-items: baseline;
		gap: var(--space-md);
		padding-block: var(--space-lg) var(--space-xl);
	}

	.amount {
		font-size: calc(var(--text-4xl) * var(--text-scale, 1));
		font-weight: var(--weight-bold);
		color: var(--color-fg-base);
		font-variant-numeric: tabular-nums;
	}

	.unit {
		font-size: calc(var(--text-lg) * var(--text-scale, 1));
		font-weight: var(--weight-semibold);
		color: var(--color-fg-base);
	}

	.summary {
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-subtle);
	}
</style>
