<script lang="ts">
	interface Props {
		lines: string[];
		/** "(80 字节)" — the size, when the content is a truncated blob. */
		note?: string;
	}

	let { lines, note }: Props = $props();
</script>

<pre class="code">{lines.join('\n')}{#if note}
		{note}{/if}</pre>

<style>
	.code {
		margin: 0;
		padding: var(--space-xl);
		border-radius: var(--radius-lg);
		background: var(--color-bg-sunken);
		font-family: var(--font-mono);
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		line-height: var(--leading-relaxed);
		color: var(--color-fg-base);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
