<script lang="ts">
	import Icon from '$lib/wallet/ui/Icon.svelte';
	import { UTILITY_ICONS } from '$lib/wallet/icons';
	import type { GroupManageRow } from '../model';

	/**
	 * Group management (E3), mirroring the contacts vocabulary spec 018 set.
	 *
	 * System groups (收藏 / 最近的 dApp) can be hidden but never deleted —
	 * their trash affordance is absent rather than disabled, because an
	 * affordance that is only ever refused is a lie about what is possible.
	 */
	interface Props {
		title: string;
		rows: GroupManageRow[];
		newGroup: string;
		closeLabel: string;
		hideLabel: string;
		showLabel: string;
		deleteLabel: string;
		onclose?: () => void;
		ontoggle?: (id: string) => void;
		ondelete?: (id: string) => void;
		onnew?: () => void;
	}

	let {
		title,
		rows,
		newGroup,
		closeLabel,
		hideLabel,
		showLabel,
		deleteLabel,
		onclose,
		ontoggle,
		ondelete,
		onnew
	}: Props = $props();
</script>

<header>
	<h2>{title}</h2>
	<button type="button" class="close" aria-label={closeLabel} onclick={onclose}>
		<Icon icon={UTILITY_ICONS.x} size="lg" />
	</button>
</header>

<ul>
	{#each rows as row (row.id)}
		<li class="row" class:hidden={row.hidden}>
			<span class="grip" aria-hidden="true">
				<Icon icon={UTILITY_ICONS['grip-vertical']} size="base" />
			</span>
			<span class="title">{row.title}</span>
			{#if row.meta}
				<span class="meta">{row.meta}</span>
			{/if}
			<button
				type="button"
				class="icon"
				aria-label={row.hidden ? showLabel : hideLabel}
				onclick={() => ontoggle?.(row.id)}
			>
				<Icon icon={UTILITY_ICONS[row.hidden ? 'eye-off' : 'eye']} size="base" />
			</button>
			{#if !row.system}
				<button
					type="button"
					class="icon"
					aria-label={deleteLabel}
					onclick={() => ondelete?.(row.id)}
				>
					<Icon icon={UTILITY_ICONS['trash-2']} size="base" />
				</button>
			{/if}
		</li>
	{/each}
</ul>

<button type="button" class="new" onclick={onnew}>
	<span class="plus"><Icon icon={UTILITY_ICONS.plus} size="base" /></span>
	<span>{newGroup}</span>
</button>

<style>
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-block: var(--space-md) var(--space-lg);
	}

	h2 {
		margin: 0;
		font-size: calc(var(--text-2xl) * var(--text-scale, 1));
		font-weight: var(--weight-bold);
		color: var(--color-fg-base);
	}

	.close {
		display: flex;
		border: none;
		background: none;
		color: var(--color-fg-muted);
		cursor: pointer;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--space-lg);
		padding-block: var(--space-xl);
		border-bottom: var(--border-hairline) solid var(--color-border-base);
	}

	.grip {
		display: flex;
		color: var(--color-fg-subtle);
		cursor: grab;
	}

	.title {
		font-size: calc(var(--text-lg) * var(--text-scale, 1));
		font-weight: var(--weight-semibold);
		color: var(--color-fg-base);
	}

	.meta {
		flex: 1;
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-subtle);
	}

	/* Hidden reads as hidden: the row itself dims, so the eye icon is a
	   confirmation rather than the only clue. */
	.hidden .title,
	.hidden .meta {
		opacity: var(--opacity-dim);
	}

	.icon {
		display: flex;
		border: none;
		background: none;
		color: var(--color-fg-muted);
		cursor: pointer;
	}

	.new {
		display: flex;
		align-items: center;
		gap: var(--space-lg);
		width: 100%;
		padding-block: var(--space-xl);
		border: none;
		background: none;
		font-family: var(--font-ui);
		font-size: calc(var(--text-lg) * var(--text-scale, 1));
		color: var(--color-fg-subtle);
		cursor: pointer;
		text-align: start;
	}

	.plus {
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--space-4xl);
		height: var(--space-4xl);
		border-radius: var(--radius-full);
		background: var(--color-bg-sunken);
	}
</style>
