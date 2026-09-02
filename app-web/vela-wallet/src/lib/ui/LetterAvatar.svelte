<script lang="ts">
	/**
	 * A site or token's mark: its first letter on a tint of its own brand
	 * colour (spec 022). Deliberately NOT a fetched favicon — a wallet that
	 * downloads an icon from the site it is about to warn you about has handed
	 * that site a tracking pixel and a way to impersonate a brand.
	 */
	interface Props {
		letter: string;
		/** The brand colour. The disc is a low-alpha wash of it; the glyph is it. */
		tint: string;
		size?: number;
		/** Muted rendering for the unknown-site case. */
		muted?: boolean;
	}

	let { letter, tint, size = 40, muted = false }: Props = $props();
</script>

<span
	class="avatar"
	class:muted
	style:--tint={tint}
	style:width="{size}px"
	style:height="{size}px"
	style:font-size="{Math.round(size * 0.42)}px"
	aria-hidden="true">{letter}</span
>

<style>
	.avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		border-radius: var(--radius-full);
		background: color-mix(in srgb, var(--tint) 16%, transparent);
		color: var(--tint);
		font-family: var(--font-ui);
		font-weight: var(--weight-bold);
		line-height: 1;
		user-select: none;
	}

	.muted {
		background: var(--color-bg-sunken);
		color: var(--color-fg-muted);
	}
</style>
