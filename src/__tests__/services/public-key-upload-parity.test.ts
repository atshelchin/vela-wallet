/**
 * DRIFT GATE for the index-upload decision table, which exists TWICE.
 *
 * Web onboarding runs `create_wallet.rs`'s `Syncing` machine. iOS/Android
 * cannot (Hermes has no WebAssembly) and run `services/public-key-upload.ts` —
 * and so does WEB, on every cold start: `_layout.tsx` calls
 * `retryPendingUploads()` unconditionally, which re-walks the whole table in
 * TypeScript for every entry the core left pending. The core's machine only
 * covers the one run that created the wallet; every retry after that is this
 * file's table, on all three platforms.
 *
 * Neither copy can be deleted (the core cannot be entered at `Syncing`, and
 * native has no wasm), so the only defence against a one-sided edit is an
 * assertion that reads BOTH — the same shape as `core-table-parity.test.ts`.
 * The file header of `public-key-upload.ts` has said "change them together"
 * since D10; a comment cannot fail a build, which is what this file is for.
 *
 * What a red test here costs, concretely: the pending entry is what makes a
 * retry happen at all. Clear it before the index has revealed the key by
 * walletRef and the bundler never sees that key, so gas sponsorship silently
 * stops for that wallet — issue #89, which is exactly how it happened the first
 * time. Keep it when the core would have dropped it and a stale entry is
 * re-driven forever.
 */

// Only the two pure functions are exercised here, but importing them pulls the
// module's native/network graph in. Stub it — nothing below reaches it.
jest.mock('@/modules/passkey', () => ({ getRelyingPartyId: () => 'getvela.app' }));
jest.mock('@/services/public-key-index', () => ({
  createRecord: jest.fn(), queryRecord: jest.fn(), queryByWalletRef: jest.fn(),
}));
jest.mock('@/services/vela-core', () => ({
  computeAddress: () => '0x' + '5a'.repeat(20),
  fromHex: (hex: string) => Uint8Array.from(Buffer.from(hex, 'hex')),
}));
jest.mock('@/services/storage', () => ({
  loadPendingUploads: jest.fn(async () => []), removePendingUpload: jest.fn(async () => {}),
}));

import { readFileSync } from 'fs';
import { resolve } from 'path';

import {
  judgeUpload,
  shouldClearPending,
  MISMATCH_MESSAGE,
  type CreateObservation,
  type QueryObservation,
  type UploadVerdict,
  type WalletRefObservation,
} from '@/services/public-key-upload';

const CREATE_WALLET_RS = readFileSync(
  resolve(__dirname, '../../../rust/crates/vela-core/src/app/create_wallet.rs'),
  'utf8',
);

const PK = '04' + 'ab'.repeat(64);
const OTHER = '04' + 'cd'.repeat(64);
const BOOM = new Error('create 4xx');
const DOWN = new Error('index unreachable');

const CREATE_OK: CreateObservation = { ok: true };
const CREATE_FAIL: CreateObservation = { ok: false, error: BOOM };
const NO_ANSWER: QueryObservation = { type: 'unavailable', error: DOWN };
const found = (publicKey: string): QueryObservation => ({ type: 'record', publicKey });

// ---------------------------------------------------------------------------
// Side A — the TypeScript table, executed
// ---------------------------------------------------------------------------

type Row = {
  name: string;
  create: CreateObservation;
  query: QueryObservation;
  expected: UploadVerdict;
};

const ROWS: Row[] = [
  {
    name: 'ok | ok | yes → confirmed',
    create: CREATE_OK, query: found(PK), expected: { type: 'confirmed' },
  },
  {
    name: 'ok | ok | no → mismatch (not retryable by waiting)',
    create: CREATE_OK, query: found(OTHER), expected: { type: 'mismatch' },
  },
  {
    name: 'fail | ok | yes → confirmed (already-exists / write landed, response lost)',
    create: CREATE_FAIL, query: found(PK), expected: { type: 'confirmed' },
  },
  {
    name: 'fail | ok | no → mismatch',
    create: CREATE_FAIL, query: found(OTHER), expected: { type: 'mismatch' },
  },
  {
    name: 'ok | fail/404 → unconfirmed, surfacing the QUERY error',
    create: CREATE_OK, query: NO_ANSWER, expected: { type: 'unconfirmed', error: DOWN },
  },
  {
    name: 'fail | fail/404 → unconfirmed, surfacing the CREATE error (the original cause)',
    create: CREATE_FAIL, query: NO_ANSWER, expected: { type: 'unconfirmed', error: BOOM },
  },
];

describe('TypeScript side — every row of the spec-011 table', () => {
  test.each(ROWS)('$name', ({ create, query, expected }) => {
    expect(judgeUpload(PK, create, query)).toEqual(expected);
  });

  test('hex case is not meaning: an upper-cased echo still confirms', () => {
    // The core compares with `eq_ignore_ascii_case`; a case-sensitive `!==`
    // here would call the SAME key a mismatch, strand the entry pending
    // forever, and never reach the walletRef step at all.
    expect(judgeUpload(PK, CREATE_OK, found(PK.toUpperCase()))).toEqual({ type: 'confirmed' });
  });

  const WALLET_REF: [WalletRefObservation, boolean][] = [
    ['resolved', true],    // the reveal landed → the bundler can see the key
    ['unresolved', false], // reveal still pending → keep it and re-drive (issue #89)
    ['unknown', false],    // index/RPC down → an absence of information
  ];
  test.each(WALLET_REF)('walletRef %s → clear pending: %s', (observation, clear) => {
    expect(shouldClearPending(observation)).toBe(clear);
  });
});

