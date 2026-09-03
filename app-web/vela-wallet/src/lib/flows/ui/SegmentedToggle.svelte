<script lang="ts">
	/**
	 * The two-segment toggle (spec 021 component 5) — T3's ERC-20 / native tabs
	 * and SD2c's fiat / token pricing switch.
	 *
	 * The design review made this the ONE segmented control in the product, so
	 * it takes its segments as data rather than growing a variant per caller.
	 */
	interface Props {
		options: { id: string; label: string }[];
		selected: string;
		label: string;
		onselect?: (id: string) => void;
	}

	let { options, selected, label, onselect }: Props = $props();
</script>

<div class="toggle" role="tablist" aria-label={label}>
	{#each options as option (option.id)}
		<button
			type="button"
			role="tab"
			aria-selected={option.id === selected}
			class:on={option.id === selected}
			onclick={() => onselect?.(option.id)}
		>
			{option.label}
		</button>
	{/each}
</div>

<style>
	.toggle {
		display: flex;
		gap: var(--space-xs);
		padding: var(--space-xs);
		border-radius: var(--radius-lg);
		background: var(--color-bg-sunken);
	}

	button {
		flex: 1;
		min-width: 0;
		padding-block: var(--space-md);
		border: none;
		border-radius: var(--radius-md);
		background: none;
		font-family: var(--font-ui);
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		font-weight: var(--weight-medium);
		color: var(--color-fg-muted);
		cursor: pointer;
		transition: background var(--motion-duration-fast) ease;
	}

	.on {
		background: var(--color-bg-raised);
		font-weight: var(--weight-semibold);
		color: var(--color-fg-base);
	}
</style>
