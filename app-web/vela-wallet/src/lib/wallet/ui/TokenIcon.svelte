<script lang="ts">
	interface Props {
		ticker: string;
		/** Chain badge dot color (fixture data, not a theme token). */
		badgeColor: string;
	}

	let { ticker, badgeColor }: Props = $props();

	const glyph = $derived(ticker.slice(0, 3).toUpperCase());
</script>

<span class="token" aria-hidden="true">
	<span class="glyph">{glyph}</span>
	<span class="badge" style:background={badgeColor}></span>
</span>

<style>
	.token {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: calc(var(--space-2xl) * 2);
		height: calc(var(--space-2xl) * 2);
		border-radius: var(--radius-full);
		background: var(--color-bg-sunken);
		border: var(--border-hairline) solid var(--color-border-base);
		flex-shrink: 0;
	}

	.glyph {
		font-size: calc(var(--text-xs) * var(--text-scale, 1));
		font-weight: var(--weight-semibold);
		color: var(--color-fg-muted);
		letter-spacing: var(--letterSpacing-sectionLabel);
	}

	.badge {
		position: absolute;
		right: 0;
		bottom: 0;
		width: var(--icon-xs);
		height: var(--icon-xs);
		border-radius: var(--radius-full);
		border: var(--border-emphasis) solid var(--color-bg-base);
	}
</style>
