<script lang="ts">
	import LetterAvatar from '$lib/ui/LetterAvatar.svelte';
	import type { SigningModel } from '../model';

	interface Props {
		dapp: SigningModel['dapp'];
		network: SigningModel['network'];
	}

	let { dapp, network }: Props = $props();
</script>

<header class="header">
	<LetterAvatar letter={dapp.letter} tint={dapp.tint} size={36} />
	<span class="who">
		<span class="name">{dapp.name}</span>
		<span class="host">{dapp.host}</span>
	</span>
	<span class="network">
		<span class="dot" style:background={network.dot}></span>
		{network.name}
	</span>
</header>

<style>
	.header {
		display: flex;
		align-items: center;
		gap: var(--space-lg);
	}

	.who {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		flex: 1;
		min-width: 0;
	}

	.name {
		font-size: calc(var(--text-lg) * var(--text-scale, 1));
		font-weight: var(--weight-semibold);
		color: var(--color-fg-base);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.host {
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.network {
		display: inline-flex;
		align-items: center;
		gap: var(--space-md);
		flex-shrink: 0;
		height: var(--size-networkChip);
		padding-inline: var(--space-lg);
		border-radius: var(--radius-full);
		background: var(--color-bg-sunken);
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-base);
	}

	.dot {
		width: var(--space-md);
		height: var(--space-md);
		border-radius: var(--radius-full);
	}
</style>
