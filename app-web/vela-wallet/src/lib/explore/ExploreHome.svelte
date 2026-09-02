<script lang="ts">
	import SectionHeader from '$lib/wallet/ui/SectionHeader.svelte';
	import TabBar from '$lib/wallet/ui/TabBar.svelte';
	import SigningSheet from '$lib/signing/SigningSheet.svelte';
	import type { SigningModel } from '$lib/signing/model';
	import AddressBar from './ui/AddressBar.svelte';
	import BrowserToolbar from './ui/BrowserToolbar.svelte';
	import ConnectionPanel from './ui/ConnectionPanel.svelte';
	import DemoPage from './ui/DemoPage.svelte';
	import ExploreEmpty from './ui/ExploreEmpty.svelte';
	import GroupManageSheet from './ui/GroupManageSheet.svelte';
	import SearchField from './ui/SearchField.svelte';
	import Sheet from './ui/Sheet.svelte';
	import SiteMenuSheet from './ui/SiteMenuSheet.svelte';
	import SiteRow from './ui/SiteRow.svelte';
	import SiteTile from './ui/SiteTile.svelte';
	import TabsScreen from './ui/TabsScreen.svelte';
	import type { ExploreHomeModel, ExploreSheet, ExploreView } from './model';
	import type { ExploreMessages } from './messages';

	/**
	 * The phone Explore screen (spec 022): one surface with three views —
	 * the start page, a page being browsed, and the tab switcher.
	 *
	 * Browsing swaps the four-tab bar for the browser toolbar rather than
	 * stacking one on the other: two navigation bars on a 392pt screen is
	 * where the page would have gone.
	 */
	interface Props {
		model: ExploreHomeModel;
		copy: ExploreMessages;
		/** A signing request from the page. Fixture-driven for now. */
		signing?: SigningModel;
		/** The wallet's own tab bar. Absent in the gallery, where it is a picture. */
		onselect?: (id: 'wallet' | 'contacts' | 'explore' | 'settings') => void;
	}

	let { model, copy, signing, onselect }: Props = $props();

	// Pure UI state. Everything a person can DO on this screen lives here; the
	// fixture decides only where the screen STARTS — so each piece is an
	// override over the model rather than a copy of it, and a model swap (the
	// gallery's state picker, a locale change) still lands.
	let viewOverride = $state<ExploreView | undefined>();
	let sheetOverride = $state<ExploreSheet | null | undefined>();
	let signingUp = $state(false);

	const view = $derived(viewOverride ?? model.view);
	const sheet = $derived(sheetOverride === undefined ? model.sheet : (sheetOverride ?? undefined));
</script>

