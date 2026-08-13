/**
 * What the RPC recovery banner's "save a working endpoint" step can end as.
 *
 * A standalone module from the days this controller was a platform pair:
 * the pair could not import its own base file (Metro resolved it back to
 * the `.web.ts` half and recursed at module init), so both halves imported
 * from here. The pair is gone; the module stays as the one place the
 * contract the screens compile against is declared.
 *
 * The vocabulary is deliberately a verdict, not a boolean. "Saved" and "refused
 * because the endpoint proved it serves another chain" are different outcomes
 * with different copy, and "could not reach it" is NOT a third refusal — see
 * `rpc-fix.ts`.
 */

export type RpcFixOutcome =
  /** Written, pools flushed. The caller may close and re-fetch. */
  | { kind: 'saved' }
  /**
   * REFUSED on proof: the endpoint answered `eth_chainId` with another chain's
   * id. Nothing was written; the previously saved endpoint still serves.
   */
  | { kind: 'wrong-chain'; expected: number; actual: number }
  /**
   * REFUSED because the endpoint could not be reached at all.
   *
   * Native only. On web this is never produced: an unreachable endpoint is
   * "unable to verify", not "wrong", and refusing it locks a user out of the
   * one screen that exists to replace a dead endpoint. Kept in the vocabulary
   * because the native controller still behaves the old way (FR-202).
   */
  | { kind: 'unreachable' }
  /** The save could not be attempted at all (storage/core fault). */
  | { kind: 'failed' };
