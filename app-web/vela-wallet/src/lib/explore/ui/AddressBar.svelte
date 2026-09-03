<script lang="ts">
	import Icon from '$lib/wallet/ui/Icon.svelte';
	import { UTILITY_ICONS } from '$lib/wallet/icons';

	/**
	 * The browsing top bar (E4): close, the domain in a pill with its padlock,
	 * and the site menu. The pill shows the DOMAIN, never the full URL — the
	 * part of an address that decides who you are talking to is the part that
	 * must not be pushed off the end by a long path.
	 */
	interface Props {
		host: string;
		secure: boolean;
		secureLabel: string;
		closeLabel: string;
		menuLabel: string;
		onclose?: () => void;
		onmenu?: () => void;
	}

	let { host, secure, secureLabel, closeLabel, menuLabel, onclose, onmenu }: Props = $props();
</script>

<header class="bar">
	<button type="button" class="icon" aria-label={closeLabel} onclick={onclose}>
		<Icon icon={UTILITY_ICONS.x} size="lg" />
	</button>
	<span class="pill">
		{#if secure}
			<Icon icon={UTILITY_ICONS.lock} size="xs" label={secureLabel} />
		{/if}
		<span class="host">{host}</span>
	</span>
	<button type="button" class="icon" aria-label={menuLabel} onclick={onmenu}>
		<Icon icon={UTILITY_ICONS.ellipsis} size="lg" />
	</button>
</header>

<style>
	.bar {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-md) var(--space-lg);
		background: var(--color-bg-base);
	}

	.pill {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-md);
		flex: 1;
		min-width: 0;
		height: var(--size-addressPill);
		padding-inline: var(--space-xl);
		border-radius: var(--radius-full);
		background: var(--color-bg-raised);
		color: var(--color-fg-muted);
	}

	.host {
		font-size: calc(var(--text-lg) * var(--text-scale, 1));
		color: var(--color-fg-base);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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

	.icon:active {
		transform: scale(var(--motion-press-button));
	}
</style>
