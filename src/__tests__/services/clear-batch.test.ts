// The signing sheet's EIP-5792 batch derivations.
//
// These exist as pure functions precisely so this file can exercise them: the
// jest suite runs in `testEnvironment: 'node'` and only matches `*.test.ts`, so
// nothing here renders a component. What is covered is the STATE ALGEBRA the
// sheet used to express as a `batchResolving` boolean — the thing that latched.
//
// The scenario that motivated it, replayed below as `describe('a superseded
// wallet_sendCalls')`: a dApp sends a batch, its legs are still resolving when a
// second request arrives, and the sheet is NOT unmounted (both the web core and
// the native dApp-connection model overwrite the pending request in place). The
// old boolean's only reset lived in a `.finally` that the supersession
// cancelled, so `resolving` stayed true forever: the loading placeholder for
// every non-approval surface, a permanently disabled confirm, a permanently
// spinning slider. The only way out was to close the sheet — which is the
// REJECT path, so the dApp collected a 4001 the user never gave.

import {
  batchItemsFor,
  batchPassKey,
  batchPassPending,
  batchRowsAligned,
  displayTokenSymbol,
  TOKEN_SYMBOL_PLACEHOLDER,
  type BatchPass,
} from '@/services/wallet-state-core/clear-batch';

type Row = { to: string };

const legs = (...tos: string[]) => tos.map((to) => ({ to, data: '0x', value: '0x0' }));

describe('batchPassKey', () => {
  it('is stable across recomputation of an equal input', () => {
    // The sheet memoizes its input object; React may drop a `useMemo` cache at
    // any time. A key by object identity would then read as a NEW pass and
    // throw away resolved rows (back to the loading placeholder) for nothing.
    const a = batchPassKey('req-1', 1, legs('0xaaa', '0xbbb'));
    const b = batchPassKey('req-1', 1, legs('0xaaa', '0xbbb'));
    expect(a).toBe(b);
  });

  it('separates requests, chains, leg counts and leg contents', () => {
    const base = batchPassKey('req-1', 1, legs('0xaaa', '0xbbb'));
    expect(batchPassKey('req-2', 1, legs('0xaaa', '0xbbb'))).not.toBe(base);
    expect(batchPassKey('req-1', 8453, legs('0xaaa', '0xbbb'))).not.toBe(base);
    expect(batchPassKey('req-1', 1, legs('0xaaa'))).not.toBe(base);
    expect(batchPassKey('req-1', 1, legs('0xaaa', '0xccc'))).not.toBe(base);
  });

  it('does not let two different bundles collide by concatenation', () => {
    expect(batchPassKey('r', 1, [{ to: '0xab', data: '', value: '' }]))
      .not.toBe(batchPassKey('r', 1, [{ to: '0xa', data: 'b', value: '' }]));
  });

  it('survives malformed and hostile leg shapes', () => {
    // dApp-supplied params. A key that can throw would take the whole sheet
    // down on a request the wallet is supposed to be protecting the user from.
    expect(() => batchPassKey('r', 1, [null, undefined, 42, { to: {} }])).not.toThrow();
  });
});

