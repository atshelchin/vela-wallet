<script lang="ts">
	import type { WalletHomeModel } from './model';
	import { UTILITY_ICONS } from './icons';
	import ActionButtonRow from './ui/ActionButtonRow.svelte';
	import ActivityRow from './ui/ActivityRow.svelte';
	import AssetRow from './ui/AssetRow.svelte';
	import BalanceDisplay from './ui/BalanceDisplay.svelte';
	import BottomSheet from './ui/BottomSheet.svelte';
	import ChainFilterList from './ui/ChainFilterList.svelte';
	import EmptyState from './ui/EmptyState.svelte';
	import SectionHeader from './ui/SectionHeader.svelte';
	import SkeletonRow from './ui/SkeletonRow.svelte';
	import TabBar from './ui/TabBar.svelte';
	import WalletHeader from './ui/WalletHeader.svelte';

	interface Props {
		model: WalletHomeModel;
		/** Tab selection. Absent in the gallery, where the bar is a picture. */
		onselect?: (id: 'wallet' | 'contacts' | 'explore' | 'settings') => void;
		/** Open the identicon viewer; absent in the gallery. */
		onidenticon?: () => void;
		identiconViewerLabel?: string;
	}

	let { model, onselect, onidenticon, identiconViewerLabel }: Props = $props();

	// Pure UI state: the fixture-provided sheet, once dismissed, stays dismissed.
	// Nothing on this screen reopens it any more — the pill that did is gone.
	let sheetClosed = $state(false);
	const showSheet = $derived(model.sheet !== undefined && !sheetClosed);
</script>

<div class="home" style:--text-scale={model.textScale === 1 ? undefined : model.textScale}>
	<div class="scroll">
		<!-- The header owns the whole width. The network filter pill used to sit
		     at its trailing edge and cost the name and address the room they
		     needed — a wallet called "kimik3 · something" showed as "kimik3 ·…"
		     next to a chip nobody was reading (founder call, 2026-08-26). -->
		<header class="top">
			<WalletHeader header={model.header} {onidenticon} identiconLabel={identiconViewerLabel} />
		</header>

		<div class="balance">
			<BalanceDisplay balance={model.balance} />
		</div>

		<ActionButtonRow
			receive={model.actions.receive}
			send={model.actions.send}
			scan={model.actions.scan}
		/>

		<SectionHeader title={model.activitySection.title} action={model.activitySection.action} />
		{#if model.activitySection.mode === 'loading'}
			<SkeletonRow />
			<SkeletonRow />
		{:else if model.activitySection.mode === 'empty' && model.activitySection.empty !== undefined}
			<EmptyState
				icon={UTILITY_ICONS.inbox}
				title={model.activitySection.empty.title}
				caption={model.activitySection.empty.caption}
			/>
		{:else}
			{#each model.activityGroups as group (group.label)}
				<p class="day">{group.label}</p>
				<ul>
					{#each group.rows as row, i (i)}
						<li><ActivityRow {row} /></li>
					{/each}
				</ul>
			{/each}
		{/if}

		<SectionHeader title={model.assetsSection.title} action={model.assetsSection.action} />
		{#if model.assetsSection.mode === 'loading'}
			<SkeletonRow />
			<SkeletonRow />
			<SkeletonRow />
		{:else if model.assetsSection.mode === 'empty' && model.assetsSection.empty !== undefined}
			<EmptyState
				icon={UTILITY_ICONS.wallet}
				title={model.assetsSection.empty.title}
				caption={model.assetsSection.empty.caption}
			/>
		{:else}
			<ul>
				{#each model.assetRows as row, i (i)}
					<li><AssetRow {row} /></li>
				{/each}
			</ul>
		{/if}
	</div>

	<TabBar tabs={model.tabs} {onselect} />

	{#if showSheet && model.sheet !== undefined}
		<BottomSheet
			title={model.sheet.title}
			trailingIcon="search"
			onclose={() => (sheetClosed = true)}
		>
			<ChainFilterList rows={model.sheet.rows} onselect={() => (sheetClosed = true)} />
		</BottomSheet>
	{/if}
</div>

<style>
	.home {
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

	.top {
		display: flex;
		align-items: center;
		padding-block: var(--space-xl);
	}

	.balance {
		padding-block: var(--space-md) var(--space-2xl);
	}

	.day {
		margin: 0;
		padding-block: var(--space-sm);
		font-size: calc(var(--text-sm) * var(--text-scale, 1));
		color: var(--color-fg-subtle);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
</style>
