<script lang="ts">
	import KeyValueRows from './KeyValueRows.svelte';
	import type { KeyValueRow, Tone } from '../model';

	interface Props {
		title?: string;
		rows: KeyValueRow[];
		tone: Tone;
	}

	let { title, rows, tone }: Props = $props();
</script>

<section class="card" data-tone={tone}>
	{#if title}
		<h3>{title}</h3>
	{/if}
	<KeyValueRows {rows} />
</section>

<style>
	.card {
		padding: var(--space-lg) var(--space-xl);
		border: var(--border-hairline) solid var(--color-border-base);
		border-radius: var(--radius-xl);
	}

	[data-tone='danger'] {
		border-color: var(--color-error-base);
		background: var(--color-error-soft);
	}

	h3 {
		margin: 0;
		padding-block: var(--space-md);
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		font-weight: var(--weight-semibold);
		color: var(--color-fg-muted);
	}
</style>
