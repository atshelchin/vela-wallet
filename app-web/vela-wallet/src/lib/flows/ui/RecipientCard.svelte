<script lang="ts">
	/**
	 * SD2b's split row (spec 021 component 13): one of N people, what they get,
	 * and the way to drop them.
	 *
	 * The ordinal ("Recipient 2") is a label above the name rather than a
	 * number beside it, because in a split the ROW is the person and the number
	 * is only there to keep three otherwise-similar cards apart.
	 *
	 * Live (spec 028 Phase 10), the row is ALSO where the person and the amount
	 * are typed: the drawn card assumed every recipient arrived from the book or
	 * a spreadsheet, and a "+ add recipient" that produced a card nothing could
	 * fill was a dead promise. `oninput` present ⇒ the address and the amount
	 * are fields, with the book's door beside the address, exactly as the
	 * single form's field has one.
	 */
	import { UTILITY_ICONS } from '$lib/wallet/icons';
	import Icon from '$lib/wallet/ui/Icon.svelte';
	import Identicon from '$lib/wallet/ui/Identicon.svelte';
	import type { RecipientCardModel } from '../model';

	interface Props {
		recipient: RecipientCardModel;
		/** The token the amount is counted in — the amount field's own name. */
		symbol?: string;
		onremove?: () => void;
		/** Present ⇒ the row can be typed into. Absent, the drawn card stands. */
		oninput?: (patch: { address?: string; amount?: string }) => void;
		/** The book, for THIS row. */
		onpick?: () => void;
	}

	let { recipient, symbol, onremove, oninput, onpick }: Props = $props();
</script>

<div class="card" class:editable={oninput !== undefined}>
	<Identicon svg={recipient.identiconSvg} size="row" address={recipient.address || undefined} />
	<span class="text">
		<span class="ordinal">{recipient.ordinal}</span>
		{#if oninput}
			<span class="entry-row" data-field>
				<input
					class="entry address"
					spellcheck="false"
					autocomplete="off"
					aria-label={`${recipient.ordinal} · ${recipient.addressLabel ?? ''}`}
					value={recipient.address}
					oninput={(event) => oninput({ address: event.currentTarget.value })}
				/>
				{#if onpick}
					<button type="button" class="pick" aria-label={recipient.pickLabel} onclick={onpick}>
						<Icon icon={UTILITY_ICONS['user-round']} size="sm" />
					</button>
				{/if}
			</span>
		{:else}
			<span class="name">{recipient.name}</span>
		{/if}
	</span>
	{#if oninput}
		<span class="amount-entry" data-field>
			<input
				class="entry amount"
				inputmode="decimal"
				autocomplete="off"
				aria-label={`${recipient.ordinal} · ${symbol ?? ''}`}
				placeholder="0"
				value={recipient.amountValue ?? ''}
				oninput={(event) => oninput({ amount: event.currentTarget.value })}
			/>
			{#if symbol !== undefined}<span class="symbol">{symbol}</span>{/if}
		</span>
	{:else}
		<span class="amount">{recipient.amount}</span>
	{/if}
	<button type="button" class="remove" aria-label={recipient.removeLabel} onclick={onremove}>
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

	/* The fields sit on the card's own surface: the card is the field, and a
	   sunken box inside a raised one would be a well inside a well. */
	.entry-row,
	.amount-entry {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		min-width: 0;
		border-radius: var(--radius-sm);
	}

	.entry {
		min-width: 0;
		border: none;
		background: none;
		padding: 0;
		color: var(--color-fg-base);
	}

	.entry:focus {
		outline: none;
	}

	.address {
		flex: 1;
		font-family: var(--font-mono);
		font-size: calc(var(--text-base) * var(--text-scale, 1));
	}

	.amount-entry {
		flex-shrink: 0;
		justify-content: flex-end;
	}

	.amount {
		text-align: end;
	}

	.entry.amount {
		width: calc(var(--space-2xl) * 6);
		text-align: end;
		text-overflow: ellipsis;
		font-family: var(--font-numeric);
		font-size: calc(var(--text-lg) * var(--text-scale, 1));
		font-weight: var(--weight-semibold);
		font-variant-numeric: tabular-nums;
	}

	.symbol {
		font-size: calc(var(--text-sm) * var(--text-scale, 1));
		color: var(--color-fg-muted);
	}

	.pick,
	.remove {
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

	.pick:hover,
	.remove:hover {
		color: var(--color-fg-base);
	}
</style>
