<script lang="ts">
	import type { WalletHeaderModel } from '../model';
	import { UTILITY_ICONS } from '../icons';
	import Icon from './Icon.svelte';
	import Identicon from './Identicon.svelte';

	interface Props {
		header: WalletHeaderModel;
		onclick?: () => void;
	}

	let { header, onclick }: Props = $props();
</script>

<button type="button" class="header" {onclick}>
	<Identicon svg={header.identiconSvg} size="header" />
	<span class="text">
		<span class="name-row">
			<span class="name">{header.name}</span>
			<Icon icon={UTILITY_ICONS['chevron-down']} size="sm" />
		</span>
		<span class="address">{header.addressDisplay}</span>
	</span>
</button>

<style>
	.header {
		display: flex;
		align-items: center;
		gap: var(--space-lg);
		padding: 0;
		border: none;
		background: none;
		font-family: var(--font-ui);
		text-align: start;
		cursor: pointer;
		min-width: 0;
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		min-width: 0;
	}

	.name-row {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		color: var(--color-fg-base);
		min-width: 0;
	}

	.name {
		font-size: calc(var(--text-xl) * var(--text-scale, 1));
		font-weight: var(--weight-bold);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.address {
		font-family: var(--font-mono);
		font-size: calc(var(--text-sm) * var(--text-scale, 1));
		color: var(--color-fg-subtle);
	}
</style>