<div class="explore">
	{#if view === 'tabs'}
		<TabsScreen
			tabs={model.tabs}
			copy={model.tabsScreen}
			ondone={() => (viewOverride = 'browsing')}
			onopen={() => (viewOverride = 'browsing')}
			onnew={() => (viewOverride = 'start')}
			oncloseall={() => (viewOverride = 'start')}
		/>
	{:else if view === 'browsing'}
		<AddressBar
			host={model.browser.host}
			secure={model.browser.secure}
			secureLabel={copy.secureSite}
			closeLabel={copy.closePage}
			menuLabel={copy.siteMenu}
			onclose={() => (viewOverride = 'start')}
			onmenu={() => (sheetOverride = model.menus.siteMenu)}
		/>
		<div class="page">
			<DemoPage page={model.browser.page} onaction={() => (signingUp = signing !== undefined)} />
		</div>
		<BrowserToolbar
			browser={model.browser}
			{copy}
			onaccount={() => (sheetOverride = model.menus.connection)}
			ontabs={() => (viewOverride = 'tabs')}
		/>
	{:else}
		<div class="scroll">
			<header class="top">
				<h1>{model.title}</h1>
				{#if model.tabCountLabel}
					<button
						type="button"
						class="tab-count"
						aria-label={copy.tabs}
						onclick={() => (viewOverride = 'tabs')}
					>
						{model.tabCountLabel}
					</button>
				{/if}
			</header>

			<div class="search">
				<SearchField
					placeholder={model.searchPlaceholder}
					scanLabel={model.scanLabel}
					onsubmit={() => (viewOverride = 'browsing')}
				/>
			</div>

			{#if model.empty}
				<ExploreEmpty
					title={model.empty.title}
					caption={model.empty.caption}
					cta={model.empty.cta}
					onbrowse={() => (viewOverride = 'browsing')}
				/>
			{/if}

			{#if model.favorites}
				<SectionHeader
					title={model.favorites.title}
					action={model.favorites.action}
					onaction={() => (sheetOverride = model.menus.groupManage)}
				/>
				<div class="grid">
					{#each model.favorites.tiles as tile, i (i)}
						<SiteTile {tile} onopen={() => (viewOverride = 'browsing')} />
					{/each}
				</div>
			{/if}

			{#each model.groups as group (group.id)}
				<SectionHeader
					title={group.title}
					action={group.action === 'clear' ? copy.clear : group.action === 'menu' ? '⋯' : ''}
					onaction={() => (sheetOverride = model.menus.groupManage)}
				/>
				<ul>
					{#each group.sites as site (site.id + group.id)}
						<li><SiteRow {site} onopen={() => (viewOverride = 'browsing')} /></li>
					{/each}
				</ul>
			{/each}
		</div>

		<TabBar tabs={model.navLabels} selected="explore" {onselect} />
	{/if}

	{#if sheet}
		<Sheet
			label={sheet.kind === 'connection' ? sheet.connection.title : copy.siteMenu}
			onclose={() => (sheetOverride = null)}
		>
			{#if sheet.kind === 'group-manage'}
				<GroupManageSheet
					title={sheet.title}
					rows={sheet.rows}
					newGroup={sheet.newGroup}
					closeLabel={copy.close}
					hideLabel={copy.hide}
					showLabel={copy.show}
					deleteLabel={copy.delete}
					onclose={() => (sheetOverride = null)}
				/>
			{:else if sheet.kind === 'site-menu'}
				<SiteMenuSheet
					site={sheet.site}
					statusLine={sheet.statusLine}
					items={sheet.items}
					closeLabel={copy.close}
					onclose={() => (sheetOverride = null)}
				/>
			{:else}
				<ConnectionPanel
					connection={sheet.connection}
					closeLabel={copy.close}
					onclose={() => (sheetOverride = null)}
					ondisconnect={() => (sheetOverride = null)}
				/>
			{/if}
		</Sheet>
	{/if}

	{#if signingUp && signing}
		<SigningSheet
			model={signing}
			onclose={() => (signingUp = false)}
			onconfirm={() => (signingUp = false)}
		/>
	{/if}
</div>

<style>
	.explore {
		position: relative;
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--color-bg-base);
		overflow: hidden;
	}

	.scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding-inline: var(--layout-screenPaddingX);
	}

	.page {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-block: var(--space-2xl) var(--space-xl);
	}

	h1 {
		margin: 0;
		font-size: calc(var(--text-3xl) * var(--text-scale, 1));
		font-weight: var(--weight-bold);
		color: var(--color-fg-base);
	}

	.tab-count {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: var(--size-tabCount);
		height: var(--size-tabCount);
		padding-inline: var(--space-md);
		border: var(--border-emphasis) solid var(--color-fg-base);
		border-radius: var(--radius-sm);
		background: none;
		font-family: var(--font-ui);
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		font-weight: var(--weight-semibold);
		color: var(--color-fg-base);
		cursor: pointer;
	}

	.search {
		padding-bottom: var(--space-2xl);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		justify-items: center;
		gap: var(--space-2xl) var(--space-md);
		padding-block: var(--space-lg);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
</style>
