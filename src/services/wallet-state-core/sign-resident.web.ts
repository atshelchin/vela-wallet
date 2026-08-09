/**
 * The one `sign_request` core the web app has — WEB only, and APP-RESIDENT.
 *
 * The dApp signing lifecycle outlives every screen: the sheet is rendered by a
 * root-level `<SigningRequestModal>`, a Safari-extension sign arrives while the
 * user is anywhere in the app, and the same-session settled-rid registry (⑧: a
 * rid never signs twice) must survive navigation. So the core is a module-level
 * singleton, the `session-resident.web.ts` pattern.
 *
 * Three things this module owes its consumers:
 *
 * - **The transport table.** The core speaks `transport_id` and nothing else
 *   about transports; the id → instance map lives here so a response always
 *   reaches the transport that OWNS the request (F2) even when a WalletPair
 *   session and an extension sign are live at the same time.
 * - **Reference stability.** `incomingRequest` is the dependency of
 *   `SigningSheet`'s descriptor resolution, gas estimate and simulation — three
 *   network round trips. The effect loop commits a view after every dispatch
 *   AND every effect resolution, so equal views are dropped here and the
 *   projected request/funding objects are rebuilt only when they actually
 *   changed (`session-resident.web.ts`'s account-array rule, same reason).
 * - **A first frame identical to today's.** `INITIAL_VIEW` mirrors the core's
 *   pristine projection: no request, nothing signing, no error.
 *
 * Imported by explicit `.web` specifier on every side: `tsc` resolves a
 * `.web.ts` file's own imports to the base `.ts` variant, so a bare specifier
 * would type-check against a native module that does not exist.
 */

import { createSignRequestSession } from '@/services/wallet-state-core/sign-session.web';
import { fromWireWei } from '@/services/wallet-state-core/sign-executor.web';
import { dispatchWalletSession } from '@/services/wallet-state-core/session-resident.web';
import { formatWei, type FundingNeeded } from '@/services/bundler-service';
import { getAllNetworksSync } from '@/models/network';
import type { AssetSimResult } from '@/services/tx-simulation';
import type { DAppInfo, DAppTransport } from '@/services/dapp-transport';
import type { BLEIncomingRequest } from '@/models/types';
import type { SignEvent } from './generated/SignEvent';
import type { SignTrackerHandoff } from './generated/SignTrackerHandoff';
import type { SignView } from './generated/SignView';

/**
 * The id every request that carries no transport of its own is stamped with.
 * It resolves to whatever the durable (WalletPair / remote-inject) transport is
 * AT RESPONSE TIME, which is exactly what `responseTransport(req, transportRef.current)`
 * did. In practice every transport-sourced request carries its own instance, so
 * this is the defensive tail rather than a live path.
 */
export const DURABLE_TRANSPORT_ID = 'durable';

/** The machine's own initial projection — mirrored until the first view lands. */
const INITIAL_VIEW: SignView = {
  surface: 'hidden',
  request: null,
  is_signing: false,
  is_submitting: false,
  pending_op_hash: null,
  error: null,
  funding: null,
  confirm_gate_open: false,
  reconcile_pending: false,
  swipe_action: 'none',
  tracker_handoff: null,
  notice: null,
  global_chain_id: 1,
};

let current: SignView = INITIAL_VIEW;
/** Structural key of `current`, so an unchanged view never re-renders the app. */
let currentKey = JSON.stringify(INITIAL_VIEW);

let currentRequest: BLEIncomingRequest | null = null;
let currentRequestKey = 'null';
let currentFunding: FundingNeeded | null = null;
let currentFundingKey = 'null';

const listeners = new Set<(view: SignView) => void>();
let session: ReturnType<typeof createSignRequestSession> | null = null;

// ---------------------------------------------------------------------------
// The transport table (F2)
// ---------------------------------------------------------------------------

/**
 * Bounded, like `MAX_TRACKED_USEROPS` (`use-dapp-signing.ts:41`): a long-lived
 * tab can install many one-shot extension/popup transports, and a dropped one
 * must still be answerable for as long as its own pipeline can be in flight.
 * Nothing is evicted on 'disconnected' for exactly that reason — an extension
 * transport goes disconnected only AFTER it wrote its result.
 */
const MAX_TRACKED_TRANSPORTS = 32;
const transportIds = new WeakMap<DAppTransport, string>();
const transportsById = new Map<string, DAppTransport>();
let nextTransportId = 0;
let durableTransport: DAppTransport | null = null;

/** Stable id for a transport instance, minted on first sight. */
export function registerSignTransport(transport: DAppTransport): string {
  const known = transportIds.get(transport);
  if (known) {
    // Re-assert the strong entry: a long-lived durable transport must not be
    // evicted out from under its own in-flight request.
    transportsById.delete(known);
    transportsById.set(known, transport);
    return known;
  }
  nextTransportId += 1;
  const id = `t${nextTransportId}`;
  transportIds.set(transport, id);
  if (transportsById.size >= MAX_TRACKED_TRANSPORTS) {
    const oldest = transportsById.keys().next().value;
    if (oldest !== undefined) transportsById.delete(oldest);
  }
  transportsById.set(id, transport);
  return id;
}

