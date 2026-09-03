<script lang="ts">
	/**
	 * The total line above the fee (spec 021 component 25): SD2b's
	 * "Total · 3 recipients — 120 USDT · ≈$120.00", SD2d's equivalent.
	 *
	 * Deliberately not a `FactRow`: that row is a fact ABOUT the transaction
	 * inside a card, and this is a running sum of what the form above it
	 * currently says, sitting between the form and the fee.
	 */
	interface Props {
		label: string;
		value: string;
	}

	let { label, value }: Props = $props();
</script>

<p class="summary">
	<span class="label">{label}</span>
	<span class="value">{value}</span>
</p>

<style>
	.summary {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-lg);
		margin: 0;
		padding-block: var(--space-md);
	}

	.label {
		font-size: calc(var(--text-sm) * var(--text-scale, 1));
		color: var(--color-fg-subtle);
	}

	.value {
		font-family: var(--font-numeric);
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		font-weight: var(--weight-semibold);
		font-variant-numeric: tabular-nums;
		color: var(--color-fg-base);
	}
</style>
