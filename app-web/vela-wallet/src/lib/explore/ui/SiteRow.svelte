<script lang="ts">
	import LetterAvatar from '$lib/ui/LetterAvatar.svelte';
	import type { SiteModel } from '../model';

	interface Props {
		site: SiteModel;
		onopen?: (id: string) => void;
	}

	let { site, onopen }: Props = $props();
</script>

<button type="button" class="row" onclick={() => onopen?.(site.id)}>
	<LetterAvatar letter={site.letter} tint={site.tint} size={40} />
	<span class="text">
		<span class="name">{site.name}</span>
		<span class="sub">{site.subtitle ?? site.host}</span>
	</span>
	{#if site.meta}
		<span class="meta">{site.meta}</span>
	{/if}
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

	.name {
		font-size: calc(var(--text-lg) * var(--text-scale, 1));
		font-weight: var(--weight-semibold);
		color: var(--color-fg-base);
	}

	.sub {
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.meta {
		flex-shrink: 0;
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-accent-base);
	}
</style>
