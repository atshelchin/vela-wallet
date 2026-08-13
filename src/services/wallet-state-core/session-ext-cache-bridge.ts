/**
 * The one hand-off point between the `session` core and the `ext_cache` core —
 * WEB only (spec 017, the G9 half of integration-plan.md's `session_ended` gap).
 *
 * `SessionOperation::ClearExtensionCache` is the session's word for "drop the
 * Safari extension's account snapshot", and `ExtCacheEvent::session_ended` is
 * the ext-cache machine's ear for it. The two cores must not import each other,
 * and the ext-cache session is owned by `<AccountFileWriter/>`'s controller
 * (`use-ext-cache.web.ts`) rather than by a module-level singleton, so the
 * controller registers its live session here and the session executor calls it.
 *
 * A registry, not a policy: WHETHER logout clears the cache is decided in Rust
 * (today it is not — `ClearExtensionCache` is documented as never emitted while
 * open question 2 is open, and the clear still happens the way it always has,
 * through `accounts_changed { has_wallet: false }` when the writer re-reports).
 * This file only guarantees the wire exists and lands in the right core if it
 * ever is.
 */

/** Set while an ext-cache controller is mounted; null otherwise. */
let ender: (() => void) | null = null;

/**
 * Called by `use-ext-cache.web.ts` on mount (with its dispatcher) and on
 * unmount (with `null`). Last mount wins — the writer is a singleton at the
 * app root, and React 19 StrictMode's double-mount frees the first core before
 * building the second.
 */
export function registerExtCacheEnder(fn: (() => void) | null): void {
  ender = fn;
}

/** Tell the ext-cache core the session ended. A no-op when nothing is mounted. */
export function endExtCacheSession(): void {
  ender?.();
}
