<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';
	import type { PageProps } from './$types';
	import BrandMark from '$lib/ui/BrandMark.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Carousel from '$lib/ui/Carousel.svelte';
	import FeatureCard from '$lib/ui/FeatureCard.svelte';
	import CreatePanel from '$lib/ui/onboarding/CreatePanel.svelte';
	import LoginPanel from '$lib/ui/onboarding/LoginPanel.svelte';
	import Sheet from '$lib/ui/onboarding/Sheet.svelte';
	import type {
		ActionId,
		CreatePanelState,
		LoginPanelState,
		StringResolver
	} from '$lib/onboarding/states';
	import { scaffoldTitleI18nKey } from '$lib/onboarding/outcomes';
	import { fillTemplate } from '$lib/i18n/fill';
	import { SUPPORTED_LOCALES, FALLBACK_LOCALE } from '$lib/i18n/locales';
	import { BREAKPOINT_DESKTOP } from '$lib/tokens/tokens';
	import { SITE_ORIGIN } from '$lib/site';

	let { data }: PageProps = $props();

	const m = $derived(data.messages);
	const locale = $derived(data.locale);

	/* ------------------------------------------------------------------ */
	/* Onboarding flow containers (spec 014 US2 / T025).                    */
	/* ≥ 1280px: the flow panel swaps the .actions column content in place  */
	/* (FR-008); below: the bottom sheet presentation (FR-009). The hero    */
	/* column is untouched either way — the aside keeps its dimensions.     */
	/* ------------------------------------------------------------------ */

	type Flow = 'create' | 'login';

	const desktop = new MediaQuery(`(min-width: ${BREAKPOINT_DESKTOP}px)`, false);

	let openFlow = $state<Flow | null>(null);
	let sheet = $state<{ requestClose: () => void }>();

	/** Initial states per contract §3: create → empty Form, login → Waiting(null). */
	const CREATE_INITIAL: CreatePanelState = {
		kind: 'form',
		name: '',
		nameTooLong: false,
		acks: [false, false, false],
		canSubmit: false,
		busy: false
	};
	const LOGIN_INITIAL: LoginPanelState = { kind: 'waiting' };

	/** Serialized flow copy from the layout load; frozen numbers filled here. */
	const flowStrings: StringResolver = (key, params) => fillTemplate(data.flow[key] ?? key, params);

	const sheetLabel = $derived(
		openFlow === null
			? ''
			: flowStrings(
					scaffoldTitleI18nKey(openFlow === 'create' ? CREATE_INITIAL : LOGIN_INITIAL, openFlow)
				)
	);

	/**
	 * Host action sink (contract §2): every ActionId is a no-op in this
	 * feature (FR-011 — the wiring feature routes them later), except the
	 * dismissal semantics, which close the container.
	 */
	function onFlowAction(id: ActionId) {
		if (id === 'back' || id === 'cancel' || id === 'close' || id === 'not_now') closeFlow();
	}

	function closeFlow() {
		// Sheet presentation: play the exit animation, then unmount via onClose.
		if (sheet) sheet.requestClose();
		else openFlow = null;
	}
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
		{#if openFlow !== null && desktop.current}
			<div class="flowPanel">
				{#if openFlow === 'create'}
					<CreatePanel state={CREATE_INITIAL} strings={flowStrings} onAction={onFlowAction} />
				{:else}
					<LoginPanel state={LOGIN_INITIAL} strings={flowStrings} onAction={onFlowAction} />
				{/if}
			</div>
		{:else}
			<div class="stack">
				<Button variant="primary" onclick={() => (openFlow = 'create')}>
					{m.createWallet}
				</Button>
				<Button variant="secondary" onclick={() => (openFlow = 'login')}>
					{m.alreadyHaveWallet}
				</Button>
			</div>
		{/if}
	</aside>
</main>

{#if openFlow !== null && !desktop.current}
	<Sheet bind:this={sheet} label={sheetLabel} onClose={() => (openFlow = null)}>
		{#if openFlow === 'create'}
			<CreatePanel
				state={CREATE_INITIAL}
				strings={flowStrings}
				onAction={onFlowAction}
				showHandle
			/>
		{:else}
			<LoginPanel state={LOGIN_INITIAL} strings={flowStrings} onAction={onFlowAction} showHandle />
		{/if}
	</Sheet>
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

	/* In-place swap target: same column, same width envelope as the stack. */
	.flowPanel {
		width: 100%;
		max-width: var(--layout-frameW);
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
