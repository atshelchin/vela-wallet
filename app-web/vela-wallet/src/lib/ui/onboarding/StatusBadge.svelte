<script lang="ts">
	/**
	 * Outcome status badge — 6 variants (spec 014, data-model §3).
	 * Circle = --size-emptyStateCircle, tint = variant soft bg + base glyph.
	 * Decorative: the outcome headline right below carries the meaning.
	 */
	import type { BadgeVariant } from '$lib/onboarding/states';

	interface Props {
		variant: BadgeVariant;
	}

	let { variant }: Props = $props();
</script>

<span class="badge {variant}" aria-hidden="true">
	{#if variant === 'success'}
		<svg class="glyph" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>
	{:else if variant === 'error'}
		<svg class="glyph" viewBox="0 0 24 24"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
	{:else if variant === 'timeout'}
		<svg class="glyph" viewBox="0 0 24 24">
			<circle cx="12" cy="12" r="9" />
			<path d="M12 7v5l3 2" />
		</svg>
	{:else}
		<!-- warning / neutral / info share the ! glyph; the tint differs. -->
		<svg class="glyph" viewBox="0 0 24 24">
			<path d="M12 5v9" />
			<path d="M12 18.5h.01" />
		</svg>
	{/if}
</span>

<style>
	.badge {
		display: grid;
		place-items: center;
		width: var(--size-emptyStateCircle);
		height: var(--size-emptyStateCircle);
		border-radius: var(--radius-full);
	}

	.glyph {
		width: var(--icon-xl);
		height: var(--icon-xl);
		fill: none;
		stroke: currentColor;
		stroke-width: var(--icon-stroke-bold);
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.success {
		background: var(--color-success-soft);
		color: var(--color-success-base);
	}

	.warning,
	.timeout {
		background: var(--color-warning-soft);
		color: var(--color-warning-base);
	}

	.error {
		background: var(--color-error-soft);
		color: var(--color-error-base);
	}

	.info {
		background: var(--color-info-soft);
		color: var(--color-info-base);
	}

	.neutral {
		background: var(--color-bg-sunken);
		border: var(--border-hairline) solid var(--color-border-base);
		color: var(--color-fg-base);
	}
</style>
