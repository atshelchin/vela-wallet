<script lang="ts">
	import Icon from '$lib/wallet/ui/Icon.svelte';
	import { UTILITY_ICONS } from '$lib/wallet/icons';
	import LetterAvatar from '$lib/ui/LetterAvatar.svelte';
	import PositiveNote from './PositiveNote.svelte';
	import type { FeeModel } from '../model';

	interface Props {
		fee: FeeModel;
		/** Opens the fee-token selector; absent in the gallery. */
		ontoggle?: () => void;
	}

	let { fee, ontoggle }: Props = $props();
</script>

{#if fee.kind === 'offchain'}
	<PositiveNote text={fee.note} quiet />
{:else if fee.kind === 'onchain'}
	{#if fee.selector}
		<section class="selector">
			<header>
				<span>{fee.selector.title}</span>
				<Icon icon={UTILITY_ICONS['chevron-down']} size="sm" />
			</header>
			{#each fee.selector.options as option (option.id)}
				<div class="option" class:selected={option.selected}>
					<LetterAvatar letter={option.mark.letter} tint={option.mark.tint} size={32} />
					<span class="who">
						<span class="name">{option.name}</span>
						<span class="balance">{option.balance}</span>
					</span>
					<span class="numbers">
						<span class="fee">{option.fee}</span>
						<span class="hint">{option.selected ? '' : ''}</span>
					</span>
					{#if option.selected}
						<span class="check"><Icon icon={UTILITY_ICONS.check} size="base" /></span>
					{/if}
				</div>
			{/each}
		</section>
	{:else}
		<button type="button" class="row" onclick={ontoggle}>
			<span class="label">{fee.label}</span>
			<span class="value">{fee.value}</span>
			<Icon icon={UTILITY_ICONS['chevron-right']} size="sm" />
		</button>
	{/if}
{/if}

<style>
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		width: 100%;
		padding: var(--space-lg) var(--space-xl);
		border: none;
		border-radius: var(--radius-lg);
		background: var(--color-bg-sunken);
		font-family: var(--font-ui);
		color: var(--color-fg-muted);
		cursor: pointer;
		text-align: start;
	}

	.label {
		flex: 1;
		font-size: calc(var(--text-base) * var(--text-scale, 1));
	}

	.value {
		font-family: var(--font-numeric);
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		font-variant-numeric: tabular-nums;
		color: var(--color-fg-base);
	}

	.selector {
		border-radius: var(--radius-lg);
		background: var(--color-bg-sunken);
		padding: var(--space-lg) var(--space-xl);
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-block: var(--space-md);
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-muted);
	}

	.option {
		display: flex;
		align-items: center;
		gap: var(--space-lg);
		padding: var(--space-md);
		border-radius: var(--radius-lg);
	}

	.option.selected {
		background: var(--color-bg-raised);
	}

	.who {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		flex: 1;
		min-width: 0;
	}

	.name {
		font-size: calc(var(--text-lg) * var(--text-scale, 1));
		font-weight: var(--weight-semibold);
		color: var(--color-fg-base);
	}

	.balance {
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-muted);
	}

	.numbers {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
	}

	.fee {
		font-family: var(--font-numeric);
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-base);
	}

	.check {
		color: var(--color-accent-base);
	}
</style>
