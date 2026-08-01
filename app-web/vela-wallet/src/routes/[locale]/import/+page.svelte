<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	import PlaceholderPage from '$lib/ui/PlaceholderPage.svelte';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>{data.messages.alreadyHaveWallet}</title></svelte:head>

<PlaceholderPage
	title={data.messages.alreadyHaveWallet}
	backHref={resolve('/[locale]', { locale: data.locale })}
/>
