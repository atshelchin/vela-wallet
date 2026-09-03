<script lang="ts">
	/**
	 * Settings, as a signed-in person reaches it (spec 023).
	 *
	 * The same three things happen here that happen on the wallet route:
	 *
	 * 1. **The guard.** The core rules on `allowed_route`; this page decides
	 *    when to move. A browser with no wallet goes back to Welcome rather
	 *    than being shown an account block it has no business seeing.
	 * 2. **The identity.** Name, address and identicon come from the session
	 *    over the top of the fixture model, rendered in the browser through
	 *    vela-core — the same module the session machine already loaded.
	 * 3. **The way out.** 退出登录 signs out. It used to be the Settings TAB
	 *    that did that, back when there was no settings screen to put it on;
	 *    now the tab opens this page and the row inside does the work, which is
	 *    where a person would look for it.
	 *
	 * Everything else is fixture-driven by design (spec 023 scope): the
	 * networks, latencies, storage figures and endpoints are canon data, and
	 * wiring them to real preferences is the next feature, not this one.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { MediaQuery } from 'svelte/reactivity';
	import SettingsDesktop from '$lib/settings/SettingsDesktop.svelte';
	import SettingsHome from '$lib/settings/SettingsHome.svelte';
	import { desktopWithIdentity, homeWithIdentity } from '$lib/settings/identity';
	import { BREAKPOINT_DESKTOP } from '$lib/tokens/tokens';
	import { session } from '$lib/session/core/session.svelte';
	import { identiconSvgForClient } from '$lib/wallet/identicon';
	import { shortenAddress, type WalletIdentity } from '$lib/wallet/identity';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const welcome = $derived(resolve('/[locale]', { locale: data.locale }));
	const walletHref = $derived(resolve('/[locale]/wallet', { locale: data.locale }));
	const wide = new MediaQuery(`(min-width: ${BREAKPOINT_DESKTOP}px)`, false);

	const view = $derived(session.view);
	const signedIn = $derived(view.allowed_route === 'wallet');

	const identity = $derived<WalletIdentity | null>(
		signedIn
			? {
					name: view.accounts[view.active_index]?.account.name ?? '',
					address: view.address,
					identiconSvg: identiconSvgForClient(view.address)
				}
			: null
	);

	/** The wide layout's app sidebar wears the same identity the phone header does. */
	const sidebar = $derived(
		identity === null
			? data.sidebar
			: {
					...data.sidebar,
					header: {
						name: identity.name,
						addressDisplay: shortenAddress(identity.address),
						addressFull: identity.address,
						identiconSvg: identity.identiconSvg
					}
				}
	);

	onMount(() => {
		void session.boot();
	});

	// The guard's other half. `loading` is deliberately not acted on: the core
	// has not ruled yet, and bouncing on a non-answer would throw a reloading
	// person back to Welcome mid-boot.
	$effect(() => {
		if (view.allowed_route === 'onboarding') void goto(welcome, { replaceState: true });
	});

	/**
	 * The tab bar. 钱包 has a route; 通讯录 and 探索 do not yet, so they stay
	 * put rather than navigating to a 404 — the same call the wallet screen
	 * made for its own three.
	 */
	function selectTab(id: 'wallet' | 'contacts' | 'explore' | 'settings') {
		if (id === 'wallet') void goto(walletHref);
	}

	function signOut() {
		session.signOut();
	}
</script>

<svelte:head>
	<title>{data.settingsMessages.title}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#if identity}
	{#if wide.current}
		<SettingsDesktop
			model={desktopWithIdentity(data.desktop, identity)}
			{sidebar}
			onnav={selectTab}
			onsignout={signOut}
		/>
	{:else}
		<SettingsHome
			model={homeWithIdentity(data.home, identity)}
			onselecttab={selectTab}
			onsignout={signOut}
		/>
	{/if}
{:else}
	<!-- The core has not ruled yet. An empty surface, not a fixture account. -->
	<div class="waiting" aria-busy="true"></div>
{/if}

<style>
	.waiting {
		min-height: 100dvh;
		background: var(--color-bg-base);
	}
</style>
