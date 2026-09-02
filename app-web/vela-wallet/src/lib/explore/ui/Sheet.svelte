<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The explore bottom sheet (E3/E6/E7): grab handle, scrim, Escape and a
	 * scrim tap all closing it. Content is a snippet because the three sheets
	 * have three different headers and nothing else in common.
	 */
	interface Props {
		label: string;
		onclose?: () => void;
		children: Snippet;
	}

	let { label, onclose, children }: Props = $props();
</script>

<svelte:window
	onkeydown={(event: KeyboardEvent) => {
		if (event.key === 'Escape') onclose?.();
	}}
/>

<div class="scrim" role="presentation" onclick={() => onclose?.()}></div>
<div class="sheet" role="dialog" aria-modal="true" aria-label={label}>
	<span class="handle" aria-hidden="true"></span>
	<div class="content">{@render children()}</div>
</div>

<style>
	.scrim {
		position: absolute;
		inset: 0;
		background: var(--color-fixed-backdrop);
	}

	.sheet {
		position: absolute;
		inset-inline: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		max-height: 78%;
		background: var(--color-bg-base);
		border-start-start-radius: var(--radius-2xl);
		border-start-end-radius: var(--radius-2xl);
		animation: rise var(--motion-sheet-in) ease-out;
	}

	@keyframes rise {
		from {
			transform: translateY(var(--space-5xl));
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.sheet {
			animation: none;
		}
	}

	.handle {
		align-self: center;
		width: var(--space-5xl);
		height: var(--space-sm);
		border-radius: var(--radius-full);
		background: var(--color-border-strong);
		margin-block: var(--space-lg);
	}

	.content {
		overflow-y: auto;
		padding-inline: var(--layout-screenPaddingX);
		padding-bottom: var(--space-3xl);
	}
</style>
