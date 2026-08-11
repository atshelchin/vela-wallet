/**
 * What the RPC recovery banner's "save a working endpoint" step can end as.
 *
 * A standalone module for the reason `network-admin-controller-types.ts` is one:
 * `rpc-fix.ts` / `rpc-fix.web.ts` are a platform pair, and a `.web.ts` that
 * imports its own base specifier resolves back to itself under Metro and
 * recurses at module init. Both variants import the vocabulary from here.
 *
 * The vocabulary is deliberately a verdict, not a boolean. "Saved" and "refused
 * because the endpoint proved it serves another chain" are different outcomes
 * with different copy, and "could not reach it" is NOT a third refusal — see
 * `rpc-fix.web.ts`.
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
