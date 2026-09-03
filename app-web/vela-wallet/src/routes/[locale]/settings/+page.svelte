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
	import { networkAdmin } from '$lib/settings/core/network-admin.svelte';
	import { currency } from '$lib/settings/core/currency.svelte';
	import { withLiveCurrency, withLiveNetworks, withLiveNetworksDesktop } from '$lib/settings/live';
	import type { SettingsNetEvent } from '$lib/settings/net-events';
	import { identiconSvgForClient } from '$lib/wallet/identicon';
	import { shortenAddress, type WalletIdentity } from '$lib/wallet/identity';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const welcome = $derived(resolve('/[locale]', { locale: data.locale }));
	const walletHref = $derived(resolve('/[locale]/wallet', { locale: data.locale }));
	const contactsHref = $derived(resolve('/[locale]/contacts', { locale: data.locale }));
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
		void networkAdmin.boot();
		void currency.boot();
	});

	/** Which network's editor is open — render state; the ledger is the core's. */
	let selectedNetworkId = $state<string | undefined>(undefined);

	const net = $derived(networkAdmin.view);
	const m = $derived(data.settingsMessages);

	/** Fixture base → identity overlay → live network sections (research D7). */
	const liveHome = $derived(
		identity === null
			? data.home
			: withLiveCurrency(
					withLiveNetworks(homeWithIdentity(data.home, identity), net, m, selectedNetworkId),
					currency.view
				)
	);
	const liveDesktop = $derived(
		identity === null
			? data.desktop
			: withLiveNetworksDesktop(
					desktopWithIdentity(data.desktop, identity),
					net,
					m,
					selectedNetworkId
				)
	);

	/**
	 * The one translation table: what the person did → what the core is told.
	 * No decisions — the core refuses, coalesces, or persists as its rules say.
	 */
	function onNetEvent(event: SettingsNetEvent): void {
		const chainOf = (id: string) => net.networks.find((row) => row.id === id)?.chain_id;
		switch (event.kind) {
			case 'select-network': {
				selectedNetworkId = event.id;
				const chainId = chainOf(event.id);
				if (chainId !== undefined)
					networkAdmin.dispatch({ type: 'override_expanded', chain_id: chainId });
				return;
			}
			case 'delete-network':
				networkAdmin.dispatch({ type: 'delete_confirmed', id: event.id });
				return;
			case 'detail-field': {
				const chainId = selectedNetworkId === undefined ? undefined : chainOf(selectedNetworkId);
				if (chainId !== undefined)
					networkAdmin.dispatch({
						type: 'override_field_edited',
						chain_id: chainId,
						field: event.field,
						value: event.value
					});
				return;
			}
			case 'detail-blur': {
				const chainId = selectedNetworkId === undefined ? undefined : chainOf(selectedNetworkId);
				if (chainId !== undefined)
					networkAdmin.dispatch({ type: 'override_blurred', chain_id: chainId });
				return;
			}
			case 'open-add':
				networkAdmin.dispatch({ type: 'wizard_reset' });
				return;
			case 'search':
				networkAdmin.dispatch({ type: 'search_input', query: event.query });
				return;
			case 'pick-suggestion':
				networkAdmin.dispatch({
					type: 'chain_selected',
					chain_id: event.chainId,
					keep_custom_rpc: false
				});
				return;
			case 'custom-rpc':
				networkAdmin.dispatch({ type: 'custom_rpc_edited', value: event.value });
				return;
			case 'confirm-add':
				networkAdmin.dispatch({ type: 'add_confirmed', now_iso: new Date().toISOString() });
				return;
			case 'recheck': {
				const chainId = net.wizard.chain_info?.chain_id;
				if (chainId !== undefined)
					networkAdmin.dispatch({
						type: 'chain_selected',
						chain_id: chainId,
						keep_custom_rpc: true
					});
				return;
			}
			case 'endpoints-open':
				networkAdmin.dispatch({ type: 'endpoints_opened' });
				return;
			case 'endpoint':
				networkAdmin.dispatch({ type: 'endpoint_edited', field: event.field, value: event.value });
				return;
			case 'endpoint-blur':
				networkAdmin.dispatch({ type: 'endpoint_blurred', field: event.field });
				return;
			case 'endpoints-reset':
				networkAdmin.dispatch({ type: 'reset_endpoints_to_defaults' });
				return;
			case 'providers-open':
				networkAdmin.dispatch({ type: 'providers_opened' });
				return;
			case 'provider-key':
				networkAdmin.dispatch({
					type: 'provider_key_edited',
					provider: event.provider,
					value: event.value
				});
				return;
			case 'provider-blur':
				networkAdmin.dispatch({ type: 'provider_key_blurred', provider: event.provider });
				return;
			case 'provider-test':
				networkAdmin.dispatch({ type: 'provider_test_requested', provider: event.provider });
				return;
		}
	}

	// The guard's other half. `loading` is deliberately not acted on: the core
	// has not ruled yet, and bouncing on a non-answer would throw a reloading
	// person back to Welcome mid-boot.
	$effect(() => {
		if (view.allowed_route === 'onboarding') void goto(welcome, { replaceState: true });
	});

	/**
	 * The tab bar. 钱包 and 通讯录 have routes (spec 024 gave the book its
	 * own); 探索 has none on web by decision (spec 022), so it stays put.
	 */
	function selectTab(id: 'wallet' | 'contacts' | 'explore' | 'settings') {
		if (id === 'wallet') void goto(walletHref);
		else if (id === 'contacts') void goto(contactsHref);
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
			model={liveDesktop}
			{sidebar}
			onnav={selectTab}
			onsignout={signOut}
			onnetevent={onNetEvent}
		/>
	{:else}
		<SettingsHome
			model={liveHome}
			onselecttab={selectTab}
			onsignout={signOut}
			onnetevent={onNetEvent}
			oncurrencyselect={(code) => currency.choose(code)}
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
