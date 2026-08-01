<script lang="ts">
	/** Interim destination for flows outside feature 006's scope. */
	interface Props {
		title: string;
		/** Href back to the locale's Welcome page. */
		backHref: string;
	}

	let { title, backHref }: Props = $props();
</script>

<main class="placeholder">
	<h1 class="title">{title}</h1>
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- generic component; callers pass resolve()d paths -->
	<a class="back" href={backHref}>← Vela Wallet</a>
</main>

<style>
	.placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-2xl);
		min-height: 100dvh;
		padding: var(--layout-screenPaddingX);
		text-align: center;
	}

	.title {
		margin: 0;
		font-size: var(--text-3xl);
		font-weight: var(--weight-semibold);
		color: var(--color-fg-base);
	}

	.back {
		font-size: var(--text-lg);
		color: var(--color-fg-muted);
		text-decoration: none;
	}

	.back:hover {
		opacity: var(--opacity-hover);
	}
</style>
