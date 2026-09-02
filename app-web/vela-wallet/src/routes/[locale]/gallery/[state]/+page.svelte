<script lang="ts">
	import { page } from '$app/state';
	import { toLocale } from '$lib/i18n/locales';
	import WalletDesktop from '$lib/wallet/WalletDesktop.svelte';
	import WalletHome from '$lib/wallet/WalletHome.svelte';
	import ContactsDesktop from '$lib/contacts/ContactsDesktop.svelte';
	import ContactsHome from '$lib/contacts/ContactsHome.svelte';
	import ExploreDesktop from '$lib/explore/ExploreDesktop.svelte';
	import ExploreHome from '$lib/explore/ExploreHome.svelte';
	import SigningSheet from '$lib/signing/SigningSheet.svelte';
	import Controls from '../Controls.svelte';

	let { data } = $props();

	const locale = $derived(toLocale(page.params.locale ?? '') ?? 'en');
	const state = $derived(page.params.state ?? '');
	/** H1s reviews the full scroll content, so its frame grows with content. */
	const expanded = $derived(state === 'h1s');
	/** dc2n is pinned to a 1024 stage so the <1120 overlay mode is visible. */
	const narrowStage = $derived(state === 'dc2n');
</script>

<svelte:head>
	<title>Vela Wallet · {state.toUpperCase()}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<Controls {locale} stateId={state} />

{#if data.kind === 'mobile'}
	<div class="stage">
		<div class="frame" class:expanded>
			<WalletHome model={data.model} />
		</div>
	</div>
{:else if data.kind === 'contacts-mobile'}
	<div class="stage">
		<div class="frame">
			<ContactsHome model={data.model} />
		</div>
	</div>
{:else if data.kind === 'explore-mobile'}
	<div class="stage">
		<div class="frame">
			<ExploreHome model={data.model} copy={data.copy} signing={data.signing} />
		</div>
	</div>
{:else if data.kind === 'signing'}
	<!-- A CS state IS the sheet over the page that asked for it, so the mock is
	     reproduced whole rather than as a floating panel. -->
	<div class="stage">
		<div class="frame">
			<ExploreHome model={data.model} copy={data.copy} />
			<SigningSheet model={data.signing} />
		</div>
	</div>
{:else if data.kind === 'explore-desktop'}
	<div class="desktop-stage">
		<ExploreDesktop
			model={data.model}
			copy={data.copy}
			sidebar={data.sidebar}
			signing={data.signing}
		/>
	</div>
{:else if data.kind === 'contacts-desktop'}
	<div class="desktop-stage" class:narrow={narrowStage}>
		<ContactsDesktop model={data.model} />
	</div>
{:else}
	<div class="desktop-stage">
		<WalletDesktop model={data.model} />
	</div>
{/if}

<style>
	.stage {
		min-height: 100dvh;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-block: var(--space-3xl);
		background: var(--color-bg-sunken);
	}

	.frame {
		position: relative;
		width: var(--layout-frameW);
		height: var(--layout-frameH);
		border: var(--border-hairline) solid var(--color-border-strong);
		border-radius: var(--radius-2xl);
		overflow: hidden;
	}

	.frame.expanded {
		height: auto;
	}

	.frame.expanded :global(.scroll) {
		overflow-y: visible;
	}

	.desktop-stage {
		height: 100dvh;
		min-width: var(--breakpoint-desktop);
	}

	/* 800 + 216 + 8 = 1024: the narrow stage that shows the overlay column. */
	.desktop-stage.narrow {
		min-width: 0;
		width: calc(var(--layout-maxContentWidth) + var(--layout-contactsRailW) + var(--space-md));
		border-inline-end: var(--border-hairline) solid var(--color-border-strong);
	}
</style>
