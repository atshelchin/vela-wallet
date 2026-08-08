<script lang="ts">
	import { resolve } from '$app/paths';
	import { toLocale } from '$lib/i18n/locales';
	import { page } from '$app/state';
	import ActionButtonRow from '$lib/wallet/ui/ActionButtonRow.svelte';
	import ActivityRow from '$lib/wallet/ui/ActivityRow.svelte';
	import AssetRow from '$lib/wallet/ui/AssetRow.svelte';
	import BalanceDisplay from '$lib/wallet/ui/BalanceDisplay.svelte';
	import ChainFilterList from '$lib/wallet/ui/ChainFilterList.svelte';
	import EmptyState from '$lib/wallet/ui/EmptyState.svelte';
	import Identicon from '$lib/wallet/ui/Identicon.svelte';
	import NetworkFilterPill from '$lib/wallet/ui/NetworkFilterPill.svelte';
	import SectionHeader from '$lib/wallet/ui/SectionHeader.svelte';
	import SkeletonRow from '$lib/wallet/ui/SkeletonRow.svelte';
	import TabBar from '$lib/wallet/ui/TabBar.svelte';
	import WalletHeader from '$lib/wallet/ui/WalletHeader.svelte';
	import { UTILITY_ICONS } from '$lib/wallet/icons';
	import Controls from './Controls.svelte';

	let { data } = $props();

	const locale = $derived(toLocale(page.params.locale ?? '') ?? 'en');
	const m = $derived(data.messages);
	const h1s = $derived(data.models.h1s);
</script>

<svelte:head>
	<title>Vela Wallet · Gallery</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<Controls {locale} />

