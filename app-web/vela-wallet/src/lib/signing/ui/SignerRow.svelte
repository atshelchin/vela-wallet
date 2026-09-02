<script lang="ts">
	interface Props {
		label: string;
		name: string;
		identiconSvg: string;
	}

	let { label, name, identiconSvg }: Props = $props();
</script>

<div class="signer">
	<span class="label">{label}</span>
	<span class="who">
		<!-- Rendered by vela-core; the same artwork the wallet header draws. -->
		<span class="identicon"
			><!-- eslint-disable-next-line svelte/no-at-html-tags -- trusted vela-core output, no user content -->
			{@html identiconSvg}</span
		>
		<span class="name">{name}</span>
	</span>
</div>

<style>
	.signer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-lg);
	}

	.label {
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-muted);
	}

	.who {
		display: flex;
		align-items: center;
		gap: var(--space-md);
	}

	.identicon {
		display: flex;
		width: var(--icon-md);
		height: var(--icon-md);
	}

	.identicon :global(svg) {
		width: 100%;
		height: 100%;
	}

	.name {
		font-size: calc(var(--text-base) * var(--text-scale, 1));
		color: var(--color-fg-base);
	}
</style>