// ---------------------------------------------------------------------------
// Side B — the Rust table, read
// ---------------------------------------------------------------------------

/** Match arms of the big `(stage, result)` dispatch, keyed by their pattern. */
function syncingArms(source: string): Map<string, string> {
  const chunks = source.split(/\n {8}\((?=Stage::)/);
  const arms = new Map<string, string>();
  for (const chunk of chunks.slice(1)) {
    const split = chunk.indexOf('=>');
    if (split < 0) continue;
    const head = ('(' + chunk.slice(0, split)).replace(/\s+/g, ' ').trim();
    // Values, never formatting: line breaks inside a builder chain are rustfmt's
    // business, so the body is compared with its whitespace collapsed and the
    // spacing around method dots removed.
    const body = chunk.slice(split).replace(/\s+/g, ' ').replace(/\s*\.\s*/g, '.');
    arms.set(head, body);
  }
  return arms;
}

const ARMS = syncingArms(CREATE_WALLET_RS);

function arm(pattern: string): string {
  const body = ARMS.get(pattern);
  // A miss means the arm was renamed, removed, or restructured — either way the
  // Rust table changed and this file has not been re-read against it.
  expect(ARMS.has(pattern)).toBe(true);
  return body ?? '';
}

const SYNCING = (step: string, result: string) =>
  `(Stage::Syncing(SyncStep::${step}), ShellResult::${result})`;

describe('Rust side — the arms the TypeScript table mirrors', () => {
  test('the set of Syncing arms is exactly the one this gate covers', () => {
    // A one-sided ADDITION is the drift a per-row check cannot see: a new
    // Confirming/CheckingWalletRef answer that TypeScript has never heard of.
    const heads = [...ARMS.keys()]
      .filter((k) => k.startsWith('(Stage::Syncing'))
      .sort();
    expect(heads).toEqual([
      SYNCING('CheckingWalletRef', 'IndexFailed { .. }'),
      SYNCING('CheckingWalletRef', 'WalletRef { resolved }'),
      SYNCING('Confirming', 'IndexFailed { message, .. }'),
      SYNCING('Confirming', 'IndexMissing'),
      SYNCING('Confirming', 'IndexRecord { public_key_hex, .. }'),
      SYNCING('Creating', 'IndexCreated'),
      SYNCING('Creating', 'IndexFailed { message, .. }'),
      SYNCING('RemovingPending', 'PendingUploadRemoved'),
      SYNCING('RemovingPending', 'StorageFailed { .. }'),
      SYNCING('Waiting', 'Waited'),
    ].sort());
  });

  test('a failed create is not yet a failure — it still goes to the query', () => {
    expect(arm(SYNCING('Creating', 'IndexCreated'))).toContain('confirm_upload(model)');
    const failed = arm(SYNCING('Creating', 'IndexFailed { message, .. }'));
    expect(failed).toContain('model.sync.create_error = Some(message)');
    expect(failed).toContain('confirm_upload(model)');
  });

  test('the stored record decides, compared case-insensitively', () => {
    const body = arm(SYNCING('Confirming', 'IndexRecord { public_key_hex, .. }'));
    expect(body).toContain('eq_ignore_ascii_case');
    expect(body).toContain('check_wallet_ref(model)');
    expect(body).toContain('retry_or_fail(');
    expect(body).toContain(MISMATCH_MESSAGE);
  });

  test('a query that cannot answer is unconfirmed, preferring the create error', () => {
    for (const result of ['IndexMissing', 'IndexFailed { message, .. }']) {
      const body = arm(SYNCING('Confirming', result));
      expect(body).toContain('model.sync.create_error');
      expect(body).toMatch(/unwrap_or/);
      expect(body).toContain('retry_or_fail(model, detail)');
    }
  });

  test('the pending entry is cleared only on a RESOLVED wallet reference', () => {
    const body = arm(SYNCING('CheckingWalletRef', 'WalletRef { resolved }'));
    expect(body).toContain('if resolved {');
    expect(body).toContain('ShellOperation::RemovePendingUpload');
    // The `else` — reveal not landed — keeps it and carries on.
    expect(body).toContain('save_account(model)');
    // An unanswerable walletRef check is likewise never a reason to clear.
    const failed = arm(SYNCING('CheckingWalletRef', 'IndexFailed { .. }'));
    expect(failed).toContain('save_account(model)');
    expect(failed).not.toContain('RemovePendingUpload');
  });

  test('a failed local delete is not a failed registration', () => {
    expect(arm(SYNCING('RemovingPending', 'StorageFailed { .. }'))).toContain('save_account(model)');
  });
});