<main class="gallery">
	<h1>Wallet UI Gallery</h1>

	<section id="gallery-section-screens">
		<h2>Screens</h2>
		<div class="links">
			{#each data.mobileStates as state (state)}
				<a href={resolve('/[locale]/gallery/[state]', { locale, state })}>{state.toUpperCase()}</a>
			{/each}
			{#each data.desktopStates as state (state)}
				<a href={resolve('/[locale]/gallery/[state]', { locale, state })}>{state.toUpperCase()}</a>
			{/each}
		</div>
	</section>

	<section id="gallery-section-identicon">
		<h2>Identicon</h2>
		<div class="board">
			{#each data.board as cell (cell.seed)}
				<figure id="gallery-identicon-{cell.seed}">
					<Identicon svg={cell.svg} size="board" label={cell.seed} />
					<figcaption>{cell.seed}</figcaption>
				</figure>
			{/each}
		</div>
	</section>

	{#if h1s !== undefined}
		<section id="gallery-section-header">
			<h2>WalletHeader · NetworkFilterPill</h2>
			<div class="cell" id="gallery-walletheader-default">
				<WalletHeader header={h1s.header} />
			</div>
			{#if data.models.h7 !== undefined}
				<div class="cell" id="gallery-walletheader-long">
					<WalletHeader header={data.models.h7.header} />
				</div>
				<div class="cell row" id="gallery-networkpill-variants">
					<NetworkFilterPill pill={h1s.pill} />
					<NetworkFilterPill pill={data.models.h7.pill} />
				</div>
			{/if}
		</section>

		<section id="gallery-section-balance">
			<h2>BalanceDisplay</h2>
			{#each ['h1s', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7'] as const as state (state)}
				{#if data.models[state] !== undefined}
					<div class="cell" id="gallery-balance-{state}">
						<BalanceDisplay balance={data.models[state].balance} />
					</div>
				{/if}
			{/each}
		</section>

		<section id="gallery-section-actions">
			<h2>ActionButtonRow</h2>
			<div class="cell" id="gallery-actions-cards">
				<ActionButtonRow receive={m.actions.receive} send={m.actions.send} scan={m.actions.scan} />
			</div>
			<div class="cell" id="gallery-actions-pills">
				<ActionButtonRow
					layout="pills"
					receive={m.actions.receive}
					send={m.actions.send}
					scan={m.actions.scan}
				/>
			</div>
		</section>

		<section id="gallery-section-activity">
			<h2>SectionHeader · ActivityRow</h2>
			<div class="cell" id="gallery-sectionheader-default">
				<SectionHeader title={m.sections.activity} action={m.sections.all} />
			</div>
			{#each h1s.activityGroups as group (group.label)}
				{#each group.rows as row, i (i)}
					<div class="cell" id="gallery-activityrow-{row.kind}-{i}">
						<ActivityRow {row} />
					</div>
				{/each}
			{/each}
			{#if data.models.h5 !== undefined}
				<div class="cell" id="gallery-activityrow-masked">
					<ActivityRow row={data.models.h5.activityGroups[0].rows[0]} />
				</div>
			{/if}
		</section>

		<section id="gallery-section-assets">
			<h2>AssetRow</h2>
			{#if data.models.h4 !== undefined}
				{#each data.models.h4.assetRows as row, i (i)}
					<div class="cell" id="gallery-assetrow-{row.fiat.kind}-{i}">
						<AssetRow {row} />
					</div>
				{/each}
			{/if}
			{#if data.models.h5 !== undefined}
				<div class="cell" id="gallery-assetrow-masked">
					<AssetRow row={data.models.h5.assetRows[0]} />
				</div>
			{/if}
			{#if data.models.h7 !== undefined}
				<div class="cell" id="gallery-assetrow-extreme">
					<AssetRow row={data.models.h7.assetRows[1]} />
				</div>
			{/if}
		</section>

		<section id="gallery-section-empty-loading">
			<h2>EmptyState · Skeleton</h2>
			<div class="cell" id="gallery-empty-activity">
				<EmptyState
					icon={UTILITY_ICONS.inbox}
					title={m.activity.emptyTitle}
					caption={m.activity.emptyCaption}
				/>
			</div>
			<div class="cell" id="gallery-empty-assets">
				<EmptyState
					icon={UTILITY_ICONS.wallet}
					title={m.assets.emptyTitle}
					caption={m.assets.emptyCaption}
				/>
			</div>
			<div class="cell" id="gallery-skeleton-row">
				<SkeletonRow />
				<SkeletonRow kind="block" />
			</div>
		</section>

		<section id="gallery-section-navigation">
			<h2>TabBar · ChainFilterList</h2>
			<div class="cell frameless" id="gallery-tabbar-default">
				<TabBar tabs={h1s.tabs} />
			</div>
			<div class="cell" id="gallery-chainfilterlist-default">
				<ChainFilterList rows={data.sidebar.networks} />
			</div>
		</section>
	{/if}
</main>

<style>
	.gallery {
		max-width: var(--layout-maxContentWidth);
		margin-inline: auto;
		padding: var(--space-3xl) var(--layout-screenPaddingX) var(--space-5xl);
		display: flex;
		flex-direction: column;
		gap: var(--space-3xl);
	}

	h1 {
		margin: 0;
		font-size: var(--text-3xl);
		font-weight: var(--weight-bold);
	}

	h2 {
		margin: 0 0 var(--space-lg);
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		color: var(--color-fg-subtle);
		letter-spacing: var(--letterSpacing-sectionLabel);
	}

	.links {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-md);
	}

	.links a {
		display: inline-flex;
		align-items: center;
		height: var(--size-control-sm);
		padding-inline: var(--space-xl);
		border: var(--border-hairline) solid var(--color-border-base);
		border-radius: var(--radius-full);
		background: var(--color-bg-raised);
		color: var(--color-fg-base);
		font-size: var(--text-base);
		text-decoration: none;
	}

	.board {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xl);
	}

	.board figure {
		margin: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-md);
		max-width: calc(var(--space-5xl) * 3);
	}

	.board figcaption {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--color-fg-subtle);
		overflow-wrap: anywhere;
		text-align: center;
	}

	.cell {
		padding: var(--space-xl);
		border: var(--border-hairline) solid var(--color-border-base);
		border-radius: var(--radius-lg);
		margin-bottom: var(--space-lg);
	}

	.cell.row {
		display: flex;
		gap: var(--space-lg);
		flex-wrap: wrap;
	}

	.cell.frameless {
		padding: 0;
		overflow: hidden;
	}
</style>
