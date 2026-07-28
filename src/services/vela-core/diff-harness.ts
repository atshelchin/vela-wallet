/**
 * Side-by-side verification harness (FR-006).
 *
 * When enabled (dev only, web only — `vela.velaCoreDiff(true)`), every facade
 * call runs BOTH the Rust core and the legacy TypeScript implementation and
 * logs any divergence. This is the gate that must report zero mismatches
 * across the verification checklist before the legacy path is deleted
 * (spec FR-007 / SC-003).
 *
 * The harness never changes what the caller receives: the core's result is
 * always what is returned, even when the two disagree.
 */

export interface DiffMismatch {
  fn: string;
  input: string;
  core: string;
  legacy: string;
  at: number;
}

/**
 * The flag survives a reload (web dev only).
 *
 * Without this the harness could only ever be switched on AFTER boot, which
 * leaves exactly the flows the SC-003 checklist names first — wallet creation
 * and address display — permanently unverifiable: they derive the account's
 * counterfactual address during startup, long before any console command can
 * run. Persisting the flag is what makes a cold-start comparison possible.
 */
const STORAGE_KEY = 'vela.coreDiff';

function readPersistedFlag(): boolean {
  try {
    return (
      __DEV__ && typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1'
    );
  } catch {
    return false; // no localStorage (native, SSR, blocked storage) — off
  }
}

function persistFlag(on: boolean): void {
  try {
    if (!__DEV__ || typeof localStorage === 'undefined') return;
    if (on) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable — the in-memory flag still works for this session.
  }
}

let enabled = readPersistedFlag();
const mismatches: DiffMismatch[] = [];
const MAX_RECORDED = 200;

if (enabled) {
  // Say so at boot. A harness that is silently armed is indistinguishable from
  // one that is silently disarmed, and "zero mismatches" from a harness that
  // never ran is the most expensive kind of false confidence.
  console.log('[vela-core] diff harness ON from boot (persisted) — comparing core vs legacy');
}

export function setDiffEnabled(on: boolean): void {
  enabled = on;
  persistFlag(on);
  if (on) {
    console.log('[vela-core] diff harness ON — every call runs core + legacy and compares');
  } else {
    console.log(`[vela-core] diff harness OFF (${mismatches.length} mismatches recorded)`);
  }
}

export function isDiffEnabled(): boolean {
  return enabled;
}

export function getMismatches(): DiffMismatch[] {
  return [...mismatches];
}

export function clearMismatches(): void {
  mismatches.length = 0;
}

/** Stable, comparable rendering of any facade value (incl. bigint / bytes). */
export function fingerprint(value: unknown): string {
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

/** Run a thunk and capture either its value or the error it threw. */
function capture<T>(run: () => T): { ok: true; value: T } | { ok: false; error: unknown } {
  try {
    return { ok: true, value: run() };
  } catch (error) {
    return { ok: false, error };
  }
}

function outcomeFingerprint(outcome: ReturnType<typeof capture>): string {
  return outcome.ok
    ? fingerprint(outcome.value)
    : `throw:${outcome.error instanceof Error ? outcome.error.message : String(outcome.error)}`;
}

/**
 * Run `core`; when the harness is on, also run `legacy` and record any
 * divergence. Returns (or rethrows) the CORE outcome either way.
 *
 * Known-divergent inputs are expected to differ — the 20 enumerated
 * divergences in specs/001-rust-core-bindings/contracts/core-api.md — so the
 * log line carries the input fingerprint to make triage possible.
 */
export function compared<T>(fn: string, input: unknown[], core: () => T, legacy: () => T): T {
  if (!enabled) return core();

  const coreOutcome = capture(core);
  const legacyOutcome = capture(legacy);
  const coreFp = outcomeFingerprint(coreOutcome);
  const legacyFp = outcomeFingerprint(legacyOutcome);

  if (coreFp !== legacyFp) {
    const record: DiffMismatch = {
      fn,
      input: fingerprint(input),
      core: coreFp,
      legacy: legacyFp,
      at: Date.now(),
    };
    if (mismatches.length < MAX_RECORDED) mismatches.push(record);
    console.warn(
      `[vela-core][MISMATCH] ${fn}\n  input:  ${record.input}\n  core:   ${coreFp}\n  legacy: ${legacyFp}`,
    );
  }

  if (coreOutcome.ok) return coreOutcome.value;
  throw coreOutcome.error;
}
