<script lang="ts">
	import type { ReceivePanelModel } from '../model';
	import { UTILITY_ICONS } from '../icons';
	import Icon from './Icon.svelte';
	import QRPlaceholder from './QRPlaceholder.svelte';
	import TokenIcon from './TokenIcon.svelte';

	interface Props {
		panel: ReceivePanelModel;
	}

	let { panel }: Props = $props();
</script>

<div class="receive">
	<button type="button" class="token-picker">
		<TokenIcon ticker={panel.token.ticker} badgeColor={panel.token.badgeColor} />
		<span class="token-text">
			<span class="ticker">{panel.token.ticker}</span>
			<span class="detail">{panel.token.detail}</span>
		</span>
		<Icon icon={UTILITY_ICONS['chevron-down']} size="sm" />
	</button>

	<QRPlaceholder caption={panel.qrCaption} />

	<p class="address-label">{panel.addressLabel}</p>
	<p class="address">{panel.addressFull}</p>

	<button type="button" class="copy">
		<Icon icon={UTILITY_ICONS.copy} size="base" />
		<span>{panel.copyAddress}</span>
	</button>

	<div class="warning">
		<p class="warning-title">
			<Icon icon={UTILITY_ICONS['triangle-alert']} size="sm" />
			<span>{panel.warningTitle}</span>
		</p>
		<p class="warning-body">{panel.warningReminder}</p>
		<p class="warning-note">{panel.networksLine}</p>
	</div>
</div>

<style>
	.receive {
		display: flex;
		flex-direction: column;
		gap: var(--space-xl);
	}

	p {
		margin: 0;
	}

	.token-picker {
		display: flex;
		align-items: center;
		gap: var(--space-lg);
		width: 100%;
		padding: var(--space-lg);
		border: var(--border-hairline) solid var(--color-border-base);
		border-radius: var(--radius-xl);
		background: var(--color-bg-raised);
		font-family: var(--font-ui);
		color: var(--color-fg-muted);
		text-align: start;
		cursor: pointer;
	}

	.token-text {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		flex: 1;
		min-width: 0;
	}

	.ticker {
		font-size: calc(var(--text-lg) * var(--text-scale, 1));
		font-weight: var(--weight-semibold);
		color: var(--color-fg-base);
	}

	.detail {
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-muted);
	}

	.address-label {
		font-size: calc(var(--text-sm) * var(--text-scale, 1));
		font-weight: var(--weight-medium);
		letter-spacing: var(--letterSpacing-sectionLabel);
		color: var(--color-fg-subtle);
	}

	.address {
		font-family: var(--font-mono);
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-base);
		background: var(--color-bg-sunken);
		border-radius: var(--radius-lg);
		padding: var(--space-xl);
		overflow-wrap: anywhere;
	}

	.copy {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-md);
		height: var(--size-control-lg);
		border: var(--border-hairline) solid var(--color-border-strong);
		border-radius: var(--radius-xl);
		background: var(--color-bg-raised);
		font-family: var(--font-ui);
		font-size: calc(var(--text-lg) * var(--text-scale, 1));
		font-weight: var(--weight-semibold);
		color: var(--color-fg-base);
		cursor: pointer;
	}

	.copy:active {
		transform: scale(var(--motion-press-button));
	}

	.warning {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		padding: var(--space-xl);
		border-radius: var(--radius-xl);
		background: var(--color-warning-soft);
		border: var(--border-hairline) solid var(--color-warning-border);
	}

	.warning-title {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		font-size: calc(var(--text-lg) * var(--text-scale, 1));
		font-weight: var(--weight-semibold);
		color: var(--color-warning-base);
	}

	.warning-body {
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-muted);
	}

	.warning-note {
		font-size: calc(var(--text-sm) * var(--text-scale, 1));
		color: var(--color-fg-subtle);
	}
</style>
