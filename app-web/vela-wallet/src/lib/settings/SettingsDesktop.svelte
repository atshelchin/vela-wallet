<script lang="ts">
	/**
	 * The desktop settings surface (spec 023, DST1–DST8 + DST4b + DSR1).
	 *
	 * Three columns, per the desktop SPEC: the app sidebar (spec 015's, reused
	 * verbatim), a 216px second-level nav, and the panel. The phone's sheets
	 * become either a section of the panel it belongs to — the account switcher
	 * IS the 账户 panel — or a centred dialog, which is what add-network and
	 * fix-RPC are. Nothing here is a bottom sheet: macOS System Settings is the
	 * reference, and it has none.
	 */
	import { untrack } from 'svelte';
	import type { SettingsDesktopModel, SettingsOverlayId, SettingsPageId } from './model';
	import type { SidebarModel } from '$lib/wallet/model';
	import Button from '$lib/ui/Button.svelte';
	import Sidebar from '$lib/wallet/ui/Sidebar.svelte';
	import AboutPanel from './ui/AboutPanel.svelte';
	import AccountsSheetBody from './ui/AccountsSheetBody.svelte';
	import AddNetworkPanel from './ui/AddNetworkPanel.svelte';
	import DangerCard from './ui/DangerCard.svelte';
	import Dialog from './ui/Dialog.svelte';
	import Dropdown from './ui/Dropdown.svelte';
	import EndpointsPanel from './ui/EndpointsPanel.svelte';
	import FormRow from './ui/FormRow.svelte';
	import { UTILITY_ICONS } from '$lib/wallet/icons';
	import Icon from '$lib/wallet/ui/Icon.svelte';
	import NetworkDetailPanel from './ui/NetworkDetailPanel.svelte';
	import NetworksPanel from './ui/NetworksPanel.svelte';
	import RpcBanner from './ui/RpcBanner.svelte';
	import RpcFixBody from './ui/RpcFixBody.svelte';
	import RpcProvidersPanel from './ui/RpcProvidersPanel.svelte';
	import SegmentedControl from './ui/SegmentedControl.svelte';
	import SettingsNavList from './ui/SettingsNavList.svelte';
	import StoragePanel from './ui/StoragePanel.svelte';
	import TextScaleSlider from './ui/TextScaleSlider.svelte';

	interface Props {
		model: SettingsDesktopModel;
		/** The app sidebar's own model (spec 015). Absent in component boards. */
		sidebar?: SidebarModel;
		onnav?: (id: 'wallet' | 'contacts' | 'explore' | 'settings') => void;
		onsignout?: () => void;
	}

	let { model, sidebar, onnav, onsignout }: Props = $props();

	let page = $state<SettingsPageId>(untrack(() => model.page));
	let overlay = $state<SettingsOverlayId>(untrack(() => model.overlay));
	let openDropdown = $state<string | undefined>(untrack(() => model.dropdown?.rowId));

	/** The panel's own heading, by page. */
	const heading = $derived.by(() => {
		switch (page) {
			case 'account':
				return { title: model.account.title, description: undefined };
			case 'appearance':
				return { title: model.appearance.title, description: undefined };
			case 'localization':
				return { title: model.localization.title, description: model.localization.description };
			case 'networks':
				return { title: model.networks.title, description: model.networks.subtitle };
			case 'rpc-providers':
				return { title: model.rpcProviders.title, description: undefined };
			case 'endpoints':
				return { title: model.endpoints.title, description: undefined };
			case 'storage':
				return { title: model.storage.title, description: model.storage.subtitle };
			case 'about':
				return { title: model.about.title, description: undefined };
			default:
				return { title: model.title, description: undefined };
		}
	});

	function toggleDropdown(id: string) {
		openDropdown = openDropdown === id ? undefined : id;
	}
</script>