/** The id a transport was registered under, or the durable sentinel. */
export function signTransportId(transport: DAppTransport | null): string {
  if (!transport) return DURABLE_TRANSPORT_ID;
  return transportIds.get(transport) ?? registerSignTransport(transport);
}

/** Track the durable (WalletPair / remote-inject) transport the sentinel means. */
export function setSignDurableTransport(transport: DAppTransport | null): void {
  durableTransport = transport;
  if (transport) registerSignTransport(transport);
}

function transportFor(transportId: string): DAppTransport | null {
  if (transportId === DURABLE_TRANSPORT_ID) return durableTransport;
  return transportsById.get(transportId) ?? durableTransport;
}

// ---------------------------------------------------------------------------
// Shell-side facts the core deliberately does not carry
// ---------------------------------------------------------------------------

/**
 * The sign-time simulation of the last approve. A single slot, exactly like the
 * `lastApproveOptsRef` it ports: the approve pipeline is single-flight in the
 * core, so at most one record can be in flight for it at a time.
 */
let approveAssetSim: AssetSimResult | null = null;

export function setSignApproveExtras(assetSim: AssetSimResult | null | undefined): void {
  approveAssetSim = assetSim ?? null;
}

/**
 * The `tx_tracker` seam.
 *
 * `view.tracker_handoff` appears the moment the bundler accepts an op, carrying
 * the hash, the record ids it belongs to and the chain. Deciding what happens
 * to that op next — the receipt poll, the reconcile, the record patch on a
 * dropped op — is `tx_tracker`'s job, and `tx_tracker` is not wired yet. So
 * this is the single entry point that machine will call once it is:
 *
 * ```ts
 * setSignTrackerSink((handoff) => dispatchTxTracker({
 *   type: 'submitted', user_op_hash: handoff.user_op_hash,
 *   record_ids: handoff.record_ids, chain_id: handoff.chain_id, now_ms: Date.now(),
 * }));
 * ```
 *
 * Deliberately NOT given a stand-in caller: today's receipt wait lives inside
 * `handleDAppRequest` (the `waitForTxHash()` the submit operation already
 * awaits) and the resume-on-launch sweep in the provider, so there is no second
 * data source to fake. Handoffs are de-duplicated by hash here, which is the
 * same idempotence `tx_tracker::Event::Submitted` documents.
 */
let trackerSink: ((handoff: SignTrackerHandoff) => void) | null = null;
let lastHandoffHash = '';

export function setSignTrackerSink(sink: ((handoff: SignTrackerHandoff) => void) | null): void {
  trackerSink = sink;
}

function drainTrackerHandoff(view: SignView): void {
  const handoff = view.tracker_handoff;
  if (!handoff) return;
  if (handoff.user_op_hash === lastHandoffHash) return;
  lastHandoffHash = handoff.user_op_hash;
  trackerSink?.(handoff);
}

// ---------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------

/**
 * Request id → the per-request stamps `handleIncoming` used to write onto
 * `incomingRequest` (F2/F3). The view answers by id and never asks the shell to
 * look a transport up, and `SignDappIdentity` is name+url only — the sheet's
 * banner also renders the session's `icon`, so the WHOLE `DAppInfo` is kept
 * here and only the request's OWN identity is stamped. An ordinary relay
 * request stamps none, so `requestDApp(request, dappInfo)` keeps falling back to
 * the live session identity exactly as it always did.
 *
 * Bounded for the same reason the transport table is.
 */
interface RequestBinding {
  transportId: string;
  dapp: DAppInfo | null;
}

const requestBindings = new Map<string, RequestBinding>();

export function bindSignRequest(
  requestId: string,
  transportId: string,
  dapp: DAppInfo | null,
): void {
  if (requestBindings.size >= MAX_TRACKED_TRANSPORTS) {
    const oldest = requestBindings.keys().next().value;
    if (oldest !== undefined) requestBindings.delete(oldest);
  }
  requestBindings.delete(requestId);
  requestBindings.set(requestId, { transportId, dapp });
}

function projectRequest(view: SignView): BLEIncomingRequest | null {
  const request = view.request;
  if (!request) return null;
  let params: any[] = [];
  try {
    const parsed: unknown = JSON.parse(request.params_json);
    if (Array.isArray(parsed)) params = parsed;
  } catch {
    /* the sheet renders an empty payload rather than crashing */
  }
  const binding = requestBindings.get(request.id);
  return {
    id: request.id,
    method: request.method,
    params,
    origin: request.origin,
    // F2/F3/F4, stamped exactly as `handleIncoming` stamped them: the owning
    // transport, the request's own chain and its own dApp identity.
    __transport: transportFor(binding?.transportId ?? DURABLE_TRANSPORT_ID),
    __chainId: request.chain_id,
    // The WHOLE identity object, `icon` included — the sheet's banner renders it.
    __dapp: binding?.dapp ?? undefined,
  };
}

