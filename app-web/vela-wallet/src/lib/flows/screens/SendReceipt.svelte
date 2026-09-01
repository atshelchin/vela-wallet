<script lang="ts">
	/**
	 * SD4a / SD4b / SD4c / DSD4L — the receipt, in whichever state it is in.
	 *
	 * The SPEC sheet calls these three "三态" and it means it: submitting,
	 * submitted, confirmed. One screen that changes, not three that replace
	 * each other — which is why the disc, the title and the button all keep
	 * their positions and only their contents move.
	 *
	 * "Close · keep running" is load-bearing copy. The transaction does not
	 * depend on this screen staying open, and a person who thinks it does will
	 * sit here watching a spinner.
	 */
	import Button from '$lib/ui/Button.svelte';
	import { UTILITY_ICONS } from '$lib/wallet/icons';
	import Icon from '$lib/wallet/ui/Icon.svelte';
	import StatusHero from '../ui/StatusHero.svelte';
	import type { SendReceiptModel } from '../model';

	interface Props {
		model: SendReceiptModel;
		onexplorer?: () => void;
		oncta?: () => void;
	}

	let { model, onexplorer, oncta }: Props = $props();

	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	function copy() {
		copied = true;
		clearTimeout(timer);
		timer = setTimeout(() => (copied = false), 150);
	}
</script>

<div class="receipt">
	<StatusHero stage={model.stage} title={model.title} captions={model.captions} />

	<div class="foot">
		{#if model.hash !== undefined}
			<p class="hash">
				<span class="hash-label">{model.hash.label}</span>
				<span class="hash-value">{model.hash.value}</span>
				<button type="button" aria-label={model.hash.copyLabel} class:copied onclick={copy}>
					<Icon icon={copied ? UTILITY_ICONS.check : UTILITY_ICONS.copy} size="sm" />
				</button>
			</p>
		{/if}

		{#if model.viewOnExplorer !== undefined}
			<Button variant="secondary" onclick={onexplorer}>{model.viewOnExplorer}</Button>
		{/if}

		<Button
			variant={model.ctaAccent ? 'primary' : 'secondary'}
			shape={model.ctaAccent ? 'rounded' : 'pill'}
			onclick={oncta}
		>
			{model.cta}
		</Button>
	</div>
</div>

<style>
	.receipt {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 100%;
	}

	/* The buttons live at the bottom of the screen while the status sits near
	   the top: the gap between them is where the waiting happens, and filling
	   it would make the screen look busier than the moment is. */
	.foot {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		margin-top: auto;
		padding-block: var(--space-3xl) var(--space-xl);
	}

	.hash {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		margin: 0;
		padding-bottom: var(--space-md);
	}

	.hash-label {
		font-size: calc(var(--text-sm) * var(--text-scale, 1));
		color: var(--color-fg-subtle);
	}

	.hash-value {
		font-family: var(--font-mono);
		font-size: calc(var(--text-sm) * var(--text-scale, 1));
		color: var(--color-fg-base);
	}

	.hash button {
		display: flex;
		align-items: center;
		border: none;
		background: none;
		color: var(--color-fg-subtle);
		cursor: pointer;
	}

	.hash .copied {
		color: var(--color-success-base);
	}
</style>
