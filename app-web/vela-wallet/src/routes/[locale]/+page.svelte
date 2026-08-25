<script lang="ts">
	/**
	 * Welcome — the v2 design (spec 019).
	 *
	 * One column at every width: brand, headline, and the two ways in. Desktop
	 * gets a wider column and a side-by-side button row; below the breakpoint
	 * the column narrows and the buttons stack. Nothing reflows into a second
	 * pane, because there is no second pane — the flow this page starts is a
	 * full page of its own.
	 *
	 * Creating a wallet NAVIGATES: it is a stepped journey, so it owns a URL and
	 * back works. Signing in has no steps — one system passkey sheet and you are
	 * either in or you are not — so it runs here, in place, and speaks only
	 * through the button's busy state and the failure sheet.
	 *
	 * This page is also the site's landing page: prerendered in 15 locales with
	 * canonical + hreflang. The wasm the flow needs is fetched by the flow, not
	 * by this page — `e2e/welcome-ssr.e2e.ts` holds that line.
	 */
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	import BrandMark from '$lib/ui/BrandMark.svelte';
	import Button from '$lib/ui/Button.svelte';
	import OnboardingRail from '$lib/ui/onboarding/v2/OnboardingRail.svelte';
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

	/** Serialized flow copy from the layout load; numbers filled here. */
	const strings = (key: string, params?: Record<string, string | number>) =>
		fillTemplate(data.flow[key] ?? key, params);

	const createHref = $derived(resolve('/[locale]/create', { locale }));

	let loginView = $state<LoginView | null>(null);
	let login: LoginSession | null = null;
	let pending = $state<{ copy: PromptCopy; resolve: (accepted: boolean) => void } | null>(null);

	const signingIn = $derived(loginView?.busy ?? false);

	/**
	 * The registry is unreachable. Sign-in stays attemptable — the core decides
	 * that, not this screen — so this only surfaces the warning.
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
	 * Sign-in loads the core on FIRST USE, never on mount: this page is
	 * prerendered and must stay wasm-free until someone commits. The health
	 * probe the core starts is part of that commitment.
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
	<OnboardingRail
		rail={{ kind: 'tagline', text: strings('onboarding.welcome.desktopTagline') }}
	/>

	<div class="column">
		<div class="top">
			<!-- The rail carries the brand at desktop widths; below the breakpoint
			     there is no rail, and it belongs here as it always did. -->
			<header class="brand">
				<BrandMark size={60} />
				<span class="wordmark">VELA WALLET</span>
			</header>

			<div class="hero">
				<h1 class="headline">{m.heroTitle}</h1>
				<p class="sub">{m.heroSubtitle}</p>
			</div>
		</div>

		<div class="actions">
			<Button variant="primary" shape="rounded" href={createHref}>
				{m.createWallet}
			</Button>
			<Button variant="secondary" shape="rounded" disabled={signingIn} onclick={signIn}>
				{m.alreadyHaveWallet}
			</Button>
		</div>

		{#if endpointUnreachable}
			<p class="endpointWarning" role="status">
				{strings('onboarding.settings.warningText')}
			</p>
		{/if}
	</div>
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
	.welcome {
		display: flex;
		justify-content: center;
		min-height: 100dvh;
		padding: var(--space-4xl) var(--layout-screenPaddingX) var(--space-5xl);
		background: var(--color-bg-base);
	}

	/* The rail brings its own padding and has to reach both edges, so the page
	   gives up its own once the rail is showing. */
	@media (min-width: 1280px) {
		.welcome {
			justify-content: flex-start;
			padding: 0;
		}
	}

	/*
	 * PHONE WIDTHS: `space-between`, so the brand and headline sit at the top
	 * of the frame and the two ways in ride the bottom, within a thumb. That
	 * only works if the column fills the height — centre it and space-between
	 * has nothing to distribute, which is how the first pass ended up with the
	 * buttons riding up under the subtitle.
	 *
	 * At desktop widths it is centred instead, beside the rail. Stretching this
	 * rule to a desktop window is what opened the hole in the middle of the
	 * page and made it read like a phone screen pulled tall.
	 */
	.column {
		display: flex;
		flex: 1;
		flex-direction: column;
		justify-content: space-between;
		gap: var(--space-5xl);
		width: 100%;
		max-width: var(--layout-flowColumn);
	}

	.top {
		display: flex;
		flex-direction: column;
		gap: var(--space-3xl);
	}

	.brand {
		display: flex;
		gap: var(--space-lg);
		align-items: center;
	}

	.wordmark {
		color: var(--color-fg-base);
		font-size: var(--text-xl);
		font-weight: var(--weight-bold);
		letter-spacing: 0.11em;
	}

	.hero {
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
	}

	.headline {
		margin: 0;
		color: var(--color-fg-base);
		font-size: var(--text-heroCompact);
		font-weight: var(--weight-bold);
		/* The design breaks the headline across two lines. The break lives in
		   the corpus as a newline rather than as markup, so each locale picks
		   its own — a Chinese line length is not a German one. */
		white-space: pre-line;
		line-height: var(--leading-tight);
		letter-spacing: -0.02em;
	}

	.sub {
		margin: 0;
		color: var(--color-fg-muted);
		font-size: var(--text-lg);
		line-height: var(--leading-normal);
	}

	.actions {
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
	}

	.endpointWarning {
		margin: 0;
		color: var(--color-warning-base);
		font-size: var(--text-base);
		line-height: var(--leading-normal);
	}

	/* ------------------------------------------------------------------ */
	/* Desktop: a rail on the left, and the two ways in side by side.      */
	/* ------------------------------------------------------------------ */

	@media (min-width: 1280px) {
		/* Beside the rail: left-aligned, vertically centred, and at its natural
		   height. The mobile layout anchors the two ways in to the bottom of the
		   viewport, which is right on a phone and opens a hole on a desktop. */
		.column {
			flex: 0 1 auto;
			justify-content: center;
			gap: 0;
			/* box-sizing is border-box globally, so the measure has to carry its own
			   padding — 520 of text plus 72 a side. */
			max-width: calc(var(--layout-onboardingColumn) + 144px);
			margin-inline: 0;
			padding: var(--space-5xl) 72px;
		}

		/* The rail has it. */
		.brand {
			display: none;
		}

		.headline {
			font-size: var(--text-hero);
		}

		/* Side by side, each at ITS LABEL'S width. A desktop dialog sizes a
		   button to what it says; a full-width button is a phone's answer to a
		   thumb, and two of them stacked is what made this read as a phone. */
		.actions {
			flex-direction: row;
			margin-block-start: var(--space-4xl);
		}

		.actions :global(.button) {
			flex: 0 0 auto;
			min-width: 176px;
		}
	}
</style>
