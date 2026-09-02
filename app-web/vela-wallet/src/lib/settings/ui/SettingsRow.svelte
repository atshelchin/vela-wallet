<script lang="ts">
	/**
	 * The settings list's one row (spec 023).
	 *
	 * Every entry on ST1/ST1b is this: an optional leading glyph, a title, an
	 * optional second line, an optional right-aligned current value, and a
	 * trailing chevron or external-link mark. Nine of them make the phone's
	 * settings home; the danger tone makes the 退出登录 row; there is no second
	 * row component anywhere in this feature.
	 */
	import type { SettingsRowModel } from '../model';
	import { UTILITY_ICONS } from '$lib/wallet/icons';
	import Icon from '$lib/wallet/ui/Icon.svelte';
	import StatusPill from './StatusPill.svelte';

	interface Props {
		row: SettingsRowModel;
		/** Absent in the gallery, where the list is a picture. */
		onselect?: (id: string) => void;
		/** Hairline under the row; the last row of a group drops it. */
		divider?: boolean;
	}

	let { row, onselect, divider = true }: Props = $props();

	const tone = $derived(row.tone ?? 'default');
	const trailing = $derived(row.trailing ?? 'chevron');
</script>

<button
	type="button"
	class="row {tone}"
	class:divider
	class:iconless={row.icon === undefined}
	onclick={() => onselect?.(row.id)}
>
	{#if row.icon !== undefined}
		<span class="glyph"><Icon icon={UTILITY_ICONS[row.icon]} size="lg" /></span>
	{/if}

	<span class="text">
		<span class="title">{row.title}</span>
		{#if row.subtitle !== undefined}
			<span class="subtitle">{row.subtitle}</span>
		{/if}
	</span>

	{#if row.badge !== undefined}
		<StatusPill pill={row.badge} />
	{/if}
	{#if row.value !== undefined}
		<span class="value">{row.value}</span>
	{/if}

	{#if trailing === 'chevron'}
		<span class="trailing"><Icon icon={UTILITY_ICONS['chevron-right']} size="sm" /></span>
	{:else if trailing === 'external'}
		<span class="trailing"><Icon icon={UTILITY_ICONS['external-link']} size="sm" /></span>
	{/if}
</button>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-lg);
		width: 100%;
		min-height: var(--size-control-lg);
		padding-block: var(--space-lg);
		padding-inline: 0;
		border: none;
		background: none;
		font-family: var(--font-ui);
		color: var(--color-fg-base);
		text-align: start;
		cursor: pointer;
	}

	/* Hairline, not a card: the design language de-containers these lists, and
	   the rule starts after the glyph column so the icons read as a column. */
	.divider {
		border-bottom: var(--border-hairline) solid var(--color-border-base);
	}

	.glyph {
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--icon-2xl);
		flex-shrink: 0;
		color: var(--color-fg-muted);
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		flex: 1;
		min-width: 0;
	}

	.title {
		font-size: calc(var(--text-lg) * var(--text-scale, 1));
		font-weight: var(--weight-semibold);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.subtitle {
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-subtle);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.value {
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-muted);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.trailing {
		display: flex;
		color: var(--color-fg-subtle);
		flex-shrink: 0;
	}

	.accent .title,
	.accent .glyph {
		color: var(--color-accent-base);
	}

	.danger .title,
	.danger .glyph {
		color: var(--color-error-base);
	}

	@media (hover: hover) {
		.row:hover .title {
			color: var(--color-fg-base);
		}

		.danger:hover .title {
			color: var(--color-error-base);
		}
	}

	.row:active {
		transform: scale(var(--motion-press-row));
	}

	@media (prefers-reduced-motion: reduce) {
		.row:active {
			transform: none;
		}
	}
</style>
