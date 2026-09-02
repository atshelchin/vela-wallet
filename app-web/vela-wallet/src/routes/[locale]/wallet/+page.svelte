<script lang="ts">
	/**
	 * The wallet a signed-in person lands in — the web's answer to the iOS root
	 * view and the desktop's `SessionRoute::Wallet` branch (spec 019).
	 *
	 * Three things happen here and nowhere else on the web:
	 *
	 * 1. **The guard.** The core decides WHAT is allowed (`allowed_route`); this
	 *    page decides when to move, exactly as the native shells do. A browser
	 *    with no wallet is sent back to Welcome instead of being shown a wallet
	 *    body it has no business seeing — so nothing renders until the machine
	 *    has actually said `wallet`.
	 * 2. **The identity.** Name, address and identicon come from the session,
	 *    over the top of the fixture model. The identicon is rendered in the
	 *    BROWSER through vela-core, which is already loaded here: the session
	 *    machine that holds the address is that same module. Welcome stays
	 *    wasm-free; this page never could be.
	 * 3. **The way out.** The Settings tab signs out, which is the exit the
	 *    other three clients already have.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { MediaQuery } from 'svelte/reactivity';
	import WalletDesktop from '$lib/wallet/WalletDesktop.svelte';
	import WalletHome from '$lib/wallet/WalletHome.svelte';
	import SignOutSheet from '$lib/session/ui/SignOutSheet.svelte';
	import IdenticonViewer from '$lib/wallet/ui/IdenticonViewer.svelte';
	import { BREAKPOINT_DESKTOP } from '$lib/tokens/tokens';
	import { session } from '$lib/session/core/session.svelte';
	import { identiconSvgForClient } from '$lib/wallet/identicon';
	import { desktopWithIdentity, homeWithIdentity, type WalletIdentity } from '$lib/wallet/identity';

	/** The sidebar's own copy of the rule above: three rows, not four. */
	function webNav(model: typeof data.desktop) {
		return {
			...model,
			sidebar: {
				...model.sidebar,
				nav: model.sidebar.nav.filter((item) => item.id !== 'explore')
			}
		};
	}
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const welcome = $derived(resolve('/[locale]', { locale: data.locale }));
	const wide = new MediaQuery(`(min-width: ${BREAKPOINT_DESKTOP}px)`, false);

	const view = $derived(session.view);
	const signedIn = $derived(view.allowed_route === 'wallet');

	/**
	 * Whose wallet this is. `address` rides in the view pre-derived; the name
	 * does not, so it is read from the active row — and the identicon is
	 * rendered from the address, never from the name.
	 */
	const identity = $derived<WalletIdentity | null>(
		signedIn
			? {
					name: view.accounts[view.active_index]?.account.name ?? '',
					address: view.address,
					identiconSvg: identiconSvgForClient(view.address)
				}
			: null
	);

	const signOut = $derived(view.sign_out);

	/**
	 * The identicon viewer. Opened from the artwork itself, wherever it is
	 * drawn — the header on the phone layout, the sidebar on the wide one.
	 */
	let viewing = $state(false);

	/**
	 * The destinations THIS client has (spec 022 founder call).
	 *
	 * 探索 is the in-app dApp browser, and this client already lives inside a
	 * browser: a page cannot host another site's dApp with a wallet injected
	 * into it, so there is nothing behind that tab here. The native clients
	 * have it; the web shows three tabs rather than a fourth that opens
	 * nothing. The explore/signing vocabulary still ships — the gallery boards
	 * are the design source all four clients are reviewed against.
	 */
	const DESTINATIONS = ['wallet', 'contacts', 'settings'] as const;

	onMount(() => {
		void session.boot();
	});

	// The route guard's other half. `loading` is deliberately not acted on: the
	// core has not ruled yet, and bouncing on a non-answer would throw a
	// reloading person back to Welcome mid-boot.
	$effect(() => {
		if (view.allowed_route === 'onboarding') void goto(welcome, { replaceState: true });
	});

	/**
	 * Sign-out is the only thing behind Settings today. The other three tabs
	 * stay on this screen rather than navigating to fixtures a signed-in person
	 * would read as their real data — the same call all three native clients
	 * made.
	 */
	function select(id: 'wallet' | 'contacts' | 'explore' | 'settings') {
		if (id === 'settings') session.signOut();
	}
</script>

<svelte:head>
	<title>{data.messages.metaTitle}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#if identity}
	{#if wide.current}
		<WalletDesktop
			model={webNav(desktopWithIdentity(data.desktop, identity))}
			onnav={select}
			onidenticon={() => (viewing = true)}
			identiconViewerLabel={data.walletMessages.identiconViewer.a11yOpen}
		/>
	{:else}
		<WalletHome
			model={homeWithIdentity(data.home, identity)}
			destinations={DESTINATIONS}
			onselect={select}
			onidenticon={() => (viewing = true)}
			identiconViewerLabel={data.walletMessages.identiconViewer.a11yOpen}
		/>
	{/if}
{:else}
	<!-- The core has not ruled yet. An empty surface, not a fixture wallet. -->
	<div class="waiting" aria-busy="true"></div>
{/if}

{#if viewing && identity}
	<IdenticonViewer
		copy={data.walletMessages.identiconViewer}
		address={identity.address}
		identiconSvg={identity.identiconSvg}
		onClose={() => (viewing = false)}
	/>
{/if}

{#if signOut}
	<SignOutSheet
		copy={data.walletMessages.signOut}
		pendingUploadWarning={signOut.pending_upload_warning}
		onConfirm={() => session.confirmSignOut()}
		onDismiss={() => session.dismissSignOut()}
	/>
{/if}

<style>
	.waiting {
		min-height: 100dvh;
		background: var(--color-bg-base);
	}
</style>
