<script lang="ts">
	/**
	 * A ——●—— A. A range input under a row of tick dots, with the two glyph
	 * ends sized to what they promise. Native `input[type=range]` so keyboard
	 * and screen-reader behaviour come free.
	 */
	import type { TextScaleModel } from '../model';

	interface Props {
		model: TextScaleModel;
		onchange?: (index: number) => void;
	}

	let { model, onchange }: Props = $props();

	const ticks = $derived(Array.from({ length: model.steps }, (_, i) => i));
</script>

<div class="scale">
	<span class="glyph small" aria-hidden="true">A</span>
	<div class="track">
		<div class="ticks" aria-hidden="true">
			{#each ticks as tick (tick)}<span class="tick"></span>{/each}
		</div>
		<input
			type="range"
			min="0"
			max={model.steps - 1}
			step="1"
			value={model.index}
			aria-label={model.label}
			oninput={(event) => onchange?.(Number(event.currentTarget.value))}
		/>
	</div>
	<span class="glyph large" aria-hidden="true">A</span>
</div>

<style>
	.scale {
		display: flex;
		align-items: center;
		gap: var(--space-lg);
		padding-block: var(--space-lg);
	}

	.glyph {
		color: var(--color-fg-base);
		font-weight: var(--weight-bold);
		flex-shrink: 0;
	}

	.small {
		font-size: var(--text-base);
	}

	.large {
		font-size: var(--text-2xl);
	}

	.track {
		position: relative;
		flex: 1;
		display: flex;
		align-items: center;
		min-height: var(--size-hitTarget);
	}

	.ticks {
		position: absolute;
		inset-inline: 0;
		display: flex;
		justify-content: space-between;
		pointer-events: none;
	}

	.tick {
		width: var(--space-sm);
		height: var(--space-sm);
		border-radius: var(--radius-full);
		background: var(--color-border-strong);
	}

	input {
		width: 100%;
		margin: 0;
		background: none;
		appearance: none;
		cursor: pointer;
	}

	input::-webkit-slider-runnable-track {
		height: var(--space-sm);
		background: none;
	}

	input::-moz-range-track {
		height: var(--space-sm);
		background: none;
	}

	input::-webkit-slider-thumb {
		appearance: none;
		width: var(--icon-lg);
		height: var(--icon-lg);
		margin-block-start: calc(-1 * var(--space-md));
		border: none;
		border-radius: var(--radius-full);
		background: var(--color-fg-muted);
		box-shadow: var(--shadow-md);
	}

	input::-moz-range-thumb {
		width: var(--icon-lg);
		height: var(--icon-lg);
		border: none;
		border-radius: var(--radius-full);
		background: var(--color-fg-muted);
		box-shadow: var(--shadow-md);
	}
</style>
