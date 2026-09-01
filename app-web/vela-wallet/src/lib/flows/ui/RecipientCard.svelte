<script lang="ts">
	/**
	 * SD2b's split row (spec 021 component 13): one of N people, what they get,
	 * and the way to drop them.
	 *
	 * The ordinal ("Recipient 2") is a label above the name rather than a
	 * number beside it, because in a split the ROW is the person and the number
	 * is only there to keep three otherwise-similar cards apart.
	 */
	import { UTILITY_ICONS } from '$lib/wallet/icons';
	import Icon from '$lib/wallet/ui/Icon.svelte';
	import Identicon from '$lib/wallet/ui/Identicon.svelte';
	import type { RecipientCardModel } from '../model';

	interface Props {
		recipient: RecipientCardModel;
		onremove?: () => void;
	}

	let { recipient, onremove }: Props = $props();
</script>

<div class="card">
	<Identicon svg={recipient.identiconSvg} size="row" />
	<span class="text">
		<span class="ordinal">{recipient.ordinal}</span>
		<span class="name">{recipient.name}</span>
	</span>
	<span class="amount">{recipient.amount}</span>
	<button type="button" aria-label={recipient.removeLabel} onclick={onremove}>
		<Icon icon={UTILITY_ICONS.x} size="md" />
	</button>
</div>

<style>
	.card {
		display: flex;
		align-items: center;
		gap: var(--space-lg);
		padding: var(--space-lg);
		border-radius: var(--radius-lg);
		background: var(--color-bg-raised);
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		flex: 1;
		min-width: 0;
	}

	.ordinal {
		font-size: calc(var(--text-xs) * var(--text-scale, 1));
		color: var(--color-fg-subtle);
	}

	.name {
		font-family: var(--font-mono);
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-base);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.amount {
		font-family: var(--font-numeric);
		font-size: calc(var(--text-lg) * var(--text-scale, 1));
		font-weight: var(--weight-semibold);
		font-variant-numeric: tabular-nums;
		color: var(--color-fg-base);
		flex-shrink: 0;
	}

	button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--icon-2xl);
		height: var(--icon-2xl);
		flex-shrink: 0;
		border: none;
		border-radius: var(--radius-full);
		background: none;
		color: var(--color-fg-subtle);
		cursor: pointer;
	}

	button:hover {
		color: var(--color-fg-base);
	}
</style>
