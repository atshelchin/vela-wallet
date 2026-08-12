<script lang="ts">
	import type { MenuModel } from '../model';
	import DropdownMenu from './DropdownMenu.svelte';

	/**
	 * Right-click menu (M2 / DC6). Same visual family as DropdownMenu — it *is*
	 * DropdownMenu, re-anchored: at the cursor when a contextmenu event supplied
	 * coordinates, otherwise under the row it belongs to (the fixture states,
	 * which have no pointer).
	 */
	interface Props {
		menu: MenuModel;
		at?: { x: number; y: number };
		/** Gallery component boards render the card in normal flow. */
		inline?: boolean;
		onselect?: (label: string) => void;
		onclose?: () => void;
	}

	let { menu, at, inline = false, onselect, onclose }: Props = $props();
</script>

<DropdownMenu {menu} {at} {inline} align="start" {onselect} {onclose} />