describe('a superseded wallet_sendCalls', () => {
  const first = batchPassKey('req-1', 1, legs('0xaaa', '0xbbb'));
  const second = batchPassKey('req-2', 1, legs('0xccc'));

  it('is pending before its first answer', () => {
    expect(batchPassPending<Row>(first, null)).toBe(true);
    expect(batchItemsFor<Row>(first, null)).toBeNull();
  });

  it('settles when the answer for THAT request arrives', () => {
    const pass: BatchPass<Row> = { key: first, items: [{ to: '0xaaa' }, { to: '0xbbb' }] };
    expect(batchPassPending(first, pass)).toBe(false);
    expect(batchItemsFor(first, pass)).toBe(pass.items);
  });

  it('settles on a FAILED pass too — a failure is an answer, not a limbo', () => {
    const pass: BatchPass<Row> = { key: first, items: null };
    expect(batchPassPending(first, pass)).toBe(false);
    expect(batchItemsFor(first, pass)).toBeNull();
  });

  it('shows the second request as pending, never the first request rows', () => {
    // The exact mis-pairing the old code allowed: `items` was not cleared when
    // a new request replaced the old one, so the first frame of request 2 put
    // request 1's decoded amounts next to request 2's approval verdicts.
    const pass: BatchPass<Row> = { key: first, items: [{ to: '0xaaa' }, { to: '0xbbb' }] };
    expect(batchPassPending(second, pass)).toBe(true);
    expect(batchItemsFor(second, pass)).toBeNull();
  });

  it('cannot stay pending once the second request answers', () => {
    // The latch, replayed: request 1 in flight, request 2 supersedes it, and
    // request 1's continuation is cancelled and never writes anything. The only
    // write that ever lands is request 2's — and it clears the loading state,
    // because the state is a comparison, not a flag someone has to lower.
    const answered: BatchPass<Row> = { key: second, items: [{ to: '0xccc' }] };
    expect(batchPassPending(second, answered)).toBe(false);
  });

  it('is never pending for a request with no legs to resolve', () => {
    // A non-batch request (or a batch with an empty calls array) has no key, so
    // it cannot hold the sheet: no effect has to run to release it.
    expect(batchPassPending<Row>(null, null)).toBe(false);
    expect(batchPassPending<Row>(null, { key: first, items: [{ to: '0xaaa' }] })).toBe(false);
    expect(batchItemsFor<Row>(null, { key: first, items: [{ to: '0xaaa' }] })).toBeNull();
  });

  it('has no reachable state where a key has an answer and is still pending', () => {
    // Exhaustive over the shape: for every (key, pass) pair, "pending" and
    // "has rows" are mutually exclusive, and a settled pass is never pending.
    const keys: (string | null)[] = [null, first, second];
    const passes: (BatchPass<Row> | null)[] = [
      null,
      { key: first, items: [{ to: '0xaaa' }] },
      { key: first, items: null },
      { key: second, items: [{ to: '0xccc' }] },
    ];
    for (const key of keys) {
      for (const pass of passes) {
        const pending = batchPassPending(key, pass);
        const items = batchItemsFor(key, pass);
        expect(pending && items !== null).toBe(false);
        if (key !== null && pass?.key === key) expect(pending).toBe(false);
      }
    }
  });
});

describe('batchRowsAligned', () => {
  it('accepts the two machines only when they describe the same bundle', () => {
    expect(batchRowsAligned<Row>([{ to: '0xa' }, { to: '0xb' }], 2)).toBe(true);
    expect(batchRowsAligned<Row>([{ to: '0xa' }, { to: '0xb' }], 1)).toBe(false);
    expect(batchRowsAligned<Row>(null, 2)).toBe(false);
    expect(batchRowsAligned<Row>([{ to: '0xa' }], null)).toBe(false);
  });

  it('accepts an empty bundle described as empty by both', () => {
    expect(batchRowsAligned<Row>([], 0)).toBe(true);
  });
});

describe('displayTokenSymbol', () => {
  const meta = (symbol: string) => ({ symbol, decimals: 18, verified: true, loading: false });

  it('prints a real symbol', () => {
    expect(displayTokenSymbol(meta('USDC'))).toBe('USDC');
  });

  it('prints nothing for the in-flight / failed placeholder', () => {
    // Both guard controllers answer with this while the metadata read is in
    // flight AND when it failed outright. `Spending cap · 500 …` claims an
    // exact, already-capped amount is elided; `.trim()` cannot remove it.
    expect(displayTokenSymbol(meta(TOKEN_SYMBOL_PLACEHOLDER))).toBe('');
    expect(`Spending cap · 500 ${TOKEN_SYMBOL_PLACEHOLDER}`.trim())
      .toBe('Spending cap · 500 …');
  });

  it('prints nothing when there is no metadata at all', () => {
    expect(displayTokenSymbol(null)).toBe('');
    expect(displayTokenSymbol(undefined)).toBe('');
  });
});
