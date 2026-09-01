<script lang="ts">
	/**
	 * The small status pill (spec 021 component 23): A2's 已确认, T3's 已添加,
	 * T3b's 兼容 / 不兼容.
	 *
	 * Four tones off the semantic colour pairs, so a chip never invents a
	 * colour — and never uses the accent, which in this product means "this
	 * moves money", not "this is fine".
	 */
	import type { StatusChipModel } from '../model';

	interface Props {
		chip: StatusChipModel;
	}

	let { chip }: Props = $props();
</script>

<span class="chip {chip.tone}">{chip.text}</span>

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		padding: var(--space-xs) var(--space-md);
		border-radius: var(--radius-full);
		font-size: calc(var(--text-xs) * var(--text-scale, 1));
		font-weight: var(--weight-semibold);
		white-space: nowrap;
	}

	.success {
		background: var(--color-success-soft);
		color: var(--color-success-base);
	}

	.warning {
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
</style>
