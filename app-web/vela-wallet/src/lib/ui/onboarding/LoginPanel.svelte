<script lang="ts">
	/**
	 * Login-flow panel (spec 014): renders ANY LoginPanelState via the
	 * shared atoms — Waiting (B1/B1c: single partially-filled bar, no step
	 * counter) and Outcome (B2–B6, E9, E10) — inside the shared scaffold.
	 */
	import type { ActionId, LoginPanelState, StringResolver } from '$lib/onboarding/states';
	import { scaffoldTitleI18nKey } from '$lib/onboarding/outcomes';
	import ElapsedRing from './ElapsedRing.svelte';
	import FlowScaffold from './FlowScaffold.svelte';
	import OutcomeBody from './OutcomeBody.svelte';
	import StepProgress from './StepProgress.svelte';

	interface Props {
		state: LoginPanelState;
		strings: StringResolver;
		onAction: (id: ActionId) => void;
		/** Sheet presentation shows the drag handle. */
		showHandle?: boolean;
	}

	let { state, strings, onAction, showHandle = false }: Props = $props();

	const title = $derived(strings(scaffoldTitleI18nKey(state, 'login')));
</script>

<FlowScaffold
	{title}
	closeLabel={strings('onboarding.common.close')}
	{showHandle}
	onClose={() => onAction('close')}
>
	{#key state}
		{#if state.kind === 'waiting'}
			<div class="waiting">
				<StepProgress mode="bar" />
				<div class="statusRow">
					<div class="statusText">
						<h3 class="status">{strings('onboarding.login.statusAwaitingPasskey')}</h3>
						<p class="hintline">{strings('onboarding.login.statusAwaitingPasskeyHint')}</p>
					</div>
					{#if state.elapsedSecs !== undefined}
						<ElapsedRing
							seconds={state.elapsedSecs}
							label={strings('onboarding.common.waitedSeconds', {
								seconds: state.elapsedSecs
							})}
						/>
					{/if}
				</div>
			</div>
		{:else}
			<OutcomeBody spec={state.spec} {strings} {onAction} />
		{/if}
	{/key}
</FlowScaffold>

<style>
	.waiting {
		display: flex;
		flex-direction: column;
	}

	.statusRow {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-xl);
		margin-top: var(--space-2xl);
	}

	.statusText {
		min-width: 0;
	}

	.status {
		margin: 0;
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
		color: var(--color-fg-base);
	}

	.hintline {
		margin: var(--space-sm) 0 0;
		font-size: var(--text-base);
		color: var(--color-fg-subtle);
	}
</style>
