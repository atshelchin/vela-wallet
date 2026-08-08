<script lang="ts">
	import type { IconDef } from '../icons';
	import Icon from './Icon.svelte';

	interface Props {
		icon: IconDef;
		title: string;
		caption: string;
	}

	let { icon, title, caption }: Props = $props();
</script>

<div class="empty">
	<span class="circle"><Icon {icon} size="lg" /></span>
	<p class="title">{title}</p>
	<p class="caption">{caption}</p>
</div>

<style>
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: var(--space-md);
		padding-block: var(--space-4xl);
	}

	.circle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--size-emptyStateCircle);
		height: var(--size-emptyStateCircle);
		border-radius: var(--radius-full);
		background: var(--color-bg-sunken);
		color: var(--color-fg-subtle);
		margin-bottom: var(--space-sm);
	}

	p {
		margin: 0;
	}

	.title {
		font-size: calc(var(--text-lg) * var(--text-scale, 1));
		font-weight: var(--weight-semibold);
		color: var(--color-fg-base);
	}

	.caption {
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-muted);
	}
</style>
