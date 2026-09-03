<script lang="ts">
	/**
	 * R4 — what "Save image" produces (spec 021).
	 *
	 * Not a screen. It is a 480×700 render product that ends up in someone's
	 * photo library and then in a chat, so its geometry is fixed, its colours
	 * are mode-invariant, and it carries the wordmark: away from the app, the
	 * card has to say what it is on its own.
	 *
	 * The identicon sits in the middle of the code (founder direction): a card
	 * whose address was doctored would carry artwork that no longer matches the
	 * characters printed under it.
	 */
	import Identicon from '$lib/wallet/ui/Identicon.svelte';
	import BrandMark from '$lib/ui/BrandMark.svelte';
	import type { ShareCardModel } from '../model';
	import QRCard from './QRCard.svelte';

	interface Props {
		model: ShareCardModel;
	}

	let { model }: Props = $props();
</script>

<div class="card">
	<p class="headline">{model.headline}</p>

	<div class="sheet">
		<QRCard label={model.headline}>
			{#snippet centre()}
				<Identicon svg={model.identiconSvg} size="row" />
			{/snippet}
		</QRCard>

		<p class="name">{model.name}</p>
		<p class="address">
			{#each model.lines as line, i (i)}<span>{line}</span>{/each}
		</p>
		<p class="note">
			<span class="mark" style:background={model.networkMark.badgeColor}>
				{model.networkMark.ticker}
			</span>
			{model.networkNote}
		</p>
	</div>

	<div class="brand">
		<BrandMark />
		<span class="wordmark">{model.wordmark}</span>
	</div>
</div>

<style>
	/*
	 * Every colour on this card is fixed rather than themed. The image is
	 * saved once and viewed anywhere — a card that rendered in dark mode and
	 * was then opened on a white chat background would be a different card.
	 */
	.card {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: var(--layout-shareCardW);
		height: var(--layout-shareCardH);
		padding: var(--space-2xl);
		background: var(--color-accent-base);
		color: var(--color-onAccent);
	}

	.headline {
		margin: 0;
		padding-block: var(--space-lg) var(--space-2xl);
		font-family: var(--font-display);
		font-size: var(--text-3xl);
		font-weight: var(--weight-bold);
		text-align: center;
	}

	.sheet {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-md);
		width: 100%;
		padding: var(--space-2xl);
		border-radius: var(--radius-2xl);
		background: var(--color-onAccent);
		color: var(--color-fixed-shadowInk);
	}

	.name {
		margin: 0;
		padding-top: var(--space-md);
		font-size: var(--text-lg);
		font-weight: var(--weight-bold);
	}

	.address {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		line-height: var(--leading-normal);
		opacity: var(--opacity-dim);
	}

	.note {
		display: inline-flex;
		align-items: center;
		gap: var(--space-sm);
		margin: 0;
		margin-top: var(--space-sm);
		padding: var(--space-xs) var(--space-lg) var(--space-xs) var(--space-xs);
		border-radius: var(--radius-full);
		border: var(--border-hairline) solid var(--color-border-base);
		font-size: var(--text-sm);
	}

	.mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--icon-xl);
		height: var(--icon-xl);
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
		font-weight: var(--weight-bold);
		color: var(--color-onAccent);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: var(--space-lg);
		margin-top: auto;
		padding-block: var(--space-xl);
	}

	.wordmark {
		font-family: var(--font-display);
		font-size: var(--text-3xl);
		font-weight: var(--weight-bold);
		/* Off the accent field, on the white end of the card's own palette. */
		color: var(--color-onAccent);
	}
</style>
