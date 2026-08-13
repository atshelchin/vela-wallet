/**
 * useTxSettlement — WEB. A mirror of one `tx_tracker` entry, and nothing else.
 *
 * `use-tx-settlement.ts` is the native counterpart: on Hermes there is no wasm,
 * so that module keeps the whole poller — the 3 s loop, the 40/60 attempt
 * budget, the write-back. On web all three belong to the core
 * (`rust/crates/vela-core/src/app/tx_tracker.rs`), whose module doc names the
 * two surfaces this hook serves as pollers it *replaces*, and
 * `tx-tracker-resident.web.ts` is the one app-resident machine that runs it.
 *
 * Three things move out of the surfaces by using this:
 *
 * 1. **The verdict.** The core decides; [`verdictOf`] only translates its seven
 *    states into the two words storage has. `unreachable`,
 *    `accepted_not_landed` and `fee_held` answer `null` — the surface learns
 *    nothing and shows what the record already said (invariant ①: a timeout is
 *    never a failure).
 * 2. **The write.** Nothing here touches storage. `UpdateTxRecords` is the
 *    core's single atomic write port (`storage.updateTransactions`, one
 *    read-modify-write for every sibling of a batch) and it is also what makes
 *    a confirmation reach `token_trust` with the authentic receipt logs. A
 *    surface that flipped the record itself would silently take the op out of
 *    `LoadPendingTxs`' filter (`status !== 'pending'` ⇒ skipped) and the core
 *    would never see it again.
 * 3. **The cadence.** No timer lives here. The resident's dumb 3 s tick plus
 *    Home focus / visibility resumes drive the machine; every throttle, the
 *    120 s window and the 24 h abandon line are the core's.
 *
 * `trackSubmitted` is the handoff, and is documented-idempotent: a second
 * consumer of a hash already tracked joins the SAME entry, the same in-flight
 * request and the same 3 s cooldown, merging its record ids in. So a detail
 * sheet opened on a pending row costs no extra bundler traffic even while the
 * send screen is watching the same op.
 *
 * A closing surface deliberately does NOT dispatch `Abort`: the same hash may
 * still be the send screen's, and `Abort` slows that entry to the reconcile
 * cadence. Tracking is app-resident precisely so it outlives every screen.
 *
 * `getSnapshot` reads the resident's last committed view, which is the
 * `useSyncExternalStore` contract, not a render-time read of mutable module
 * state: it is only ever consulted through the store, and every mutation is
 * announced through `subscribe`.
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import {
  ensureTxTracker,
  subscribeTxTracker,
  trackSubmitted,
  txTrackerView,
} from '@/services/wallet-state-core/tx-tracker-resident';
import {
  NO_SETTLEMENT,
  verdictOf,
  type TxSettlement,
  type TxSettlementRequest,
} from './tx-settlement-types';

export {
  NO_SETTLEMENT,
  verdictOf,
  type TxSettlement,
  type TxSettlementRequest,
  type TxVerdict,
} from './tx-settlement-types';

export function useTxSettlement(request: TxSettlementRequest): TxSettlement {
  const { active, userOpHash, chainId, recordIds, onResolved } = request;
  // The core keys every entry by the lowercased hash (`receiptPollKey`), so two
  // surfaces that case it differently still meet at one entry.
  const key = active && userOpHash && chainId ? userOpHash.toLowerCase() : '';
  const idsKey = recordIds.join(',');

  // Hand the op over. Idempotent by hash in the core, so this is safe to
  // re-run: it merges the ids this surface knows about into whatever entry the
  // send screen, the sign sheet or the recovery sweep already created.
  useEffect(() => {
    if (!key || !chainId) return;
    trackSubmitted(key, idsKey ? idsKey.split(',') : [], chainId);
  }, [key, chainId, idsKey]);

  const view = useSyncExternalStore(
    (cb) => {
      // Mirrors every other resident consumer: construction is idempotent, and
      // the boot `AppResumed` sweep IS the cross-restart recovery.
      ensureTxTracker();
      return subscribeTxTracker(cb);
    },
    txTrackerView,
    txTrackerView,
  );

  const settlement = useMemo(
    () => (key ? verdictOf(view.entries.find((entry) => entry.user_op_hash === key)) : NO_SETTLEMENT),
    [view, key],
  );

  // Tell the feed once, when a verdict lands. The core already announced the
  // patch through `feedReconciled`; this is only the caller's own refresh.
  const resolvedRef = useRef(onResolved);
  useEffect(() => {
    resolvedRef.current = onResolved;
  });
  const status = settlement.status;
  useEffect(() => {
    if (status) resolvedRef.current?.();
  }, [status]);

  return settlement;
}
