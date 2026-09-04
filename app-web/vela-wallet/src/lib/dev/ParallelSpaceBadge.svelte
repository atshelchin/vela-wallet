<script lang="ts">
	/**
	 * The persistent "PARALLEL SPACE" marker.
	 *
	 * Ported from src/components/dev/ParallelSpaceBadge.tsx @ f9bcb278. It
	 * renders whenever the mode is active — unconditionally, never behind a
	 * build flag. That is the fix for an audited P0: a runtime-unlocked build
	 * showed the fixture wallet with no badge, i.e. a test wallet wearing the
	 * real one's face (docs/project-takeover/04-production-readiness.md).
	 *
	 * Its colours are deliberately NOT design tokens: the badge must read as
	 * foreign to the product, and a token would make it look like chrome.
	 * Whitelisted in the literal audit for exactly that reason.
	 */
	import { parallelActive } from './parallel-flag.svelte';

	interface Props {
		/** Tapping the badge opens the parallel-space screen. The layout owns
		 *  the route (and its resolution); the badge only reports the tap. */
		onopen: () => void;
	}

	let { onopen }: Props = $props();
</script>

{#if parallelActive()}
	<button type="button" class="badge" onclick={onopen} data-testid="parallel-space-badge">
		<span class="title">PARALLEL SPACE</span>
		<span class="sub">fixture passkey · test wallet</span>
	</button>
{/if}

<style>
	.badge {
		position: fixed;
		top: 0;
		left: 50%;
		transform: translateX(-50%);
		z-index: 9999;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.1rem;
		padding: 0.25rem 0.75rem 0.3rem;
		border-bottom-left-radius: 0.5rem;
		border-bottom-right-radius: 0.5rem;
		background: #7c3aed;
		color: #ffffff;
		border: none;
		cursor: pointer;
		font-size: 0.625rem;
		line-height: 1.1;
		letter-spacing: 0.08em;
	}

	.title {
		font-weight: 700;
	}

	.sub {
		opacity: 0.85;
		letter-spacing: 0.02em;
	}
</style>
