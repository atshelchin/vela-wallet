/**
 * The seam: Rust-backed `t` and `exists` for the web i18next instance
 * (spec 005-web-i18n-adoption, contracts/web-i18n-seam.md §1–§2).
 *
 * Two property assignments are the whole adoption. `bindMemberFunctions`
 * (`i18next.js:1726-1733`) makes `t`/`exists`/`getFixedT` plain own, writable,
 * configurable properties, and `getFixedT` ends in a LIVE `this.t(...)` lookup
 * (`:2060`) — so overriding `t` is picked up by react-i18next's `useTranslation`,
 * by every direct `i18n.t(...)` call site, and by nothing else. `changeLanguage`,
 * the `languageChanged` event and the `useSyncExternalStore` re-render path are
 * untouched, because a real i18next instance is still doing that work.
 *
 * `exists` is a SEPARATE own property (`:2074-2076`) and is not reached through
 * `t`; overriding it is FR-004. Note it has no behavioural provenance — Rust and
 * i18next agree on every shape probed — so its test asserts the engine was
 * *called*, not that the answer is right.
 *
 * This file is platform-neutral `.ts` on purpose (same reasoning as
 * `catalog-store.ts`): jest resolves no `.web.ts`, so logic that lives in the
 * platform-split file is invisible to CI.
 */

/** The slice of the wasm `I18n` surface the seam needs. */
export interface SeamEngine {
  t(key: string, opts?: unknown): string;
  tFirst(keys: string[], opts?: unknown): string;
  exists(key: string, opts?: unknown): boolean;
}

/**
 * The options shape the adapter speaks.
 *
 * Exists because the generated `TOptions` is emitted as
 * `interface TOptions extends Map<string, Value>` — `#[serde(flatten)]` on `vars`
 * forces tsify to widen the struct to a map type — which rejects every real
 * object literal under `strict`. A plain object is what works at runtime, so the
 * cast happens here, once, rather than at 194 call sites.
 */
export interface AdapterTOptions {
  count?: number | string | null;
  defaultValue?: string;
  lng?: string;
  ns?: string;
  replace?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Raised when the options object cannot be safely read in JS. */
export class UnreadableOptionsError extends Error {
  constructor(cause: unknown) {
    super(`i18n options could not be read: ${String(cause)}`);
    this.name = 'UnreadableOptionsError';
  }
}

/**
 * Copy and normalise a caller's options into something safe to hand across the
 * wasm boundary.
 *
 * **The copy is not incidental — it is the guard.** A property whose getter
 * throws is the one input that still poisons the engine: the JS exception
 * escapes the wasm call without unwinding Rust, so the borrow guard leaks and
 * every `&mut self` method (`changeLanguage`, `loadCatalog`) is dead for the
 * lifetime of the object. Rust cannot defend against this — the getter runs deep
 * inside serde's map walk, far from any `map_err` — so it must be read here,
 * inside a JS `try`, where the throw is catchable. Measured: the other four
 * exotic values (function, symbol, TypedArray, out-of-range BigInt) are rejected
 * cleanly by the engine and need no special handling.
 *
 * Throws {@link UnreadableOptionsError}; the seam turns that into an oracle
 * delegation, which is also what i18next would do — it reads the same getter and
 * throws the same error.
 */
export function normaliseOptions(raw: unknown): AdapterTOptions | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object') return undefined;

  let copy: Record<string, unknown>;
  try {
    copy = { ...(raw as Record<string, unknown>) };
  } catch (cause) {
    throw new UnreadableOptionsError(cause);
  }

  // N2 — react-i18next passes `ns` as a string on the hook path, but `<Trans>`
  // passes an array while the wasm declares `Option<String>`, which throws
  // `invalid type: JsValue(["translation"])`.
  if (Array.isArray(copy.ns)) {
    copy.ns = typeof copy.ns[0] === 'string' ? (copy.ns[0] as string) : undefined;
  }
  if (copy.ns === undefined) delete copy.ns;

  // N3 — an own-but-undefined `count`.
  //
  // i18next treats it as no count at all for plural selection (`count !== undefined`)
  // but still renders `{{count}}` as `''`, because the property IS present and
  // reads as undefined. Deleting alone gets the plural right and the
  // interpolation wrong: with `count` absent the engine leaves the literal
  // `{{count}}` on screen under `skipOnVariables`.
  //
  // Routing the interpolation source through `replace` with an explicit `null`
  // reproduces both halves — no plural suffix, and `{{count}}` renders empty.
  // A caller-supplied object `replace` is left alone: i18next would use theirs as
  // the source too, and `{{count}}` would then legitimately go unresolved.
  if ('count' in copy && copy.count === undefined) {
    delete copy.count;
    if (typeof copy.replace !== 'object' || copy.replace === null) {
      const source: Record<string, unknown> = { ...copy, count: null };
      delete source.replace;
      copy.replace = source;
    }
  }

