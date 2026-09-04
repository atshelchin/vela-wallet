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
	import { balance } from '$lib/wallet/core/balance.svelte';
	import { feed } from '$lib/wallet/core/feed.svelte';
	import {
		createReceiveWatchSession,
		type ReceiveWatchSession
	} from '$lib/flows/core/receive-watch';
	import { loadCore } from '$lib/core/client';
	import { currency } from '$lib/settings/core/currency.svelte';
	import { withLiveWallet, withLiveWalletDesktop } from '$lib/wallet/live';
	import { withLiveDesktopFlow, withLiveFlow } from '$lib/flows/live';
	import { createSendSession, type SendSession } from '$lib/flows/core/send-session';
	import { FeeQuote, IDLE_FEE_VIEW } from '$lib/flows/core/fee-quote.svelte';
	import { setSendTrackerSink } from '$lib/flows/core/send-executor';
	import { startTxTracker, trackSubmitted } from '$lib/wallet/core/tracker-resident';
	import SigningSheetView from '$lib/signing/SigningSheet.svelte';
	import { signRequest } from '$lib/signing/core/sign-resident.svelte';
	import { signingSheet } from '$lib/signing/core/sheet.svelte';
	import { buildSigningModel } from '$lib/signing/live';
	import { IDLE_FEE_VIEW as IDLE_FEE } from '$lib/flows/core/fee-quote.svelte';
	import type { SendView } from '$lib/core/generated/SendView';

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
	const contactsHref = $derived(resolve('/[locale]/contacts', { locale: data.locale }));
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

	// --- The send flow (spec 026) ---------------------------------------------
	//
	// One `send` session per visit to the flow, and ONE `fee_policy` session
	// beside it: the quote the core pre-checks against, the quote on screen and
	// the quote that is signed are one object with one owner. The core's own
	// `stage` decides which screen shows — the nav stack is not consulted while
	// a send is live, because the machine already knows where the person is.

	let sendView = $state<SendView | null>(null);
	let sendSession: SendSession | null = null;
	const feeQuote = new FeeQuote();
	/** The fee-coin sheet is a shell surface: the core has no state for it. */
	let feeSheetOpen = $state(false);

	async function openSend(): Promise<void> {
		if (sendSession || !identity) return;
		await loadCore();
		if (!identity) return;
		// The tracker owns the receipt from the moment the op is accepted; the
		// send core only hears the verdict back (invariant ⑥'s ordering half).
		setSendTrackerSink((handoff) =>
			trackSubmitted(handoff.userOpHash, handoff.recordIds, handoff.chainId, (outcome) =>
				sendSession?.dispatch({
					type: 'receipt_update',
					user_op_hash: handoff.userOpHash,
					outcome
				})
			)
		);
		startTxTracker();
		const account = identity.address;
		const credentialId = session.view.accounts[session.view.active_index]?.account.id ?? '';
		sendSession = createSendSession({
			onView: (view) => (sendView = view),
			onError: (error) => console.error('[send] core fault:', error),
			ports: {
				tokensPartial: () => {},
				// The originals are the API's; the core carries the slice it needs and
				// the overlays read that. Indexing them here (as Expo does for its
				// token selector's logos) would be a second copy nothing reads.
				tokensFetched: () => {},
				credentialId: () => session.view.accounts[session.view.active_index]?.account.id ?? null,
				credentialLoaded: () => {},
				signingStarted: () => {},
				receiptUpdate: () => {},
				alert: (kind) => console.warn('[send] alert:', kind),
				close: () => closeSend(),
				feeQuote: async (request) => {
					const outcome = await feeQuote.requestQuote(request);
					if (outcome.kind === 'ok') return { type: 'ok', estimate: outcome.estimate };
					if (outcome.kind === 'failed') return { type: 'failed', kind: outcome.failure };
					// The shell could not obtain an input the question requires, or
					// the surface moved on. Neither is a verdict about a fee — the
					// core hears the same "not estimated" either way.
					return { type: 'failed', kind: 'estimate_failed' };
				}
			}
		});
		sendSession.start({
			type: 'open',
			account: { id: credentialId, address: account, name: identity?.name ?? null },
			params: {
				preselected_symbol: null,
				preselected_network: null,
				prefilled_recipient: null,
				prefilled_chain_id: null,
				prefilled_token_address: null,
				prefilled_amount_base: null,
				locked: false,
				preselected_multi: null
			},
			display: { code: currency.view.code, rate: currency.view.rate, fiat_decimals: 2 }
		});
	}

	function closeSend(): void {
		sendSession?.dispose();
		sendSession = null;
		sendView = null;
		feeSheetOpen = false;
		feeQuote.dispose();
		nav.close();
	}

	/** The screen the core's stage names. The nav stack is not consulted here. */
	const sendState = $derived.by(() => {
		const view = sendView;
		if (!view) return undefined;
		if (feeSheetOpen) return 'sd2f' as const;
		switch (view.stage) {
			case 'select_token':
				return 'sd1' as const;
			case 'enter_details':
				return 'sd2' as const;
			case 'confirm':
				return 'sd3' as const;
			case 'receipt':
				return 'sd4b' as const;
			default:
				return 'sd1' as const;
		}
	});

	const sendActions = $derived(
		sendView === null
			? undefined
			: {
					selectToken: (index: number) => {
						const token = sendView?.tokens[index];
						if (token) {
							sendSession?.dispatch({
								type: 'select_token',
								token_id: `${token.network}_${token.token_address ?? 'native'}_${token.symbol}`
							});
						}
					},
					amountChanged: (value: string) =>
						sendSession?.dispatch({ type: 'set_amount', amount: value }),
					recipientChanged: (value: string) =>
						sendSession?.dispatch({ type: 'set_recipient', recipient: value }),
					advance: () => sendSession?.dispatch({ type: 'continue' }),
					confirm: () => sendSession?.dispatch({ type: 'slide_confirm' }),
					pickFeeToken: (index: number) => {
						const option = feeQuote.view.options[index];
						if (option) {
							feeQuote.selectAsset(option.contract);
							sendSession?.dispatch({ type: 'choose_fee_token', token: option.contract });
						}
						feeSheetOpen = false;
					},
					done: () => {
						sendSession?.dispatch({ type: 'done' });
						closeSend();
					},
					continueDisabled: !sendView.can_continue,
					confirmDisabled: !sendView.can_confirm
				}
	);

	/** The live inputs the send overlays read, or `undefined` while none is open. */
	const sendInputs = $derived(
		sendView && identity
			? {
					send: sendView,
					fee: feeQuote.view ?? IDLE_FEE_VIEW,
					m: data.flowMessages,
					currency: currency.view,
					identity,
					identicon: identiconSvgForClient,
					locale: data.locale
				}
			: undefined
	);

	const flowState = $derived(sendState ?? nav.mobileTop);
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
		void currency.boot();
		// Money in flight outlives every screen (spec 026 T232): an operation
		// submitted before the tab closed is settled by the tracker's own
		// recovery sweep, which therefore has to run on EVERY wallet boot — not
		// only when someone opens the send flow. Idempotent and throttled by the
		// core, so calling it from here costs one dispatch.
		startTxTracker();
		// The signing machine is resident for the same reason the tracker is: a
		// request can arrive while any screen is showing. `syncNetworks` runs
		// with it — until a snapshot lands every chain is unsupported, which is
		// the fail-closed default a shell must not leave in place.
		void signRequest.boot().then(() => signRequest.syncNetworks());
	});

	// The account the balances belong to. `account_changed` is also the
	// hydrate: the core reads its cache and fetches for whoever is signed in.
	$effect(() => {
		const address = identity?.address;
		if (address !== undefined) {
			void balance.setAccount(address);
			void feed.setAccount(address);
		}
	});

	// Balance privacy reaches the feed too — the core withholds the toast
	// while hidden (invariant ④), and every money row masks together.
	$effect(() => {
		feed.privacyChanged(balance.view.hidden);
	});

	// The 10s Activity poll the Expo home ran, only while the tab is visible.
	onMount(() => {
		const id = setInterval(() => {
			if (document.visibilityState === 'visible') feed.liveTick();
		}, 10_000);
		return () => clearInterval(id);
	});

	/**
	 * The deposit watcher lives exactly as long as a receive screen is showing
	 * (research D12): created on entry with THIS address, disposed on leave.
	 * A detected deposit refreshes the balances and nudges the feed — the row
	 * appearing and the total moving are the acknowledgement.
	 */
	let watcher: ReceiveWatchSession | null = null;
	const receiving = $derived(
		(flowState !== undefined && flowState.startsWith('r')) ||
			(desktopFlow !== undefined && desktopFlow.startsWith('dr'))
	);
	$effect(() => {
		const address = identity?.address;
		if (!receiving || address === undefined) return;
		let disposed = false;
		void loadCore().then(() => {
			if (disposed) return;
			watcher = createReceiveWatchSession({
				address,
				onView: () => {},
				onDeposit: () => {
					balance.refresh(true);
					feed.liveTick();
				},
				onError: (error) => console.error('[receive-watch] core fault:', error)
			});
			watcher.start({ type: 'start' });
		});
		return () => {
			disposed = true;
			watcher?.dispose();
			watcher = null;
		};
	});

	// Page visibility stands in for app focus (research D12): a hidden tab
	// pauses the pollers, a returning one refreshes by the core's rules.
	onMount(() => {
		const onvisibility = () => {
			if (document.visibilityState === 'visible') {
				balance.focused();
				feed.focusTick();
			} else balance.backgrounded();
		};
		document.addEventListener('visibilitychange', onvisibility);
		return () => document.removeEventListener('visibilitychange', onvisibility);
	});

	/** Fixture base → identity overlay → live balance/holdings (research D10). */
	const liveInputs = $derived({
		balance: balance.view,
		currency: currency.view,
		m: data.walletMessages,
		feed: feed.view,
		locale: data.locale
	});
	const liveHome = $derived(
		identity === null
			? data.home
			: withLiveWallet(homeWithIdentity(data.home, identity), liveInputs)
	);
	const liveDesktop = $derived(
		identity === null
			? data.desktop
			: withLiveWalletDesktop(webNav(desktopWithIdentity(data.desktop, identity)), liveInputs)
	);

	/** The pushed assets screen shows the same holdings as the home (D10). */
	const flowInputs = $derived({
		...liveInputs,
		identity: identity ?? undefined,
		emptyCopy: data.flows.t4.base.kind === 'assets' ? data.flows.t4.base.model.empty : undefined,
		send: sendInputs
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
	 * 设置 (spec 023) and 通讯录 (spec 024) have routes; 探索 has none on web
	 * by decision (spec 022), so it stays put.
	 */
	function select(id: 'wallet' | 'contacts' | 'explore' | 'settings') {
		if (id === 'settings') void goto(settings);
		else if (id === 'contacts') void goto(contactsHref);
	}

	// --- The signing sheet (spec 026 Phase 5) --------------------------------
	//
	// `sign_request` is app-resident: a request can arrive while any screen is
	// showing, and the sheet is the same one for all of them. The two per-
	// request machines live beside it, and the transport is whatever registered
	// itself — in 026 that is the parallel space's in-page requester; 027 plugs
	// a real one into the same table.

	const signView = $derived(signRequest.view);

	// A request arrives → both per-request machines are told about it. It goes →
	// they go with it.
	$effect(() => {
		const request = signView.request;
		if (request && signView.surface !== 'hidden') {
			void signingSheet.present(request, identity?.address ?? null);
		} else {
			signingSheet.dismiss();
		}
	});

	const signingModel = $derived.by(() => {
		if (!identity) return null;
		return buildSigningModel({
			sign: signView,
			clear: signingSheet.clear,
			guard: signingSheet.guard,
			fee: feeQuote.view ?? IDLE_FEE,
			m: data.signingMessages,
			identity,
			identicon: identiconSvgForClient
		});
	});

	/**
	 * What the approve carries. The fee is the live session's, and the params
	 * override is the GUARD's rewrite — the capped approval, not the requested
	 * one. Passing the original params here would be the never-unlimited
	 * mandate defeated at the last step.
	 */
	function approveOpts() {
		const quote = feeQuote.view?.fee ?? null;
		return {
			max_fee_per_gas: quote ? quote.max_fee_per_gas : null,
			bundler_cost_wei: null,
			gas_fee_token: feeQuote.view?.fee_token ?? null,
			quoted_fee: null,
			fee_collector: null,
			params_override_json: signingSheet.guard.rewritten_params_json,
			intent: null
		};
	}

	/** The chip ids the drawn editor emits, in the guard's vocabulary. */
	function guardChip(id: string): void {
		if (id === 'requested' || id === 'balance' || id === 'custom' || id === 'revoke') {
			signingSheet.dispatchGuard({ type: 'preset_selected', mode: id });
		}
	}

	function enter(entry: FlowEntry) {
		if (entry === 'send') {
			nav.enter(entry);
			void openSend();
			return;
		}
		nav.enter(entry);
	}
</script>

<svelte:head>
	<title>{data.messages.metaTitle}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#if signingModel}
	<!--
		Dismissal IS rejection (the 022 interaction contract draws no reject
		button), so closing answers the requester with 4001 through the core.
	-->
	<SigningSheetView
		model={signingModel}
		onclose={() => signRequest.dispatch({ type: 'reject_tapped' })}
		onconfirm={() => signRequest.dispatch({ type: 'approve_tapped', opts: approveOpts() })}
		onchip={guardChip}
		onfee={() => {}}
	/>
{/if}

{#if identity}
	{#if wide.current}
		<div class="desktop-shell">
			<WalletDesktop
				model={liveDesktop}
				onnav={select}
				onidenticon={() => (viewing = true)}
				identiconViewerLabel={data.walletMessages.identiconViewer.a11yOpen}
				onflow={enter}
				onbalancetoggle={() => balance.togglePrivacy()}
			/>
			<!-- `ds1` is the one flow the third column cannot host: a viewfinder
			     in a narrow strip is the wrong shape, so the desktop shows the
			     scanner as a centred modal (DS1L). -->
			{#if desktopFlow !== undefined && desktopFlow !== 'ds1'}
				<FlowsPanel
					model={withLiveDesktopFlow(data.desktopFlows[desktopFlow], flowInputs)}
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
			model={withLiveFlow(data.flows[flowState], flowInputs)}
			onback={() => (sendView ? sendSession?.dispatch({ type: 'back' }) : nav.back())}
			onnavigate={(to) => (to === 'fee-token' ? (feeSheetOpen = true) : nav.push(to))}
			send={sendActions}
		/>
	{:else}
		<WalletHome
			model={liveHome}
			destinations={DESTINATIONS}
			onselect={select}
			onidenticon={() => (viewing = true)}
			identiconViewerLabel={data.walletMessages.identiconViewer.a11yOpen}
			onflow={enter}
			onbalancetoggle={() => balance.togglePrivacy()}
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
