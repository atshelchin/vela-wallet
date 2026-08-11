/**
 * `verdictOf` — the ONE business judgement the two receipt surfaces still make,
 * and it is a vocabulary translation, not a classification.
 *
 * Both surfaces used to run their own bundler poll and decide
 * `r.failed ? 'failed' : 'confirmed'`; `tx_tracker`
 * (`rust/crates/vela-core/src/app/tx_tracker.rs`) took that decision back and
 * answers seven states. Three of them are honest "unknown"s — `fee_held`,
 * `unreachable`, `accepted_not_landed` — and the whole point of this function
 * is that NONE of them may become a status a surface shows or a record stores.
 * That is the machine's invariant ①: a timeout or an unreachable bundler is
 * never a failure, because marking it failed invites a re-send and a double
 * spend.
 *
 * Mutation proof for the fix these tests guard: make any non-verdict return a
 * status (the pre-fix `r.failed ? 'failed' : 'confirmed'` shape), or let
 * `rejected` carry a hash, and the cases below go red.
 */
import { NO_SETTLEMENT, verdictOf } from '@/hooks/tx-settlement-types';
import type { TrackEntryView } from '@/services/wallet-state-core/generated/TrackEntryView';
import type { TrackStatus } from '@/services/wallet-state-core/generated/TrackStatus';

function entry(status: TrackStatus, txHash: string | null = null): TrackEntryView {
  return {
    user_op_hash: '0xabc',
    chain_id: 8453,
    record_ids: ['rec-1', 'rec-2'],
    status,
    tx_hash: txHash,
    polling: true,
    submitted_at_ms: 1_700_000_000_000,
  };
}

describe('verdictOf', () => {
  it('reports nothing when the core has no entry for the hash', () => {
    expect(verdictOf(undefined)).toEqual(NO_SETTLEMENT);
    expect(verdictOf(null)).toEqual(NO_SETTLEMENT);
  });

  it('confirms only with the hash a definitive receipt named', () => {
    expect(verdictOf(entry('confirmed', '0xdead'))).toEqual({
      status: 'confirmed',
      txHash: '0xdead',
    });
  });

  it('does not confirm a confirmation it cannot link to a block', () => {
    expect(verdictOf(entry('confirmed', null))).toEqual(NO_SETTLEMENT);
  });

  it('fails a dropped op and keeps its hash for the explorer link', () => {
    // The core's own failure patch writes `tx_hash: None`; the hash is a
    // display affordance here, and nothing on these screens persists it.
    expect(verdictOf(entry('dropped', '0xbeef'))).toEqual({
      status: 'failed',
      txHash: '0xbeef',
    });
  });

  it('fails a relay rejection with no hash — nothing was ever sent', () => {
    expect(verdictOf(entry('rejected', '0xbeef'))).toEqual({ status: 'failed', txHash: null });
  });

  // The heart of it. Each of these was a `confirmed`/`failed` write before the
  // core owned the verdict.
  it.each<TrackStatus>(['pending', 'fee_held', 'unreachable', 'accepted_not_landed'])(
    'refuses to turn %s into a verdict',
    (status) => {
      expect(verdictOf(entry(status))).toEqual(NO_SETTLEMENT);
      // Even when the core happens to know a hash, a non-verdict stays silent:
      // the surface must keep showing whatever the stored record says.
      expect(verdictOf(entry(status, '0xfeed'))).toEqual(NO_SETTLEMENT);
    },
  );

  it('is exhaustive over TrackStatus — a new core verdict must break the build', () => {
    // A compile-time assertion made visible: every arm above is a literal from
    // the generated union, so adding one to the core leaves `verdictOf` with a
    // missing return and `tsc` fails before this file ever runs.
    const all: TrackStatus[] = [
      'pending',
      'fee_held',
      'confirmed',
      'dropped',
      'rejected',
      'unreachable',
      'accepted_not_landed',
    ];
    for (const status of all) {
      expect(() => verdictOf(entry(status, '0x1'))).not.toThrow();
    }
    expect(all).toHaveLength(7);
  });
});