  // N1 — `lng` is forwarded UNCHANGED. Stripping it when it equals the active
  // language looks like a free simplification and is not: it would mask a real
  // divergence. With one non-`en` catalog resident, `t(k, {lng:'fr'})` while `de`
  // is active renders English on web where native i18next (all 15 bundled)
  // renders French. The harness should surface that, not hide it.

  // Non-finite variable values need no handling here: FR-024 fixed the engine so
  // `{n: NaN}` renders `"NaN"` exactly as i18next does. Normalising them in TS
  // as well would add a second code path that can drift from the first.

  return copy as AdapterTOptions;
}

export interface SeamDeps {
  engine: SeamEngine;
  /** The captured pre-override `i18n.t` — real i18next over the bundled resources. */
  oracleT: (key: unknown, opts?: unknown) => unknown;
  /** The captured pre-override `i18n.exists`. */
  oracleExists: (key: unknown, opts?: unknown) => boolean;
  /**
   * i18next's own `t(key, 'a default')` overload handler, read off the instance
   * so the seam cannot drift from the library's own rule.
   */
  overloadHandler?: (args: unknown[]) => Record<string, unknown> | undefined;
  /**
   * Phase 3 hook. Receives ALREADY-NORMALISED arguments plus both thunks, and
   * returns the string to render. Default: Rust, falling back to the oracle if
   * it throws.
   */
  dispatch?: SeamDispatch;
}

export type SeamDispatch = (
  key: string | string[],
  opts: AdapterTOptions | undefined,
  rust: () => string,
  oracle: () => string,
) => string;

/** Rust first; the oracle is the safety net. Phase 3 replaces this. */
const defaultDispatch: SeamDispatch = (_key, _opts, rust, oracle) => {
  try {
    return rust();
  } catch {
    return oracle();
  }
};

export interface Seam {
  t(key: unknown, second?: unknown, third?: unknown): string;
  exists(key: unknown, opts?: unknown): boolean;
}

export function createSeam(deps: SeamDeps): Seam {
  const { engine, oracleT, oracleExists, overloadHandler, dispatch = defaultDispatch } = deps;

  function t(key: unknown, second?: unknown, third?: unknown): string {
    // 1 — null key. i18next answers '' rather than throwing.
    if (key === undefined || key === null) return '';

    // A selector-function key is i18next 26's own API and needs its key
    // registry to resolve. Delegating is correct, not a shortcut: the engine
    // has no way to evaluate it, and no call site in this app uses one.
    if (typeof key === 'function') return String(oracleT(key, second));

    // 2 — the `t(key, 'a default')` overload. Applied via i18next's own handler
    // so the rule cannot drift from the library's.
    let rawOpts: unknown = second;
    if (second !== undefined && (typeof second !== 'object' || second === null)) {
      rawOpts = overloadHandler ? overloadHandler([key, second, third]) : { defaultValue: String(second) };
    }

    let opts: AdapterTOptions | undefined;
    try {
      // 4 — normalise (step 3, selector keys, was handled above)
      opts = normaliseOptions(rawOpts);
    } catch {
      // A throwing getter. i18next hits the same getter and throws the same way,
      // so delegating preserves parity instead of inventing a behaviour.
      return String(oracleT(key, second));
    }

    const keys = Array.isArray(key) ? key.map(String) : String(key);

    // 5 — dispatch. `engine.t(['a','b'])` throws `arg.charCodeAt is not a
    // function` from the glue, so the array branch is mandatory, not defensive.
    const rust = () =>
      Array.isArray(keys) ? engine.tFirst(keys, opts) : engine.t(keys, opts);
    const oracle = () => String(oracleT(key, rawOpts));

    // 6 — the catch lives in the dispatcher, so the harness can record it.
    return dispatch(keys, opts, rust, oracle);
  }

  function exists(key: unknown, opts?: unknown): boolean {
    if (key === undefined || key === null) return false;
    if (typeof key === 'function' || Array.isArray(key)) return oracleExists(key, opts);
    let normalised: AdapterTOptions | undefined;
    try {
      normalised = normaliseOptions(opts);
    } catch {
      return oracleExists(key, opts);
    }
    try {
      return engine.exists(String(key), normalised);
    } catch {
      return oracleExists(key, opts);
    }
  }

  return { t, exists };
}
