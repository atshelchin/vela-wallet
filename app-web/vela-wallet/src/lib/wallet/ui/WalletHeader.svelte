<script lang="ts">
	import type { WalletHeaderModel } from '../model';
	import { UTILITY_ICONS } from '../icons';
	import Icon from './Icon.svelte';
	import Identicon from './Identicon.svelte';

	interface Props {
		header: WalletHeaderModel;
		onclick?: () => void;
		/**
		 * Open the identicon viewer. The artwork is its own control, not part
		 * of the name button: it answers a different question ("is this the
		 * account I think it is?") and the founder's call is that it answers it
		 * everywhere the artwork appears.
		 */
		onidenticon?: () => void;
		/** Accessible name for the artwork button; required to make it one. */
		identiconLabel?: string;
	}

	let { header, onclick, onidenticon, identiconLabel }: Props = $props();
</script>

<div class="header">
	<!-- Nested buttons are invalid, so the artwork and the name are siblings.
	     Without a handler it stays a picture, which is what the gallery wants. -->
	{#if onidenticon}
		<button type="button" class="avatar" aria-label={identiconLabel} onclick={onidenticon}>
			<Identicon svg={header.identiconSvg} size="header" />
		</button>
	{:else}
		<Identicon svg={header.identiconSvg} size="header" />
	{/if}
	<button type="button" class="text" {onclick}>
		<span class="name-row">
			<span class="name">{header.name}</span>
			<Icon icon={UTILITY_ICONS['chevron-down']} size="sm" />
		</span>
		<span class="address">{header.addressDisplay}</span>
	</button>
</div>

<style>
	.header {
		display: flex;
		align-items: center;
		gap: var(--space-lg);
		min-width: 0;
	}

	.avatar {
		display: flex;
		padding: 0;
		border: none;
		background: none;
		cursor: pointer;
		flex: none;
	}

	.text {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: var(--space-xs);
		padding: 0;
		border: none;
		background: none;
		font-family: var(--font-ui);
		text-align: start;
		cursor: pointer;
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
