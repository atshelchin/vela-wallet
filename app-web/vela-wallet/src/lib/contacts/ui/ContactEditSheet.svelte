<script lang="ts">
	/**
	 * The add/edit contact form (spec 024). The 018 boards drew the book's
	 * states but never a form — this composes existing primitives (BottomSheet
	 * + NameField) into the smallest one that honours the corpus's own
	 * vocabulary (addTitle / nameLabel / addressPlaceholder / invalidAddress).
	 * Flagged in the delivery report as a Penpot catalog gap to backfill.
	 *
	 * The address-shape gate is a FORM gate, matching the Expo form and the
	 * core's own `is_address` predicate (42-char 0x-hex); the core's save API
	 * merges whatever it is given, so the form is where garbage stops
	 * (deviation record, spec US2/AS4).
	 */
	import BottomSheet from '$lib/wallet/ui/BottomSheet.svelte';
	import NameField from '$lib/ui/onboarding/NameField.svelte';
	import Button from '$lib/ui/Button.svelte';

	interface Copy {
		title: string;
		nameLabel: string;
		namePlaceholder: string;
		addressLabel: string;
		addressPlaceholder: string;
		save: string;
		cancel: string;
		invalidAddress: string;
	}

	interface Props {
		copy: Copy;
		/** Present when editing — the address is identity and stays fixed. */
		initial?: { name: string; address: string };
		onsave: (draft: { name: string; address: string }) => void;
		onclose: () => void;
	}

	let { copy, initial, onsave, onclose }: Props = $props();

	// Seeds by design: the sheet is keyed per open; edits stay local.
	// svelte-ignore state_referenced_locally
	let name = $state(initial?.name ?? '');
	// svelte-ignore state_referenced_locally
	let address = $state(initial?.address ?? '');
	let touched = $state(false);

	// svelte-ignore state_referenced_locally
	const editing = initial !== undefined;
	/** The core's `is_address` shape: 0x + 40 hex. */
	const validAddress = $derived(/^0x[0-9a-fA-F]{40}$/.test(address.trim()));
	const canSave = $derived(validAddress && name.trim() !== '');

	function save() {
		touched = true;
		if (!canSave) return;
		onsave({ name: name.trim(), address: address.trim() });
	}
</script>

<BottomSheet title={copy.title} closeLabel={copy.cancel} {onclose}>
	<div class="form">
		<NameField
			label={copy.nameLabel}
			placeholder={copy.namePlaceholder}
			value={name}
			oninput={(next) => (name = next)}
		/>
		{#if editing}
			<div class="fixed-address">
				<span class="label">{copy.addressLabel}</span>
				<span class="value">{address}</span>
			</div>
		{:else}
			<NameField
				label={copy.addressLabel}
				placeholder={copy.addressPlaceholder}
				value={address}
				errorText={touched && !validAddress ? copy.invalidAddress : undefined}
				oninput={(next) => {
					address = next;
					touched = true;
				}}
			/>
		{/if}
		<div class="actions">
			<Button variant="primary" shape="rounded" disabled={!canSave} onclick={save}>
				{copy.save}
			</Button>
		</div>
	</div>
</BottomSheet>

<style>
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-xl);
		padding-block-end: var(--space-xl);
	}

	.fixed-address {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	.fixed-address .label {
		color: var(--color-fg-muted);
		font-size: var(--text-sm);
	}

	.fixed-address .value {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--color-fg-base);
		word-break: break-all;
	}

	.actions {
		margin-block-start: var(--space-md);
	}
</style>
