/**
 * The differential harness — the actual product of spec 005.
 *
 * Mirrors the shape of `src/services/vela-core/diff-harness.ts` and **inverts its
 * return contract**. Feature 001 returns the core's result because the core was
 * the adopted implementation; here the engine is on trial and i18next is the
 * shipping incumbent, so FR-016 makes the ORACLE the value that renders. A
 * proving ground must never degrade the product it is proving.
 *
 * That inversion has a consequence worth stating loudly, because it is the
 * easiest way to ship a green and completely vacuous test suite: **the harness's
 * return value cannot be used to detect a wrong engine.** It is the oracle's,
 * always. Assertions must read {@link DiffHarness.report} and compare `rust`
 * against `oracle` — see contracts/web-i18n-seam.md §6.
 *
 * Cost, measured rather than assumed: 004's research recorded the engine as
 * "~140x slower than i18next", but that compared a wasm `t()` against a raw store
 * lookup rather than against `i18next.t()`. Against the call the app actually
 * makes, Rust is 1.68 µs and i18next 1.84–2.12 µs — the engine is marginally
 * FASTER, and running both plus the compare costs ~3.85 µs against ~1.84 µs. A
 * 500-key full-tree remount goes from 0.84 ms to 1.93 ms: about 7% of a frame.
 * Always-on in development is affordable.
 */
import type { AdapterTOptions, SeamDispatch } from './seam';

/**
 * Stable, comparable rendering of any value (incl. bigint / bytes).
 *
 * Was shared with the core facade's own harness; that one went when the legacy
 * TypeScript path it compared against was deleted, so this is now its only home.
 */
function fingerprint(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'bigint') return `${value}n`;
  if (value instanceof Uint8Array) {
    let hex = '0x';
    for (const b of value) hex += b.toString(16).padStart(2, '0');
    return hex;
  }
  if (Array.isArray(value)) return `[${value.map(fingerprint).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${fingerprint(v)}`);
    return `{${entries.join(',')}}`;
  }
  return String(value);
}

export type HarnessMode = 'off' | 'first-seen' | 'every';

export interface Divergence {
  key: string | string[];
  /** Tagged encoding — the inverse of `decodeTag` in `scripts/dump-vectors/i18n.dump.mjs`. */
  options: string;
  language: string;
  /** `null` when the engine threw. */
  rust: string | null;
  oracle: string;
  reason: 'mismatch' | 'threw' | 'poisoned';
  /** Milliseconds since the harness started — NOT a wall clock, so records are stable. */
  at: number;
}

export interface HarnessReport {
  mode: HarnessMode;
  compared: number;
  /** Inputs proven to agree; only meaningful in `first-seen`. */
  agreed: number;
  divergences: Divergence[];
  /** True once the engine has been seen in the unrecoverable borrow-leak state. */
  poisoned: boolean;
}

export interface DiffHarnessDeps {
  /** The language to stamp on a record — normally the catalog store's mirror. */
  language: () => string;
  mode?: HarnessMode;
  /** Called once, the first time the engine is seen poisoned. */
  onPoison?: (d: Divergence) => void;
  /** Injected for tests; defaults to `console.warn`. */
  warn?: (message: string) => void;
}

export interface DiffHarness {
  dispatch: SeamDispatch;
  setMode(mode: HarnessMode): void;
  getMode(): HarnessMode;
  report(): HarnessReport;
  reset(): void;
}

const MAX_RECORDED = 200;

/**
 * wasm-bindgen's signature for a leaked borrow guard. Reaching this state means
 * `changeLanguage` and `loadCatalog` are dead for the lifetime of the engine
 * object, so the UI would pin to the boot language while `i18n.language` moved.
 * FR-023 closed the serde route and the seam's JS-side option copy closes the
 * throwing-getter route; this detects any path that is still open.
 */
const POISON_SIGNATURE = 'recursive use of an object detected';

