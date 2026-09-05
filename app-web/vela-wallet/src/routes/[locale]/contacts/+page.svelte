<script lang="ts">
	/**
	 * The address book, live (spec 024).
	 *
	 * The same three responsibilities as /wallet and /settings — the guard,
	 * the identity of the machinery (a route-scoped ContactsCore session,
	 * research D8), the way out (the tab bar) — plus the one thing this route
	 * pioneers: a full interaction surface over components that were pure
	 * pictures. Which SCREEN is showing (list/detail/group) is render state
	 * here; WHAT the book contains is only ever the core's view.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ContactsHome from '$lib/contacts/ContactsHome.svelte';
	import ContactEditSheet from '$lib/contacts/ui/ContactEditSheet.svelte';
	import GroupEditSheet from '$lib/contacts/ui/GroupEditSheet.svelte';
	import GroupForm from '$lib/contacts/ui/GroupForm.svelte';
	import type { ContactFormCopy, GroupFormCopy } from '$lib/contacts/forms';
	import { createContactsSession, type ContactsSession } from '$lib/contacts/core/contacts';
	import { buildContactsLive, displayName, type ContactsUiState } from '$lib/contacts/live';
	import type { ContactsUiEvent } from '$lib/contacts/ui-events';
	import type { ContactsView } from '$lib/core/generated/ContactsView';
	import { loadCore } from '$lib/core/client';
	import { fill } from '$lib/wallet/messages';
	import { avatarSvgForClient } from '$lib/wallet/identicon';
	import { preferences } from '$lib/services/preferences.svelte';
	import { session } from '$lib/session/core/session.svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { BREAKPOINT_DESKTOP } from '$lib/tokens/tokens';
	import ContactsDesktop from '$lib/contacts/ContactsDesktop.svelte';
	import { buildContactsDesktopLive } from '$lib/contacts/live';
	import Dialog from '$lib/settings/ui/Dialog.svelte';
	import Button from '$lib/ui/Button.svelte';
	import { shortenAddress } from '$lib/wallet/identity';
	import { WEB_DESTINATIONS } from '$lib/wallet/destinations';
	import { balance } from '$lib/wallet/core/balance.svelte';
	import { chainFilter } from '$lib/wallet/chain-filter.svelte';
	import { liveChainRows } from '$lib/wallet/live';
	import type { ChainRowModel } from '$lib/wallet/model';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const m = $derived(data.contactsMessages);

	const welcome = $derived(resolve('/[locale]', { locale: data.locale }));
	const walletHref = $derived(resolve('/[locale]/wallet', { locale: data.locale }));
	const settingsHref = $derived(resolve('/[locale]/settings', { locale: data.locale }));

	const sessionView = $derived(session.view);
	const signedIn = $derived(sessionView.allowed_route === 'wallet');
	/** Past the breakpoint the book is three columns (DC1), as on /wallet and /settings. */
	const wide = new MediaQuery(`(min-width: ${BREAKPOINT_DESKTOP}px)`, false);

	// --- The machine -------------------------------------------------------

	let view = $state<ContactsView | null>(null);
	let contacts: ContactsSession | null = null;
	let disposed = false;

	onMount(() => {
		void session.boot();
		void balance.boot();
		preferences.boot();
		void (async () => {
			await loadCore();
			if (disposed) return;
			contacts = createContactsSession({
				onView: (next) => (view = next),
				onError: (error) => console.error('[contacts] core fault:', error)
			});
			// Hydrate: reads the three stores (+ the send history, which the
			// web answers empty until 025). The address is the session's.
			contacts.start({ type: 'account_switched', my_address: null });
		})();
		return () => {
			disposed = true;
			contacts?.dispose();
			contacts = null;
		};
	});

	$effect(() => {
		if (sessionView.allowed_route === 'onboarding') void goto(welcome, { replaceState: true });
	});

	// --- Render state ------------------------------------------------------

	let ui = $state<ContactsUiState>({ screen: 'list', query: '' });
	type SheetState =
		| { kind: 'none' }
		| { kind: 'add' }
		| { kind: 'edit'; name: string; address: string }
		| { kind: 'group-new' }
		| { kind: 'confirm-delete'; address: string; name: string };
	let sheet = $state<SheetState>({ kind: 'none' });

	const model = $derived.by(() => {
		if (view === null) return null;
		const built = buildContactsLive(view, m, avatarSvgForClient, ui);
		if (sheet.kind === 'confirm-delete') {
			return {
				...built,
				confirm: {
					title: m.deleteTitle,
					body: fill(m.deleteBody, { name: sheet.name }),
					confirm: m.delete,
					cancel: m.cancel
				}
			};
		}
		return built;
	});

	/**
	 * The wide layout's app sidebar: the session's identity over the empty
	 * header, and the wallet's own network rows from the balance resident —
	 * the same list /wallet and /settings draw, never the board's counts.
	 */
	const sidebar = $derived.by(() => {
		if (!signedIn) return data.sidebar;
		const name = sessionView.accounts[sessionView.active_index]?.account.name ?? '';
		return {
			...data.sidebar,
			header: {
				name,
				addressDisplay: shortenAddress(sessionView.address),
				addressFull: sessionView.address,
				identiconSvg: avatarSvgForClient(sessionView.address, name)
			},
			networks: liveChainRows(balance.view, data.allNetworksLabel, chainFilter.chainId)
		};
	});

	/** The same `ui`, rendered beside the list rather than pushed over it. */
	const desktopModel = $derived(
		view === null ? null : buildContactsDesktopLive(view, m, avatarSvgForClient, ui, sidebar)
	);

	/** The filter is the wallet's to show: choose a network here, land there. */
	function pickChain(row: ChainRowModel): void {
		chainFilter.select(row.chainId ?? null);
		void goto(walletHref);
	}

	$effect(() => {
		if (signedIn) void balance.setAccount(sessionView.address);
	});

	// --- The translation table: what happened → what the core is told ------

	function onUiEvent(event: ContactsUiEvent): void {
		switch (event.kind) {
			case 'tab':
				if (event.id === 'wallet') void goto(walletHref);
				else if (event.id === 'settings') void goto(settingsHref);
				// explore has no web route by decision (spec 022).
				return;
			case 'query':
				ui = { ...ui, query: event.value };
				return;
			case 'add':
			case 'empty-primary':
				sheet = { kind: 'add' };
				return;
			case 'empty-secondary':
				// Import arrives with batch_import wiring (later feature).
				return;
			case 'open':
				ui = { ...ui, screen: 'detail', selectedAddress: event.address };
				// Let the core inspect the address: resolve its identity (written
				// back onto a saved-but-unnamed contact as `resolved_name`) and
				// classify it. Deduped and cached per address by the core. The
				// classification chain is mainnet until a send flow (026) names one.
				contacts?.dispatch({ type: 'inspect_recipient', chain_id: 1, address: event.address });
				return;
			case 'back':
				ui = { ...ui, screen: 'list', selectedAddress: undefined, selectedGroupId: undefined };
				return;
			case 'edit': {
				const contact = view?.contacts.find((c) => c.address === ui.selectedAddress);
				if (contact !== undefined)
					sheet = { kind: 'edit', name: contact.name ?? '', address: contact.address };
				return;
			}
			case 'delete': {
				const contact = view?.contacts.find((c) => c.address === event.address);
				sheet = {
					kind: 'confirm-delete',
					address: event.address,
					name: contact !== undefined ? displayName(contact) : event.address
				};
				return;
			}
			case 'sheet-select':
				if (sheet.kind === 'confirm-delete' && event.label === m.delete) {
					contacts?.dispatch({
						type: 'delete',
						address: sheet.address,
						now_ms: Date.now()
					});
					sheet = { kind: 'none' };
					ui = { ...ui, screen: 'list', selectedAddress: undefined };
				}
				return;
			case 'sheet-close':
				sheet = { kind: 'none' };
				return;
			case 'group-open':
				ui = { ...ui, screen: 'group', selectedGroupId: event.id };
				return;
			case 'group-new':
				sheet = { kind: 'group-new' };
				return;
			case 'add-member':
				// Member management lands with the desktop drag/menus polish.
				return;
		}
	}

	function saveContact(draft: { name: string; address: string }): void {
		contacts?.dispatch({
			type: 'save',
			input: {
				address: draft.address,
				name: draft.name,
				note: null,
				favorite: null,
				kind: null,
				resolved_name: null,
				resolved_source: null
			},
			now_ms: Date.now()
		});
		sheet = { kind: 'none' };
		// On the desktop the column that held the form shows what it made —
		// the phone's list already shows the new row. The core keys contacts
		// by the lowercased address.
		if (wide.current) {
			ui = {
				...ui,
				screen: 'detail',
				selectedAddress: draft.address.toLowerCase(),
				selectedGroupId: undefined
			};
		}
	}

	function saveGroup(name: string): void {
		contacts?.dispatch({
			type: 'group_save',
			input: { id: null, name, color: null, members: null }
		});
		sheet = { kind: 'none' };
	}

	/** The forms' copy — the same strings whichever container draws them. */
	function contactCopy(kind: 'add' | 'edit'): ContactFormCopy {
		return {
			title: kind === 'add' ? m.addTitle : m.editTitle,
			nameLabel: m.nameLabel,
			namePlaceholder: m.namePlaceholder,
			addressLabel: m.addressLabel,
			addressPlaceholder: m.addressPlaceholder,
			save: m.save,
			cancel: m.cancel,
			invalidAddress: m.invalidAddress
		};
	}

	const groupCopy = $derived<GroupFormCopy>({
		title: m.groupNew,
		nameLabel: m.groupNameLabel,
		namePlaceholder: m.groupNamePlaceholder,
		save: m.save,
		cancel: m.cancel
	});
