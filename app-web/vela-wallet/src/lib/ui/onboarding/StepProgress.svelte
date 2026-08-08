<script lang="ts">
	/**
	 * Progress bar (spec 014, contract §5) — the single authority for BOTH
	 * modes: `steps` = 5 equal segments (create), `bar` = one track ~40%
	 * filled (login waiting). Decorative: the visible step caption /
	 * status headline right next to it carries the information.
	 */
	import { CREATE_TOTAL_STEPS, LOGIN_BAR_FRACTION } from './geometry';

	interface Props {
		mode: 'steps' | 'bar';
		/** steps mode: 1-based filled count. */
		step?: number;
		/** steps mode: total segments. */
		total?: number;
		/** bar mode: 0..1 fill. */
		fraction?: number;
	}

	let {
		mode,
		step = 1,
		total = CREATE_TOTAL_STEPS,
		fraction = LOGIN_BAR_FRACTION
	}: Props = $props();
</script>

{#if mode === 'steps'}
	<div class="steps" aria-hidden="true">
		{#each { length: total }, i (i)}
			<span class="segment" class:filled={i < step}></span>
		{/each}
	</div>
{:else}
	<div class="track" aria-hidden="true">
		<span class="fill" style:width="{fraction * 100}%"></span>
	</div>
{/if}

<style>
	.steps {
		display: flex;
		gap: var(--space-sm);
		width: 100%;
	}

	.segment {
		flex: 1;
		height: var(--space-sm);
		border-radius: var(--radius-full);
		background: var(--color-border-base);
	}

	.segment.filled {
		background: var(--color-accent-base);
	}

	.track {
		width: 100%;
		height: var(--space-sm);
		border-radius: var(--radius-full);
		background: var(--color-border-base);
		overflow: hidden;
	}

	.fill {
		display: block;
		height: 100%;
		border-radius: var(--radius-full);
		background: var(--color-accent-base);
	}
</style>
