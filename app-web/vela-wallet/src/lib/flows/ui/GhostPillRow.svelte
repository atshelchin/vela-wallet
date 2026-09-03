<script lang="ts">
	/**
	 * SD2b's three ways to add a recipient (spec 021 component 24): by hand,
	 * from contacts, or from a spreadsheet.
	 *
	 * Outline pills, never accent: they add a ROW to a form, and the accent in
	 * this product is reserved for the button that actually moves the money.
	 */
	interface Props {
		items: { id: string; label: string }[];
		onselect?: (id: string) => void;
	}

	let { items, onselect }: Props = $props();
</script>

<div class="pills">
	{#each items as item (item.id)}
		<button type="button" onclick={() => onselect?.(item.id)}>{item.label}</button>
	{/each}
</div>

<style>
	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
	}

	button {
		flex: 1;
		/* Grows to share the row, but never below its own label: three locales
		   in, "From contacts" is longer than the third of a phone it would
		   otherwise get, and the row wraps instead of clipping. */
		min-width: max-content;
		padding: var(--space-md) var(--space-lg);
		border: var(--border-hairline) solid var(--color-border-strong);
		border-radius: var(--radius-full);
		background: none;
		font-family: var(--font-ui);
		font-size: calc(var(--text-sm) * var(--text-scale, 1));
		font-weight: var(--weight-medium);
		color: var(--color-fg-base);
		cursor: pointer;
	}

	button:hover {
		background: var(--color-bg-raised);
	}
</style>
