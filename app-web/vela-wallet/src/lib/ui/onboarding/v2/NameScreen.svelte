<script lang="ts">
	/**
	 * Name the wallet, and accept the two gates.
	 *
	 * Two checkboxes, matching the core's `ACK_COUNT`: self-custody, and legal
	 * assent. The recovery line beside them is an ASSURANCE — a fact about what
	 * the founding key set buys you — not a third gate, so it renders with a
	 * filled tick and nothing to click. Making it clickable would invite the
	 * person to tick something that changes nothing.
	 */
	import AckRow from '../AckRow.svelte';
	import NameField from '../NameField.svelte';
	import Button from '$lib/ui/Button.svelte';

	interface Props {
		name: string;
		nameEditable: boolean;
		nameTooLong: boolean;
		acks: boolean[];
		canSubmit: boolean;
		busy: boolean;
		submitLabel: string;
		statusText?: string;
		showStartOver: boolean;
		strings: (key: string) => string;
		privacyUrl: string;
		termsUrl: string;
		onName: (value: string) => void;
		onToggleAck: (index: number) => void;
		onSubmit: () => void;
		onStartOver: () => void;
	}

	let {
		name,
		nameEditable,
		nameTooLong,
		acks,
		canSubmit,
		busy,
		submitLabel,
		statusText,
		showStartOver,
		strings,
		privacyUrl,
		termsUrl,
		onName,
		onToggleAck,
		onSubmit,
		onStartOver
	}: Props = $props();
</script>

<!--
	The two policy links are absolute external URLs (getvela.app/privacy and
	/terms), not app routes, so `resolve()` has nothing to resolve. Disabled for
	the file rather than per line because the rule reports at the `href`
	attribute, which prettier wraps onto its own line.
-->
<!-- eslint-disable svelte/no-navigation-without-resolve -->
<section class="screen">
	<h1 class="title">{strings('onboarding.create.headerDefault')}</h1>

	<NameField
		label={strings('onboarding.create.accountNameLabel')}
		placeholder={strings('onboarding.create.accountNamePlaceholder')}
		hint={strings('onboarding.create.accountNameHint')}
		errorText={nameTooLong ? strings('onboarding.create.nameTooLong') : undefined}
		value={name}
		oninput={nameEditable ? onName : undefined}
	/>

	<div class="spacer"></div>

	<div class="gates">
		<AckRow checked={acks[0] ?? false} onToggle={() => onToggleAck(0)}>
			{strings('onboarding.create.ack0')}
		</AckRow>

		<AckRow checked={acks[1] ?? false} onToggle={() => onToggleAck(1)}>
			{strings('onboarding.create.ack1')}<a
				href={privacyUrl}
				target="_blank"
				rel="noreferrer"
				onclick={(event) => event.stopPropagation()}
				>{strings('onboarding.create.ack1PrivacyPolicy')}</a
			>{strings('onboarding.create.ack1And')}<a
				href={termsUrl}
				target="_blank"
				rel="noreferrer"
				onclick={(event) => event.stopPropagation()}>{strings('onboarding.create.ack1Terms')}</a
			>{strings('onboarding.create.ack1Period')}
		</AckRow>

		<p class="assurance">
			<span class="tick" aria-hidden="true">
				<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>
			</span>
			<span>{strings('onboarding.create.assuranceRecovery')}</span>
		</p>
	</div>

	{#if statusText}
		<p class="status" aria-live="polite">{statusText}</p>
	{/if}

	<Button variant="primary" shape="rounded" disabled={!canSubmit || busy} onclick={onSubmit}
		>{submitLabel}</Button
	>

	{#if showStartOver}
		<button class="startover" type="button" onclick={onStartOver}>
			{strings('onboarding.create.startOverBtn')}
		</button>
	{/if}
</section>

<style>
	.screen {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: var(--space-3xl);
	}

	.title {
		margin: 0;
		color: var(--color-fg-base);
		font-size: var(--text-3xl);
		font-weight: var(--weight-bold);
		line-height: var(--leading-tight);
		letter-spacing: -0.015em;
	}

	.spacer {
		flex: 1;
		min-height: var(--space-md);
	}

	.gates {
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
	}

	.assurance {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-lg);
		align-items: start;
		margin: 0;
		color: var(--color-fg-muted);
		font-size: var(--text-base);
		line-height: var(--leading-relaxed);
	}

	.tick {
		display: grid;
		place-items: center;
		width: var(--icon-lg);
		height: var(--icon-lg);
		margin-top: var(--space-xs);
		border-radius: var(--radius-sm);
		background: var(--color-accent-base);
	}

	.tick svg {
		width: var(--icon-sm);
		height: var(--icon-sm);
		fill: none;
		stroke: var(--color-onAccent);
		stroke-width: var(--icon-stroke-heavy);
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.status {
		margin: 0;
		color: var(--color-info-base);
		font-size: var(--text-base);
	}

	.startover {
		align-self: center;
		padding: 0;
		border: 0;
		background: none;
		color: var(--color-fg-muted);
		font-family: var(--font-ui);
		font-size: var(--text-base);
		text-decoration: underline;
		cursor: pointer;
	}
</style>
