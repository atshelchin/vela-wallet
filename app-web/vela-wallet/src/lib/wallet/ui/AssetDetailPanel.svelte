<script lang="ts">
	import type { AssetDetailPanelModel } from '../model';
	import { UTILITY_ICONS } from '../icons';
	import ActivityRow from './ActivityRow.svelte';
	import Icon from './Icon.svelte';
	import TokenIcon from './TokenIcon.svelte';

	interface Props {
		panel: AssetDetailPanelModel;
		/** The two actions, live. Absent in the gallery, where they are drawn. */
		onsend?: () => void;
		onreceive?: () => void;
	}

	let { panel, onsend, onreceive }: Props = $props();
</script>

<div class="detail">
	<div class="head">
		<TokenIcon
			ticker={panel.token.ticker}
			badgeColor={panel.token.badgeColor}
			logoUrls={panel.token.logoUrls}
			badgeLogoUrl={panel.token.badgeLogoUrl}
			badgeHidden={panel.token.badgeHidden}
		/>
		<div class="head-text">
			<p class="balance">{panel.token.balance}</p>
			<p class="fiat">{panel.token.fiatLine}</p>
		</div>
	</div>

	<div class="actions">
		<button type="button" onclick={onsend}>
			<Icon icon={UTILITY_ICONS['arrow-up-right']} size="base" />
			<span>{panel.send}</span>
		</button>
		<button type="button" onclick={onreceive}>
			<Icon icon={UTILITY_ICONS['arrow-down-left']} size="base" />
			<span>{panel.receive}</span>
		</button>
	</div>

	<dl class="facts">
		{#each panel.facts as fact (fact.label)}
			<div class="fact">
				<dt>{fact.label}</dt>
				<dd>{fact.value}</dd>
			</div>
		{/each}
	</dl>

	<button type="button" class="explorer">
		<span>{panel.viewOnExplorer}</span>
		<Icon icon={UTILITY_ICONS['chevron-right']} size="sm" />
	</button>

	<h3>{panel.transactionsTitle}</h3>
	<ul class="rows">
		{#each panel.rows as row, i (i)}
			<li><ActivityRow {row} /></li>
		{/each}
	</ul>
</div>

<style>
	.detail {
		display: flex;
		flex-direction: column;
		gap: var(--space-xl);
	}

	p {
		margin: 0;
	}

	.head {
		display: flex;
		align-items: center;
		gap: var(--space-lg);
	}

	.head-text {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	.balance {
		font-family: var(--font-display);
		font-size: calc(var(--text-2xl) * var(--text-scale, 1));
		font-weight: var(--weight-bold);
		color: var(--color-fg-base);
	}

	.fiat {
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-muted);
	}

	.actions {
		display: flex;
		gap: var(--space-lg);
	}

	.actions button {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-md);
		height: var(--size-control-md);
		border: var(--border-hairline) solid var(--color-border-base);
		border-radius: var(--radius-lg);
		background: var(--color-bg-raised);
		font-family: var(--font-ui);
		font-size: calc(var(--text-lg) * var(--text-scale, 1));
		font-weight: var(--weight-semibold);
		color: var(--color-fg-base);
		cursor: pointer;
	}

	.actions button:active {
		transform: scale(var(--motion-press-button));
	}

	.facts {
		margin: 0;
		border-top: var(--border-hairline) solid var(--color-border-base);
	}

	.fact {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-lg);
		padding-block: var(--space-lg);
		border-bottom: var(--border-hairline) solid var(--color-border-base);
	}

	dt {
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-muted);
	}

	dd {
		margin: 0;
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		font-weight: var(--weight-medium);
		color: var(--color-fg-base);
		text-align: end;
		overflow-wrap: anywhere;
	}

	.explorer {
		display: inline-flex;
		align-items: center;
		gap: var(--space-sm);
		align-self: flex-start;
		padding: 0;
		border: none;
		background: none;
		font-family: var(--font-ui);
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-muted);
		cursor: pointer;
	}

	.explorer:hover {
		color: var(--color-fg-base);
	}

	h3 {
		margin: var(--space-md) 0 0;
		font-size: calc(var(--text-lg) * var(--text-scale, 1));
		font-weight: var(--weight-bold);
		color: var(--color-fg-base);
	}

	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
	}
</style>
