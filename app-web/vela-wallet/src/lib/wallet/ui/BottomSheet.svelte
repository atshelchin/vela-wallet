<script lang="ts">
	import type { Snippet } from 'svelte';
	import { UTILITY_ICONS } from '../icons';
	import Icon from './Icon.svelte';

	interface Props {
		title: string;
		/** Optional trailing icon-button slot in the title row (mock H8: search). */
		trailingIcon?: 'search';
		onclose?: () => void;
		children: Snippet;
	}

	let { title, trailingIcon, onclose, children }: Props = $props();
</script>

<div class="scrim" role="presentation" onclick={onclose}></div>
<div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
	<span class="handle" aria-hidden="true"></span>
	<header>
		<h2>{title}</h2>
		{#if trailingIcon === 'search'}
			<span class="trailing"><Icon icon={UTILITY_ICONS.search} size="lg" /></span>
		{/if}
	</header>
	<div class="content">
		{@render children()}
	</div>
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
		max-height: 60%;
		background: var(--color-bg-base);
		border-start-start-radius: var(--radius-2xl);
		border-start-end-radius: var(--radius-2xl);
		padding-inline: var(--layout-screenPaddingX);
		padding-bottom: var(--space-3xl);
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

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-block: var(--space-md);
	}

	h2 {
		margin: 0;
		font-size: calc(var(--text-2xl) * var(--text-scale, 1));
		font-weight: var(--weight-bold);
		color: var(--color-fg-base);
	}

	.trailing {
		color: var(--color-fg-muted);
		display: flex;
	}

	.content {
		overflow-y: auto;
	}
</style>
