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
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	import BrandMark from '$lib/ui/BrandMark.svelte';
	import Button from '$lib/ui/Button.svelte';
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
	const walletHref = $derived(resolve('/[locale]/wallet', { locale }));

	let loginView = $state<LoginView | null>(null);
	let login: LoginSession | null = null;
	let pending = $state<{ copy: PromptCopy; resolve: (accepted: boolean) => void } | null>(null);

	/**
	 * The press has been accepted but the core is not up yet.
	 *
	 * `loginView.busy` cannot cover this window: the view does not exist until
	 * the 3.4 MB wasm has been fetched and the machine constructed, so the
	 * SLOWEST part of signing in was also the only part with no feedback at all
	 * — and the guard below could not hold, which let a second press build a
	 * second login session.
	 */
	let starting = $state(false);

	const signingIn = $derived(starting || (loginView?.busy ?? false));

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
		// Signing in ends where the wallet is, not back on the page that
		// started it — the same landing all three native clients make.
		await goto(walletHref, { replaceState: true });
	}

	/**
	 * Sign-in loads the core on FIRST USE, never on mount: this page is
	 * prerendered and must stay wasm-free until someone commits. The health
	 * probe the core starts is part of that commitment.
	 */
	async function signIn() {
		if (signingIn) return;
		starting = true;
		try {
			if (!login) {
				await loadOnboardingCore();
				login = createLoginSession({
					onView: (next) => (loginView = next),
					deps: { prompt, complete }
				});
				login.start({ type: 'start' });
			}
			login.dispatch({ type: 'sign_in' });
		} finally {
			// Handed over to `loginView.busy` — or released, if the core never
			// came up, so the button can be pressed again.
			starting = false;
		}
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
	<div class="column">
		<div class="top">
			<header class="brand">
				<BrandMark size={60} />
				<span class="wordmark">VELA WALLET</span>
			</header>

			<div class="hero">
				<h1 class="headline" class:long={m.heroTitleFit === 'long'}>{m.heroTitle}</h1>
				<p class="sub">{m.heroSubtitle}</p>
			</div>
		</div>

		<div class="actions">
			<Button variant="primary" shape="rounded" disabled={signingIn} href={createHref}>
				{m.createWallet}
			</Button>
			<Button variant="secondary" shape="rounded" loading={signingIn} onclick={signIn}>
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

	/*
	 * The design anchors the brand and headline at the top of the frame and
	 * the two ways in at its BOTTOM. That only happens if the column fills the
	 * height — centre it and `space-between` has nothing to distribute, which
	 * is exactly how the first pass ended up with the buttons riding up under
	 * the subtitle.
	 */

	/*
	 * `space-between`, not a centred stack: the design anchors the brand and
	 * headline at the top and the two ways in at the bottom, so the eye lands
	 * on what the wallet IS before it lands on what to do about it.
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

	/* A locale whose headline is too wide for its rung drops one step down the
	   ladder — 46 → 38 → 31 — rather than wrapping into a third line the design
	   has no room for. Which locales those are is not guessed here: the corpus
	   carries `heroTitleFit` beside the string it describes. */
	.headline.long {
		font-size: var(--text-heroTight);
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
	/* Desktop: a wider column and the two ways in side by side.           */
	/* ------------------------------------------------------------------ */

	@media (min-width: 1280px) {
		.column {
			max-width: var(--layout-welcomeColumn);
		}

		.headline {
			font-size: var(--text-hero);
		}

		.headline.long {
			font-size: var(--text-heroCompact);
		}

		/* Side by side, sharing the column equally — the design's two buttons
		   are the same width. */
		.actions {
			flex-direction: row;
		}

		.actions :global(.button) {
			flex: 1 1 auto;
		}
	}
</style>
