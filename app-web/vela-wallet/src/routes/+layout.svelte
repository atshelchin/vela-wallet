<script lang="ts">
	import '@fontsource/plus-jakarta-sans/400.css';
	import '@fontsource/plus-jakarta-sans/500.css';
	import '@fontsource/plus-jakarta-sans/600.css';
	import '@fontsource/plus-jakarta-sans/700.css';
	import '@fontsource/noto-sans-sc/400.css';
	import '@fontsource/noto-sans-sc/500.css';
	import '@fontsource/noto-sans-sc/700.css';
	import '@fontsource/ibm-plex-mono/400.css';
	import '@fontsource/ibm-plex-mono/500.css';
	import '$lib/tokens/tokens.css';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import LaunchAnimation from '$lib/launch/LaunchAnimation.svelte';
	import { markPlayed, shouldPlay, type Appearance } from '$lib/launch/constants';

	let { children } = $props();

	// Spec 012. Client-only by construction: `launching` starts false, so the
	// prerendered HTML contains no overlay and the page is complete without it
	// — it can never be the LCP element, and a visitor without scripting sees
	// the normal page (spec Edge Cases).
	let launching = $state(false);
	let pageOpacity = $state(1);
	let appearance = $state<Appearance>('dark');

	onMount(() => {
		// The inline script in app.html already made this decision before paint
		// and recorded it on <html>. Reading it back — rather than re-deciding —
		// is what guarantees the two cannot disagree and leave the page hidden
		// behind an animation that never starts.
		if (document.documentElement.dataset.launch !== 'playing') return;
		if (!shouldPlay()) return;
		markPlayed();
		// The effective appearance the rest of the page already resolves, not the
		// raw OS setting (FR-009): tokens.css keys off `data-theme` first and
		// `prefers-color-scheme` second, so read it the same way round.
		const pinned = document.documentElement.dataset.theme;
		appearance =
			pinned === 'light' || pinned === 'dark'
				? (pinned as Appearance)
				: matchMedia('(prefers-color-scheme: light)').matches
					? 'light'
					: 'dark';
		pageOpacity = 0;
		launching = true;
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<!--
	One continuous surface. The page content and the launch screen sit on this
	exact colour, which is what lets them cross-dissolve without a washed-out
	middle where both are half-transparent over the bare document (FR-012).
-->
<div class="surface">
	<div class="page" data-launch-page style:opacity={pageOpacity}>
		{@render children()}
	</div>

	{#if launching}
		<LaunchAnimation
			{appearance}
			onprogress={(value) => (pageOpacity = value)}
			onfinished={() => {
				pageOpacity = 1;
				launching = false;
				// Release the pre-paint hold, or the CSS rule keeps the page at
				// opacity 0 for the rest of the visit.
				delete document.documentElement.dataset.launch;
			}}
		/>
	{/if}
</div>

<style>
	.surface {
		min-height: 100dvh;
		background: var(--color-bg-base);
	}

	.page {
		/* Driven per-frame by the overlay's dissolve, so no CSS transition here —
		   two animations on one property would fight. */
		min-height: 100dvh;
	}
</style>
