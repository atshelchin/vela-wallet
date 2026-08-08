<script lang="ts">
	/**
	 * Create-flow panel (spec 014): renders ANY CreatePanelState via the
	 * shared atoms — Form (A1–A3), Working (A4–A8/c) and Outcome (A11–A13,
	 * E1–E8, E2x, E10) — inside the shared scaffold. No inline pattern
	 * layout; no business behaviour. Actions emit ActionIds to the
	 * host-provided sink.
	 */
	import type { ActionId, CreatePanelState, StringResolver } from '$lib/onboarding/states';
	import { CREATE_STATUS_I18N, scaffoldTitleI18nKey } from '$lib/onboarding/outcomes';
	import { CREATE_TOTAL_STEPS } from './geometry';
	import Button from '../Button.svelte';
	import AckRow from './AckRow.svelte';
	import ElapsedRing from './ElapsedRing.svelte';
	import FlowScaffold from './FlowScaffold.svelte';
	import NameField from './NameField.svelte';
	import OutcomeBody from './OutcomeBody.svelte';
	import StepProgress from './StepProgress.svelte';

	interface Props {
		state: CreatePanelState;
		strings: StringResolver;
		onAction: (id: ActionId) => void;
		/** Sheet presentation shows the drag handle. */
		showHandle?: boolean;
	}

	let { state, strings, onAction, showHandle = false }: Props = $props();

	const title = $derived(strings(scaffoldTitleI18nKey(state, 'create')));

	// Local visual state only (FR-011): typing and checkbox toggling adjust
	// the CTA enablement per the data-model rule; both reset when the host
	// swaps in a new state (assignable $derived re-evaluates on prop change).
	let name = $derived(state.kind === 'form' ? state.name : '');
	let acks = $derived(state.kind === 'form' ? state.acks : ([false, false, false] as const));

	const canSubmit = $derived(
		state.kind === 'form' &&
			!state.nameTooLong &&
			name.trim().length > 0 &&
			acks.every((acknowledged) => acknowledged)
	);

	function toggleAck(index: 0 | 1 | 2) {
		acks = acks.map((value, i) => (i === index ? !value : value)) as [boolean, boolean, boolean];
	}

	function link(id: ActionId) {
		return (event: MouseEvent) => {
			// Keep the enclosing <label> from toggling the checkbox — the
			// links must stay individually activatable (spec edge case).
			event.preventDefault();
			event.stopPropagation();
			onAction(id);
		};
	}
</script>

<FlowScaffold
	{title}
	closeLabel={strings('onboarding.common.close')}
	{showHandle}
	onClose={() => onAction('close')}
>
	{#key state}
		{#if state.kind === 'form'}
			<div class="form">
				<NameField
					label={strings('onboarding.create.accountNameLabel')}
					placeholder={strings('onboarding.create.accountNamePlaceholder')}
					hint={strings('onboarding.create.accountNameHint')}
					errorText={state.nameTooLong ? strings('onboarding.create.nameTooLong') : undefined}
					value={state.name}
					oninput={(value) => (name = value)}
				/>
				<div class="acks">
					<AckRow
						checked={acks[0]}
						onToggle={() => toggleAck(0)}
						label={strings('onboarding.create.ack0')}
					/>
					<AckRow
						checked={acks[1]}
						onToggle={() => toggleAck(1)}
						label={strings('onboarding.create.ack1')}
					/>
					<AckRow checked={acks[2]} onToggle={() => toggleAck(2)}>
						{strings('onboarding.create.ack3')}
						<button class="link" type="button" onclick={link('open_privacy_policy')}>
							{strings('onboarding.create.ack3PrivacyPolicy')}
						</button>
						{strings('onboarding.create.ack3And')}
						<button class="link" type="button" onclick={link('open_terms')}>
							{strings('onboarding.create.ack3Terms')}
						</button>
						{strings('onboarding.create.ack3Period')}
					</AckRow>
				</div>
				<Button variant="primary" disabled={!canSubmit} onclick={() => onAction('submit_create')}>
					{strings('onboarding.create.createWalletBtn')}
				</Button>
			</div>
		{:else if state.kind === 'working'}
			<div class="working">
				<StepProgress mode="steps" step={state.step} />
				<p class="stepCaption">
					{strings('onboarding.common.stepCounter', {
						current: state.step,
						total: CREATE_TOTAL_STEPS
					})}
				</p>
				<div class="statusRow">
					<div class="statusText">
						<h3 class="status">{strings(CREATE_STATUS_I18N[state.status])}</h3>
						{#if state.showHint}
							<p class="hintline">{strings('onboarding.common.confirmInPrompt')}</p>
						{/if}
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
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3xl);
	}

	.acks {
		display: flex;
		flex-direction: column;
		gap: var(--space-2xl);
	}

	.link {
		display: inline;
		margin: 0;
		padding: 0;
		border: none;
		background: none;
		color: var(--color-accent-base);
		font-family: var(--font-ui);
		font-size: var(--text-base);
		line-height: inherit;
		cursor: pointer;
	}

	.link:hover {
		opacity: var(--opacity-hover);
	}

	.working {
		display: flex;
		flex-direction: column;
	}

	.stepCaption {
		margin: var(--space-lg) 0 0;
		font-size: var(--text-sm);
		color: var(--color-fg-muted);
	}

	.statusRow {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-xl);
		margin-top: var(--space-lg);
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
