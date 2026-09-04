<script lang="ts">
	/**
	 * The window a dApp's request is answered in (spec 027 T322).
	 *
	 * A dedicated window, not the action popup and not an in-page sheet: the
	 * popup would be dismissed the moment the passkey prompt takes focus (D34),
	 * and a sheet drawn in the page could be styled, covered or scrolled by the
	 * very site asking for the signature.
	 *
	 * What this window does in Phase 3 is deliberately small and complete: it
	 * shows WHO is asking — the browser's own fact about the origin, never the
	 * page's claim — and it can refuse. Granting is `dapp_permissions`' ruling
	 * (Phase 4) and signing is 026's sheet (Phase 5); neither is faked here.
	 *
	 * Closing the window is itself a refusal: the background answers 4001 when
	 * it goes away without a decision, so there is no way to leave a dApp
	 * waiting forever.
	 */
	import { onMount } from 'svelte';
	import { hostLabel } from '$lib/dapp/host';
	import { readRequest, rejectRequest, type ExtensionRequest } from '$lib/dapp/transport';

	let { data } = $props();
	const m = $derived(data.requestMessages);

	let request = $state<ExtensionRequest | null>(null);
	let settled = $state(false);
	let rid = $state('');

	onMount(async () => {
		rid = new URLSearchParams(location.search).get('rid') ?? '';
		request = await readRequest(rid);
	});

	async function refuse(): Promise<void> {
		settled = true;
		await rejectRequest(rid);
		// The background closes this window when it settles the request; closing
		// here too covers the case where it could not be reached.
		window.close();
	}
</script>

<svelte:head><title>Vela</title></svelte:head>

<main>
	{#if request}
		<h1>{m.title.replace('{{host}}', hostLabel(request.origin))}</h1>
		<p class="body">{m.body}</p>
		<p class="method">{request.method}</p>
		<button type="button" onclick={refuse} disabled={settled}>{m.cancel}</button>
	{:else}
		<p class="body">{m.preparing}</p>
	{/if}
</main>

<style>
	main {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-6);
		min-height: 100vh;
		background: var(--color-bg-base);
		color: var(--color-text-primary);
	}
	h1 {
		font-size: var(--font-size-title-3);
		font-weight: var(--font-weight-semibold);
		margin: 0;
	}
	.body {
		font-size: var(--font-size-body);
		color: var(--color-text-secondary);
		margin: 0;
	}
	.method {
		font-family: var(--font-family-mono);
		font-size: var(--font-size-caption);
		color: var(--color-text-tertiary);
		margin: 0;
	}
	button {
		margin-top: auto;
		padding: var(--space-4);
		border: var(--border-width-hairline) solid var(--color-border-subtle);
		border-radius: var(--radius-md);
		background: var(--color-bg-elevated);
		color: var(--color-text-primary);
		font-size: var(--font-size-body);
		cursor: pointer;
	}
</style>
