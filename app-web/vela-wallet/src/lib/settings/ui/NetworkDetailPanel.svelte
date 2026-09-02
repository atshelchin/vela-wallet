<script lang="ts">
	/**
	 * ST9b / DST4's expanded editor — the chain's identity line, its RPC URL
	 * with a latency pill, the "why this might be refused" hint, and the
	 * explorer. The mismatch callout sits between the two fields, next to the
	 * field it is about.
	 */
	import type { NetworkDetailModel } from '../model';
	import Callout from './Callout.svelte';
	import ChainMark from './ChainMark.svelte';
	import StatusPill from './StatusPill.svelte';
	import UrlField from './UrlField.svelte';

	interface Props {
		detail: NetworkDetailModel;
		/** The desktop's inline editor drops the identity line — the row above
		 *  it already says which chain this is. */
		showIdentity?: boolean;
	}

	let { detail, showIdentity = true }: Props = $props();
</script>

<div class="detail">
	{#if showIdentity}
		<div class="identity">
			<ChainMark mark={detail.mark} />
			<span class="text">
				<span class="name">{detail.name}</span>
				<span class="note">{detail.note}</span>
			</span>
			<StatusPill pill={detail.badge} />
		</div>
	{/if}

	<UrlField field={detail.rpc} />
	{#if detail.callout !== undefined}
		<Callout callout={detail.callout} />
	{/if}
	<UrlField field={detail.explorer} />
</div>

<style>
	.detail {
		display: flex;
		flex-direction: column;
		gap: var(--space-3xl);
	}

	.identity {
		display: flex;
		align-items: center;
		gap: var(--space-lg);
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		flex: 1;
		min-width: 0;
	}

	.name {
		font-size: calc(var(--text-xl) * var(--text-scale, 1));
		font-weight: var(--weight-bold);
		color: var(--color-fg-base);
	}

	.note {
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-subtle);
	}
</style>
