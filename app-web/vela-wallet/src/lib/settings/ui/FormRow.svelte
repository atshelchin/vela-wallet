<script lang="ts">
	/**
	 * The desktop panel's row: a label on the left, one control on the right
	 * (DST2/DST3). Hairline-separated, no card — the same de-containered
	 * language the phone list uses, turned on its side.
	 */
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		/** The control fills its own width; `wide` lets a slider stretch. */
		wide?: boolean;
		children: Snippet;
	}

	let { label, wide = false, children }: Props = $props();
</script>

<div class="form-row">
	<span class="label">{label}</span>
	<div class="control" class:wide>{@render children()}</div>
</div>

<style>
	.form-row {
		display: flex;
		align-items: center;
		gap: var(--space-3xl);
		min-height: var(--size-control-lg);
		padding-block: var(--space-xl);
		border-bottom: var(--border-hairline) solid var(--color-border-base);
	}

	.label {
		flex: 1;
		min-width: 0;
		font-size: calc(var(--text-lg) * var(--text-scale, 1));
		font-weight: var(--weight-semibold);
		color: var(--color-fg-base);
	}

	.control {
		display: flex;
		justify-content: flex-end;
		width: var(--layout-settingsControlW);
		flex-shrink: 0;
	}

	.control.wide > :global(*) {
		width: 100%;
	}
</style>
