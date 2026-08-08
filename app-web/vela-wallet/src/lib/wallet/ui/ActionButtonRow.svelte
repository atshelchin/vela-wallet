<script lang="ts">
	import { UTILITY_ICONS } from '../icons';
	import Icon from './Icon.svelte';

	interface Props {
		receive: string;
		send: string;
		scan: string;
		/** 'cards' = mobile 3-up tiles; 'pills' = desktop inline buttons. */
		layout?: 'cards' | 'pills';
		onreceive?: () => void;
		onsend?: () => void;
		onscan?: () => void;
	}

	let { receive, send, scan, layout = 'cards', onreceive, onsend, onscan }: Props = $props();

	const items = $derived([
		{ label: receive, icon: UTILITY_ICONS['arrow-down-left'], onclick: onreceive },
		{ label: send, icon: UTILITY_ICONS['arrow-up-right'], onclick: onsend },
		{ label: scan, icon: UTILITY_ICONS['scan-line'], onclick: onscan }
	]);
</script>

<div class="actions {layout}">
	{#each items as item (item.label)}
		<button type="button" onclick={item.onclick}>
			<Icon icon={item.icon} size="lg" />
			<span>{item.label}</span>
		</button>
	{/each}
</div>

<style>
	.actions {
		display: flex;
		gap: var(--space-lg);
	}

	button {
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: var(--radius-xl);
		background: var(--color-bg-raised);
		color: var(--color-fg-base);
		font-family: var(--font-ui);
		font-size: calc(var(--text-lg) * var(--text-scale, 1));
		font-weight: var(--weight-semibold);
		cursor: pointer;
	}

	button:hover {
		opacity: var(--opacity-hover);
	}

	button:active {
		transform: scale(var(--motion-press-button));
	}

	.cards button {
		flex: 1;
		flex-direction: column;
		gap: var(--space-md);
		padding-block: var(--space-xl);
	}

	.pills button {
		flex: 1;
		flex-direction: row;
		gap: var(--space-md);
		height: var(--size-control-lg);
		border: var(--border-hairline) solid var(--color-border-base);
		border-radius: var(--radius-lg);
	}
</style>
