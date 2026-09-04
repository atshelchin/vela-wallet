/**
 * The camera, and everything it can refuse (spec 028 T422).
 *
 * The drawn surface stays pure: it renders a frame, a hint and three tools, and
 * takes a snippet for whatever fills the frame. This module is the machinery —
 * getting a stream, decoding frames, and above all SAYING why there is nothing
 * to look at when there is nothing to look at.
 *
 * That last part is most of the file, and it is the point. A viewfinder that
 * stays black tells a person their camera is broken; the truth is usually that
 * they refused permission once months ago, or that the page is not on HTTPS.
 * Each of those is actionable, and only if it is said.
 */
import {
	decodeCameraFrame,
	canvasFromFile,
	decodeImage,
	loadDecoders
} from '$lib/services/qr-decode';

/** Why there is no picture — each one a different thing to do about it. */
export type ScanStatus =
	| 'idle'
	/** Asking for the camera. The browser may be showing its own prompt. */
	| 'starting'
	| 'live'
	/** The person said no — this time, or once before and the browser remembers. */
	| 'denied'
	/** No camera at all: most desktops, and every locked-down device. */
	| 'absent'
	/** `getUserMedia` does not exist off HTTPS, so the page itself is the problem. */
	| 'insecure'
	/** The camera exists and something else has it, or it failed to open. */
	| 'unavailable';

class Scanner {
	status = $state<ScanStatus>('idle');
	/** The last thing decoded, from the camera or from a picked image. */
	result = $state<string | null>(null);
	/** Set when a picked image contained no code — a different thing from a
	 *  camera that never saw one, because the person is waiting on an answer. */
	nothingFound = $state(false);

	#stream: MediaStream | null = null;
	#video: HTMLVideoElement | null = null;
	#canvas: HTMLCanvasElement | null = null;
	#raf = 0;
	#stopped = true;

	/** Whether asking is even possible here. Checked before asking, so a
	 *  desktop without a camera never triggers a permission prompt. */
	static supported(): boolean {
		return (
			typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
		);
	}

	async start(video: HTMLVideoElement): Promise<void> {
		this.#stopped = false;
		this.result = null;
		this.nothingFound = false;
		if (!Scanner.supported()) {
			// `getUserMedia` is undefined off a secure origin, so "no camera API"
			// and "not on HTTPS" are the same symptom with different fixes.
			this.status = window.isSecureContext ? 'absent' : 'insecure';
			return;
		}
		this.status = 'starting';
		// Warm the decoders while the person is still granting permission —
		// nothing has been fetched until now, and this is the moment it stops
		// costing anyone who never scans.
		void loadDecoders();
		try {
			this.#stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: 'environment' },
				audio: false
			});
		} catch (error) {
			this.status = classify(error);
			return;
		}
		if (this.#stopped) {
			this.#release();
			return;
		}
		this.#video = video;
		video.srcObject = this.#stream;
		video.setAttribute('playsinline', 'true');
		video.muted = true;
		await video.play().catch(() => {});
		this.status = 'live';
		this.#loop();
	}

	/** A picked image — the way out when the camera cannot be had. */
	async pick(file: Blob): Promise<string | null> {
		this.nothingFound = false;
		const found = await decodeImage(await canvasFromFile(file));
		if (found) this.result = found;
		else this.nothingFound = true;
		return found;
	}

	stop(): void {
		this.#stopped = true;
		if (this.#raf) cancelAnimationFrame(this.#raf);
		this.#raf = 0;
		this.#release();
		if (this.#video) this.#video.srcObject = null;
		this.#video = null;
		this.status = 'idle';
	}

	#release(): void {
		this.#stream?.getTracks().forEach((track) => track.stop());
		this.#stream = null;
	}

	#loop(): void {
		const tick = async () => {
			if (this.#stopped || !this.#video) return;
			const video = this.#video;
			if (video.readyState >= 2 && video.videoWidth > 0) {
				const canvas = (this.#canvas ??= document.createElement('canvas'));
				canvas.width = video.videoWidth;
				canvas.height = video.videoHeight;
				canvas.getContext('2d', { willReadFrequently: true })?.drawImage(video, 0, 0);
				const found = await decodeCameraFrame(canvas);
				if (found) {
					this.result = found;
					this.stop();
					return;
				}
			}
			this.#raf = requestAnimationFrame(() => void tick());
		};
		this.#raf = requestAnimationFrame(() => void tick());
	}
}

/**
 * What the browser's refusal actually was.
 *
 * `NotAllowedError` is the one that matters: it covers both "the person just
 * said no" and "the person said no once and the browser never asked again",
 * which look identical here and are the same instruction to a person — change
 * it in the site settings.
 */
function classify(error: unknown): ScanStatus {
	const name = (error as { name?: string } | null)?.name ?? '';
	if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
	if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'absent';
	return 'unavailable';
}

/** One scanner per page: two live camera streams is a bug, not a feature. */
export const scanner = new Scanner();
export { Scanner };