export function createDiffHarness(deps: DiffHarnessDeps): DiffHarness {
  const { language, onPoison, warn = (m: string) => console.warn(m) } = deps;

  let mode: HarnessMode = deps.mode ?? 'off';
  let compared = 0;
  let poisoned = false;
  const divergences: Divergence[] = [];
  // Fingerprints of inputs the two engines have ALREADY agreed on. Membership is
  // what makes returning the Rust result on a hit byte-identical by construction.
  const agreed = new Set<string>();

  const started = Date.now();

  function record(d: Omit<Divergence, 'at'>): void {
    const full: Divergence = { ...d, at: Date.now() - started };
    if (divergences.length < MAX_RECORDED) divergences.push(full);
    warn(
      `[i18n][${d.reason.toUpperCase()}] ${String(d.key)} @${d.language}\n` +
        `  options: ${d.options}\n  rust:    ${JSON.stringify(d.rust)}\n  oracle:  ${JSON.stringify(d.oracle)}`,
    );
    if (d.reason === 'poisoned' && !poisoned) {
      poisoned = true;
      onPoison?.(full);
    }
  }

  const dispatch: SeamDispatch = (key, opts, rust, oracle) => {
    // Layer 0 — unconditional, in EVERY mode and every build. A throwing `t`
    // propagates out of render and blanks the tree, so the try/catch is not part
    // of the instrumentation; it is part of the product.
    if (mode === 'off') {
      try {
        return rust();
      } catch (e) {
        if (String((e as Error)?.message ?? e).includes(POISON_SIGNATURE)) {
          record({
            key,
            options: encodeOptions(opts),
            language: language(),
            rust: null,
            oracle: '',
            reason: 'poisoned',
          });
        }
        return oracle();
      }
    }

    const fp = `${language()}|${fingerprint(key)}|${encodeOptions(opts)}`;
    if (mode === 'first-seen' && agreed.has(fp)) {
      // Safe by construction: this input only entered the set after both engines
      // produced the same string, and both are deterministic in that input.
      try {
        return rust();
      } catch {
        return oracle();
      }
    }

    compared++;
    let rustValue: string | null = null;
    let rustThrew: unknown;
    try {
      rustValue = rust();
    } catch (e) {
      rustThrew = e;
    }
    const oracleValue = oracle();

    if (rustThrew !== undefined) {
      const message = String((rustThrew as Error)?.message ?? rustThrew);
      record({
        key,
        options: encodeOptions(opts),
        language: language(),
        rust: null,
        oracle: oracleValue,
        reason: message.includes(POISON_SIGNATURE) ? 'poisoned' : 'threw',
      });
      return oracleValue;
    }

    if (rustValue !== oracleValue) {
      record({
        key,
        options: encodeOptions(opts),
        language: language(),
        rust: rustValue,
        oracle: oracleValue,
        reason: 'mismatch',
      });
      // Deliberately NOT added to `agreed`: a divergent input must keep being
      // compared, and must keep rendering the oracle, every time it appears.
      return oracleValue;
    }

    if (mode === 'first-seen') agreed.add(fp);
    return oracleValue;
  };

  return {
    dispatch,
    setMode: (m) => {
      mode = m;
    },
    getMode: () => mode,
    report: () => ({ mode, compared, agreed: agreed.size, divergences: [...divergences], poisoned }),
    reset: () => {
      compared = 0;
      divergences.length = 0;
      agreed.clear();
      poisoned = false;
    },
  };
}

/**
 * Encode options the way the conformance dumper does, so a divergence is
 * replayable rather than merely readable.
 *
 * A finding CANNOT become a hand-pasted corpus vector: CI runs
 * `npm run dump:vectors` and then `git diff --exit-code` over the vectors
 * directory, so anything added by hand is deleted on the next run. The durable
 * form is a generator input — see {@link dumperLine}.
 */
export function encodeOptions(opts: AdapterTOptions | undefined): string {
  if (opts === undefined) return 'undefined';
  const entries = Object.entries(opts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${tag(v)}`);
  return `{${entries.join(',')}}`;
}

/**
 * The tags the dumper uses for values JSON cannot carry.
 *
 * **Type-prefixed, because this string doubles as the `first-seen` cache key.**
 * `fingerprint` stringifies scalars (`String(value)`), so `{count:1}` and
 * `{count:'1'}` collapse to the same text — and those two genuinely differ to the
 * engine, which pluralises on a number and not on a string. A collision would
 * retire an input the engines had never actually compared, which is the one
 * failure a first-seen cache must not have.
 */
function tag(v: unknown): string {
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return '{"__t":"nan"}';
    if (v === Number.POSITIVE_INFINITY) return '{"__t":"infinity"}';
    if (v === Number.NEGATIVE_INFINITY) return '{"__t":"infinity","sign":-1}';
    return `n:${fingerprint(v)}`;
  }
  if (v === undefined) return '{"__t":"undefined"}';
  if (v === null) return 'null:';
  if (typeof v === 'bigint') return `{"__t":"bigint","v":"${v}"}`;
  if (typeof v === 'function') return '{"__t":"fn"}';
  if (typeof v === 'string') return `s:${JSON.stringify(v)}`;
  if (typeof v === 'boolean') return `b:${v}`;
  return `o:${fingerprint(v)}`;
}

/**
 * A paste-ready source line for `buildBehaviour()` in
 * `scripts/dump-vectors/i18n.dump.mjs`.
 *
 * The expectation is deliberately absent: it must be re-derived by the dumper
 * from the real i18next, not copied from a divergence record. Copying it would
 * pin whatever the oracle happened to say at the moment of capture, which is the
 * one number a regression vector must not inherit.
 */
export function dumperLine(d: Divergence): string {
  return `add('${d.reason}/${String(d.key)}/${d.language}', 'i18n_t', { key: ${JSON.stringify(d.key)}, lng: ${JSON.stringify(d.language)}, opts: /* ${d.options} */ {} });`;
}
