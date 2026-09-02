<script lang="ts">
	interface Props {
		id: string;
		collection: string;
	}

	let { id, collection }: Props = $props();
</script>

<div class="nft">
	<p class="id">{id}</p>
	<p class="collection">{collection}</p>
</div>

<style>
	.nft {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.id {
		margin: 0;
		font-family: var(--font-numeric);
		font-size: calc(var(--text-4xl) * var(--text-scale, 1));
		font-weight: var(--weight-bold);
		line-height: var(--leading-amountHero);
		color: var(--color-fg-base);
	}

	.collection {
		margin: 0;
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-muted);
	}
</style>
