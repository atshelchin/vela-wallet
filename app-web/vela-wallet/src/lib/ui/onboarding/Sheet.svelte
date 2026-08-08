<script lang="ts">
	/**
	 * Bottom-sheet overlay for web below the desktop breakpoint (spec 014,
	 * contract §3).
	 * Backdrop --color-fixed-backdrop, panel --color-bg-raised, top radius
	 * --radius-xl, enter/exit --motion-sheet-in/out, focus-trapped, aria-modal.
	 * Content hugs its own height per state (spec edge case).
	 *
	 * Drag-to-dismiss: the panel follows a downward pointer drag 1:1 (native
	 * sheet feel); release past 1/3 of the panel height OR a downward flick
	 * closes, anything else springs back. While a drag is engaged the entry
	 * keyframes are detached (their `both` fill would override the inline
	 * transform) and the backdrop dims proportionally. Sheets whose content
	 * scrolls keep native panning and dismiss via ×/Esc/backdrop only.
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
	/** True once a drag has engaged this session: entry keyframes stay detached. */
	let dragTouched = $state(false);
	/** True only while the pointer is actively driving the panel. */
	let dragging = $state(false);
	/** Backdrop dim level while drag-driven (1 = fully dimmed). */
	let backdropDim = $state(1);
	let restoreFocus: HTMLElement | null = null;
	let suppressClick = false;
	let closed = false;

	function fireClose() {
		if (closed) return;
		closed = true;
		onClose();
	}

	/** Play the exit animation, then fire onClose (bindable from the host). */
	export function requestClose() {
		closing = true;
		// The keyframe path handles the panel; a drag-touched backdrop runs on
		// inline opacity instead of keyframes, so fade it explicitly.
		if (dragTouched) backdropDim = 0;
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
		if (closing && event.target === event.currentTarget) fireClose();
	}

	/** Swallow the synthetic click a finished drag would otherwise deliver. */
	function onPanelClickCapture(event: MouseEvent) {
		if (!suppressClick) return;
		suppressClick = false;
		event.stopPropagation();
		event.preventDefault();
	}

	function dragToDismiss(node: HTMLElement) {
		const SLOP = 8;
		const FLICK_VELOCITY = 0.5; // px per ms, downward
		let pointerId = -1;
		let startY = 0;
		let lastY = 0;
		let lastT = 0;
		let velocity = 0;
		let candidate = false;
		let engaged = false;

		const scrollable = () => node.scrollHeight > node.clientHeight + 1;
		const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		// Must be decided before a gesture starts: non-scrolling sheets own
		// vertical panning, scrolling ones keep it native.
		const applyTouchAction = () => {
			node.style.touchAction = scrollable() ? 'pan-y' : 'none';
		};
		applyTouchAction();
		const ro = new ResizeObserver(applyTouchAction);
		ro.observe(node);

		function onDown(event: PointerEvent) {
			if (closing || engaged) return;
			if (event.pointerType === 'mouse' && event.button !== 0) return;
			if (scrollable() || node.scrollTop > 0) return;
			candidate = true;
			pointerId = event.pointerId;
			startY = lastY = event.clientY;
			lastT = event.timeStamp;
			velocity = 0;
		}

		function onMove(event: PointerEvent) {
			if (!candidate || event.pointerId !== pointerId) return;
			const dy = event.clientY - startY;
			const dt = event.timeStamp - lastT;
			if (dt > 0) velocity = (event.clientY - lastY) / dt;
			lastY = event.clientY;
			lastT = event.timeStamp;
			if (!engaged) {
				if (dy <= SLOP) return;
				engaged = true;
				dragTouched = true;
				dragging = true;
				node.setPointerCapture(pointerId);
				node.style.transition = 'none';
			}
			const y = Math.max(0, dy);
			node.style.transform = `translateY(${y}px)`;
			backdropDim = Math.max(0, 1 - y / Math.max(1, node.clientHeight));
			event.preventDefault();
		}

		function settle(event: PointerEvent, cancelled: boolean) {
			if (!candidate || event.pointerId !== pointerId) return;
			candidate = false;
			if (!engaged) return;
			engaged = false;
			dragging = false;
			suppressClick = true;
			const dy = Math.max(0, lastY - startY);
			const shouldClose = !cancelled && (dy > node.clientHeight / 3 || velocity > FLICK_VELOCITY);
			if (shouldClose) {
				if (reducedMotion()) {
					fireClose();
					return;
				}
				backdropDim = 0;
				node.style.transition = 'transform var(--motion-sheet-out) ease-in';
				void node.offsetHeight;
				node.style.transform = 'translateY(105%)';
				const done = (ev: TransitionEvent) => {
					if (ev.target !== node) return;
					node.removeEventListener('transitionend', done);
					fireClose();
				};
				node.addEventListener('transitionend', done);
				// Belt-and-braces: transitionend can be swallowed by unmounts.
				window.setTimeout(fireClose, 400);
			} else {
				backdropDim = 1;
				node.style.transition = 'transform var(--motion-sheet-in) ease-out';
				node.style.transform = 'translateY(0)';
				const done = (ev: TransitionEvent) => {
					if (ev.target !== node) return;
					node.removeEventListener('transitionend', done);
					node.style.transition = '';
					node.style.transform = '';
				};
				node.addEventListener('transitionend', done);
			}
		}

		const onUp = (event: PointerEvent) => settle(event, false);
		const onCancel = (event: PointerEvent) => settle(event, true);

		node.addEventListener('pointerdown', onDown);
		node.addEventListener('pointermove', onMove);
		node.addEventListener('pointerup', onUp);
		node.addEventListener('pointercancel', onCancel);
		return {
			destroy() {
				ro.disconnect();
				node.removeEventListener('pointerdown', onDown);
				node.removeEventListener('pointermove', onMove);
				node.removeEventListener('pointerup', onUp);
				node.removeEventListener('pointercancel', onCancel);
			}
		};
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="overlay" class:closing>
	<button
		class="backdrop"
		type="button"
		tabindex="-1"
		aria-hidden="true"
		onclick={requestClose}
		style:animation={dragTouched ? 'none' : undefined}
		style:opacity={dragTouched ? backdropDim : undefined}
		style:transition={dragTouched && !dragging
			? 'opacity var(--motion-sheet-out) ease-in'
			: undefined}
	></button>
	<div
		class="panel"
		role="dialog"
		aria-modal="true"
		aria-label={label}
		tabindex="-1"
		bind:this={panel}
		use:dragToDismiss
		onanimationend={onPanelAnimationEnd}
		onclickcapture={onPanelClickCapture}
		style:animation={dragTouched && !closing ? 'none' : undefined}
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
		overscroll-behavior: contain;
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