<div class="desktop">
	{#if sidebar !== undefined}
		<Sidebar {sidebar} {onnav} />
	{/if}

	<SettingsNavList
		title={model.title}
		items={model.nav}
		selected={page}
		onselect={(id) => (page = id)}
	/>

	<main>
		<div class="panel">
			<header class="panel-head">
				<div class="titles">
					<h1>{heading.title}</h1>
					{#if heading.description !== undefined}
						<p>{heading.description}</p>
					{/if}
				</div>
				{#if page === 'networks'}
					<button type="button" class="add" onclick={() => (overlay = 'add-network')}>
						<Icon icon={UTILITY_ICONS.plus} size="sm" />
						<span>{model.networks.addLabel}</span>
					</button>
				{/if}
			</header>

			{#if model.rpcBanner !== undefined}
				<div class="banner"><RpcBanner banner={model.rpcBanner} /></div>
			{/if}

			{#if page === 'account'}
				<AccountsSheetBody
					sheet={{
						title: model.account.title,
						summary: model.account.summary,
						rows: model.account.rows,
						primary: model.account.primary,
						secondary: model.account.secondary
					}}
					layout="inline"
				/>

				<hr />

				<button type="button" class="sign-out" onclick={() => (overlay = 'sign-out')}>
					<Icon icon={UTILITY_ICONS['log-out']} size="md" />
					<span>{model.account.signOutLabel}</span>
				</button>
				<p class="sign-out-note">{model.account.signOutNote}</p>

				<DangerCard
					title={model.account.erase.title}
					subtitle={model.account.erase.subtitle}
					action={model.account.erase.action}
				/>
			{:else if page === 'appearance'}
				<FormRow label={model.appearance.language.label}>
					<Dropdown
						value={model.appearance.language.value ?? ''}
						label={model.appearance.language.label}
					/>
				</FormRow>
				<FormRow label={model.appearance.textScale.label} wide>
					<TextScaleSlider model={model.appearance.textScale.scale} />
				</FormRow>
				<FormRow label={model.appearance.theme.label}>
					<SegmentedControl model={model.appearance.theme.segmented} />
				</FormRow>
				<FormRow label={model.appearance.avatar.label}>
					<SegmentedControl model={model.appearance.avatar.segmented} />
				</FormRow>
			{:else if page === 'localization'}
				{#each model.localization.rows as row (row.id)}
					<FormRow label={row.label}>
						<Dropdown
							value={row.value ?? ''}
							label={row.label}
							open={openDropdown === row.id}
							rows={model.dropdown?.rowId === row.id ? model.dropdown.rows : undefined}
							ontoggle={() => toggleDropdown(row.id)}
						/>
					</FormRow>
				{/each}
			{:else if page === 'networks'}
				<NetworksPanel
					rows={model.networks.rows}
					addLabel={model.networks.addLabel}
					deleteLabel={model.networks.addLabel}
					expandable
				>
					{#snippet detail()}
						<NetworkDetailPanel detail={model.networks.detail} showIdentity={false} />
					{/snippet}
				</NetworksPanel>
			{:else if page === 'rpc-providers'}
				<RpcProvidersPanel panel={model.rpcProviders} />
			{:else if page === 'endpoints'}
				<EndpointsPanel panel={model.endpoints} />
			{:else if page === 'storage'}
				<StoragePanel panel={model.storage} />
			{:else if page === 'about'}
				<AboutPanel panel={model.about} layout="inline" />
			{/if}
		</div>
	</main>

	{#if overlay === 'add-network'}
		<Dialog
			title={model.addNetwork.title}
			subtitle={model.addNetwork.subtitle}
			closeLabel={model.closeLabel}
			onclose={() => (overlay = 'none')}
		>
			<AddNetworkPanel panel={model.addNetwork} />
		</Dialog>
	{:else if overlay === 'rpc-fix'}
		<Dialog
			title={model.rpcFix.title}
			closeLabel={model.closeLabel}
			onclose={() => (overlay = 'none')}
		>
			<RpcFixBody panel={model.rpcFix} onprimary={() => (overlay = 'none')} />
		</Dialog>
	{:else if overlay === 'sign-out'}
		<Dialog
			title={model.account.signOutLabel}
			closeLabel={model.closeLabel}
			onclose={() => (overlay = 'none')}
		>
			<p class="dialog-body">{model.account.signOutNote}</p>
			<div class="dialog-actions">
				<Button variant="danger" shape="rounded" onclick={onsignout}>
					{model.account.signOutLabel}
				</Button>
			</div>
		</Dialog>
	{/if}
</div>

<style>
	.desktop {
		position: relative;
		display: flex;
		height: 100%;
		background: var(--color-bg-base);
		overflow: hidden;
	}

	main {
		flex: 1;
		min-width: 0;
		/* NOT `overflow: hidden`: the desktop SPEC requires the dropdown overlay
		   to escape its container's clipping, and a scroll container here is
		   what would clip it. The panel scrolls instead. */
		display: flex;
		justify-content: center;
	}

	.panel {
		width: 100%;
		max-width: var(--layout-maxContentWidth);
		height: 100%;
		overflow-y: auto;
		padding: var(--space-4xl) var(--space-5xl) var(--space-5xl);
	}

	.panel-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-xl);
		margin-bottom: var(--space-3xl);
	}

	h1 {
		margin: 0;
		font-size: calc(var(--text-2xl) * var(--text-scale, 1));
		font-weight: var(--weight-bold);
		color: var(--color-fg-base);
	}

	.titles p {
		margin: var(--space-md) 0 0;
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-subtle);
	}

	.add {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		min-height: var(--size-control-sm);
		padding-inline: var(--space-xl);
		border: var(--border-hairline) solid var(--color-border-base);
		border-radius: var(--radius-lg);
		background: var(--color-bg-raised);
		font-family: var(--font-ui);
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-base);
		cursor: pointer;
		flex-shrink: 0;
	}

	.banner {
		margin-bottom: var(--space-3xl);
	}

	hr {
		border: none;
		border-top: var(--border-hairline) solid var(--color-border-base);
		margin-block: var(--space-4xl);
	}

	.sign-out {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		padding: 0;
		border: none;
		background: none;
		font-family: var(--font-ui);
		font-size: calc(var(--text-lg) * var(--text-scale, 1));
		color: var(--color-fg-base);
		cursor: pointer;
	}

	.sign-out-note {
		margin: var(--space-md) 0 var(--space-3xl);
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		line-height: var(--leading-normal);
		color: var(--color-fg-subtle);
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
</style>
