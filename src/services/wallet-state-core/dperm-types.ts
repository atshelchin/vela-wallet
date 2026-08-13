/**
 * Platform-neutral types and copy for the `dapp_permissions` core (spec 017,
 * group G11).
 *
 * Standalone for the reason `sign-types.ts` states:
 * the retired native stub needed these declarations without
 * the web service graph behind them. The stub is gone; the split stays
 * because the vocabulary has importers of its own and keeps the wasm graph
 * out of anything that must not load it.
 */

import type { DpermGrant } from './generated/DpermGrant';
import type { DpermPopupView } from './generated/DpermPopupView';
import type { DpermRejectReason } from './generated/DpermRejectReason';
import type { DAppGrant } from '@/services/dapp-permissions';

/**
 * The stored grant on the wire. `grantedAt` crosses even though the core
 * never decides anything with it (grants have no TTL) — dropping it here
 * would quietly make the wire shape a lie about what is persisted.
 */
export function toWireGrant(grant: DAppGrant | null): DpermGrant | null {
  if (!grant) return null;
  return {
    origin: grant.origin,
    address: grant.address,
    chain_id: grant.chainId,
    granted_at_ms: grant.grantedAt,
  };
}

/** One popup request's question, in the shell's own vocabulary. */
export interface PopupRequestQuestion {
  /** The JSON-RPC method the popup was opened for. */
  method: string;
  /** The stored `vela.perm.<origin>` value, or `null` when there is none. */
  grant: DpermGrant | null;
  /**
   * Every wallet address. `null` (or empty) means "not known yet" — the core
   * must NOT log the origin out on a transient empty read.
   */
  currentAddresses: string[] | null;
  /** `peer.request.address`. The empty string is "no pin", as in the TS. */
  pinnedAddress: string | null | undefined;
}

export type PopupVerdict = DpermPopupView;

/**
 * The words for the core's refusal reasons — the core owns the code and the
 * reason, the shell owns the copy (the contract `DpermRejectReason` states).
 * Every string here is the one `web-request.tsx` already sent for that
 * situation, verbatim, so no dApp sees a changed message.
 *
 * Pure and dependency-free so both platforms can read it.
 */
export function dpermRejectMessage(reason: DpermRejectReason): string {
  switch (reason) {
    case 'not_connected':
      return 'Connect Vela Wallet to this site first';
    case 'stale_authorized_address':
      return 'The requested account is no longer authorized';
    case 'unauthorized_frame':
      return 'Unauthorized frame';
    case 'no_account_available':
      return 'No active wallet account is available';
    case 'consent_busy':
      return 'Another connection request is already open';
    case 'insecure_origin':
      return 'Signing is not available on an insecure (http) site';
    case 'user_rejected':
      return 'User rejected the connection';
    case 'navigated_away':
      return 'The page navigated away before the request finished';
    case 'browser_closed':
    default:
      return 'The browser closed before the request finished';
  }
}
