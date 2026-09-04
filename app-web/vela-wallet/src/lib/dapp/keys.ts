/**
 * The storage keys both halves of the extension agree on (spec 027).
 *
 * Restated here rather than imported from `extension/lib/protocol.js`: that
 * module is bundled into scripts that run in a stranger's page, and pulling it
 * into the app's graph would put the page-side vocabulary in every wallet
 * chunk. `protocol.test.ts` pins the two against each other, so they cannot
 * drift in silence.
 */

/** Per-origin connect grant — the shape the Safari extension already uses. */
export const PERM_PREFIX = 'vela.perm.';
/** A request in flight, written down the moment it arrives. */
export const REQUEST_PREFIX = 'vela.req.';
/** The snapshot the worker reads to answer a granted origin instantly. */
export const EXT_CACHE_KEY = 'vela.ext.cache';
