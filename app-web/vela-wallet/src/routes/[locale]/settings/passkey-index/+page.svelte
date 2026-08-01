<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	import PlaceholderPage from '$lib/ui/PlaceholderPage.svelte';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>{data.messages.passkeyIndexLink}</title></svelte:head>

<PlaceholderPage
	title={data.messages.passkeyIndexLink}
	backHref={resolve('/[locale]', { locale: data.locale })}
/>
