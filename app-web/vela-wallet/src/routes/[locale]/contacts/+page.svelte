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
	import { createContactsSession, type ContactsSession } from '$lib/contacts/core/contacts';
	import { buildContactsLive, displayName, type ContactsUiState } from '$lib/contacts/live';
	import type { ContactsUiEvent } from '$lib/contacts/ui-events';
	import type { ContactsView } from '$lib/core/generated/ContactsView';
	import { loadCore } from '$lib/core/client';
	import { fill } from '$lib/wallet/messages';
	import { identiconSvgForClient } from '$lib/wallet/identicon';
	import { session } from '$lib/session/core/session.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const m = $derived(data.contactsMessages);

	const welcome = $derived(resolve('/[locale]', { locale: data.locale }));
	const walletHref = $derived(resolve('/[locale]/wallet', { locale: data.locale }));
	const settingsHref = $derived(resolve('/[locale]/settings', { locale: data.locale }));

	const sessionView = $derived(session.view);
	const signedIn = $derived(sessionView.allowed_route === 'wallet');

	// --- The machine -------------------------------------------------------

	let view = $state<ContactsView | null>(null);
	let contacts: ContactsSession | null = null;
	let disposed = false;

	onMount(() => {
		void session.boot();
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
		const built = buildContactsLive(view, m, identiconSvgForClient, ui);
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
	}

	function saveGroup(name: string): void {
		contacts?.dispatch({
			type: 'group_save',
			input: { id: null, name, color: null, members: null }
		});
		sheet = { kind: 'none' };
	}
</script>

<svelte:head>
	<title>{m.title}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#if signedIn && model !== null}
	<main class="page">
		<ContactsHome {model} onuievent={onUiEvent} />
	</main>

	{#if sheet.kind === 'add' || sheet.kind === 'edit'}
		<ContactEditSheet
			copy={{
				title: sheet.kind === 'add' ? m.addTitle : m.editTitle,
				nameLabel: m.nameLabel,
				namePlaceholder: m.namePlaceholder,
				addressLabel: m.addressLabel,
				addressPlaceholder: m.addressPlaceholder,
				save: m.save,
				cancel: m.cancel,
				invalidAddress: m.invalidAddress
			}}
			initial={sheet.kind === 'edit' ? { name: sheet.name, address: sheet.address } : undefined}
			onsave={saveContact}
			onclose={() => (sheet = { kind: 'none' })}
		/>
	{:else if sheet.kind === 'group-new'}
		<GroupEditSheet
			copy={{
				title: m.groupNew,
				nameLabel: m.groupNameLabel,
				namePlaceholder: m.groupNamePlaceholder,
				save: m.save,
				cancel: m.cancel
			}}
			onsave={saveGroup}
			onclose={() => (sheet = { kind: 'none' })}
		/>
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

	.waiting {
		min-height: 100dvh;
		background: var(--color-bg-base);
	}
</style>
