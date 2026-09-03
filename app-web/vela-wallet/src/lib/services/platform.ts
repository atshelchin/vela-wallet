/**
 * Platform seams — WEB (spec 025). The Expo module's haptics and app-state
 * readers, reduced to what a browser can honestly answer: no vibration
 * commitment (the UI celebration renders regardless — contract: acknowledged,
 * never skipped), and page visibility standing in for app activity.
 */

export function hapticSuccess(): void {
	// No haptic surface on web; the caller's visual acknowledgement is the feedback.
}

/** `isAppActive` → the document is visible. Hidden tabs pause pollers (D12). */
export function isAppActive(): boolean {
	return typeof document === 'undefined' || document.visibilityState === 'visible';
}
