<script lang="ts">
	import type { NetworkPillModel } from '../model';
	import { UTILITY_ICONS } from '../icons';
	import Icon from './Icon.svelte';

	interface Props {
		pill: NetworkPillModel;
		onclick?: () => void;
	}

	let { pill, onclick }: Props = $props();
</script>

<button type="button" class="pill" {onclick}>
	{#if pill.kind === 'all'}
		<span class="dots" aria-hidden="true">
			{#each pill.dots as color, i (i)}
				<span class="dot" style:background={color}></span>
			{/each}
		</span>
	{:else}
		<span class="dot single" style:background={pill.dot} aria-hidden="true"></span>
	{/if}
	<span class="label">{pill.label}</span>
	<Icon icon={UTILITY_ICONS['chevron-down']} size="sm" />
</button>

<style>
	.pill {
		display: inline-flex;
		align-items: center;
		gap: var(--space-md);
		height: var(--size-control-sm);
		padding-inline: var(--space-lg);
		border: var(--border-hairline) solid var(--color-border-base);
		border-radius: var(--radius-full);
		background: var(--color-bg-raised);
		color: var(--color-fg-base);
		font-family: var(--font-ui);
		cursor: pointer;
		max-width: 100%;
	}

	.pill:active {
		transform: scale(var(--motion-press-button));
	}

	.dots {
		display: inline-flex;
		flex-shrink: 0;
	}

	.dot {
		width: var(--icon-sm);
		height: var(--icon-sm);
		border-radius: var(--radius-full);
		flex-shrink: 0;
	}

	.dots .dot + .dot {
		margin-inline-start: calc(var(--space-sm) * -1);
	}

	.single {
		width: var(--icon-xs);
		height: var(--icon-xs);
	}

	.label {
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		font-weight: var(--weight-medium);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
