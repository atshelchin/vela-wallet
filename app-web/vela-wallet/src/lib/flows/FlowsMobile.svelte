<script lang="ts">
	/**
	 * The phone host: one flow state, rendered.
	 *
	 * Takes a `FlowScreenModel` and draws its base screen plus, where the state
	 * has one, the sheet over it. Every screen in the four journeys goes
	 * through here, so the gallery and the real app render the same thing by
	 * construction rather than by discipline — there is no second code path for
	 * either to drift down.
	 */
	import BottomSheet from '$lib/wallet/ui/BottomSheet.svelte';
	import FlowScreen from './ui/FlowScreen.svelte';
	import ScanSurface from './ui/ScanSurface.svelte';
	import ShareCard from './ui/ShareCard.svelte';
	import AddToken from './screens/AddToken.svelte';
	import Assets from './screens/Assets.svelte';
	import BatchImport from './screens/BatchImport.svelte';
	import ContactPick from './screens/ContactPick.svelte';
	import FeeTokenPick from './screens/FeeTokenPick.svelte';
	import History from './screens/History.svelte';
	import ReceiveList from './screens/ReceiveList.svelte';
	import ReceiveQr from './screens/ReceiveQr.svelte';
	import SendConfirm from './screens/SendConfirm.svelte';
	import SendForm from './screens/SendForm.svelte';
	import SendPick from './screens/SendPick.svelte';
	import SendReceipt from './screens/SendReceipt.svelte';
	import TokenDetail from './screens/TokenDetail.svelte';
	import TxDetail from './screens/TxDetail.svelte';
	import type { FlowScreenModel } from './model';

	interface Props {
		model: FlowScreenModel;
		/** Absent in the gallery, where the screens are pictures. */
		onback?: () => void;
		onnavigate?: (to: string, index?: number) => void;
	}

	let { model, onback, onnavigate }: Props = $props();

	const base = $derived(model.base);
	const sheet = $derived(model.sheet);

	let sheetClosed = $state(false);
	const showSheet = $derived(sheet !== undefined && !sheetClosed);

	// A new state means a new sheet; without this the dismissal of the last
	// one would suppress the next.
	$effect(() => {
		void model.state;
		sheetClosed = false;
	});

	const go = (to: string, index?: number) => onnavigate?.(to, index);
</script>

<div class="host" style:--text-scale={model.textScale === 1 ? undefined : model.textScale}>
	{#if base.kind === 'scan'}
		<ScanSurface model={base.model} onclose={onback} />
	{:else if base.kind === 'share-card'}
		<!-- Not a screen: the saved image, shown on its own so the gallery and
		     the save path render the very same artwork. -->
		<div class="card-stage"><ShareCard model={base.model} /></div>
	{:else if base.kind === 'receive-list'}
		<FlowScreen header={base.model.header} {onback}>
			<ReceiveList model={base.model} onqr={(i) => go('receive-qr', i)} />
		</FlowScreen>
	{:else if base.kind === 'history'}
		<FlowScreen header={base.model.header} {onback} onpill={() => go('chains')}>
			<History model={base.model} onselect={(g, r) => go('tx-detail', g * 100 + r)} />
		</FlowScreen>
	{:else if base.kind === 'assets'}
		<FlowScreen
			header={base.model.header}
			{onback}
			onaction={() => go('add-token')}
			onpill={() => go('chains')}
		>
			<Assets
				model={base.model}
				onselect={(i) => go('token-detail', i)}
				onadd={() => go('add-token')}
				onreceive={() => go('receive')}
			/>
		</FlowScreen>
	{:else if base.kind === 'send-pick'}
		<FlowScreen header={base.model.header} {onback} onpill={() => go('chains')}>
			<SendPick
				model={base.model}
				onselect={(i) => go('send-form', i)}
				oncta={() => go('send-multi')}
			/>
		</FlowScreen>
	{:else if base.kind === 'send-form'}
		<FlowScreen header={base.model.header} {onback}>
			<SendForm
				model={base.model}
				onpickRecipient={() => go('contact-pick')}
				onscan={() => go('scan')}
				onfee={() => go('fee-token')}
				onrecipientAction={(id) =>
					go(
						id === 'import' ? 'batch-import' : id === 'contacts' ? 'contact-pick' : 'add-recipient'
					)}
			/>
		</FlowScreen>
	{:else if base.kind === 'send-confirm'}
		<FlowScreen header={base.model.header} {onback}>
			<SendConfirm model={base.model} onconfirm={() => go('send-receipt')} />
		</FlowScreen>
	{:else}
		<FlowScreen header={base.model.header} {onback}>
			<SendReceipt model={base.model} oncta={() => go('done')} />
		</FlowScreen>
	{/if}

	{#if showSheet && sheet !== undefined}
		{#if sheet.kind === 'receive-qr'}
			<BottomSheet
				title={sheet.model.title}
				closeLabel={sheet.model.closeLabel}
				height="tall"
				hideTitle
				onclose={() => (sheetClosed = true)}
			>
				<ReceiveQr model={sheet.model} />
			</BottomSheet>
		{:else if sheet.kind === 'tx-detail'}
			<BottomSheet
				title={sheet.model.title}
				closeLabel={sheet.model.closeLabel}
				height="tall"
				hideTitle
				onclose={() => (sheetClosed = true)}
			>
				<TxDetail model={sheet.model} />
			</BottomSheet>
		{:else if sheet.kind === 'token-detail'}
			<BottomSheet
				title={sheet.model.symbol}
				closeLabel={sheet.model.closeLabel}
				height="tall"
				hideTitle
				onclose={() => (sheetClosed = true)}
			>
				<TokenDetail model={sheet.model} />
			</BottomSheet>
		{:else if sheet.kind === 'add-token'}
			<BottomSheet
				title={sheet.model.title}
				closeLabel={sheet.model.closeLabel}
				height="tall"
				onclose={() => (sheetClosed = true)}
			>
				<AddToken model={sheet.model} />
			</BottomSheet>
		{:else if sheet.kind === 'contact-pick'}
			<BottomSheet
				title={sheet.model.title}
				closeLabel={sheet.model.closeLabel}
				height="tall"
				onclose={() => (sheetClosed = true)}
			>
				<ContactPick model={sheet.model} onscan={() => go('scan')} />
			</BottomSheet>
		{:else if sheet.kind === 'fee-token'}
			<BottomSheet
				title={sheet.model.title}
				closeLabel={sheet.model.closeLabel}
				onclose={() => (sheetClosed = true)}
			>
				<FeeTokenPick model={sheet.model} />
			</BottomSheet>
		{:else}
			<BottomSheet
				title={sheet.model.title}
				closeLabel={sheet.model.closeLabel}
				height="tall"
				onclose={() => (sheetClosed = true)}
			>
				<BatchImport model={sheet.model} />
			</BottomSheet>
		{/if}
	{/if}
</div>

<style>
	.host {
		position: relative;
		height: 100%;
		background: var(--color-bg-base);
		overflow: hidden;
	}

	.card-stage {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		/* The card is a fixed 480 wide and the phone frame is not, so it
		   scales down to fit rather than being cropped by it. */
		container-type: inline-size;
		overflow: auto;
	}
</style>
