<script lang="ts">
	import Icon from '$lib/wallet/ui/Icon.svelte';
	import { UTILITY_ICONS } from '$lib/wallet/icons';
	import type { BrowserModel } from '../model';
	import type { ExploreMessages } from '../messages';

	/**
	 * The browsing bottom bar (E4), which REPLACES the four-tab bar while a
	 * page is open: back, forward, the account chip whose green dot is the
	 * connection state, the bookmark star, and the tab count.
	 */
	interface Props {
		browser: BrowserModel;
		copy: ExploreMessages;
		onback?: () => void;
		onforward?: () => void;
		onaccount?: () => void;
		onbookmark?: () => void;
		ontabs?: () => void;
	}

	let { browser, copy, onback, onforward, onaccount, onbookmark, ontabs }: Props = $props();
</script>

<nav class="toolbar">
	<button
		type="button"
		class="icon"
		aria-label={copy.back}
		disabled={!browser.canBack}
		onclick={onback}
	>
		<Icon icon={UTILITY_ICONS['arrow-left']} size="lg" />
	</button>
	<button
		type="button"
		class="icon"
		aria-label={copy.forward}
		disabled={!browser.canForward}
		onclick={onforward}
	>
		<Icon icon={UTILITY_ICONS['arrow-right']} size="lg" />
	</button>

	<button type="button" class="account" aria-label={copy.account} onclick={onaccount}>
		<span class="identicon"
			><!-- eslint-disable-next-line svelte/no-at-html-tags -- trusted vela-core output, no user content -->
			{@html browser.account.identiconSvg}</span
		>
		{#if browser.connected}
			<span class="dot" aria-label={copy.connectedTag}></span>
		{/if}
	</button>

	<button type="button" class="icon" aria-label={copy.addToFavorites} onclick={onbookmark}>
		<Icon icon={UTILITY_ICONS[browser.bookmarked ? 'star-filled' : 'star']} size="lg" />
	</button>
	<button type="button" class="icon count" aria-label={copy.tabs} onclick={ontabs}>
		<span class="box">{browser.tabCount}</span>
	</button>
</nav>

<style>
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: var(--size-browserBar);
		padding-inline: var(--space-xl);
		border-top: var(--border-hairline) solid var(--color-border-base);
		background: var(--color-bg-base);
	}

	.icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--size-hitTarget);
		height: var(--size-hitTarget);
		border: none;
		background: none;
		color: var(--color-fg-base);
		cursor: pointer;
	}

	.icon:disabled {
		color: var(--color-fg-subtle);
		opacity: var(--opacity-disabled);
		cursor: default;
	}

	.icon:active:not(:disabled) {
		transform: scale(var(--motion-press-button));
	}

	.account {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		height: var(--space-4xl);
		padding-inline: var(--space-md);
		border: none;
		border-radius: var(--radius-full);
		background: var(--color-bg-raised);
		cursor: pointer;
	}

	.identicon {
		display: flex;
		width: var(--icon-base);
		height: var(--icon-base);
	}

	.identicon :global(svg) {
		width: 100%;
		height: 100%;
	}

	/* The connection state, as one green dot. It is the only thing in this bar
	   that says a site can see your address. */
	.dot {
		width: var(--space-md);
		height: var(--space-md);
		border-radius: var(--radius-full);
		background: var(--color-success-base);
	}

	.box {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: var(--size-tabCount);
		height: var(--size-tabCount);
		padding-inline: var(--space-sm);
		border: var(--border-emphasis) solid var(--color-fg-base);
		border-radius: var(--radius-sm);
		font-size: calc(var(--text-sm) * var(--text-scale, 1));
		font-weight: var(--weight-semibold);
	}
</style>