</script>

<svelte:head>
	<title>{m.title}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#if signedIn && model !== null && desktopModel !== null}
	{#if wide.current}
		<div class="desktop-shell">
			<ContactsDesktop
				model={desktopModel}
				onuievent={onUiEvent}
				onchainselect={pickChain}
				contactForm={sheet.kind === 'add' || sheet.kind === 'edit'
					? {
							copy: contactCopy(sheet.kind),
							initial:
								sheet.kind === 'edit' ? { name: sheet.name, address: sheet.address } : undefined,
							onsave: saveContact,
							onclose: () => (sheet = { kind: 'none' })
						}
					: undefined}
			/>

			<!-- The phone's other sheets become centred dialogs here — one field,
			     or a yes/no — as settings' add-network and sign-out are. The
			     contact form is the exception: it is the third column, above. -->
			{#if sheet.kind === 'group-new'}
				<Dialog title={m.groupNew} closeLabel={m.cancel} onclose={() => (sheet = { kind: 'none' })}>
					<GroupForm copy={groupCopy} onsave={saveGroup} />
				</Dialog>
			{:else if sheet.kind === 'confirm-delete'}
				<Dialog
					title={m.deleteTitle}
					closeLabel={m.cancel}
					onclose={() => (sheet = { kind: 'none' })}
				>
					<p class="dialog-body">{fill(m.deleteBody, { name: sheet.name })}</p>
					<div class="dialog-actions">
						<Button
							variant="danger"
							shape="rounded"
							onclick={() => onUiEvent({ kind: 'sheet-select', label: m.delete })}
						>
							{m.delete}
						</Button>
					</div>
				</Dialog>
			{/if}
		</div>
	{:else}
		<main class="page">
			<ContactsHome {model} destinations={WEB_DESTINATIONS} onuievent={onUiEvent} />
		</main>

		{#if sheet.kind === 'add' || sheet.kind === 'edit'}
			<ContactEditSheet
				copy={contactCopy(sheet.kind)}
				initial={sheet.kind === 'edit' ? { name: sheet.name, address: sheet.address } : undefined}
				onsave={saveContact}
				onclose={() => (sheet = { kind: 'none' })}
			/>
		{:else if sheet.kind === 'group-new'}
			<GroupEditSheet
				copy={groupCopy}
				onsave={saveGroup}
				onclose={() => (sheet = { kind: 'none' })}
			/>
		{/if}
	{/if}
{:else}
	<!-- The cores have not ruled yet. An empty surface, not a fixture book. -->
	<div class="waiting" aria-busy="true"></div>
{/if}

<style>
	.page {
		height: 100dvh;
		display: flex;
		flex-direction: column;
		background: var(--color-bg-base);
	}

	/* The three columns are `height: 100%` of this frame (the settings and
	   wallet routes frame theirs the same way). */
	.desktop-shell {
		position: relative;
		height: 100dvh;
		overflow: hidden;
	}

	.dialog-body {
		margin: 0 0 var(--space-xl);
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		line-height: var(--leading-normal);
		color: var(--color-fg-muted);
	}

	.dialog-actions {
		display: flex;
		justify-content: flex-end;
	}

	.waiting {
		min-height: 100dvh;
		background: var(--color-bg-base);
	}
</style>
