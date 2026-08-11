/**
 * useTxSettlement — NATIVE. The TypeScript self-poll the two receipt surfaces
 * have always run, moved behind one seam and otherwise unchanged.
 *
 * React Native runs on Hermes, which has no WebAssembly, so iOS and Android
 * keep every TypeScript poller `tx_tracker` unified on web (`waitForReceipt`,
 * `tx-reconciler.ts`, and this one). The loop below is the union of what
 * `TransactionReceipt.tsx` and `TransactionDetailSheet.tsx` each had inline:
 * first attempt one shared 3 s slot after mount, a bounded retry budget
 * (`nativeMaxAttempts` — 60 for the receipt, 40 for the detail sheet), stop on
 * the first definitive receipt, and — for the detail sheet only
 * (`nativePersist`) — write the verdict back to the records it belongs to.
 *
 * Nothing here classifies anything the RPC layer did not: `pollUserOpReceipt`
 * resolves non-null ONLY for a definitive receipt that named a transaction
 * hash, so `r.failed` is the bundler's `success === false`, not a timeout.
 *
 * `use-tx-settlement.web.ts` is the web counterpart: there the core owns the
 * poll, the deadlines and the write, and this file is never loaded.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { pollUserOpReceipt, USER_OP_RECEIPT_POLL_INTERVAL_MS } from '@/services/tx-reconciler';
import { updateTransaction } from '@/services/storage';
import {
  NO_SETTLEMENT,
  type TxSettlement,
  type TxSettlementRequest,
  type TxVerdict,
} from './tx-settlement-types';

export {
  NO_SETTLEMENT,
  verdictOf,
  type TxSettlement,
  type TxSettlementRequest,
  type TxVerdict,
} from './tx-settlement-types';

interface Target {
  hash: string;
  chainId: number;
  ids: string[];
}

export function useTxSettlement(request: TxSettlementRequest): TxSettlement {
  const { active, userOpHash, chainId, recordIds, nativeMaxAttempts, nativePersist, onResolved } =
    request;
  const [settlement, setSettlement] = useState<TxSettlement>(NO_SETTLEMENT);

  // The callback is a render-fresh closure; keeping it in a ref (written from
  // an effect, never during render) stops a new identity from restarting the
  // poll and losing the attempt budget.
  const resolvedRef = useRef(onResolved);
  useEffect(() => {
    resolvedRef.current = onResolved;
  });

  // One value identity per tracked op, so a parent re-render never restarts a
  // live poll: `recordIds` is usually a fresh array literal (`[tx.id]`).
  const idsKey = recordIds.join(',');
  const identity = userOpHash && chainId ? `${userOpHash}|${chainId}|${idsKey}` : '';
  const target = useMemo<Target | null>(
    () =>
      active && userOpHash && chainId
        ? { hash: userOpHash, chainId, ids: idsKey ? idsKey.split(',') : [] }
        : null,
    [active, userOpHash, chainId, idsKey],
  );

  // Reset on a new OP, never merely on the gate closing. A definitive receipt
  // is a fact about the op, not about the surface that happened to see it —
  // the same reason the core drops an aborted entry to the reconcile cadence
  // instead of forgetting it. (The detail sheet's inline loop used to clear on
  // every close; the receipt's never cleared at all. Clearing only on identity
  // change keeps both, because a cleared-while-hidden verdict was never
  // observable: the sheet re-reads the record it just persisted.)
  useEffect(() => {
    setSettlement(NO_SETTLEMENT);
  }, [identity]);

  useEffect(() => {
    if (!target) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const tick = async () => {
      if (cancelled) return;
      attempts++;
      const r = await pollUserOpReceipt(target.hash, target.chainId);
      if (cancelled) return;
      if (r && (r.confirmed || r.failed)) {
        const status: TxVerdict = r.failed ? 'failed' : 'confirmed';
        setSettlement({ status, txHash: r.txHash ?? null });
        if (nativePersist) {
          await Promise.all(
            target.ids.map((id) =>
              updateTransaction(id, {
                status,
                ...(r.txHash ? { txHash: r.txHash } : {}),
              }).catch(() => {}),
            ),
          );
        }
        resolvedRef.current?.();
        return; // final — stop polling
      }
      if (attempts < nativeMaxAttempts) timer = setTimeout(tick, USER_OP_RECEIPT_POLL_INTERVAL_MS);
    };
    // The background send waiter may already have made the initial request.
    // Wait for the next shared three-second slot instead of immediately issuing
    // a duplicate receipt RPC.
    timer = setTimeout(tick, USER_OP_RECEIPT_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [target, nativeMaxAttempts, nativePersist]);

  return settlement;
}
