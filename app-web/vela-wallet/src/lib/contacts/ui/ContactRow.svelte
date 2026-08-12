<script lang="ts">
	import Identicon from '$lib/wallet/ui/Identicon.svelte';
	import type { ContactModel } from '../model';

	interface Props {
		contact: ContactModel;
		/** Desktop selection (the row the third column is showing). */
		selected?: boolean;
		/** Static gallery variant of the pointer-hover raise. */
		hover?: boolean;
		/** c1s: swipe actions revealed without a gesture (research.md D5). */
		revealed?: boolean;
		actions?: { send: string; delete: string };
		divider?: boolean;
		onclick?: () => void;
		oncontextmenu?: (event: MouseEvent) => void;
		onsend?: () => void;
		ondelete?: () => void;
	}

	let {
		contact,
		selected = false,
		hover = false,
		revealed = false,
		actions,
		divider = false,
		onclick,
		oncontextmenu,
		onsend,
		ondelete
	}: Props = $props();
</script>

<div class="wrap" class:divider>
	{#if actions !== undefined && revealed}
		<div class="swipe">
			<button type="button" class="swipe-action send" onclick={onsend}>{actions.send}</button>
			<button type="button" class="swipe-action delete" onclick={ondelete}>
				{actions.delete}
			</button>
		</div>
	{/if}
	<button
		type="button"
		class="row"
		class:selected
		class:hover
		class:revealed
		aria-current={selected ? 'true' : undefined}
		{onclick}
		{oncontextmenu}
	>
		<Identicon svg={contact.identiconSvg} size="row" />
		<span class="text">
			<span class="name">{contact.name}</span>
			<span class="address">{contact.addressDisplay}</span>
		</span>
	</button>
</div>

<style>
	.wrap {
		position: relative;
		display: flex;
		align-items: stretch;
		overflow: hidden;
	}

	.wrap.divider {
		border-bottom: var(--border-hairline) solid var(--color-border-base);
	}

	.row {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--space-lg);
		flex: 1;
		min-width: 0;
		padding: var(--space-md) var(--space-lg);
		border: none;
		border-radius: var(--radius-lg);
		background: var(--color-bg-base);
		font-family: var(--font-ui);
		text-align: start;
		cursor: pointer;
		transition: background var(--motion-hover) ease-out;
	}

	.row:hover,
	.row.hover {
		background: var(--color-bg-raised);
	}

	.row.selected {
		background: var(--color-bg-raised);
	}

	.text {
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
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.address {
		font-family: var(--font-mono);
		font-size: calc(var(--text-sm) * var(--text-scale, 1));
		color: var(--color-fg-subtle);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Swipe-left reveal. Web has no swipe gesture (research.md D5): the c1s
	   fixture pins the revealed state, and the row yields trailing width to the
	   actions rather than translating its content off the leading edge. */
	.swipe {
		display: flex;
		flex-shrink: 0;
		order: 1;
	}

	.swipe-action {
		display: flex;
		align-items: center;
		justify-content: center;
		width: calc(var(--space-5xl) + var(--space-3xl));
		border: none;
		color: var(--color-onAccent);
		font-family: var(--font-ui);
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		font-weight: var(--weight-semibold);
		cursor: pointer;
	}

	.swipe-action.send {
		background: var(--color-accent-base);
	}

	.swipe-action.delete {
		background: var(--color-error-base);
	}

	.row.revealed {
		border-start-end-radius: var(--radius-none);
		border-end-end-radius: var(--radius-none);
		transition: flex-basis var(--motion-duration-normal) ease-out;
	}

	@media (prefers-reduced-motion: reduce) {
		.row,
		.row.revealed {
			transition: none;
		}
	}
</style>
