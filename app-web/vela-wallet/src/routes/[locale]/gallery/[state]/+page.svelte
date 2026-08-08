<script lang="ts">
	import { page } from '$app/state';
	import { toLocale } from '$lib/i18n/locales';
	import WalletDesktop from '$lib/wallet/WalletDesktop.svelte';
	import WalletHome from '$lib/wallet/WalletHome.svelte';
	import Controls from '../Controls.svelte';

	let { data } = $props();

	const locale = $derived(toLocale(page.params.locale ?? '') ?? 'en');
	const state = $derived(page.params.state ?? '');
	/** H1s reviews the full scroll content, so its frame grows with content. */
	const expanded = $derived(state === 'h1s');
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
</style>
