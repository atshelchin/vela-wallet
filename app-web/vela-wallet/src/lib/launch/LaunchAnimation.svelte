<script lang="ts">
	/**
	 * The launch animation — the only file in this app that touches a Lottie
	 * runtime (spec 012 FR-024). Contract:
	 * `specs/012-launch-animation-lottie/contracts/launch-animation-api.md`.
	 *
	 * Same shape as the other three platforms: play once → hold the finished
	 * lockup → cross-dissolve into the page, with any input cutting straight to
	 * the dissolve and every failure path ending silently on the page.
	 *
	 * Web-specific constraints, both structural rather than stylistic:
	 *  - It is mounted CLIENT-SIDE ONLY. The page is prerendered per locale and
	 *    must be complete without this, so nothing here may reach the server
	 *    output and it can never be the LCP element.
	 *  - `lottie-web` is loaded by dynamic `import()`, so its ~46 KB gzip sits in
	 *    a chunk outside the initial page load.
	 */
	import { onMount } from 'svelte';
	import {
		EXIT_CROSSFADE_MS,
		FIRST_FRAME_BUDGET_MS,
		HARD_CEILING_MS,
		HOLD_MS,
		assetUrl,
		boxSize,
		formFactor,
		type Appearance
	} from './constants';

	interface Props {
		appearance: Appearance;
		/** Fraction of the cross-dissolve completed, 0…1. The HOST fades the page
		 *  content in by the same fraction over a background that never fades. */
		onprogress?: (value: number) => void;
		/** Fires EXACTLY once, for every outcome. */
		onfinished?: () => void;
	}

	let { appearance, onprogress, onfinished }: Props = $props();

	let host: HTMLDivElement;
	let dissolve = $state(0);
	let presented = $state(false);
	let finished = false;

	// Viewport-driven, and re-evaluated on resize: the composition and the box
	// both follow the window without restarting playback (FR-011).
	let vw = $state(0);
	let vh = $state(0);
	const form = $derived(vw ? formFactor(vw, vh) : 'phone');
	const box = $derived(boxSize(vw || 390, form));

	const prefersReducedMotion = () =>
		typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	function finishOnce() {
		if (finished) return;
		finished = true;
		onprogress?.(1);
		onfinished?.();
	}

	function beginExit() {
		if (dissolve > 0 || finished) return;
		const start = performance.now();
		const step = (now: number) => {
			// Both layers move together: the overlay's opacity is 1 − dissolve and
			// the host applies dissolve to the page, over one continuous
			// background. Fading only the backdrop is the bug this shape avoids.
			const t = Math.min((now - start) / EXIT_CROSSFADE_MS, 1);
			dissolve = t;
			onprogress?.(t);
			if (t < 1) requestAnimationFrame(step);
			else finishOnce();
		};
		requestAnimationFrame(step);
	}

	onMount(() => {
		let anim: { destroy: () => void; goToAndStop: (v: number, isFrame: boolean) => void } | null =
			null;
		let cancelled = false;
		const timers: ReturnType<typeof setTimeout>[] = [];

		const measure = () => {
			vw = window.innerWidth;
			vh = window.innerHeight;
		};
		measure();
		window.addEventListener('resize', measure, { passive: true });

		// FR-016: any input cuts to the dissolve.
		const skip = () => beginExit();
		window.addEventListener('pointerdown', skip, { passive: true });
		window.addEventListener('keydown', skip);

		// FR-014: nothing on screen within the budget → abandon, silently.
		timers.push(setTimeout(() => { if (!presented) finishOnce(); }, FIRST_FRAME_BUDGET_MS));

		(async () => {
			try {
				const reduce = prefersReducedMotion();
				// Dynamic, and the LIGHT build: the full player is 76 KB gzip
				// against 46 for this one, and nothing here needs expressions.
				const lottie = (await import('lottie-web/build/player/lottie_light')).default;
				if (cancelled) return;

				anim = lottie.loadAnimation({
					container: host,
					renderer: 'svg',
					loop: false,
					autoplay: !reduce,
					path: assetUrl(form, appearance)
				}) as never;

				const player = anim as unknown as {
					addEventListener: (e: string, cb: () => void) => void;
					goToAndStop: (v: number, isFrame: boolean) => void;
					totalFrames: number;
				};

				player.addEventListener('DOMLoaded', () => {
					presented = true;
					if (reduce) {
						// FR-019/FR-020: the finished lockup, statically, and NO
						// hold — the point of the setting is less time on motion.
						player.goToAndStop(player.totalFrames - 1, true);
						beginExit();
					}
				});

				// Play → hold → dissolve.
				player.addEventListener('complete', () => {
					timers.push(setTimeout(beginExit, HOLD_MS));
				});

				// FR-015: hard ceiling from mount.
				timers.push(setTimeout(beginExit, HARD_CEILING_MS));
			} catch {
				// FR-017: a failed import, a missing asset, an unparseable file —
				// none of it is something the user hears about.
				finishOnce();
			}
		})();

		return () => {
			cancelled = true;
			timers.forEach(clearTimeout);
			window.removeEventListener('resize', measure);
			window.removeEventListener('pointerdown', skip);
			window.removeEventListener('keydown', skip);
			anim?.destroy();
		};
	});
</script>

<!--
	Opaque until the dissolve starts — the page must not be visible through it
	(FR-013). `aria-hidden` + `inert`: decoration, and it must not trap focus or
	be announced (FR-021).
-->
<div
	class="overlay"
	style:opacity={1 - dissolve}
	aria-hidden="true"
	inert
>
	<div class="box" bind:this={host} style:width="{box.w}px" style:height="{box.h}px"></div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		/* The page's own identically-coloured background sits underneath, so the
		   backdrop stays continuous through the dissolve instead of washing out
		   to the bare document. */
		background: var(--color-bg-base);
		z-index: 100;
	}

	.box {
		/* The shipped asset is cropped to the motion, so the box IS the artwork —
		   nothing to letterbox. */
		flex: none;
	}
</style>
