/**
 * Platform-neutral types for the web popup's APPROVE half — the second door
 * into the `dapp_permissions` core (spec 017, group G11).
 *
 * Standalone for the same reason `dperm-types.ts` is: the native stub
 * (`dperm-connect.ts`) needs these declarations, and importing them from a
 * `.web` module would drag the web-only wasm graph into the native bundle.
 *
 * `dperm-types.ts` covers the popup's QUESTION (`decide_popup_request`); this
 * covers what happens after the user presses Connect, which the core owns
 * end to end in `consent_approved`: which address the grant is written for,
 * which chain it records, that a "Connected to <app>" audit row is written at
 * all, and what the dApp is answered with.
 */

import type { DpermGrant } from './generated/DpermGrant';
import type { DpermRejectReason } from './generated/DpermRejectReason';
import type { DpermRespondPayload } from './generated/DpermRespondPayload';

/**
 * Everything the core needs to author one popup connection. Every field is a
 * FACT the shell observed, never a judgement it made:
 *
 * - `chainId` is `peer.request.chainId`, the chain this popup session is for.
 *   The popup has no other notion of a current chain — it is a one-shot window
 *   opened for one request, the request names its chain, `assertChainSupported`
 *   has already refused it if the wallet cannot serve it, and the signing
 *   pipeline downstream reads that same number off `transport.requestChainId`.
 * - `nowMs` is the shell's clock; the core owns none.
 * - `storedGrant` is the `vela.perm.<origin>` value as read, `null` when
 *   absent or unreadable.
 */
export interface PopupConnectQuestion {
  origin: string;
  /** `peer.request.id` — the id the answer must be addressed to. */
  requestId: string;
  /** The JSON-RPC method the popup was opened for. */
  method: string;
  /** The account shown on the consent card. */
  activeAddress: string;
  /** Every wallet address; `null`/empty means "not known yet". */
  currentAddresses: string[] | null;
  chainId: number;
  nowMs: number;
  storedGrant: DpermGrant | null;
}

/** The `SaveConnectionRecord` operation, in the shell's own vocabulary. */
export interface PopupConnectRecord {
  address: string;
  chainId: number;
  /** The full origin. The shell derives the display host — presentation. */
  origin: string;
}

/**
 * The core's three authored operations for one approved connection. The shell
 * performs them; it decides none of them.
 */
export interface PopupConnectPlan {
  /** `WriteGrant` — persist verbatim. */
  grant: DpermGrant;
  /** `SaveConnectionRecord` — the "Connected to <app>" audit row. */
  record: PopupConnectRecord;
  /** `Respond` — the payload `popupResult` encodes for the dApp. */
  respond: DpermRespondPayload;
}

/**
 * How a still-pending request is settled when the popup goes away.
 *
 * The code is the core's, and it is the whole point: 4900 unknown-pending,
 * never 4001. A dApp reads 4001 as "the user said no, nothing happened" and
 * re-sends — double-spending a UserOp that may already be at the bundler.
 */
export interface PopupSettlement {
  code: number;
  reason: DpermRejectReason;
}