function projectFunding(view: SignView): FundingNeeded | null {
  const funding = view.funding;
  if (!funding) return null;
  const recommendedWei = fromWireWei(funding.data.recommended_wei);
  const currentBalance = fromWireWei(funding.data.current_balance_wei);
  return {
    depositAddress: funding.data.deposit_address,
    safeAddress: funding.data.safe_address,
    chainId: funding.data.chain_id,
    nativeSym: funding.data.native_symbol,
    thresholdWei: fromWireWei(funding.data.threshold_wei),
    recommendedWei,
    currentBalance,
    recommendedFormatted: formatWei(recommendedWei),
    currentFormatted: formatWei(currentBalance),
    presentation: funding.presentation,
    denialReason: funding.denial_reason ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// The session
// ---------------------------------------------------------------------------

export function ensureSignRequest() {
  if (!session) {
    session = createSignRequestSession({
      onView: (view: SignView) => {
        const key = JSON.stringify(view);
        if (key === currentKey) return;
        currentKey = key;
        const requestKey = JSON.stringify(view.request);
        if (requestKey !== currentRequestKey) {
          currentRequestKey = requestKey;
          currentRequest = projectRequest(view);
        }
        const fundingKey = JSON.stringify(view.funding);
        if (fundingKey !== currentFundingKey) {
          currentFundingKey = fundingKey;
          currentFunding = projectFunding(view);
        }
        current = view;
        drainTrackerHandoff(view);
        listeners.forEach((listener) => listener(view));
      },
      onError: (error) => console.error('[sign_request] core fault:', error),
      ports: {
        transportFor,
        opSubmitted: (id, userOpHash) => {
          dispatchSign({ type: 'op_submitted', id, user_op_hash: userOpHash, now_ms: Date.now() });
        },
        assetSim: () => approveAssetSim,
        switchActiveAccount: async (index: number) => {
          // §12.1.6 step 1 (integration-plan §12.1.6): the switch itself is
          // synchronous in the session core, but React has not committed when
          // it returns — and any surface still reading the signer through
          // `useWallet()` would act on the OLD account. The yield that used to
          // sit at `web-request.tsx:207` lives here now, so the ack the core
          // gates the approval surface on means "the switch has landed".
          //
          // The index is the session's OWN row index: the shell feeds this
          // machine from `walletSessionAccounts()`, so the two lists are one
          // list. An index from any other domain would be a silent whole no-op
          // in the session and the wallet would sign from the wrong account.
          dispatchWalletSession({ type: 'switch_account', index });
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        },
      },
    });
    // `start` commits the core's pristine view first, which is the frame
    // `INITIAL_VIEW` already mirrors. A networks snapshot is the only event
    // that can safely be first: until it arrives every chain is unsupported
    // (fail-closed), so a shell that forgot it would 4902 everything.
    session.start(networksEvent());
  }
  return session;
}

export function dispatchSign(event: SignEvent): void {
  ensureSignRequest().dispatch(event);
}

// ---------------------------------------------------------------------------
// Inputs the shell owns
// ---------------------------------------------------------------------------

let networksKey: string | null = null;

function supportedChainIds(): number[] {
  return getAllNetworksSync().map((network) => network.chainId);
}

function networksEvent(): SignEvent {
  const chainIds = supportedChainIds();
  networksKey = chainIds.join(',');
  return { type: 'networks_changed', chain_ids: chainIds };
}

/**
 * Re-assert the supported-network set. `assertChainSupported` read
 * `getAllNetworksSync()` live at every call, and a custom network can be added
 * at any time, so this runs immediately before every arrival/chain-switch
 * dispatch. Unchanged sets are dropped, so it costs one string compare.
 */
export function syncSignNetworks(): void {
  const chainIds = supportedChainIds();
  const key = chainIds.join(',');
  if (session && key === networksKey) return;
  ensureSignRequest();
  if (key === networksKey) return; // the boot event above already carried it
  networksKey = key;
  dispatchSign({ type: 'networks_changed', chain_ids: chainIds });
}

let accountsKey = '';

/**
 * The wallet accounts snapshot. Fed from the SESSION's own rows so
 * `SwitchActiveAccount.index` lands in the domain that consumes it — see the
 * index-domain note in `switchActiveAccount` above.
 */
export function setSignAccounts(
  accounts: { address: string; id: string }[],
  activeIndex: number,
): void {
  const key = `${activeIndex}|${accounts.map((account) => `${account.address}:${account.id}`).join(',')}`;
  if (key === accountsKey && session) return;
  accountsKey = key;
  dispatchSign({
    type: 'accounts_changed',
    accounts: accounts.map((account) => ({
      address: account.address,
      credential_id: account.id,
    })),
    active_index: activeIndex,
  });
}

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

/** The latest committed view. Synchronous — that is the whole point. */
export function signRequestView(): SignView {
  return current;
}

/** The request on the sheet, in the shape the sheet has always read. */
export function signRequestPending(): BLEIncomingRequest | null {
  return currentRequest;
}

/** The funding facts behind the in-sheet funding view. */
export function signRequestFunding(): FundingNeeded | null {
  return currentFunding;
}

/** Subscribe to every committed view. Returns the unsubscribe. */
export function subscribeSignRequest(listener: (view: SignView) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
