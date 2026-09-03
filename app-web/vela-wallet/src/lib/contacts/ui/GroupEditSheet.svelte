<script lang="ts">
	/**
	 * The new/rename group form (spec 024) — the group sibling of
	 * ContactEditSheet, one named field. Same Penpot-gap flag applies.
	 */
	import BottomSheet from '$lib/wallet/ui/BottomSheet.svelte';
	import NameField from '$lib/ui/onboarding/NameField.svelte';
	import Button from '$lib/ui/Button.svelte';

	interface Copy {
		title: string;
		nameLabel: string;
		namePlaceholder: string;
		save: string;
		cancel: string;
	}

	interface Props {
		copy: Copy;
		initialName?: string;
		onsave: (name: string) => void;
		onclose: () => void;
	}

	let { copy, initialName, onsave, onclose }: Props = $props();

	// Seed by design: the sheet is keyed per open; edits stay local.
	// svelte-ignore state_referenced_locally
	let name = $state(initialName ?? '');
	const canSave = $derived(name.trim() !== '');
</script>

<BottomSheet title={copy.title} closeLabel={copy.cancel} {onclose}>
	<div class="form">
		<NameField
			label={copy.nameLabel}
			placeholder={copy.namePlaceholder}
			value={name}
			oninput={(next) => (name = next)}
		/>
		<div class="actions">
			<Button
				variant="primary"
				shape="rounded"
				disabled={!canSave}
				onclick={() => canSave && onsave(name.trim())}
			>
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

	.actions {
		margin-block-start: var(--space-md);
	}
</style>
