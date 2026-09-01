<script lang="ts">
	/**
	 * T4's guidance card (spec 021 component 21): the CTA on top, then the
	 * question a person with an empty asset list is actually asking — "it
	 * arrived, so why can't I see it?" — and its answer.
	 *
	 * The question is set as a heading rather than as body copy because it is
	 * the part someone scanning the screen needs to recognise as theirs.
	 */
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		body: string;
		/** The card's own call to action, above the text. */
		cta?: Snippet;
	}

	let { title, body, cta }: Props = $props();
</script>

<section class="card">
	{#if cta}
		<div class="cta">{@render cta()}</div>
	{/if}
	<h3>{title}</h3>
	<p>{body}</p>
</section>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		padding: var(--space-lg);
		border: var(--border-hairline) solid var(--color-border-base);
		border-radius: var(--radius-xl);
	}

	.cta {
		padding-bottom: var(--space-md);
	}

	h3 {
		margin: 0;
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		font-weight: var(--weight-semibold);
		color: var(--color-fg-base);
	}

	p {
		margin: 0;
		font-size: calc(var(--text-sm) * var(--text-scale, 1));
		line-height: var(--leading-relaxed);
		color: var(--color-fg-muted);
	}
</style>
