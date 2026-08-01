<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	import PlaceholderPage from '$lib/ui/PlaceholderPage.svelte';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>{data.messages.createWallet}</title></svelte:head>

<PlaceholderPage
	title={data.messages.createWallet}
	backHref={resolve('/[locale]', { locale: data.locale })}
/>
