/**
 * The settlement axis the two receipt surfaces read — and the ONE place the
 * core's seven-state verdict is narrowed to the two words storage has.
 *
 * `TransactionReceipt` and `TransactionDetailSheet` used to each run their own
 * bundler poll and each classify the answer (`r.failed ? 'failed' : 'confirmed'`,
 * budgets of 60 and 40). `tx_tracker` (spec 016/017,
 * `rust/crates/vela-core/src/app/tx_tracker.rs`) replaced all of that: its
 * module doc names both of those pollers explicitly, it owns every cadence, the
 * 120 s window, the 24 h abandon line, and it is the only writer of a record
 * patch (`UpdateTxRecords` → `storage.updateTransactions`, one atomic
 * read-modify-write for every sibling of a batch).
 *
 * The narrowing below is deliberately *lossy in one direction only*: the four
 * non-verdicts (`pending`, `fee_held`, `unreachable`, `accepted_not_landed`)
 * become `null`, never a status. `null` means "this surface has learnt
 * nothing new" — the record keeps whatever it already said. That is invariant ①
 * of the machine: a timeout, an unreachable bundler or an op the bundler
 * accepted but has not landed is NEVER a failure, and must never be persisted
 * as one. It is the same narrowing `tx-tracker-resident.web.ts`'s `outcomeOf`
 * applies for the send screen, kept exhaustive with no `default` for the same
 * reason: a new verdict in the core must break this build rather than default
 * into silence on a money surface.
 */
import type { TrackEntryView } from '@/services/wallet-state-core/generated/TrackEntryView';

/** What a receipt surface may *say* about a transaction it did not start. */
export type TxVerdict = 'confirmed' | 'failed';

export interface TxSettlement {
  /** A terminal verdict, or `null` while the op is still in flight/unknown. */
  status: TxVerdict | null;
  /** The on-chain hash a definitive receipt named — for drops too. */
  txHash: string | null;
}

/** Nothing learnt. A frozen singleton so `useMemo` consumers keep identity. */
export const NO_SETTLEMENT: TxSettlement = Object.freeze({ status: null, txHash: null });

/**
 * Read one `tx_tracker` entry as a settlement verdict.
 *
 * Pure, and the only business judgement this shell layer is allowed to make —
 * it is a vocabulary translation (seven core states → storage's two terminal
 * words), not a classification: every "is this over, and did it succeed"
 * decision was already taken in Rust.
 */
export function verdictOf(entry: TrackEntryView | undefined | null): TxSettlement {
  if (!entry) return NO_SETTLEMENT;
  switch (entry.status) {
    case 'confirmed':
      // A confirmation without a hash cannot happen (the core only builds
      // `Confirmed { tx_hash }` from a receipt that named one), but a verdict
      // we cannot link to a block is not one worth showing.
      return entry.tx_hash ? { status: 'confirmed', txHash: entry.tx_hash } : NO_SETTLEMENT;
    case 'dropped':
      // A definitive `success === false` receipt — dropped or reverted. The
      // hash is shown (the explorer explains it) but never persisted: the
      // core's only failure-patch constructor writes `tx_hash: None`.
      return { status: 'failed', txHash: entry.tx_hash };
    case 'rejected':
      // The relay refused it before any block; nothing was sent, so there is
      // no hash to link.
      return { status: 'failed', txHash: null };
    case 'pending':
    case 'fee_held':
    case 'unreachable':
    case 'accepted_not_landed':
      // Invariant ①. Still in flight, parked until fees settle, or genuinely
      // unknown — all four keep the record exactly as it is.
      return NO_SETTLEMENT;
  }
}

/**
 * What a surface asks to be told about. `active` is the whole gate: while it is
 * false nothing is tracked and the answer is [`NO_SETTLEMENT`].
 */
export interface TxSettlementRequest {
  /** Track only while the surface is on screen AND the record is still open. */
  active: boolean;
  userOpHash: string | null | undefined;
  chainId: number | null | undefined;
  /**
   * The stored records this UserOp wrote (one per batch recipient).
   *
   * Web: handed to the core, which patches exactly these ids through its one
   * atomic write port. Native: patched here, but only when `nativePersist`.
   */
  recordIds: readonly string[];
  /**
   * NATIVE ONLY — the self-poll's retry budget (Hermes has no WebAssembly, so
   * iOS/Android keep the TypeScript poller this hook wraps). The web
   * implementation ignores it: cadence and deadlines are the core's.
   */
  nativeMaxAttempts: number;
  /**
   * NATIVE ONLY — persist the verdict to `recordIds`. On web the core is the
   * only writer, so this field has no reader there.
   */
  nativePersist: boolean;
  /** Fired once, after a verdict lands, so the feed can re-read the store. */
  onResolved?: () => void;
}
