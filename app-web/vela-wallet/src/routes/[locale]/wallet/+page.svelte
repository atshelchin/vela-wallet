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
	import { createContactsSession, type ContactsSession } from '$lib/contacts/core/contacts';
	import type { ContactGroupView } from '$lib/core/generated/ContactGroupView';
	import type { ContactsView } from '$lib/core/generated/ContactsView';
	import { readFlowHandoff } from '$lib/flows/contact-handoff';
	import { preferences } from '$lib/services/preferences.svelte';
	import { publishExtSnapshot } from '$lib/dapp/core/ext-cache';
	import { inExtension } from '$lib/dapp/transport';
	import { avatarSvgForClient } from '$lib/wallet/identicon';
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
	import { createBatchImportSession, type BatchImportSession } from '$lib/flows/core/batch-session';
	import {
		createManageTokensSession,
		type ManageTokensSession
	} from '$lib/wallet/core/manage-tokens-session';
	import type { MtokView } from '$lib/core/generated/MtokView';
	import { getAllNetworksSync } from '$lib/services/networks';
	import { sendTokenId } from '$lib/flows/live-send';
	import type { BatchView } from '$lib/core/generated/BatchView';
	import { FeeQuote, IDLE_FEE_VIEW } from '$lib/flows/core/fee-quote.svelte';
	import { scanner, scanNotice } from '$lib/flows/core/scanner.svelte';
	import { isHexAddress, parseEIP681 } from '$lib/services/eip681';
	import { setSendTrackerSink } from '$lib/flows/core/send-executor';
	import { startTxTracker, trackSubmitted } from '$lib/wallet/core/tracker-resident';
	import SigningHost from '$lib/signing/SigningHost.svelte';
	import { signRequest } from '$lib/signing/core/sign-resident.svelte';
	import type { SendOpenParams } from '$lib/core/generated/SendOpenParams';
	import type { SendView } from '$lib/core/generated/SendView';

	import { WEB_DESTINATIONS, webNavItems } from '$lib/wallet/destinations';
	import { chainFilter } from '$lib/wallet/chain-filter.svelte';
	import { balanceTokenId } from '$lib/wallet/live';
	import {
		feedItemAt,
		findFeedItem,
		liveTxDetail,
		withLiveTxDetailDesktop,
		withLiveTxDetailMobile
	} from '$lib/wallet/live-detail';
	import type { PageProps } from './$types';

	/** The sidebar's copy of the rule in `destinations.ts`: three rows, not four. */
	function webNav(model: typeof data.desktop) {
		return { ...model, sidebar: { ...model.sidebar, nav: webNavItems(model.sidebar.nav) } };
	}

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
					identiconSvg: avatarSvgForClient(
						view.address,
						view.accounts[view.active_index]?.account.name ?? ''
					)
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
	 * The third column's own two subjects (spec 015 D3 and 021 A2, live): the
	 * held token whose detail is open, and the feed item whose detail the
	 * flow shows. Keys, not copies — the live models re-derive from the
	 * stores, so a balance refresh updates an open detail rather than
	 * stranding a snapshot.
	 */
	let selectedAssetId = $state<string | null>(null);
	let selectedTxId = $state<string | null>(null);
	const selectedTx = $derived(findFeedItem(feed.view, selectedTxId));
	const txDetail = $derived(
		selectedTx === undefined
			? undefined
			: liveTxDetail(selectedTx, {
					m: data.flowMessages,
					wm: data.walletMessages,
					currency: currency.view,
					hidden: balance.view.hidden,
					identicon: (seed) => avatarSvgForClient(seed, '')
				})
	);

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
	/**
	 * The picker is choosing SEVERAL tokens (spec 028 T440). Shell state by
	 * precedent — the phone's `sweepActive` is its chain filter, a shell
	 * value too — because the core's `multi_select_mode` only flips when the
	 * selection is CONFIRMED. Everything the flag reveals (which rows are
	 * ticked, which are off-chain, what "all valuable" means, what the sweep
	 * moves) is the core's.
	 */
	let sweepPicking = $state(false);

	// --- The batch importer (spec 026 US3) ------------------------------------
	//
	// Its own machine, opened with the sheet and disposed with it. The parse,
	// the duplicate check, the fiat→token conversion and the apply gate are all
	// its; when no source can price the chosen currency it refuses to convert,
	// which is the whole reason the machine exists.
	let batchView = $state<BatchView | null>(null);
	let batchSession: BatchImportSession | null = null;

	async function openBatch(): Promise<void> {
		const token = sendView?.selected_token;
		if (batchSession || !token) return;
		await loadCore();
		batchSession = createBatchImportSession({
			onView: (view) => (batchView = view),
			onError: (error) => console.error('[batch_import] core fault:', error)
		});
		batchSession.start({
			type: 'open',
			token: {
				symbol: token.symbol,
				decimals: token.decimals,
				balance: token.balance,
				price_usd: token.price_usd
			},
			currency_code: currency.view.code,
			max_recipients: 60
		});
	}

	function closeBatch(): void {
		batchSession?.dispose();
		batchSession = null;
		batchView = null;
	}

	const batchActions = $derived(
		batchView === null
			? undefined
			: {
					unit: (id: string) =>
						batchSession?.dispatch({ type: 'set_unit', unit: id === 'fiat' ? 'fiat' : 'token' }),
					paste: (text: string) => batchSession?.dispatch({ type: 'set_raw_text', text }),
					pickFile: () => batchSession?.dispatch({ type: 'pick_file_requested' }),
					saveTemplate: () => batchSession?.dispatch({ type: 'save_template_requested' }),
					apply: () => {
						const recipients = batchView?.recipients ?? [];
						if (recipients.length === 0) return;
						// The core parsed and priced them; the send core seeds its split
						// from exactly those rows, and nothing is recomputed here.
						sendSession?.dispatch({
							type: 'seed_split_recipients',
							recipients: recipients.map((r, index) => ({
								id: `b${index}`,
								address: r.address,
								amount: r.amount,
								name: r.name
							}))
						});
						closeBatch();
					}
				}
	);

	const batchInputs = $derived(
		batchView && sendView?.selected_token
			? { batch: batchView, m: data.flowMessages, symbol: sendView.selected_token.symbol }
			: undefined
	);

	// --- Adding a token (spec 028 US4) -------------------------------------
	//
	// `manage_tokens` has had an executor, a session, types and 22 Rust tests
	// since 025, and was constructed by nothing. It is built when the sheet
	// opens and disposed when it closes; the network snapshot rides on the
	// probe request because the registry (defaults + custom networks) is the
	// shell's, and a confirmed save invalidates the token cache through the
	// core's own `invalidate_token_cache`, which is where the balance list
	// learns to look again.
	let addTokenView = $state<MtokView | null>(null);
	let manageTokens: ManageTokensSession | null = null;

	async function openAddToken(): Promise<void> {
		if (manageTokens) return;
		await loadCore();
		if (manageTokens) return;
		manageTokens = createManageTokensSession({
			account: () => identity?.address ?? '',
			onInvalidated: () => balance.refresh(true),
			onView: (view) => (addTokenView = view),
			onError: (error) => console.error('[manage_tokens] core fault:', error)
		});
		manageTokens.start({ type: 'start' });
	}

	function closeAddToken(): void {
		manageTokens?.dispose();
		manageTokens = null;
		addTokenView = null;
	}

	/**
	 * The registry as the core's `u32` can carry it — wire representability,
	 * not policy: a row that cannot be serialised would make the probe request
	 * throw and the field do nothing at all.
	 */
	function networkSnapshot(): { chain_id: number; name: string }[] {
		return getAllNetworksSync()
			.filter((n) => Number.isInteger(n.chainId) && n.chainId >= 0 && n.chainId <= 4_294_967_295)
			.map((n) => ({ chain_id: n.chainId, name: n.displayName }));
	}

	const addTokenActions = $derived(
		addTokenView === null
			? undefined
			: {
					input: (value: string) => {
						manageTokens?.dispatch({ type: 'address_input', s: value });
					},
					submit: () => {
						const first = addTokenView?.found[0];
						if (first && !first.added) {
							manageTokens?.dispatch({ type: 'save_requested', chain_id: first.chain_id });
						}
					}
				}
	);

	// The probe fires the moment the address is well-formed. The phone has a
	// separate "search" button; the drawn sheet (T3) has one CTA, "add", so the
	// search is implicit. The core's echo gate discards an answer for an
	// address the person has already typed past.
	$effect(() => {
		const view = addTokenView;
		if (!view || !view.address_valid || view.detecting) return;
		if (view.found.length > 0 || view.not_found) return;
		manageTokens?.dispatch({ type: 'detect_requested', networks: networkSnapshot() });
	});

	const addTokenInputs = $derived(
		addTokenView ? { view: addTokenView, m: data.flowMessages } : undefined
	);

	// --- The address book beside a send (spec 028 US5) -----------------------
	//
	// The recipient picker (SD2e / DSD2e) showed the gallery's three fixture
	// people in the middle of a live transfer, and `show_contact_picker` —
	// the core's own state for it — was read by nothing. While a send is open
	// this route holds its own ContactsCore session (024 D8: route-scoped,
	// not a global ledger) and hands its view to the picker; a pick dispatches
	// the core's `picked_address`, a group seeds split mode with its members.
	let contactsView = $state<ContactsView | null>(null);
	let contactsSession: ContactsSession | null = null;

	function openContactsBook(): void {
		if (contactsSession) return;
		contactsSession = createContactsSession({
			onView: (view) => (contactsView = view),
			onError: (error) => console.error('[contacts] core fault:', error)
		});
		contactsSession.start({ type: 'account_switched', my_address: identity?.address ?? null });
	}

	function closeContactsBook(): void {
		contactsSession?.dispose();
		contactsSession = null;
		contactsView = null;
	}

	/** A whole group as split-mode recipients: the core's `seed_split_recipients`, amounts blank. */
	function seedGroup(group: ContactGroupView): void {
		if (group.members.length === 0) return;
		sendSession?.dispatch({
			type: 'seed_split_recipients',
			recipients: group.members.map((member) => ({
				id: '',
				address: member.address,
				amount: '',
				name: member.name ?? member.resolved_name
			}))
		});
	}

	async function openSend(prefill?: Partial<SendOpenParams>): Promise<void> {
		if (sendSession || !identity) return;
		await loadCore();
		if (!identity) return;
		openContactsBook();
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
				preselected_multi: null,
				// A code scanned from the wallet home arrives here: the core reads
				// these exactly as it reads the deep-link params on the phone.
				...prefill
			},
			display: { code: currency.view.code, rate: currency.view.rate, fiat_decimals: 2 }
		});
	}

	function closeSend(): void {
		closeBatch();
		closeContactsBook();
		sendSession?.dispose();
		sendSession = null;
		sendView = null;
		feeSheetOpen = false;
		sweepPicking = false;
		feeQuote.dispose();
		nav.close();
	}

	/** The screen the core's stage names. The nav stack is not consulted here. */
	const sendState = $derived.by(() => {
		const view = sendView;
		if (!view) return undefined;
		// The scanner is the CORE's state, not a shell flag: `open_scanner` is
		// what the recipient row dispatches and `scan_resolved` is what closes it,
		// so the picker, the form and the sweep all open the same one.
		if (view.show_scanner) return 's1' as const;
		// The picker too (spec 028 US5): `open_contact_picker` is what the
		// recipient row dispatches, and a pick — or `close_contact_picker` —
		// is what takes it down.
		if (view.show_contact_picker) return 'sd2e' as const;
		if (feeSheetOpen) return 'sd2f' as const;
		if (batchView) return 'sd2c' as const;
		switch (view.stage) {
			case 'select_token':
				// SD1b is SD1 with checkboxes: the same list, choosing several.
				return sweepPicking ? ('sd1b' as const) : ('sd1' as const);
			case 'enter_details':
				return view.multi_select_mode ? ('sd2d' as const) : ('sd2' as const);
			case 'confirm':
				return view.multi_select_mode ? ('sd3c' as const) : ('sd3' as const);
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
						if (!token) return;
						if (!sweepPicking) {
							sendSession?.dispatch({ type: 'select_token', token_id: sendTokenId(token) });
							return;
						}
						// A batch is one chain. The phone pins it with a filter; the
						// drawn picker (SD1b) pins it with the FIRST pick, so the first
						// tap names the network and the core refuses every other chain
						// from then on. Emptying the selection unpins, so a person can
						// start over without leaving the screen.
						if (sendView?.multi_chain_id === null) {
							sendSession?.dispatch({ type: 'set_multi_network', chain_id: token.chain_id });
						}
						sendSession?.dispatch({ type: 'toggle_multi_token', token_id: sendTokenId(token) });
					},
					selectAll: () => {
						// The scope is what the picker is showing; what counts as
						// valuable inside that scope stays the core's.
						sendSession?.dispatch({
							type: 'toggle_all_multi_tokens',
							visible_ids: (sendView?.tokens ?? []).map(sendTokenId)
						});
					},
					pickCta: () => {
						if (!sweepPicking) {
							sweepPicking = true;
							return;
						}
						if ((sendView?.multi_selected_ids.length ?? 0) === 0) return;
						// The core decides what this becomes: one pick is a normal
						// send, several are a sweep, and the warm-up estimate starts.
						sendSession?.dispatch({ type: 'confirm_multi_selection' });
					},
					amountChanged: (value: string) =>
						sendSession?.dispatch({ type: 'set_amount', amount: value }),
					recipientChanged: (value: string) =>
						sendSession?.dispatch({ type: 'set_recipient', recipient: value }),
					advance: () => sendSession?.dispatch({ type: 'continue' }),
					addRecipient: () => sendSession?.dispatch({ type: 'enter_split_mode' }),
					pickContact: (index: number) => {
						const contact = contactsView?.contacts[index];
						if (contact)
							sendSession?.dispatch({ type: 'picked_address', address: contact.address });
					},
					pickGroup: (index: number) => {
						const group = contactsView?.groups[index];
						if (group) seedGroup(group);
					},
					removeRecipient: (index: number) => {
						const rows = (sendView?.recipients ?? []).filter((_, i) => i !== index);
						sendSession?.dispatch({ type: 'recipients_changed', recipients: rows });
					},
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
					// The three surfaces the phone raises as sheets and the desktop opens
					// as panels (spec 028 T453). They are the session's, so the host that
					// asks does not need to know which layout it is on.
					openFeeSheet: () => {
						feeSheetOpen = true;
					},
					openBatch: () => void openBatch(),
					openScanner: () => sendSession?.dispatch({ type: 'open_scanner' }),
					continueDisabled: !sendView.can_continue,
					confirmDisabled: !sendView.can_confirm
				}
	);

	// An emptied selection unpins the chain (see `selectToken`). The core keeps
	// `multi_chain_id` until told otherwise, and a picker locked to a chain with
	// nothing ticked would grey every other row for no reason a person can see.
	$effect(() => {
		const view = sendView;
		if (!sweepPicking || !view || view.multi_chain_id === null) return;
		if (view.multi_selected_ids.length === 0 && !view.multi_select_mode) {
			sendSession?.dispatch({ type: 'set_multi_network', chain_id: null });
		}
	});

	/** The live inputs the send overlays read, or `undefined` while none is open. */
	const sendInputs = $derived(
		sendView && identity
			? {
					send: sendView,
					fee: feeQuote.view ?? IDLE_FEE_VIEW,
					m: data.flowMessages,
					currency: currency.view,
					identity,
					identicon: avatarSvgForClient,
					sweepPicking
				}
			: undefined
	);

	const flowState = $derived(sendState ?? nav.mobileTop);
	/**
	 * The desktop's copy of the same rule (spec 028 T453): while a send is
	 * live, the core's stage names the panel and the nav stack is not
	 * consulted. Until this phase the third column read `nav.desktopTop` alone,
	 * so it showed the send screens with live DATA (026's overlays) and dead
	 * controls — a Continue that did nothing on a form that knew the balance.
	 */
	const desktopSendState = $derived.by(() => {
		const view = sendView;
		if (!view) return undefined;
		// The scanner is a centred modal on this layout; the host below draws
		// it for `ds1` and hides the panel.
		if (view.show_scanner) return 'ds1' as const;
		// The picker is the core's state too (spec 028 US5).
		if (view.show_contact_picker) return 'dsd2e' as const;
		if (feeSheetOpen) return 'dsd2f' as const;
		if (batchView) return 'dsd2c' as const;
		switch (view.stage) {
			case 'select_token':
				return 'dsd1' as const;
			case 'enter_details':
				return view.split_mode ? ('dsd2b' as const) : ('dsd2' as const);
			case 'confirm':
				return 'dsd3' as const;
			case 'receipt':
				return 'dsd4' as const;
			default:
				return 'dsd1' as const;
		}
	});
	const desktopFlow = $derived(desktopSendState ?? nav.desktopTop);

	// --- The scanner (spec 028 T422/T423) ------------------------------------
	//
	// `ScanSurface` owns no camera and knows of none: it draws a frame, a hint
	// and three tools, and takes a snippet for whatever fills the frame. This is
	// what fills it. The refusals matter more than the decode — a black
	// viewfinder tells a person their camera is broken, when the truth is
	// usually a permission they can change or a URL that is not HTTPS.

	let scanVideo = $state<HTMLVideoElement | null>(null);
	let scanPicker = $state<HTMLInputElement | null>(null);
	/** A code that WAS read and is not one this wallet can act on. */
	let scanUnusable = $state(false);

	/** The scan screen is showing, on whichever layout is drawn. */
	const scanning = $derived(flowState === 's1' || desktopFlow === 'ds1');

	/**
	 * Expo re-arms its scanner two seconds after a decode, and the same reason
	 * applies here: a poster with an unusable code in frame must not end the
	 * scan, and re-arming instantly would decode that same code forever.
	 */
	const SCAN_REARM_MS = 2000;
	let scanRearm = 0;

	$effect(() => {
		const video = scanVideo;
		if (!scanning || !video) return;
		scanUnusable = false;
		void scanner.start(video);
		return () => {
			clearTimeout(scanRearm);
			scanner.stop();
		};
	});

	// One code is acted on once: the read is taken off the surface before it is
	// handled, so a still-set `result` cannot fire this twice.
	$effect(() => {
		const found = scanner.result;
		if (found === null) return;
		scanner.clear();
		handleScan(found);
	});

	function handleScan(value: string): void {
		const request = parseEIP681(value);
		// Inside a live send the CORE rules on the scan — whether the screen
		// locks, to which chain, and how base units become a figure are all
		// `scan_resolved`'s to decide (send.rs). The shell only tokenizes.
		if (sendSession && sendView) {
			sendSession.dispatch({
				type: 'scan_resolved',
				scan: request
					? {
							type: 'request',
							recipient: request.recipient,
							chain_id: request.chainId ?? null,
							token_address: request.tokenAddress ?? null,
							amount_base_units: request.amountBaseUnits?.toString() ?? null
						}
					: { type: 'text', data: value }
			});
			return;
		}
		// From the wallet home there is no session yet, so the code OPENS one,
		// prefilled — and locked when the request names a chain to lock to. This
		// is the phone's `onScan` (useHomeController.ts:529) with a session in
		// place of a route push.
		if (request && request.chainId != null) {
			nav.enter('send');
			void openSend({
				prefilled_recipient: request.recipient,
				prefilled_chain_id: String(request.chainId),
				prefilled_token_address: request.tokenAddress ?? null,
				prefilled_amount_base: request.amountBaseUnits?.toString() ?? null,
				locked: true
			});
			return;
		}
		const address = request?.recipient ?? value.trim();
		if (isHexAddress(address)) {
			nav.enter('send');
			void openSend({ prefilled_recipient: address });
			return;
		}
		// A code that is not a payment. Said, and the viewfinder stays alive.
		scanUnusable = true;
		clearTimeout(scanRearm);
		scanRearm = setTimeout(() => {
			if (scanning && scanVideo) void scanner.start(scanVideo);
		}, SCAN_REARM_MS) as unknown as number;
	}

	function scanTool(id: 'gallery' | 'torch' | 'flip'): void {
		if (id === 'gallery') scanPicker?.click();
		else if (id === 'torch') void scanner.toggleTorch();
		else void scanner.flip();
	}

	async function pickScanImage(event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		// Clear it before reading: picking the SAME file twice fires no second
		// change event, and the retry would look like a hang.
		input.value = '';
		if (!file) return;
		scanUnusable = false;
		await scanner.pick(file);
	}

	const scanCopy = $derived(
		scanNotice(
			{ status: scanner.status, nothingFound: scanner.nothingFound, unusable: scanUnusable },
			data.flowMessages
		)
	);

	// The destinations THIS client has — `WEB_DESTINATIONS` (spec 022 founder
	// call): the web has no 探索, and every route reads the same list.

	onMount(() => {
		void session.boot();
		void currency.boot();
		preferences.boot();
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

	/**
	 * Publish what an already-connected site may be told, whenever this wallet's
	 * accounts change (spec 027 T332).
	 *
	 * A page that is already connected asks `eth_accounts` and `eth_chainId` on
	 * every load, and the extension's service worker cannot run the core to
	 * answer them. So `ext_cache` decides what the snapshot contains and this
	 * stores it; the worker only reads. Off the extension there is no channel
	 * and no storage to write to, and `publishExtSnapshot` is a no-op.
	 */
	$effect(() => {
		const view = session.view;
		if (view.loading || !inExtension()) return;
		void publishExtSnapshot({
			isLoading: false,
			hasWallet: view.has_wallet,
			accounts: view.accounts.map((row) => row.account),
			active: view.accounts[view.active_index]?.account ?? null,
			theme: 'dark',
			locale: data.locale ?? 'en'
		});
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
		// The sidebar's network filter: holdings and feed narrow to it, the
		// hero total does not (the phone app's `selectedChainId` semantics).
		chainFilter: chainFilter.chainId,
		selectedToken:
			selectedAssetId === null
				? undefined
				: balance.view.tokens.find((t) => balanceTokenId(t) === selectedAssetId)
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
		send: sendInputs,
		batch: batchInputs,
		addToken: addTokenInputs,
		contactPick:
			contactsView && sendView
				? { view: contactsView, m: data.flowMessages, identicon: avatarSvgForClient }
				: undefined
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

	// --- The signing sheet (spec 026 Phase 5, hosted since 027 T340) ---------
	//
	// The wiring lives in `<SigningHost>` because 027 added a second place a
	// request can reach a person — the extension's request window — and a second
	// copy of the most dangerous screen in the product would be a second
	// implementation of it.

	/**
	 * A person arriving from the address book (spec 028 US5): `?to=` opens a
	 * send with the recipient filled — what a scanned address does — `?group=`
	 * opens one and seeds split mode with the group's members once the book has
	 * answered, `?flow=receive` opens the receive card. Read once; the query is
	 * then dropped from the URL so a reload is a plain visit.
	 */
	let handedOff = false;
	$effect(() => {
		if (handedOff || !identity) return;
		const handoff = readFlowHandoff(location.search);
		handedOff = true;
		if (handoff === null) return;
		void goto(resolve('/[locale]/wallet', { locale: data.locale }), { replaceState: true });
		if (handoff.kind === 'receive') {
			nav.enter('receive');
			return;
		}
		nav.enter('send');
		void openSend(
			handoff.kind === 'send' ? { prefilled_recipient: handoff.recipient } : undefined
		).then(() => {
			if (handoff.kind !== 'group-send') return;
			pendingGroup = handoff.groupId;
		});
	});

	/** A group hand-off waits for the book to load, then seeds the split. */
	let pendingGroup = $state<string | null>(null);
	$effect(() => {
		const id = pendingGroup;
		const view = contactsView;
		if (id === null || !view?.loaded || !sendSession) return;
		pendingGroup = null;
		const group = view.groups.find((g) => g.id === id);
		if (group) seedGroup(group);
	});

	function enter(entry: FlowEntry) {
		// One column: a flow opening closes the asset detail (and vice versa).
		selectedAssetId = null;
		if (entry === 'send') {
			nav.enter(entry);
			void openSend();
			return;
		}
		nav.enter(entry);
		if (entry === 'add-token') void openAddToken();
	}

	/**
	 * The history screen names a row by position (`group * 100 + row`, its
	 * own convention); the feed is walked the way the groups were built.
	 */
	function selectTxAt(index: number) {
		selectedTxId = feedItemAt(feed.view, Math.floor(index / 100), index % 100)?.id ?? null;
	}
</script>

<svelte:head>
	<title>{data.messages.metaTitle}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<SigningHost messages={data.signingMessages} fee={feeQuote} />

<!--
  What fills the scanner's frame. One definition for both layouts — only one of
  them is ever mounted, so there is only ever one camera.

  The file input is MOUNTED rather than conditional: `click()` on an input that
  is not in the document opens nothing, and the "choose a photo" tool is the
  whole way out for a person whose camera was refused.
-->
{#snippet scanFeed()}
	<video class="scan-video" bind:this={scanVideo} muted playsinline></video>
	<input
		class="scan-picker"
		type="file"
		accept="image/*"
		tabindex="-1"
		aria-hidden="true"
		bind:this={scanPicker}
		onchange={pickScanImage}
	/>
{/snippet}

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
				onchainselect={(row) => chainFilter.select(row.chainId ?? null)}
				onasset={(row) => {
					nav.close();
					selectedAssetId = row.id ?? null;
				}}
				onassetclose={() => (selectedAssetId = null)}
				onactivity={(row) => (selectedTxId = row.id ?? null)}
			/>
			<!-- `ds1` is the one flow the third column cannot host: a viewfinder
			     in a narrow strip is the wrong shape, so the desktop shows the
			     scanner as a centred modal (DS1L). -->
			{#if desktopFlow !== undefined && desktopFlow !== 'ds1'}
				<FlowsPanel
					model={withLiveTxDetailDesktop(
						withLiveDesktopFlow(data.desktopFlows[desktopFlow], flowInputs),
						txDetail
					)}
					onback={() => {
						if (sendView) {
							// The sheets the phone raises are panels here; leaving one is
							// closing it, not stepping the core back a stage.
							if (feeSheetOpen) feeSheetOpen = false;
							else if (batchView) closeBatch();
							else if (sendView.show_contact_picker)
								sendSession?.dispatch({ type: 'close_contact_picker' });
							else sendSession?.dispatch({ type: 'back' });
							return;
						}
						if (nav.desktopTop === 'dt3') closeAddToken();
						nav.back();
					}}
					onclose={() => {
						if (sendView) {
							closeSend();
							return;
						}
						closeAddToken();
						nav.close();
					}}
					onnavigate={(to, index) => {
						if (to === 'tx-detail' && index !== undefined) selectTxAt(index);
						// The picker opens through the core, as the scanner does.
						if (to === 'contact-pick' && sendSession) {
							sendSession.dispatch({ type: 'open_contact_picker', target: null });
							return;
						}
						nav.push(to);
						if (to === 'add-token') void openAddToken();
					}}
					addToken={addTokenActions}
					send={sendActions}
					batch={batchActions}
				/>
			{/if}
		</div>
		{#if desktopFlow === 'ds1'}
			<div class="scan-scrim" role="presentation">
				<div class="scan-modal">
					<ScanSurface
						model={data.desktopScan}
						variant="modal"
						feed={scanFeed}
						notice={scanCopy}
						ontool={scanTool}
						onclose={() =>
							sendView?.show_scanner
								? sendSession?.dispatch({ type: 'close_scanner' })
								: nav.close()}
					/>
				</div>
			</div>
		{/if}
	{:else if flowState !== undefined}
		<FlowsMobile
			model={withLiveTxDetailMobile(withLiveFlow(data.flows[flowState], flowInputs), txDetail)}
			onback={() => {
				// Backing out of the scanner is closing the scanner, not stepping
				// back a stage — the core opened it and the core closes it.
				if (sendView?.show_scanner) sendSession?.dispatch({ type: 'close_scanner' });
				else if (sendView?.show_contact_picker)
					sendSession?.dispatch({ type: 'close_contact_picker' });
				else if (sendView) sendSession?.dispatch({ type: 'back' });
				else nav.back();
			}}
			onnavigate={(to, index) => {
				if (to === 'tx-detail' && index !== undefined) selectTxAt(index);
				if (to === 'fee-token') feeSheetOpen = true;
				else if (to === 'batch-import') void openBatch();
				else if (to === 'scan' && sendSession) sendSession.dispatch({ type: 'open_scanner' });
				else if (to === 'contact-pick' && sendSession)
					sendSession.dispatch({ type: 'open_contact_picker', target: null });
				else if (to === 'add-token') {
					nav.push(to);
					void openAddToken();
				} else nav.push(to);
			}}
			onsheetclose={() => {
				// The sheet was a pushed step; dismissing it pops the step, so the
				// next tap on "add by address" pushes a fresh one.
				if (nav.mobileTop === 't3') {
					closeAddToken();
					nav.back();
				}
				if (sendView?.show_contact_picker) sendSession?.dispatch({ type: 'close_contact_picker' });
			}}
			send={sendActions}
			batch={batchActions}
			scan={{ feed: scanFeed, notice: scanCopy, tool: scanTool }}
			addToken={addTokenActions}
		/>
	{:else}
		<WalletHome
			model={liveHome}
			destinations={WEB_DESTINATIONS}
			onselect={select}
			onidenticon={() => (viewing = true)}
			identiconViewerLabel={data.walletMessages.identiconViewer.a11yOpen}
			onflow={enter}
			onbalancetoggle={() => balance.togglePrivacy()}
			onactivity={(row) => (selectedTxId = row.id ?? null)}
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

	/* The wallet is a flex ITEM here, beside the flow column, and a flex item
	   given no `flex` is as wide as its content — which with a skeleton
	   balance and an empty feed was a strip down the left of the screen. It
	   takes every column the flow panel leaves, as the gallery's block stage
	   gives it for free. */
	.desktop-shell > :global(.desktop) {
		flex: 1;
		min-width: 0;
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

	/* Fills the frame the brackets mark. `pointer-events: none` because a
	   `<video>` over the surface swallows the taps meant for the tools under
	   it — measured on the Expo build, and the same element here. */
	.scan-video {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: var(--radius-md);
		background: var(--color-bg-sunken);
		pointer-events: none;
	}

	/* Mounted, not drawn: `click()` on a detached input opens nothing. */
	.scan-picker {
		position: absolute;
		width: var(--border-hairline);
		height: var(--border-hairline);
		opacity: 0;
		pointer-events: none;
	}
</style>
