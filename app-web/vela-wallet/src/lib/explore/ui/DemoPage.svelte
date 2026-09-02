<script lang="ts">
	import type { DemoPageModel } from '../model';

	/**
	 * A stand-in for whatever site is open (spec 022 §2). It is deliberately
	 * NOT chrome: its words and its pink button belong to the site, so nothing
	 * here is translated and nothing here uses a Vela token. A real WebView
	 * replaces this component and nothing else.
	 */
	interface Props {
		page: DemoPageModel;
		onaction?: () => void;
	}

	let { page, onaction }: Props = $props();
</script>

<div class="page">
	<div class="card">
		<p class="title">{page.title}</p>
		{#each page.fields as field, i (i)}
			<div class="field">
				<span class="value">{field.value}</span>
				<span class="symbol">{field.symbol}</span>
			</div>
		{/each}
		<button type="button" style:background={page.ctaTint} onclick={onaction}>{page.cta}</button>
	</div>
	<span class="skeleton wide"></span>
	<span class="skeleton"></span>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-lg);
		min-height: 100%;
		padding: var(--space-4xl) var(--space-3xl);
		background: #f0efec;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
		width: 100%;
		max-width: 320px;
		padding: var(--space-2xl);
		border-radius: var(--radius-2xl);
		background: #ffffff;
	}

	.title {
		margin: 0;
		font-family: var(--font-ui);
		font-size: 15px;
		font-weight: 600;
		color: #1a1a18;
	}

	.field {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		padding: var(--space-xl);
		border-radius: var(--radius-lg);
		background: #f5f3ef;
	}

	.value {
		font-family: var(--font-numeric);
		font-size: 22px;
		color: #1a1a18;
	}

	.symbol {
		font-family: var(--font-ui);
		font-size: 13px;
		color: #8c887e;
	}

	button {
		height: 48px;
		border: none;
		border-radius: var(--radius-full);
		font-family: var(--font-ui);
		font-size: 15px;
		font-weight: 600;
		color: #ffffff;
		cursor: pointer;
	}

	.skeleton {
		height: 10px;
		width: 60%;
		border-radius: var(--radius-full);
		background: #ffffff;
	}

	.wide {
		width: 80%;
	}
</style>
