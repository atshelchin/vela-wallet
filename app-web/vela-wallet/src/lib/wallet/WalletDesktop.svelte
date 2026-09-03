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
		/** Spec 025: tap-to-hide. The core owns `hidden`; this only reports the tap. */
		onbalancetoggle?: () => void;
		/**
		 * Spec 021: the dock and the two section actions open a flow in the
		 * third column. When it is wired the flow host owns that column, so
		 * this component stops drawing its own spec-015 panels — two things
		 * cannot occupy one column.
		 */
		onflow?: (entry: 'receive' | 'send' | 'scan' | 'activity' | 'add-token' | 'tx-detail') => void;
	}

	let { model, onnav, onidenticon, identiconViewerLabel, onflow, onbalancetoggle }: Props =
		$props();

	// The third column replaces the mobile bottom sheet (research.md D5).
	// Pure UI state: which content it hosts, seeded by the fixture state.
	let panel: PanelId = $derived(model.initialPanel);
</script>

<div class="desktop">
	<Sidebar sidebar={model.sidebar} {onnav} {onidenticon} identiconLabel={identiconViewerLabel} />

	<main>
		<div class="content">
			<BalanceDisplay balance={model.balance} ontoggle={onbalancetoggle} />

			<div class="actions">
				<ActionButtonRow
					layout="pills"
					receive={model.actions.receive}
					send={model.actions.send}
					scan={model.actions.scan}
					onreceive={() => (onflow === undefined ? (panel = 'receive') : onflow('receive'))}
					onsend={() => onflow?.('send')}
					onscan={() => onflow?.('scan')}
				/>
			</div>

			<SectionHeader
				title={model.activitySection.title}
				action={model.activitySection.action}
				onaction={() => onflow?.('activity')}
			/>
			{#each model.activityGroups as group (group.label)}
				<ul>
					{#each group.rows as row, i (i)}
						<li><ActivityRow {row} onclick={() => onflow?.('tx-detail')} /></li>
					{/each}
				</ul>
			{/each}

			<!-- The desktop's assets action reads 添加, so it opens the add-token
			     panel stacked on the assets one — which is what makes the back
			     chevron in the DT3L mock lead somewhere. -->
			<SectionHeader
				title={model.assetsSection.title}
				action={model.assetsSection.action}
				onaction={() => onflow?.('add-token')}
			/>
			<ul>
				{#each model.assetRows as row, i (i)}
					<li><AssetRow {row} onclick={() => (panel = 'asset-detail')} /></li>
				{/each}
			</ul>
		</div>
	</main>

	<!-- Only when no flow host is wired: in the real app the third column
	     belongs to the flows, and in the gallery it belongs to these. -->
	{#if onflow !== undefined}
		<!-- the flow host draws the column -->
	{:else if panel === 'receive'}
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
