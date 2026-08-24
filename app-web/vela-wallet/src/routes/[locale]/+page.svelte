<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	import BrandMark from '$lib/ui/BrandMark.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Carousel from '$lib/ui/Carousel.svelte';
	import FeatureCard from '$lib/ui/FeatureCard.svelte';
	import PromptSheet from '$lib/ui/onboarding/v2/PromptSheet.svelte';
	import { fillTemplate } from '$lib/i18n/fill';
	import { SUPPORTED_LOCALES, FALLBACK_LOCALE } from '$lib/i18n/locales';
	import { SITE_ORIGIN } from '$lib/site';
	import { loadOnboardingCore } from '$lib/onboarding/core/wasm-client';
	import { createLoginSession, type LoginSession } from '$lib/onboarding/core/sessions';
	import { promptCopy, type PromptCopy } from '$lib/onboarding/core/copy';
	import { session } from '$lib/session/core/session.svelte';
	import type { CompletionMode } from '$lib/onboarding/generated/CompletionMode';
	import type { LoginView } from '$lib/onboarding/generated/LoginView';
	import type { PromptKind } from '$lib/onboarding/generated/PromptKind';

	let { data }: PageProps = $props();

	const m = $derived(data.messages);
	const locale = $derived(data.locale);

	/* ------------------------------------------------------------------ */
	/* Onboarding (spec 019).                                               */
	/*                                                                      */
	/* Creating a wallet is a stepped journey and gets its own route, so    */
	/* back works and a reload strands nobody mid-ceremony. Signing in has  */
	/* no steps — one system passkey sheet and you are either in or you are */
	/* not — so it runs HERE, in place, and only speaks through the button's */
	/* busy state and the failure sheet.                                    */
	/* ------------------------------------------------------------------ */

	/** Serialized flow copy from the layout load; numbers filled here. */
	const strings = (key: string, params?: Record<string, string | number>) =>
		fillTemplate(data.flow[key] ?? key, params);

	const createHref = $derived(resolve('/[locale]/create', { locale }));

	let loginView = $state<LoginView | null>(null);
	let login: LoginSession | null = null;
	let pending = $state<{ copy: PromptCopy; resolve: (accepted: boolean) => void } | null>(null);

	const signingIn = $derived(loginView?.busy ?? false);

	/**
	 * The endpoint the registry lives at is unreachable. Sign-in is still
	 * attemptable — the core decides that, not this screen — so this only
	 * surfaces the warning.
	 */
	const endpointUnreachable = $derived(loginView?.endpoint_unreachable ?? false);

	function prompt(kind: PromptKind): Promise<boolean> {
		return new Promise((settle) => {
			pending = { copy: promptCopy(kind, strings), resolve: settle };
		});
	}

	async function complete(mode: CompletionMode): Promise<void> {
		await session.boot();
		session.accountEstablished(mode);
	}

	/**
	 * Sign-in loads the core on FIRST USE, not on mount: the Welcome page is
	 * prerendered and must stay wasm-free until someone commits. The health
	 * probe the core starts on `start` is part of that commitment.
	 */
	async function signIn() {
		if (signingIn) return;
		if (!login) {
			await loadOnboardingCore();
			login = createLoginSession({
				onView: (next) => (loginView = next),
				deps: { prompt, complete }
			});
			login.start({ type: 'start' });
		}
		login.dispatch({ type: 'sign_in' });
	}

	onMount(() => () => {
		login?.dispose();
		login = null;
	});
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
			<Button variant="primary" href={createHref}>
				{m.createWallet}
			</Button>
			<Button variant="secondary" disabled={signingIn} onclick={signIn}>
				{m.alreadyHaveWallet}
			</Button>
			{#if endpointUnreachable}
				<p class="endpointWarning" role="status">
					{strings('onboarding.settings.warningText')}
				</p>
			{/if}
		</div>
	</aside>
</main>

{#if pending}
	<PromptSheet
		copy={pending.copy}
		dismissLabel={strings('onboarding.common.back')}
		onAnswer={(accepted) => {
			pending?.resolve(accepted);
			pending = null;
		}}
	/>
{/if}

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

	.endpointWarning {
		margin: 0;
		color: var(--color-warning-base);
		font-size: var(--text-base);
		line-height: var(--leading-normal);
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
