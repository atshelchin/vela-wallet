<script lang="ts">
	import type { AssetRowModel } from '../model';
	import TokenIcon from './TokenIcon.svelte';

	interface Props {
		row: AssetRowModel;
		onclick?: () => void;
	}

	let { row, onclick }: Props = $props();
</script>

<button type="button" class="row" {onclick}>
	<TokenIcon ticker={row.ticker} badgeColor={row.badgeColor} />
	<span class="text">
		<span class="ticker">{row.ticker}</span>
		<span class="chain">{row.chain}</span>
	</span>
	<span class="numbers" class:masked={row.masked}>
		<span class="balance">{row.balance}</span>
		{#if row.fiat.kind === 'value'}
			<span class="fiat">{row.fiat.text}</span>
		{:else if row.fiat.kind === 'no-price'}
			<span class="fiat no-price">{row.fiat.text}</span>
		{:else}
			<span class="fiat">••••</span>
		{/if}
	</span>
</button>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-lg);
		width: 100%;
		padding-block: var(--space-lg);
		padding-inline: 0;
		border: none;
		background: none;
		font-family: var(--font-ui);
		text-align: start;
		cursor: pointer;
	}

	.row:active {
		transform: scale(var(--motion-press-row));
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		flex: 1;
		min-width: 0;
	}

	.ticker {
		font-size: calc(var(--text-lg) * var(--text-scale, 1));
		font-weight: var(--weight-semibold);
		color: var(--color-fg-base);
	}

	.chain {
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.numbers {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: var(--space-xs);
		flex-shrink: 0;
	}

	.balance {
		font-family: var(--font-numeric);
		font-size: calc(var(--text-lg) * var(--text-scale, 1));
		font-weight: var(--weight-semibold);
		font-variant-numeric: tabular-nums;
		color: var(--color-fg-base);
	}

	.fiat {
		font-family: var(--font-numeric);
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		font-variant-numeric: tabular-nums;
		color: var(--color-fg-subtle);
	}

	.no-price {
		color: var(--color-warning-base);
	}

	.masked .balance,
	.masked .fiat {
		letter-spacing: var(--space-xs);
	}
</style>
