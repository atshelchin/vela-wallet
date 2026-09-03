<script lang="ts">
	/**
	 * SD2f — which coin pays the network fee.
	 *
	 * The hint above the list is doing real work: paying gas in a stablecoin is
	 * unusual enough that a person seeing USDC offered as a fee token will
	 * wonder whether they are being asked to send it. Saying what the choice is
	 * for, once, above the rows, is cheaper than a tooltip on each.
	 */
	import FeeTokenRow from '../ui/FeeTokenRow.svelte';
	import type { FeeTokenPickModel } from '../model';

	interface Props {
		model: FeeTokenPickModel;
		onselect?: (index: number) => void;
	}

	let { model, onselect }: Props = $props();
</script>

<div class="fees">
	<p class="hint">{model.hint}</p>
	<ul>
		{#each model.rows as row, i (row.symbol)}
			<li>
				<FeeTokenRow {row} estimateLabel={model.estimateLabel} onselect={() => onselect?.(i)} />
			</li>
		{/each}
	</ul>
</div>

<style>
	.fees {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.hint {
		margin: 0;
		font-size: calc(var(--text-sm) * var(--text-scale, 1));
		line-height: var(--leading-normal);
		color: var(--color-fg-muted);
	}

	ul {
		list-style: none;
		margin: 0;
		/* The selected row draws its own fill, so the list is inset by that
		   fill's padding rather than by the sheet's text margin. */
		padding: 0;
	}
</style>
