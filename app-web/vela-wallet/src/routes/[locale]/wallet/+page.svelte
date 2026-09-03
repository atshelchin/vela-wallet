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
	 * 3. **The way out.** The Settings tab opens the settings screen, and the
	 *    退出登录 row inside it signs out. Until spec 023 there was no such
	 *    screen, so the tab itself was the sign-out — which meant tapping
	 *    设置 to change your language logged you out instead.
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
	import FlowsMobile from '$lib/flows/FlowsMobile.svelte';
	import FlowsPanel from '$lib/flows/FlowsPanel.svelte';
	import ScanSurface from '$lib/flows/ui/ScanSurface.svelte';
	import { FlowNav, type FlowEntry } from '$lib/flows/nav.svelte';

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
	const settings = $derived(resolve('/[locale]/settings', { locale: data.locale }));
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
	 * Spec 021: Receive / Send / Activity / Assets, as pushed screens inside
	 * this route. `flows` and `desktopFlows` arrive prerendered from `load`;
	 * this only decides which one is showing.
	 */
	const nav = new FlowNav();
	const flowState = $derived(nav.mobileTop);
	const desktopFlow = $derived(nav.desktopTop);

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

	/**
	 * The browser's Back unwinds the flow stack before it leaves the wallet.
	 * `FlowNav` pushed a history entry for every step, so each `popstate` here
	 * corresponds to exactly one of them.
	 */
	onMount(() => {
		const onpop = () => {
			if (nav.open) nav.back();
		};
		addEventListener('popstate', onpop);
		return () => removeEventListener('popstate', onpop);
	});

	// The route guard's other half. `loading` is deliberately not acted on: the
	// core has not ruled yet, and bouncing on a non-answer would throw a
	// reloading person back to Welcome mid-boot.
	$effect(() => {
		if (view.allowed_route === 'onboarding') void goto(welcome, { replaceState: true });
	});

	/**
	 * 设置 has a route now (spec 023). 通讯录 and 探索 still do not, so they
	 * stay on this screen rather than navigating to fixtures a signed-in person
	 * would read as their real data.
	 */
	function select(id: 'wallet' | 'contacts' | 'explore' | 'settings') {
		if (id === 'settings') void goto(settings);
	}

	function enter(entry: FlowEntry) {
		nav.enter(entry);
	}
</script>

<svelte:head>
	<title>{data.messages.metaTitle}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#if identity}
	{#if wide.current}
		<div class="desktop-shell">
			<WalletDesktop
				model={webNav(desktopWithIdentity(data.desktop, identity))}
				onnav={select}
				onidenticon={() => (viewing = true)}
				identiconViewerLabel={data.walletMessages.identiconViewer.a11yOpen}
				onflow={enter}
			/>
			<!-- `ds1` is the one flow the third column cannot host: a viewfinder
			     in a narrow strip is the wrong shape, so the desktop shows the
			     scanner as a centred modal (DS1L). -->
			{#if desktopFlow !== undefined && desktopFlow !== 'ds1'}
				<FlowsPanel
					model={data.desktopFlows[desktopFlow]}
					onback={() => nav.back()}
					onclose={() => nav.close()}
					onnavigate={(to) => nav.push(to)}
				/>
			{/if}
		</div>
		{#if desktopFlow === 'ds1'}
			<div class="scan-scrim" role="presentation">
				<div class="scan-modal">
					<ScanSurface model={data.desktopScan} variant="modal" onclose={() => nav.close()} />
				</div>
			</div>
		{/if}
	{:else if flowState !== undefined}
		<FlowsMobile
			model={data.flows[flowState]}
			onback={() => nav.back()}
			onnavigate={(to) => nav.push(to)}
		/>
	{:else}
		<WalletHome
			model={homeWithIdentity(data.home, identity)}
			destinations={DESTINATIONS}
			onselect={select}
			onidenticon={() => (viewing = true)}
			identiconViewerLabel={data.walletMessages.identiconViewer.a11yOpen}
			onflow={enter}
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

	/* The desktop keeps the wallet visible behind the third column — that is
	   the whole point of a column over a pushed screen. */
	.desktop-shell {
		display: flex;
		height: 100dvh;
		overflow: hidden;
	}

	.scan-scrim {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-fixed-backdrop);
	}

	.scan-modal {
		width: min(90vw, calc(var(--size-qrCard) + var(--space-5xl) * 2));
		border-radius: var(--radius-2xl);
		background: var(--color-bg-base);
		box-shadow: var(--shadow-lg);
		overflow: hidden;
	}
</style>
