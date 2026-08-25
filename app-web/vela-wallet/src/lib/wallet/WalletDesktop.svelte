<script lang="ts">
	import type { PanelId, WalletDesktopModel } from './model';
	import ActionButtonRow from './ui/ActionButtonRow.svelte';
	import ActivityRow from './ui/ActivityRow.svelte';
	import AssetDetailPanel from './ui/AssetDetailPanel.svelte';
	import AssetRow from './ui/AssetRow.svelte';
	import BalanceDisplay from './ui/BalanceDisplay.svelte';
	import ReceivePanel from './ui/ReceivePanel.svelte';
	import SectionHeader from './ui/SectionHeader.svelte';
	import Sidebar from './ui/Sidebar.svelte';
	import ThirdPanel from './ui/ThirdPanel.svelte';

	interface Props {
		model: WalletDesktopModel;
		/** Sidebar navigation. Absent in the gallery, where the rail is a picture. */
		onnav?: (id: 'wallet' | 'contacts' | 'explore' | 'settings') => void;
		/** Open the identicon viewer; absent in the gallery. */
		onidenticon?: () => void;
		identiconViewerLabel?: string;
	}

	let { model, onnav, onidenticon, identiconViewerLabel }: Props = $props();

	// The third column replaces the mobile bottom sheet (research.md D5).
	// Pure UI state: which content it hosts, seeded by the fixture state.
	let panel: PanelId = $derived(model.initialPanel);
</script>

<div class="desktop">
	<Sidebar sidebar={model.sidebar} {onnav} {onidenticon} identiconLabel={identiconViewerLabel} />

	<main>
		<div class="content">
			<BalanceDisplay balance={model.balance} />

			<div class="actions">
				<ActionButtonRow
					layout="pills"
					receive={model.actions.receive}
					send={model.actions.send}
					scan={model.actions.scan}
					onreceive={() => (panel = 'receive')}
				/>
			</div>

			<SectionHeader title={model.activitySection.title} action={model.activitySection.action} />
			{#each model.activityGroups as group (group.label)}
				<ul>
					{#each group.rows as row, i (i)}
						<li><ActivityRow {row} /></li>
					{/each}
				</ul>
			{/each}

			<SectionHeader title={model.assetsSection.title} action={model.assetsSection.action} />
			<ul>
				{#each model.assetRows as row, i (i)}
					<li><AssetRow {row} onclick={() => (panel = 'asset-detail')} /></li>
				{/each}
			</ul>
		</div>
	</main>

	{#if panel === 'receive'}
		<ThirdPanel
			title={model.panels.receive.title}
			closeLabel={model.closeLabel}
			onclose={() => (panel = 'none')}
		>
			<ReceivePanel panel={model.panels.receive} />
		</ThirdPanel>
	{:else if panel === 'asset-detail'}
		<ThirdPanel
			title={model.panels.assetDetail.title}
			closeLabel={model.closeLabel}
			onclose={() => (panel = 'none')}
		>
			<AssetDetailPanel panel={model.panels.assetDetail} />
		</ThirdPanel>
	{/if}
</div>

<style>
	.desktop {
		display: flex;
		height: 100%;
		background: var(--color-bg-base);
		overflow: hidden;
	}

	main {
		flex: 1;
		min-width: 0;
		overflow-y: auto;
	}

	.content {
		max-width: var(--layout-maxContentWidth);
		padding: var(--space-4xl) var(--space-4xl) var(--space-4xl) var(--space-3xl);
		display: flex;
		flex-direction: column;
	}

	.actions {
		max-width: calc(var(--layout-maxContentWidth) * 0.75);
		padding-block: var(--space-2xl) var(--space-3xl);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
</style>
