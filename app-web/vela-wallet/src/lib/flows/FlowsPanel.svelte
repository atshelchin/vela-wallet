<script lang="ts">
	/**
	 * The desktop host: one flow state, in the third column.
	 *
	 * Same screen bodies as the phone — only the chrome differs. The phone
	 * pushes a `FlowScreen` or raises a `BottomSheet`; the desktop puts the
	 * identical body inside `ThirdPanel`, which is why every body here takes
	 * its model and nothing else.
	 *
	 * `ds1` is the one exception in the whole feature: a scanner is a viewfinder
	 * and a narrow column is the wrong shape for one, so the desktop shows it as
	 * a centred modal (DS1L) and this component does not draw it.
	 */
	import ThirdPanel from '$lib/wallet/ui/ThirdPanel.svelte';
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
	import TxDetail from './screens/TxDetail.svelte';
	import type { DesktopFlowModel } from './model';

	interface Props {
		model: DesktopFlowModel;
		onback?: () => void;
		onclose?: () => void;
		onnavigate?: (to: string, index?: number) => void;
		/** The add-token panel's handlers, when the `manage_tokens` core is live (spec 028). */
		addToken?: { input(value: string): void; submit(): void };
	}

	let { model, onback, onclose, onnavigate, addToken }: Props = $props();

	const body = $derived(model.body);
	const go = (to: string, index?: number) => onnavigate?.(to, index);
</script>

<ThirdPanel
	title={model.title}
	closeLabel={model.closeLabel}
	backLabel={model.backLabel}
	{onback}
	{onclose}
>
	{#if body.kind === 'receive-list'}
		<ReceiveList model={body.model} chrome={false} onqr={(i) => go('receive-qr', i)} />
	{:else if body.kind === 'receive-qr'}
		<ReceiveQr model={body.model} />
	{:else if body.kind === 'history'}
		<History model={body.model} onselect={(g, r) => go('tx-detail', g * 100 + r)} />
	{:else if body.kind === 'tx-detail'}
		<TxDetail model={body.model} />
	{:else if body.kind === 'assets'}
		<Assets
			model={body.model}
			onselect={(i) => go('token-detail', i)}
			onadd={() => go('add-token')}
			onreceive={() => go('receive')}
		/>
	{:else if body.kind === 'add-token'}
		<AddToken
			model={body.model}
			oninput={addToken ? (value) => addToken.input(value) : undefined}
			onsubmit={addToken ? () => addToken.submit() : undefined}
		/>
	{:else if body.kind === 'send-pick'}
		<SendPick model={body.model} onselect={(i) => go('send-form', i)} />
	{:else if body.kind === 'send-form'}
		<SendForm
			model={body.model}
			onpickRecipient={() => go('contact-pick')}
			onscan={() => go('scan')}
			onfee={() => go('fee-token')}
		/>
	{:else if body.kind === 'send-confirm'}
		<SendConfirm model={body.model} onconfirm={() => go('send-receipt')} />
	{:else if body.kind === 'contact-pick'}
		<ContactPick model={body.model} onscan={() => go('scan')} />
	{:else if body.kind === 'fee-token'}
		<FeeTokenPick model={body.model} />
	{:else if body.kind === 'batch-import'}
		<BatchImport model={body.model} />
	{:else}
		<SendReceipt model={body.model} oncta={() => go('done')} />
	{/if}
</ThirdPanel>
