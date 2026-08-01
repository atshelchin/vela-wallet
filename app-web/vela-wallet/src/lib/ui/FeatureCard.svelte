<script lang="ts">
	interface Props {
		/** Zero-padded display number, '01'…'06'. */
		number: string;
		title: string;
		description: string;
	}

	let { number, title, description }: Props = $props();
</script>

<article class="card">
	<span class="number">{number}</span>
	<h3 class="title">{title}</h3>
	<p class="description">{description}</p>
</article>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		background: var(--color-bg-raised);
		border-radius: var(--radius-xl);
		padding: var(--space-2xl);
	}

	.number {
		color: var(--color-fg-subtle);
		font-size: var(--text-base);
		font-weight: var(--weight-medium);
	}

	.title {
		margin: 0;
		color: var(--color-fg-base);
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
		line-height: var(--leading-tight);
	}

	.description {
		margin: 0;
		color: var(--color-fg-muted);
		font-size: var(--text-lg);
		line-height: var(--leading-relaxed);
	}
</style>
