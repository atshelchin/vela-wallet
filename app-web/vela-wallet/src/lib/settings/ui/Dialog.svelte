<script lang="ts">
	/**
	 * The desktop's centred modal (DST4b / DSR1) — what the phone draws as a
	 * bottom sheet. Same content, different container: the SPEC's rule is that
	 * every phone 弹框 becomes an in-panel section or a centred dialog on the
	 * desktop, and these two are the dialogs.
	 */
	import type { Snippet } from 'svelte';
	import { UTILITY_ICONS } from '$lib/wallet/icons';
	import Icon from '$lib/wallet/ui/Icon.svelte';

	interface Props {
		title: string;
		subtitle?: string;
		closeLabel: string;
		onclose?: () => void;
		children: Snippet;
	}

	let { title, subtitle, closeLabel, onclose, children }: Props = $props();
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') onclose?.();
	}}
/>

<div class="scrim" role="presentation" onclick={onclose}></div>
<div class="dialog" role="dialog" aria-modal="true" aria-label={title}>
	<header>
		<div class="titles">
			<h2>{title}</h2>
			{#if subtitle !== undefined}<p>{subtitle}</p>{/if}
		</div>
		<button type="button" class="close" aria-label={closeLabel} onclick={onclose}>
			<Icon icon={UTILITY_ICONS.x} size="md" />
		</button>
	</header>
	<div class="content">{@render children()}</div>
</div>

<style>
	.scrim {
		position: absolute;
		inset: 0;
		background: var(--color-fixed-backdrop);
		z-index: 10;
	}

	.dialog {
		position: absolute;
		top: 50%;
		left: 50%;
		z-index: 11;
		width: var(--layout-settingsDialogW);
		max-height: 80%;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		padding: var(--space-3xl);
		border-radius: var(--radius-xl);
		background: var(--color-bg-raised);
		border: var(--border-hairline) solid var(--color-border-base);
		box-shadow: var(--shadow-lg);
		animation: rise var(--motion-duration-fast) ease-out;
	}

	@keyframes rise {
		from {
			transform: translate(-50%, -50%) scale(0.97);
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.dialog {
			animation: none;
		}
	}

	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-lg);
		margin-bottom: var(--space-xl);
	}

	h2 {
		margin: 0;
		font-size: calc(var(--text-2xl) * var(--text-scale, 1));
		font-weight: var(--weight-bold);
		color: var(--color-fg-base);
	}

	.titles p {
		margin: var(--space-md) 0 0;
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-subtle);
	}

	.close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--space-4xl);
		height: var(--space-4xl);
		border: none;
		border-radius: var(--radius-full);
		background: var(--color-bg-sunken);
		color: var(--color-fg-muted);
		cursor: pointer;
		flex-shrink: 0;
	}

	.content {
		overflow-y: auto;
	}
</style>
