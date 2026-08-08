<script lang="ts">
	/**
	 * Bottom-sheet overlay for web below the desktop breakpoint (spec 014,
	 * contract §3).
	 * Backdrop --color-fixed-backdrop, panel --color-bg-raised, top radius
	 * --radius-xl, enter/exit --motion-sheet-in/out, focus-trapped, aria-modal.
	 * Content hugs its own height per state (spec edge case).
	 */
	import type { Snippet } from 'svelte';

	interface Props {
		/** Accessible name for the dialog (resolved string). */
		label: string;
		/** Called after the exit animation completes (or immediately on unmount). */
		onClose: () => void;
		children: Snippet;
	}

	let { label, onClose, children }: Props = $props();

	let closing = $state(false);
	let panel = $state<HTMLElement | null>(null);
	let restoreFocus: HTMLElement | null = null;

	/** Play the exit animation, then fire onClose (bindable from the host). */
	export function requestClose() {
		closing = true;
	}

	$effect(() => {
		restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		panel?.focus();
		return () => restoreFocus?.focus();
	});

	function focusables(): HTMLElement[] {
		if (!panel) return [];
		return Array.from(
			panel.querySelectorAll<HTMLElement>(
				'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
			)
		);
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			requestClose();
			return;
		}
		if (event.key !== 'Tab') return;
		const items = focusables();
		if (items.length === 0) {
			event.preventDefault();
			panel?.focus();
			return;
		}
		const first = items[0];
		const last = items[items.length - 1];
		const active = document.activeElement;
		if (event.shiftKey && (active === first || active === panel)) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && active === last) {
			event.preventDefault();
			first.focus();
		}
	}

	function onPanelAnimationEnd(event: AnimationEvent) {
		if (closing && event.target === event.currentTarget) onClose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="overlay" class:closing>
	<button class="backdrop" type="button" tabindex="-1" aria-hidden="true" onclick={requestClose}
	></button>
	<div
		class="panel"
		role="dialog"
		aria-modal="true"
		aria-label={label}
		tabindex="-1"
		bind:this={panel}
		onanimationend={onPanelAnimationEnd}
	>
		{@render children()}
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 1;
		display: flex;
		align-items: flex-end;
		justify-content: center;
	}

	.backdrop {
		position: absolute;
		inset: 0;
		border: none;
		padding: 0;
		background: var(--color-fixed-backdrop);
		animation: backdrop-in var(--motion-sheet-in) ease-out both;
	}

	.closing .backdrop {
		animation: backdrop-out var(--motion-sheet-out) ease-in both;
	}

	.panel {
		position: relative;
		width: 100%;
		max-height: calc(100dvh - var(--space-5xl));
		overflow-y: auto;
		background: var(--color-bg-raised);
		border-start-start-radius: var(--radius-xl);
		border-start-end-radius: var(--radius-xl);
		animation: sheet-in var(--motion-sheet-in) ease-out both;
	}

	.closing .panel {
		animation: sheet-out var(--motion-sheet-out) ease-in both;
	}

	@keyframes sheet-in {
		from {
			transform: translateY(100%);
		}
		to {
			transform: translateY(0);
		}
	}

	@keyframes sheet-out {
		from {
			transform: translateY(0);
		}
		to {
			transform: translateY(100%);
		}
	}

	@keyframes backdrop-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes backdrop-out {
		from {
			opacity: 1;
		}
		to {
			opacity: 0;
		}
	}
</style>
