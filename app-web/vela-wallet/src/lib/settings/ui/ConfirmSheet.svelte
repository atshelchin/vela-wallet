<script lang="ts">
	/**
	 * ST3 / ST3b / ST13b / ST16 — the confirm sheet.
	 *
	 * Four mocks, one component: a title, a body, an optional quieter second
	 * paragraph, an optional callout, and two stacked buttons. The tone picks
	 * the CTA's colour, so "清除缓存" is accent and "全部清除" is red without
	 * either screen owning a button of its own.
	 */
	import type { ConfirmSheetModel } from '../model';
	import Button from '$lib/ui/Button.svelte';
	import Callout from './Callout.svelte';

	interface Props {
		sheet: ConfirmSheetModel;
		onconfirm?: () => void;
		oncancel?: () => void;
	}

	let { sheet, onconfirm, oncancel }: Props = $props();
</script>

<div class="confirm">
	<p class="body">{sheet.body}</p>
	{#if sheet.note !== undefined}
		<p class="note">{sheet.note}</p>
	{/if}
	{#if sheet.callout !== undefined}
		<Callout callout={sheet.callout} />
	{/if}
	<div class="actions">
		<Button
			variant={sheet.tone === 'danger' ? 'danger' : 'primary'}
			shape="rounded"
			onclick={onconfirm}
		>
			{sheet.confirm}
		</Button>
		<Button variant="secondary" shape="rounded" onclick={oncancel}>{sheet.cancel}</Button>
	</div>
</div>

<style>
	.confirm {
		display: flex;
		flex-direction: column;
		gap: var(--space-xl);
		padding-block: var(--space-md) var(--space-xl);
	}

	.body {
		margin: 0;
		font-size: calc(var(--text-lg) * var(--text-scale, 1));
		line-height: var(--leading-normal);
		color: var(--color-fg-base);
	}

	.note {
		margin: 0;
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		line-height: var(--leading-normal);
		color: var(--color-fg-subtle);
	}

	.actions {
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
	}
</style>
