/**
 * The one `sign_request` core the web app has — WEB only, and APP-RESIDENT.
 *
 * The dApp signing lifecycle outlives every screen: the sheet is rendered by a
 * root-level `<SigningRequestModal>`, a Safari-extension sign arrives while the
 * user is anywhere in the app, and the same-session settled-rid registry (⑧: a
 * rid never signs twice) must survive navigation. So the core is a module-level
 * singleton, the `session-resident.ts` pattern.
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
 *   changed (`session-resident.ts`'s account-array rule, same reason).
 * - **A first frame identical to today's.** `INITIAL_VIEW` mirrors the core's
 *   pristine projection: no request, nothing signing, no error.
 *
 * (In the platform-pair days this file had to be imported by explicit `.web`
 * specifier — a relic the pair collapse removed; imports are bare now.)
 */

import { createSignRequestSession } from '@/services/wallet-state-core/sign-session';
import { fromWireWei } from '@/services/wallet-state-core/sign-executor';
import {
  dispatchWalletSession,
  walletSessionAccounts,
  walletSessionView,
} from '@/services/wallet-state-core/session-resident';
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

/**
 * §12.1.6's fail-closed branch: the switch the core asked for is not a switch
 * to the account this request was granted to. Say so, and NEVER ack — the ack
 * is what opens the approval surface, so acking here is precisely the silent
 * wrong-account signature the rule exists to prevent. The user can still
 * reject or dismiss the sheet; only approving is dead.
 */
function refuseSwitch(
  index: number,
  intended: string | null,
  target: string | null,
): Promise<never> {
  console.error(
    `[sign_request] §12.1.6: refusing the granted-account switch — index ${index} is not ` +
      `the session's row for ${intended ?? '(unknown signer)'} (that row holds ` +
      `${target ?? 'nothing'}). The accounts this machine holds are not the session's own ` +
      'rows, so the index domains disagree. The approval surface stays shut; nothing is signed.',
  );
  // Deliberately never resolves.
  return new Promise<never>(() => {});
}

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
          // §12.1.6 step 2. The signer no longer travels through React at all:
          // the core picks it out of its OWN `accounts`/`active_index` (see
          // `sign_request.rs::sign_account_index`) and hands it to
          // `SignAndSubmit` and `CheckBundlerFunding` directly, so acking this
          // operation no longer has to wait for a React commit. Step 1's
          // `setTimeout(0)` — which is where `web-request.tsx:207`'s timeout
          // had moved — is therefore gone, and the ack is immediate.
          //
          // What replaces it is stronger than a yield: the switch is VERIFIED
          // to have landed before it is acked. `dispatchWalletSession` commits
          // the session's view synchronously (`effect-loop.ts` commits inside
          // `dispatch`), and `SwitchAccount` with an out-of-range index is a
          // silent WHOLE no-op there (`session.rs::switch_account`, invariant
          // ①). Silent is the danger: the surface would open on an account the
          // origin was never granted. So we check, and a failure is fail-closed
          // — never acked, so `confirm_gate_open` stays false and nothing can
          // be signed. The user can still reject or dismiss the sheet.
          const intended = current.request?.signer_address ?? null;
          const target = walletSessionAccounts()[index]?.address ?? null;
          // Checked BEFORE the dispatch: a bad index must not move the user's
          // active account either.
          if (target === null || (intended !== null && !sameAddress(target, intended))) {
            return refuseSwitch(index, intended, target);
          }
          dispatchWalletSession({ type: 'switch_account', index });
          if (walletSessionView().active_index !== index) {
            return refuseSwitch(index, intended, target);
          }
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

/** Hex addresses, compared the way every other site in this app compares them. */
function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

function rowsKey(accounts: { address: string; id: string }[], activeIndex: number): string {
  return `${activeIndex}|${accounts.map((account) => `${account.address}:${account.id}`).join(',')}`;
}

/**
 * Whether `accounts` is positionally the same list as the session's rows over
 * the range they share. Deliberately length- and index-tolerant: a caller's
 * snapshot can legitimately be one commit behind (React flushes passive effects
 * in a later task), and that is not a domain error. A reordered, filtered or
 * foreign list is.
 */
function sameDomain(accounts: { address: string }[], rows: { address: string }[]): boolean {
  const overlap = Math.min(accounts.length, rows.length);
  for (let i = 0; i < overlap; i += 1) {
    if (!sameAddress(accounts[i]?.address, rows[i]?.address)) return false;
  }
  return true;
}

/**
 * The wallet accounts snapshot — and the one place the §12.1.6 index domain is
 * decided.
 *
 * `sign_request` answers a granted address with a POSITION in this list, and
 * that position is consumed by the SESSION (`SwitchAccount.index`), where an
 * index that names no row is a silent whole no-op. So the two lists have to be
 * one list. On web they are: `useWallet().state.accounts` IS
 * `walletSessionAccounts()`. Rather than trust that, this reads the session's
 * own rows and feeds THOSE, and the caller's array is used only to notice that
 * it was a different list and say so. A caller handing over a filtered, sorted
 * or otherwise foreign list therefore cannot move this machine into a second
 * index domain; the worst it can do is print.
 */
export function setSignAccounts(
  accounts: { address: string; id: string }[],
  activeIndex: number,
): void {
  const rows = walletSessionAccounts();
  const sessionIndex = walletSessionView().active_index;
  if (!sameDomain(accounts, rows)) {
    console.error(
      '[sign_request] §12.1.6: the accounts handed to setSignAccounts are not the ' +
        "session's own rows. `SwitchAccount.index` is consumed in the session's " +
        'domain, so the session rows are used instead. Caller: ' +
        `${accounts.map((a) => a.address).join(',') || '(none)'} @${activeIndex}; ` +
        `session: ${rows.map((a) => a.address).join(',') || '(none)'} @${sessionIndex}.`,
    );
  }
  const key = rowsKey(rows, sessionIndex);
  if (key === accountsKey && session) return;
  accountsKey = key;
  dispatchSign({
    type: 'accounts_changed',
    accounts: rows.map((account) => ({
      address: account.address,
      credential_id: account.id,
    })),
    active_index: sessionIndex,
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
