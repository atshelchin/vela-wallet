<script lang="ts">
	interface Props {
		/** Inline SVG markup produced by vela-core (`identiconSvgCircular`) at
		 *  build time — never composed client-side (research.md D1). */
		svg: string;
		/** Diameter in px steps expressed via the icon token scale.
		 *  `hero`/`detail` are the spec-018 contact-detail avatars (64 mobile / 48 desktop). */
		size?: 'row' | 'header' | 'board' | 'hero' | 'detail' | 'viewer';
		label?: string;
	}

	let { svg, size = 'header', label }: Props = $props();
</script>

<span
	class="identicon {size}"
	role={label === undefined ? 'presentation' : 'img'}
	aria-label={label}
	aria-hidden={label === undefined ? 'true' : undefined}
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- trusted vela-core output, no user content -->
	{@html svg}
</span>

<style>
	.identicon {
		display: block;
		border-radius: var(--radius-full);
		overflow: hidden;
		background: var(--color-bg-sunken);
		flex-shrink: 0;
	}

	.identicon :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}

	.row {
		width: var(--icon-2xl);
		height: var(--icon-2xl);
	}

	.header {
		width: calc(var(--space-2xl) * 2);
		height: calc(var(--space-2xl) * 2);
	}

	.board {
		width: var(--size-emptyStateCircle);
		height: var(--size-emptyStateCircle);
	}

	.hero {
		width: var(--size-identiconHero);
		height: var(--size-identiconHero);
	}

	.detail {
		width: var(--size-identiconDetail);
		height: var(--size-identiconDetail);
	}

	.viewer {
		width: var(--size-identiconViewer);
		height: var(--size-identiconViewer);
	}
</style>
