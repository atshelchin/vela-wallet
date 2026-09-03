<script lang="ts">
	import type { ContactModel, LetterSectionModel } from '../model';
	import ContactRow from './ContactRow.svelte';

	interface Props {
		sections: LetterSectionModel[];
		/** Swipe-revealed row, pinned by the c1s fixture. */
		revealed?: { letter: string; index: number };
		swipeActions?: { send: string; delete: string };
		selected?: string;
		onselect?: (contact: ContactModel) => void;
		oncontactmenu?: (contact: ContactModel, event: MouseEvent) => void;
		ondelete?: (contact: ContactModel) => void;
	}

	let { sections, revealed, swipeActions, selected, onselect, oncontactmenu, ondelete }: Props =
		$props();
</script>

<div class="sections">
	{#each sections as section (section.letter)}
		<section id="contacts-section-{section.letter}">
			<h3 class="letter">{section.letter}</h3>
			<ul>
				{#each section.contacts as contact, i (contact.addressFull)}
					<li>
						<ContactRow
							{contact}
							selected={selected === contact.name}
							revealed={revealed?.letter === section.letter && revealed.index === i}
							actions={swipeActions}
							divider={i < section.contacts.length - 1}
							onclick={() => onselect?.(contact)}
							oncontextmenu={(event) => oncontactmenu?.(contact, event)}
							ondelete={() => ondelete?.(contact)}
						/>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</div>

<style>
	.sections {
		display: flex;
		flex-direction: column;
	}

	.letter {
		display: flex;
		align-items: center;
		gap: var(--space-lg);
		margin: 0;
		padding: var(--space-md) var(--space-lg) var(--space-sm);
		font-size: calc(var(--text-sm) * var(--text-scale, 1));
		font-weight: var(--weight-medium);
		color: var(--color-fg-subtle);
	}

	.letter::after {
		content: '';
		flex: 1;
		border-top: var(--border-hairline) solid var(--color-border-base);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
</style>
