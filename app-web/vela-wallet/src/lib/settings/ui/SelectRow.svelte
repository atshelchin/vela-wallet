<script lang="ts">
	/**
	 * One choice in a picker (spec 023).
	 *
	 * Five sheets are made of nothing else: language, currency, number, date
	 * and time. The differences are all data — a leading currency glyph, a
	 * trailing note like "自动 · 系统" or "印度计数", the mono face every format
	 * sample wants — so they share one row and one list.
	 */
	import type { SelectRowModel } from '../model';
	import { UTILITY_ICONS } from '$lib/wallet/icons';
	import Icon from '$lib/wallet/ui/Icon.svelte';

	interface Props {
		row: SelectRowModel;
		onselect?: (id: string) => void;
	}

	let { row, onselect }: Props = $props();
</script>

<button
	type="button"
	class="select-row"
	role="option"
	aria-selected={row.selected === true}
	class:selected={row.selected}
	onclick={() => onselect?.(row.id)}
>
	{#if row.glyph !== undefined}
		<span class="glyph" aria-hidden="true">{row.glyph}</span>
	{/if}
	<span class="label" class:mono={row.mono}>{row.label}</span>
	{#if row.caption !== undefined}
		<span class="caption">{row.caption}</span>
	{/if}
	<span class="spacer"></span>
	{#if row.note !== undefined}
		<span class="note">{row.note}</span>
	{/if}
	{#if row.selected}
		<span class="check"><Icon icon={UTILITY_ICONS.check} size="md" /></span>
	{/if}
</button>

<style>
	.select-row {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		width: 100%;
		min-height: var(--size-control-lg);
		padding-block: var(--space-lg);
		padding-inline: 0;
		border: none;
		border-bottom: var(--border-hairline) solid var(--color-border-base);
		background: none;
		font-family: var(--font-ui);
		color: var(--color-fg-base);
		text-align: start;
		cursor: pointer;
	}

	.glyph {
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--space-4xl);
		height: var(--space-4xl);
		border-radius: var(--radius-full);
		background: var(--color-bg-raised);
		color: var(--color-fg-muted);
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		flex-shrink: 0;
	}

	.label {
		font-size: calc(var(--text-lg) * var(--text-scale, 1));
	}

	.label.mono {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.caption {
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-subtle);
	}

	.spacer {
		flex: 1;
	}

	.note {
		font-size: calc(var(--text-sm) * var(--text-scale, 1));
		color: var(--color-fg-subtle);
		white-space: nowrap;
	}

	.check {
		display: flex;
		color: var(--color-accent-base);
	}

	/* The chosen row is stated twice — accent text and a check — because the
	   check alone disappears at the small type size the notes use. */
	.selected .label {
		color: var(--color-accent-base);
		font-weight: var(--weight-semibold);
	}
</style>
