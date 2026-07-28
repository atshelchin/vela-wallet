/**
 * Vector-file writer for the vela-core conformance corpus.
 *
 * Schema: specs/001-rust-core-bindings/contracts/conformance-vectors.md
 * Regeneration policy: diffs to committed vectors are reviewed like code.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface Divergence {
  ts_behavior: string;
  reason: string;
}

export interface VectorCase {
  name: string;
  fn: string;
  input: Record<string, unknown>;
  /** Output object (field names = Rust return fields; bare returns use {value}) or {error: CoreErrorCode}. */
  expect: Record<string, unknown>;
  /** Present ⇔ Rust intentionally differs from TS. Comes ONLY from divergences.ts. */
  divergence?: Divergence;
}

const VECTORS_DIR = path.join(__dirname, '..', '..', 'rust', 'crates', 'vela-core', 'tests', 'vectors');

export function hex0x(bytes: Uint8Array): string {
  return '0x' + Buffer.from(bytes).toString('hex');
}

export function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** Patterned test payload matching the existing sha256 size-sweep tests. */
export function patternedBytes(size: number): Uint8Array {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) data[i] = (i * 7 + size) & 0xff;
  return data;
}

/**
 * Run a TS oracle call that is expected to THROW, for cases where Rust and TS
 * agree on rejection. Returns an {error} expectation after verifying the oracle
 * actually threw — a non-throwing oracle means the vector is wrong, so fail loud.
 */
export function expectOracleThrow(label: string, errorCode: string, call: () => unknown): Record<string, unknown> {
  try {
    call();
  } catch {
    return { error: errorCode };
  }
  throw new Error(`dump-vectors: oracle did NOT throw for ${label} — vector definition is wrong`);
}

export function writeSuite(suite: string, cases: VectorCase[]): void {
  fs.mkdirSync(VECTORS_DIR, { recursive: true });
  // Deliberately NO timestamp and NO git sha: the corpus must be byte-stable so
  // that ANY diff is a behavior change — that invariant is what lets CI
  // regenerate the corpus and assert zero diff, which is the only check that
  // catches the TypeScript oracle drifting away from the committed vectors.
  // A wall-clock stamp or a HEAD sha would rewrite all five files on every run
  // (or every commit) and make that check impossible. Git already records when
  // each file changed and which commit produced it.
  const doc = {
    suite,
    source: 'scripts/dump-vectors (extracted from the production TypeScript)',
    cases,
  };
  const file = path.join(VECTORS_DIR, `${suite}.json`);
  fs.writeFileSync(file, JSON.stringify(doc, null, 1) + '\n');
  // eslint-disable-next-line no-console
  console.log(`wrote ${cases.length} cases → ${path.relative(process.cwd(), file)}`);
}
