<script lang="ts">
	import LetterAvatar from '$lib/ui/LetterAvatar.svelte';
	import type { AmountLine } from '../model';

	interface Props {
		line: AmountLine;
		/** Boxed in its own tone — the burn intercept (cs28). */
		card?: boolean;
		/** Second line inside the card. */
		note?: string;
		/** Swap lines render one step smaller than a lone hero. */
		compact?: boolean;
	}

	let { line, card = false, note, compact = false }: Props = $props();
</script>

<div class="hero" class:card class:compact data-tone={line.tone}>
	{#if line.caption && !card}
		<p class="caption">{line.caption}</p>
	{/if}
	<p class="value">
		<span class="number">{line.sign}{line.value}</span>
		{#if line.token}
			<LetterAvatar letter={line.token.letter} tint={line.token.tint} size={compact ? 20 : 22} />
		{/if}
		<span class="symbol">{line.symbol}</span>
	</p>
	{#if note}
		<p class="note">{note}</p>
	{:else if line.fiat}
		<p class="fiat">{line.caption && card ? `${line.caption} ` : ''}{line.fiat}</p>
	{/if}
</div>

<style>
	.hero {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.card {
		gap: var(--space-xs);
		padding: var(--space-xl);
		border-radius: var(--radius-xl);
	}

	.card[data-tone='danger'] {
		background: var(--color-error-soft);
		border: var(--border-hairline) solid var(--color-error-base);
	}

	.caption {
		margin: 0;
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-muted);
	}

	.value {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		margin: 0;
	}

	.number {
		font-family: var(--font-numeric);
		font-size: calc(var(--text-4xl) * var(--text-scale, 1));
		font-weight: var(--weight-bold);
		font-variant-numeric: tabular-nums;
		line-height: var(--leading-amountHero);
		color: var(--color-fg-base);
	}

	.compact .number {
		font-size: calc(var(--text-3xl) * var(--text-scale, 1));
	}

	.card .number {
		font-size: calc(var(--text-2xl) * var(--text-scale, 1));
	}

	[data-tone='success'] .number,
	[data-tone='success'] .symbol {
		color: var(--color-success-base);
	}

	[data-tone='danger'] .number,
	[data-tone='danger'] .symbol {
		color: var(--color-error-base);
	}

	.symbol {
		font-size: calc(var(--text-xl) * var(--text-scale, 1));
		font-weight: var(--weight-semibold);
		color: var(--color-fg-muted);
	}

	.fiat,
	.note {
		margin: 0;
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-subtle);
	}

	.note {
		color: var(--color-fg-muted);
	}
</style>
