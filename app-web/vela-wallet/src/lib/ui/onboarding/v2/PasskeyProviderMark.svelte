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
	import { browser } from '$app/environment';
	import { isDarkTheme } from '$lib/theme.svelte';
	import {
		passkeyFallbackIconDataUri,
		passkeyProviderIconDataUri
	} from '$lib/onboarding/core/wasm-client';
	import type { CreateKeyRow } from '$lib/onboarding/generated/CreateKeyRow';
	import { directoryEntry } from '$lib/onboarding/core/passkey-directory.svelte';

	interface Props {
		/** The row this mark stands for; everything comes off it. */
		key: CreateKeyRow;
		/** The mark's accessible label. */
		label: string;
		/**
		 * Draw the method's shape glyph when there is no artwork at all — a
		 * platform authenticator the catalog cannot name. The key list wants a
		 * filled slot (proportion is its signal: a wide laptop, a tall phone);
		 * the done card wants nothing rather than a placeholder.
		 */
		glyphFallback?: boolean;
	}

	let { key, label, glyphFallback = false }: Props = $props();

	/**
	 * The fallback artwork's three slots, read off the live cascade rather than
	 * hard-coded: it ships in one theme, and one vendor's greys are not this
	 * app's greys in either. Resolved once — these tokens do not change while a
	 * key list is on screen.
	 */
	const token = (name: string) =>
		browser ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : '';
	const strong = $derived(token('--color-fg-muted'));
	const soft = $derived(token('--color-border-strong'));
	const hole = $derived(token('--color-bg-base'));

	const dark = $derived(isDarkTheme());

	/**
	 * Three sources, in order: the provider's own mark from the compiled
	 * catalog; the directory service's mark for a model no catalog carries
	 * (hardware keys); and the security-key artwork when neither can name it but
	 * the authenticator at least said what KIND it is. A platform authenticator
	 * nobody can name gets none of them, and the row keeps its shape glyph.
	 */
	const uri = $derived.by(() => {
		// Nothing to draw before hydration: the artwork comes from the wasm core,
		// which only exists in the browser, and these screens only render there.
		if (!browser) return undefined;
		const provider = key.aaguid ? passkeyProviderIconDataUri(key.aaguid, dark) : undefined;
		if (provider) return provider;
		const listed = directoryEntry(key.aaguid, dark);
		if (listed?.iconUrl) return listed.iconUrl;
		return passkeyFallbackIconDataUri(
			key.authenticator_attachment,
			key.transports,
			key.method === 'security_key',
			strong,
			soft,
			hole
		);
	});
</script>

{#if uri}
	<img class="mark" src={uri} alt={label} />
{:else if glyphFallback}
	<span
		class="glyph"
		class:tall={key.method === 'hybrid'}
		class:squat={key.method === 'security_key'}
		aria-hidden="true"
	></span>
{/if}

<style>
	.mark {
		flex: 0 0 var(--icon-xl);
		width: var(--icon-xl);
		height: var(--icon-xl);
		border-radius: var(--radius-sm);
		object-fit: contain;
	}

	/*
	 * The last resort, moved here from the key list so one component owns the
	 * whole question of what a row's leading slot shows.
	 *
	 * Proportion is the whole signal: a wide laptop, a tall phone, a squat key.
	 * A person picks the row that looks like the thing in their hand, so the
	 * three must not read as one rounded box — which is what they did when they
	 * shared a height.
	 */
	.glyph {
		flex: 0 0 var(--icon-xl);
		width: var(--icon-xl);
		height: var(--icon-sm);
		border: var(--border-emphasis) solid var(--color-fg-muted);
		border-radius: var(--radius-sm);
	}

	.tall {
		flex-basis: var(--icon-sm);
		width: var(--icon-sm);
		height: var(--icon-xl);
	}

	.squat {
		height: var(--icon-xs);
		border-radius: var(--radius-full);
	}
</style>
