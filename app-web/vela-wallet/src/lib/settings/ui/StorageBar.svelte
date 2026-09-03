<script lang="ts">
	/**
	 * ST13 / DST7's one-line accounting: a stacked bar plus a legend. The
	 * segments are shares, not pixels, so the bar tells the truth at any width.
	 */
	import type { StorageSegmentModel } from '../model';

	interface Props {
		segments: StorageSegmentModel[];
		/** Legend under the bar; the desktop mock drops it. */
		legend?: boolean;
	}

	let { segments, legend = true }: Props = $props();
</script>

<div class="bar" role="presentation">
	{#each segments as segment (segment.id)}
		<span style:flex={segment.fraction} style:background={segment.color}></span>
	{/each}
</div>

{#if legend}
	<ul class="legend">
		{#each segments as segment (segment.id)}
			<li>
				<span class="dot" style:background={segment.color}></span>
				{segment.label}
			</li>
		{/each}
	</ul>
{/if}

<style>
	.bar {
		display: flex;
		height: var(--space-md);
		border-radius: var(--radius-sm);
		overflow: hidden;
		background: var(--color-bg-sunken);
	}

	.legend {
		list-style: none;
		display: flex;
		gap: var(--space-xl);
		margin: var(--space-md) 0 0;
		padding: 0;
	}

	.legend li {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		font-size: calc(var(--text-sm) * var(--text-scale, 1));
		color: var(--color-fg-subtle);
	}

	.dot {
		width: var(--space-md);
		height: var(--space-md);
		border-radius: var(--radius-full);
	}
</style>
