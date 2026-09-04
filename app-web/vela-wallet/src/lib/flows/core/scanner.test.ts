/**
 * Every refusal has its own name (spec 028 T424).
 *
 * A scanner's failure modes all look identical to a person — a black frame —
 * and each has a different thing to do about it. These pin the classification,
 * because the value of this module is not that it decodes; it is that it says
 * WHY when it cannot.
 */
import { describe, expect, it, vi } from 'vitest';
import { Scanner } from './scanner.svelte';

/** Drive `start()` with a `getUserMedia` that rejects the way a browser does. */
async function statusAfterRejecting(name: string): Promise<string> {
	const scanner = new Scanner();
	const error = Object.assign(new Error(name), { name });
	vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => Promise.reject(error) } });
	vi.stubGlobal('window', { isSecureContext: true });
	await scanner.start({} as HTMLVideoElement);
	vi.unstubAllGlobals();
	return scanner.status;
}

describe('a camera that will not open says which kind of no it is', () => {
	it('a refusal is a refusal — this time, or once and remembered', async () => {
		// The browser reports both the same way, and for a person they are the
		// same instruction: change it in the site settings.
		expect(await statusAfterRejecting('NotAllowedError')).toBe('denied');
		expect(await statusAfterRejecting('SecurityError')).toBe('denied');
	});

	it('no camera is not a refusal — most desktops are simply like this', async () => {
		expect(await statusAfterRejecting('NotFoundError')).toBe('absent');
		expect(await statusAfterRejecting('OverconstrainedError')).toBe('absent');
	});

	it('anything else is "unavailable", never silence', async () => {
		expect(await statusAfterRejecting('AbortError')).toBe('unavailable');
	});

	it('separates "no camera API" from "not on HTTPS", which look the same', async () => {
		// `getUserMedia` is simply undefined off a secure origin, so the symptom
		// is identical and the fix is not: one needs a device, the other a URL.
		const insecure = new Scanner();
		vi.stubGlobal('navigator', { mediaDevices: undefined });
		vi.stubGlobal('window', { isSecureContext: false });
		await insecure.start({} as HTMLVideoElement);
		expect(insecure.status).toBe('insecure');

		const noCamera = new Scanner();
		vi.stubGlobal('window', { isSecureContext: true });
		await noCamera.start({} as HTMLVideoElement);
		expect(noCamera.status).toBe('absent');
		vi.unstubAllGlobals();
	});

	it('never asks when asking is impossible', async () => {
		// Checked BEFORE `getUserMedia`, so a device without a camera never
		// triggers a permission prompt someone then has to dismiss.
		vi.stubGlobal('navigator', { mediaDevices: undefined });
		vi.stubGlobal('window', { isSecureContext: true });
		expect(Scanner.supported()).toBe(false);
		vi.unstubAllGlobals();
	});
});
