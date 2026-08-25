<script lang="ts">
	/**
	 * The mark of the vault holding a passkey — Apple Passwords, 1Password,
	 * Windows Hello — resolved from the key's AAGUID by the core.
	 *
	 * Renders nothing when the catalog has no entry, which is a normal answer:
	 * hardware keys live in the FIDO metadata service, and an authenticator may
	 * report no AAGUID at all. The row keeps the shape glyph it always drew.
	 *
	 * An image element, not inline markup: these marks carry embedded CSS with
	 * generic class names (`.cls-1`) and `clipPath` ids, and several of them
	 * inlined into one document would fight over both — the same collision that
	 * once turned this app's identicons square. (Written without the literal
	 * tag names: svelte2tsx scans this block for them and would call the
	 * script unclosed.)
	 */
	import { MediaQuery } from 'svelte/reactivity';
	import { browser } from '$app/environment';
	import { passkeyProviderIconDataUri } from '$lib/onboarding/core/wasm-client';

	interface Props {
		aaguid: string;
		/** The provider's name — the mark's accessible label. */
		name: string;
	}

	let { aaguid, name }: Props = $props();

	// The effective appearance, resolved the way `tokens.css` resolves it: a
	// pinned `data-theme` first, the OS preference second (spec 012 FR-009).
	const light = new MediaQuery('(prefers-color-scheme: light)', false);
	const dark = $derived.by(() => {
		const pinned = browser ? document.documentElement.dataset.theme : undefined;
		if (pinned === 'dark') return true;
		if (pinned === 'light') return false;
		return !light.current;
	});

	const uri = $derived(aaguid ? passkeyProviderIconDataUri(aaguid, dark) : undefined);
</script>

{#if uri}
	<img class="mark" src={uri} alt={name} />
{/if}

<style>
	.mark {
		flex: 0 0 var(--icon-xl);
		width: var(--icon-xl);
		height: var(--icon-xl);
		border-radius: var(--radius-sm);
		object-fit: contain;
	}
</style>
