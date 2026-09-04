<script lang="ts">
	/**
	 * SD2's amount (spec 021 component 8): the number, big and centred, with
	 * its fiat equivalent and the toggle that swaps which of the two you type.
	 *
	 * The figure is the largest type on the screen because it is the one thing
	 * the person came to decide. The fiat line stays subordinate even when the
	 * denominations swap — the amount being ENTERED leads, whichever it is.
	 */
	import { UTILITY_ICONS } from '$lib/wallet/icons';
	import Icon from '$lib/wallet/ui/Icon.svelte';

	interface Props {
		value: string;
		fiat: string;
		denomLabel: string;
		ondenom?: () => void;
		/**
		 * Present ⇒ the figure is TYPED here (spec 026). The gallery passes
		 * nothing and keeps the drawn picture, exactly as the balance hero's
		 * tap-to-hide does: an affordance appears only where something is
		 * listening for it.
		 */
		oninput?: (value: string) => void;
		placeholder?: string;
	}

	let { value, fiat, denomLabel, ondenom, oninput, placeholder }: Props = $props();
</script>

<div class="amount">
	{#if oninput}
		<input
			class="value entry"
			inputmode="decimal"
			autocomplete="off"
			aria-label={denomLabel}
			placeholder={placeholder ?? '0'}
			{value}
			oninput={(event) => oninput(event.currentTarget.value)}
		/>
	{:else}
		<p class="value">{value}</p>
	{/if}
	<button type="button" class="fiat" aria-label={denomLabel} onclick={ondenom}>
		<span>{fiat}</span>
		<Icon icon={UTILITY_ICONS['chevrons-up-down']} size="sm" />
	</button>
</div>

<style>
	.amount {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-sm);
		padding-block: var(--space-3xl);
	}

	.value {
		margin: 0;
		font-family: var(--font-numeric);
		font-size: calc(var(--text-hero) * var(--text-scale, 1));
		font-weight: var(--weight-bold);
		font-variant-numeric: tabular-nums;
		line-height: var(--leading-none);
		color: var(--color-fg-base);
	}

	.entry {
		width: 100%;
		border: none;
		background: none;
		text-align: center;
		padding: 0;
	}

	.entry:focus {
		outline: none;
	}

	.fiat {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		padding: var(--space-xs) var(--space-sm);
		border: none;
		border-radius: var(--radius-sm);
		background: none;
		font-family: var(--font-numeric);
		font-size: calc(var(--text-lg) * var(--text-scale, 1));
		font-variant-numeric: tabular-nums;
		color: var(--color-fg-muted);
		cursor: pointer;
	}

	.fiat:hover {
		color: var(--color-fg-base);
	}
</style>
