/**
 * Lightweight net metrics — WEB (spec 025; trimmed from the Expo ring-buffer
 * module to the counting seam the pool facade records into. The bug-report
 * feature that reads a full buffer arrives with its own spec).
 */

export type NetService = 'rpc' | 'bundler';
export type NetOutcome = 'success' | 'retry' | 'final_failure';

const counters = new Map<string, number>();

export function recordNet(
	service: NetService,
	outcome: NetOutcome,
	detail?: { note?: string }
): void {
	void detail; // the Expo module buffers notes; the counter seam keeps the arity
	const key = `${service}:${outcome}`;
	counters.set(key, (counters.get(key) ?? 0) + 1);
}

/** Test/diagnostics read. */
export function netCounters(): ReadonlyMap<string, number> {
	return counters;
}
