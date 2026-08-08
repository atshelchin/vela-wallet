<script lang="ts">
	/**
	 * The Outcome pattern (spec 014): badge → headline → body →
	 * [address strip + caption] → [tech-details disclosure] → action stack.
	 * The SINGLE authority for outcome layout — CreatePanel and LoginPanel
	 * both delegate here (SC-003). Renders the OutcomeSpec verbatim; never
	 * branches on outcome kind.
	 */
	import type { ActionId, OutcomeSpec, StringResolver } from '$lib/onboarding/states';
	import ActionStack from './ActionStack.svelte';
	import AddressStrip from './AddressStrip.svelte';
	import StatusBadge from './StatusBadge.svelte';
	import TechDetails from './TechDetails.svelte';

	interface Props {
		spec: OutcomeSpec;
		strings: StringResolver;
		onAction: (id: ActionId) => void;
	}

	let { spec, strings, onAction }: Props = $props();

	const stackActions = $derived(
		spec.actions.map((action) => ({
			id: action.id,
			role: action.role,
			label: strings(action.labelKey)
		}))
	);
</script>

<div class="outcome">
	<div class="badge">
		<StatusBadge variant={spec.badge} />
	</div>
	<h3 class="headline">{strings(spec.headlineKey)}</h3>
	<p class="body">{strings(spec.bodyKey, spec.bodyParams)}</p>

	{#if spec.address !== undefined}
		<div class="addressBlock">
			<AddressStrip
				address={spec.address}
				copyLabel={strings('onboarding.common.copyAddress')}
				copiedLabel={strings('onboarding.common.copied')}
				onCopy={() => onAction('copy_address')}
			/>
			{#if spec.captionKey !== undefined}
				<p class="caption">{strings(spec.captionKey)}</p>
			{/if}
		</div>
	{/if}

	{#if spec.details !== undefined}
		<div class="detailsBlock">
			<TechDetails
				label={strings('onboarding.create.technicalDetails')}
				code={spec.details.code}
				context={spec.details.context}
				endpoint={spec.details.endpoint}
				initialExpanded={spec.detailsExpanded}
				onToggle={() => onAction('toggle_details')}
			/>
		</div>
	{/if}

	<div class="actions">
		<ActionStack actions={stackActions} {onAction} />
	</div>
</div>

<style>
	.outcome {
		display: flex;
		flex-direction: column;
	}

	.badge {
		display: flex;
		justify-content: center;
		margin-top: var(--space-xl);
	}

	.headline {
		margin: var(--space-3xl) 0 0;
		text-align: center;
		font-size: var(--text-2xl);
		font-weight: var(--weight-semibold);
		color: var(--color-fg-base);
	}

	.body {
		margin: var(--space-md) 0 0;
		text-align: center;
		font-size: var(--text-base);
		line-height: var(--leading-normal);
		color: var(--color-fg-muted);
	}

	.addressBlock {
		display: flex;
		flex-direction: column;
		gap: var(--space-xl);
		margin-top: var(--space-3xl);
	}

	.caption {
		margin: 0;
		text-align: center;
		font-size: var(--text-sm);
		color: var(--color-fg-subtle);
	}

	.detailsBlock {
		margin-top: var(--space-3xl);
	}

	.actions {
		margin-top: var(--space-3xl);
	}
</style>
