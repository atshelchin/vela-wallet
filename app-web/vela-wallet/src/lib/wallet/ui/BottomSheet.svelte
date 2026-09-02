<script lang="ts">
	import type { Snippet } from 'svelte';
	import { UTILITY_ICONS } from '../icons';
	import Icon from './Icon.svelte';

	interface Props {
		title: string;
		/** Optional trailing icon-button slot in the title row (mock H8: search). */
		trailingIcon?: 'search';
		/**
		 * Spec 023: the settings sheets carry a whole form — a callout, a field,
		 * a CTA and a row of links — where the wallet's carries a chain list.
		 * 60% cuts the last line off; the mocks show these opening past
		 * three-quarters of the frame.
		 */
		tall?: boolean;
		/**
		 * Spec 023: every settings sheet ends its title row in a circular ✕.
		 * The label is what makes it a button rather than decoration, so the
		 * affordance appears only when a caller has a name for it.
		 */
		closeLabel?: string;
		/** Spec 018 C5/C6: action sheets show no visible title, only the a11y name. */
		hideTitle?: boolean;
		onclose?: () => void;
		children: Snippet;
	}

	let {
		title,
		trailingIcon,
		closeLabel,
		tall = false,
		hideTitle = false,
		onclose,
		children
	}: Props = $props();
</script>

<div class="scrim" role="presentation" onclick={onclose}></div>
<div class="sheet" class:tall role="dialog" aria-modal="true" aria-label={title}>
	<span class="handle" aria-hidden="true"></span>
	{#if !hideTitle}
		<header>
			<h2>{title}</h2>
			{#if trailingIcon === 'search'}
				<span class="trailing"><Icon icon={UTILITY_ICONS.search} size="lg" /></span>
			{:else if closeLabel !== undefined}
				<button type="button" class="close" aria-label={closeLabel} onclick={onclose}>
					<Icon icon={UTILITY_ICONS.x} size="md" />
				</button>
			{/if}
		</header>
	{/if}
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

	.sheet.tall {
		max-height: 88%;
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

	.close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--space-4xl);
		height: var(--space-4xl);
		border: none;
		border-radius: var(--radius-full);
		background: var(--color-bg-raised);
		color: var(--color-fg-muted);
		cursor: pointer;
		flex-shrink: 0;
	}

	.content {
		overflow-y: auto;
	}
</style>
