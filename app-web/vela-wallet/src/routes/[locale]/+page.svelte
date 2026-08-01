<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	import BrandMark from '$lib/ui/BrandMark.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Carousel from '$lib/ui/Carousel.svelte';
	import FeatureCard from '$lib/ui/FeatureCard.svelte';
	import { SUPPORTED_LOCALES, FALLBACK_LOCALE } from '$lib/i18n/locales';
	import { SITE_ORIGIN } from '$lib/site';

	let { data }: PageProps = $props();

	const m = $derived(data.messages);
	const locale = $derived(data.locale);
</script>

<svelte:head>
	<title>{m.metaTitle}</title>
	<meta name="description" content={m.metaDescription} />
	<link rel="canonical" href="{SITE_ORIGIN}/{locale}" />
	{#each SUPPORTED_LOCALES as alternate (alternate)}
		<link rel="alternate" hreflang={alternate} href="{SITE_ORIGIN}/{alternate}" />
	{/each}
	<link rel="alternate" hreflang="x-default" href="{SITE_ORIGIN}/{FALLBACK_LOCALE}" />
</svelte:head>

<main class="welcome">
	<section class="content">
		<header class="brand">
			<BrandMark />
			<h1 class="wordmark">Vela Wallet</h1>
		</header>

		<p class="tagline">{m.tagline}</p>

		<!-- Desktop: 2×3 grid. Mobile: one-card carousel. Same content, one source. -->
		<div class="grid">
			{#each m.features as feature (feature.number)}
				<FeatureCard {...feature} />
			{/each}
		</div>

		<div class="slides">
			<Carousel items={m.features} label={m.tagline}>
				{#snippet slide(feature: (typeof m.features)[number])}
					<FeatureCard {...feature} />
				{/snippet}
			</Carousel>
		</div>
	</section>

	<aside class="actions">
		<div class="stack">
			<Button variant="primary" href={resolve('/[locale]/create', { locale })}>
				{m.createWallet}
			</Button>
			<Button variant="secondary" href={resolve('/[locale]/import', { locale })}>
				{m.alreadyHaveWallet}
			</Button>
		</div>
	</aside>
</main>

<style>
	/* ------------------------------------------------------------------ */
	/* Mobile (< 1280px): centered brand, carousel, bottom-anchored CTAs. */
	/* ------------------------------------------------------------------ */

	.welcome {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		padding: var(--space-3xl) var(--layout-screenPaddingX) var(--space-4xl);
		gap: var(--space-3xl);
	}

	.content {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	.brand {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-xl);
		margin-top: auto;
	}

	.wordmark {
		margin: 0;
		font-size: var(--text-4xl);
		font-weight: var(--weight-bold);
		color: var(--color-fg-base);
	}

	.tagline {
		margin: var(--space-4xl) 0 auto;
		text-align: center;
		font-size: var(--text-2xl);
		color: var(--color-fg-muted);
	}

	.grid {
		display: none;
	}

	.slides {
		margin-top: var(--space-4xl);
	}

	.actions {
		display: flex;
		flex-direction: column;
	}

	.stack {
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
		width: 100%;
	}

	/* ------------------------------------------------------------- */
	/* Desktop (>= 1280px): content pane + raised action pane right. */
	/* ------------------------------------------------------------- */

	@media (min-width: 1280px) {
		.welcome {
			flex-direction: row;
			padding: 0;
			gap: 0;
		}

		.content {
			flex: 1 1 auto;
			justify-content: center;
			padding: var(--space-5xl);
		}

		.brand {
			justify-content: flex-start;
			margin-top: 0;
		}

		.wordmark {
			font-size: var(--text-5xl);
		}

		.tagline {
			margin: var(--space-5xl) 0 var(--space-5xl);
			text-align: start;
			font-size: var(--text-4xl);
		}

		.grid {
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			gap: var(--space-2xl);
			max-width: calc(var(--layout-maxContentWidth) + var(--space-5xl) * 4);
		}

		.slides {
			display: none;
		}

		.actions {
			flex: 0 0 38%;
			align-items: center;
			justify-content: center;
			background: var(--color-bg-raised);
			border-inline-start: var(--border-hairline) solid var(--color-border-base);
			padding: var(--space-5xl);
		}

		.stack {
			max-width: var(--layout-frameW);
		}
	}
</style>
