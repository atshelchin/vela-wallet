<script lang="ts">
	/**
	 * SD2c — pasting or importing a list of recipients.
	 *
	 * The screen's real subject is the rate, not the paste box. Someone
	 * importing a payroll sheet has amounts in their own currency, and the
	 * question that decides whether the transfer is right is what those amounts
	 * become in the token. So: the unit toggle, the editable rate, and a
	 * per-row conversion the person can read back against their spreadsheet.
	 *
	 * Bad rows are marked and skipped, never silently dropped, and the CTA
	 * counts only the good ones — a button that says "Import 3" and imports 2
	 * is how someone underpays a contractor.
	 */
	import Button from '$lib/ui/Button.svelte';
	import { UTILITY_ICONS } from '$lib/wallet/icons';
	import Icon from '$lib/wallet/ui/Icon.svelte';
	import MonoField from '../ui/MonoField.svelte';
	import SegmentedToggle from '../ui/SegmentedToggle.svelte';
	import type { BatchImportModel } from '../model';

	interface Props {
		model: BatchImportModel;
		onunit?: (id: string) => void;
		onfile?: () => void;
		ontemplate?: () => void;
		onapply?: () => void;
		/**
		 * Present ⇒ the table can be pasted here (spec 026). Absent, the field
		 * stays the drawn picture the gallery renders.
		 */
		onpaste?: (value: string) => void;
	}

	let { model, onunit, onfile, ontemplate, onapply, onpaste }: Props = $props();
</script>

<div class="batch">
	<SegmentedToggle
		label={model.title}
		selected={model.unit}
		options={[
			{ id: 'fiat', label: model.units.fiat },
			{ id: 'token', label: model.units.token }
		]}
		onselect={onunit}
	/>

	<MonoField
		value={model.pasteValue}
		placeholder={model.pastePlaceholder}
		rows={4}
		oninput={onpaste}
	/>

	<p class="tools">
		<button type="button" onclick={onfile}>
			<Icon icon={UTILITY_ICONS['file-text']} size="sm" />
			{model.importFile}
		</button>
		<span class="sep" aria-hidden="true">·</span>
		<button type="button" onclick={ontemplate}>{model.template}</button>
	</p>

	<div class="rate">
		<span class="rate-label">{model.rateSection}</span>
		<span class="rate-value">{model.rateLabel} {model.rateValue}</span>
		<Icon icon={UTILITY_ICONS.pencil} size="sm" />
	</div>
	<p class="rate-hint">{model.rateHint}</p>

	<p class="parsed">{model.parsedLabel}</p>
	<ul>
		{#each model.rows as row, i (i)}
			<li>
				<span class="flag" class:bad={!row.ok}>
					<Icon icon={row.ok ? UTILITY_ICONS.check : UTILITY_ICONS.x} size="sm" />
				</span>
				<span class="address">{row.address}</span>
				<span class="conversion">{row.conversion}</span>
			</li>
		{/each}
	</ul>

	{#if model.rejectedText !== undefined}
		<p class="rejected">{model.rejectedText}</p>
	{/if}

	<div class="cta">
		<Button variant="primary" shape="rounded" disabled={model.ctaDisabled} onclick={onapply}>
			{model.cta}
		</Button>
	</div>
</div>

<style>
	.batch {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.tools {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		margin: 0;
	}

	.tools button {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		border: none;
		background: none;
		font-family: var(--font-ui);
		font-size: calc(var(--text-sm) * var(--text-scale, 1));
		color: var(--color-fg-muted);
		cursor: pointer;
	}

	.sep {
		color: var(--color-fg-subtle);
	}

	.rate {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding-top: var(--space-md);
		border-top: var(--border-hairline) solid var(--color-border-base);
		color: var(--color-fg-subtle);
	}

	.rate-label {
		flex: 1;
		min-width: 0;
		font-size: calc(var(--text-base) * var(--text-scale, 1));
	}

	.rate-value {
		font-family: var(--font-numeric);
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		font-variant-numeric: tabular-nums;
		color: var(--color-fg-base);
	}

	.rate-hint {
		margin: 0;
		font-size: calc(var(--text-sm) * var(--text-scale, 1));
		color: var(--color-fg-subtle);
	}

	.parsed {
		margin: 0;
		padding-top: var(--space-md);
		font-size: calc(var(--text-sm) * var(--text-scale, 1));
		color: var(--color-fg-muted);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	li {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		padding-block: var(--space-md);
	}

	.flag {
		display: flex;
		flex-shrink: 0;
		color: var(--color-success-base);
	}

	.bad {
		color: var(--color-error-base);
	}

	.address {
		flex: 1;
		min-width: 0;
		font-family: var(--font-mono);
		font-size: calc(var(--text-sm) * var(--text-scale, 1));
		color: var(--color-fg-base);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.conversion {
		font-family: var(--font-numeric);
		font-size: calc(var(--text-sm) * var(--text-scale, 1));
		font-variant-numeric: tabular-nums;
		color: var(--color-fg-muted);
	}

	.rejected {
		margin: 0;
		font-size: calc(var(--text-sm) * var(--text-scale, 1));
		color: var(--color-error-base);
	}

	.cta {
		padding-top: var(--space-md);
	}
</style>
