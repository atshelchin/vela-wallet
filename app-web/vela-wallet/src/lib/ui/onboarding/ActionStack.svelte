<script lang="ts">
	/**
	 * Outcome action stack (spec 014, contract §5): primary = the existing
	 * Button; secondaries = the mock's DARK SOLID ROWS (full-width pills on
	 * bg-sunken with a hairline) — deliberately NOT the outline
	 * welcome-secondary style. This component is the single authority for
	 * that styling.
	 */
	import Button from '../Button.svelte';
	import type { ActionId, ActionRole } from '$lib/onboarding/states';

	interface StackAction {
		id: ActionId;
		role: ActionRole;
		/** Resolved label. */
		label: string;
	}

	interface Props {
		actions: StackAction[];
		onAction: (id: ActionId) => void;
	}

	let { actions, onAction }: Props = $props();
</script>

<div class="stack">
	{#each actions as action (action.id)}
		{#if action.role === 'primary'}
			<Button variant="primary" onclick={() => onAction(action.id)}>{action.label}</Button>
		{:else}
			<button class="row" type="button" onclick={() => onAction(action.id)}>
				{action.label}
			</button>
		{/if}
	{/each}
</div>

<style>
	.stack {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		width: 100%;
	}

	.row {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		/* Minimum, not fixed: long-locale labels wrap and grow the row
		   instead of overflowing it (spec 014 long-label fix). */
		min-height: var(--size-control-lg);
		padding-inline: var(--space-3xl);
		padding-block: var(--space-md);
		background: var(--color-bg-sunken);
		border: var(--border-hairline) solid var(--color-border-base);
		border-radius: var(--radius-full);
		color: var(--color-fg-base);
		font-family: var(--font-ui);
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
		line-height: var(--leading-tight);
		text-align: center;
		cursor: pointer;
		user-select: none;
		transition:
			opacity var(--motion-duration-fast) ease,
			transform var(--motion-duration-fast) ease;
	}

	.row:hover {
		opacity: var(--opacity-hover);
	}

	.row:active {
		transform: scale(var(--motion-press-button));
	}
</style>
