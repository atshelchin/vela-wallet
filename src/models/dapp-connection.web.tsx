/**
 * Global dApp connection context — WEB, with BOTH halves driven by portable
 * Rust state machines (spec 017): the signing half by
 * `rust/crates/vela-core/src/app/sign_request.rs`, and the connection lifecycle
 * by `rust/crates/vela-core/src/app/dapp_session.rs`.
 *
 * What moved into the core, and is therefore GONE from this file: the five
 * synchronous refs the approve path used to coordinate through
 * (`approveInFlightRef`, `signCancelledRef`, `fundingRidRef`,
 * `lastApproveOptsRef`, `incomingRequestRef`) and every rule they encoded —
 *
 * - **BUG-2** — a reject during the ≤15 s gas pre-check aborts the pipeline
 *   before it can submit, and past the commitment point a swipe is a *dismiss*,
 *   never a 4001 that still broadcasts.
 * - **BUG-3** — the approve pipeline is single-flight; a same-tick second tap
 *   finds it occupied.
 * - **the funding rid race** — a funding "Continue" replays the SAME request's
 *   capped opts, and a late funding outcome never hijacks a newer request.
 * - **§4** — the durable record precedes any result the dApp can poll.
 * - **F2/F3/F4** — the response goes to the transport that OWNS the request,
 *   and sign/display/history use the request's own chain and dApp identity.
 * - **§12.1.6** — the granted account is switched FIRST and the approval
 *   surface only opens on the ack (see `sign-resident.web.ts`).
 *
 * What moved into `dapp_session`, and is therefore also GONE from this file:
 * the transport refs, the relay session state, and every timer the connection
 * lifecycle used to hold by hand —
 *
 * - **the 4 s reconnect grace**, which a repeated blip must never extend (③);
 * - **the 45 s stuck prompt** and the `reconnectNonce` that re-armed it;
 * - **the 120 s join watchdog** for a relay that silently drops the join;
 * - **the 60 s reconnect deadline**, the `min(1s·2ⁿ, 30s)` backoff ladder and
 *   the 8 s `dropIfDead` that keeps a dead restored channel from looping on
 *   every launch (BUG-5/6, invariant ⑤);
 * - **the fingerprint gate** — a pairing becomes a session only through
 *   `FingerprintConfirmed`, and cancelling or replacing one releases the
 *   ephemeral X25519 key explicitly (① and ②);
 * - **the counter-durability order** — a WalletPair push is issued only from
 *   `CountersPersisted { ok: true }`, so no ciphertext is produced for a nonce
 *   that is not durable yet (⑦).
 *
 * The core holds numeric handles and a phase; every key, counter and encrypted
 * snapshot stays in the shell's transport objects
 * (`src/services/wallet-state-core/dsess-executor.web.ts`, which also documents
 * the single deliberate divergence: the backoff is arbitrated by the core and
 * executed by `WalletPairTransport`'s own identical ladder).
 *
 * What stays here is the read-only RPC routing, the extension-sign slot, and
 * the wiring between the two cores — unchanged from native.
 *
 * `dapp-connection.tsx` is the native counterpart (Hermes has no wasm) and
 * `dapp-connection-shape.ts` holds everything both share; a `.web` file must
 * never value-import its own base file.
 */
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { useWallet } from '@/models/wallet-state';
import type { DAppInfo, DAppTransport, RemoteInjectSession } from '@/services/dapp-transport';
import { isSigningMethod, handleReadOnlyRPC, INSTANT_READONLY_METHODS } from '@/hooks/use-dapp-signing';
import { gateReadOnly, readOnlyKey } from '@/services/readonly-rpc-gate';
import { startTxTracker } from '@/services/wallet-state-core/tx-tracker-resident.web';
import {
  bindSignRequest,
  dispatchSign,
  registerSignTransport,
  setSignAccounts,
  setSignApproveExtras,
  signRequestFunding,
  signRequestPending,
  signRequestView,
  signTransportId,
  subscribeSignRequest,
  syncSignNetworks,
} from '@/services/wallet-state-core/sign-resident.web';
import {
  connectDsessBridge,
  connectDsessWalletPair,
  dispatchDsess,
  dsessDappInfo,
  dsessDurableTransport,
  dsessProjection,
  restoreDsess,
  setDsessRequestSink,
  setDsessWalletInfoSource,
  subscribeDsess,
  type DsessProjection,
} from '@/services/wallet-state-core/dsess-resident.web';
import { signErrorMessage } from '@/services/wallet-state-core/sign-types';
import type { SignView } from '@/services/wallet-state-core/generated/SignView';
import {
  DAppConnectionContext,
  type ApproveRequestOptions,
  type ExtensionSignMeta,
} from './dapp-connection-shape';

export {
  DAppConnectionContext,
  useDAppConnection,
  saveSession,
  loadSession,
  clearSession,
} from './dapp-connection-shape';
export type {
  ConnectionStatus,
  ConnectionType,
  ApproveRequestOptions,
  ExtensionSignMeta,
  DAppConnectionContextValue,
} from './dapp-connection-shape';

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function DAppConnectionProvider({ children }: { children: ReactNode }) {
  const { state, activeAccount } = useWallet();
  const address = activeAccount?.address ?? state.address;
  const accountName = activeAccount?.name ?? 'Wallet';

  // The ENTIRE connection half, as one projection of the `dapp_session` core.
  // Pushed, never read from the module during render: the resident is the app's
  // most mutable state and an untracked render-time read would be cached
  // forever by the React Compiler (`wallet-state.web.ts`).
  const [conn, setConn] = useState<DsessProjection>(dsessProjection);
  useEffect(() => {
    const unsubscribe = subscribeDsess(setConn);
    // Catch up on anything committed between the initial render and here.
    setConn(dsessProjection());
    return unsubscribe;
  }, []);

  const {
    status, session, dappInfo, connectionType, pendingFingerprint, reconnectStuck,
  } = conn;

  /**
   * A Safari-extension / popup sign transport's own transport-level error.
   * Kept apart from the connection error rather than sharing one slot: the
   * core is the single writer of the session's error, and this one belongs to
   * a transport the session does not own. The error card only renders under
   * `status === 'error'`, which only a connection failure produces, so the
   * connection's message wins when both exist.
   */
  const [extErrorMessage, setExtErrorMessage] = useState<string | null>(null);
  const errorMessage = conn.errorMessage ?? extErrorMessage;

  // The ENTIRE signing half, as one projection of the core.
  const [signView, setSignView] = useState<SignView>(signRequestView);
  useEffect(() => {
    const unsubscribe = subscribeSignRequest(setSignView);
    // Boots the resident with the supported-network snapshot. Until that lands
    // every chain is unsupported (fail-closed), so it must precede any request.
    syncSignNetworks();
    // Catch up on anything committed between the initial render and here.
    setSignView(signRequestView());
    return unsubscribe;
  }, []);

  // The accounts snapshot, fed from the SESSION's own rows (on web
  // `state.accounts` IS `walletSessionAccounts()`), so `SwitchActiveAccount.index`
  // lands in the domain that consumes it — the §12.1.6 index-domain trap.
  useEffect(() => {
    setSignAccounts(state.accounts, state.activeAccountIndex);
  }, [state.accounts, state.activeAccountIndex]);

  const chainId = signView.global_chain_id;
  const incomingRequest = signRequestPending();
  const fundingNeeded = signRequestFunding();
  const signError = signView.error ? signErrorMessage(signView.error) : null;

  /**
   * Transient slot for a Safari-extension / web-popup sign transport
   * (beginExtensionSign). SEPARATE from the session's own transport so a live
   * WalletPair/bridge session is NOT clobbered by an extension sign. Responses
   * route per-request through the core's `transport_id` (F2), never through
   * this ref.
   */
  const signTransportRef = useRef<DAppTransport | null>(null);
  /** The per-transport facts a one-shot sign transport was installed with. */
  const signMetaRef = useRef(new WeakMap<DAppTransport, ExtensionSignMeta>());

  const addressRef = useRef(address);
  const accountNameRef = useRef(accountName);
  const accountsRef = useRef(state.accounts);

  useEffect(() => { addressRef.current = address; }, [address]);
  useEffect(() => { accountNameRef.current = accountName; }, [accountName]);
  useEffect(() => { accountsRef.current = state.accounts; }, [state.accounts]);

  // The wallet identity a `PushWalletInfo` is composed from. Read at push time
  // from the refs above, exactly as the transport handlers read them.
  useEffect(() => {
    setDsessWalletInfoSource(() => ({
      address: addressRef.current,
      name: accountNameRef.current,
      accounts: accountsRef.current.map(a => ({ name: a.name, address: a.address })),
    }));
    return () => setDsessWalletInfoSource(null);
  }, []);

  // Push wallet info when account/chain changes while connected. The core
  // decides whether anything goes out (`status === 'connected' &&
  // transport.connected`) and, for WalletPair, sequences the counter persist
  // ahead of it (⑦). The dependency list is the one this effect always had, so
  // the same five changes still push.
  useEffect(() => {
    dispatchDsess({ type: 'wallet_changed', chain_id: chainId });
  }, [address, chainId, accountName, status, state.accounts]);

  // --- Handle incoming request ---
  const handleIncoming = useCallback((
    id: string,
    method: string,
    params: any[],
    origin: string,
    meta?: { transport?: DAppTransport; chainId?: number; dapp?: DAppInfo },
  ) => {
    const addr = addressRef.current;
    // The global chain, read from the core rather than a React-lagging mirror:
    // `chainIdRef.current = nc` used to be assigned in the same synchronous turn
    // as the switch, so a read arriving in the SAME transport batch already saw
    // the new chain. `signRequestView()` is committed synchronously by the
    // effect loop, so it keeps that property.
    const cid = meta?.chainId ?? signRequestView().global_chain_id;
    // The transport that OWNS this request. Responses MUST route here, never
    // the session's durable transport — with a concurrent WalletPair session
    // live, that would deliver an extension signature over the WP socket (F2).
    // Read at REQUEST time, never in render.
    const owner = meta?.transport ?? dsessDurableTransport();

    // `eth_accounts` may legitimately be empty, but `eth_requestAccounts` is an
    // authorization request. Do not try to serialize an absent account as an
    // undefined array member: reply with an actionable EIP-1193 error immediately
    // so the dApp never reports a misleading transport timeout.
    if (method === 'eth_requestAccounts' && !addr) {
      owner?.sendResponse(id, undefined, { code: 4100, message: 'No active wallet account is available' });
      return;
    }

    if (isSigningMethod(method) || method === 'wallet_switchEthereumChain') {
      // `assertChainSupported` read the network list live at every call, so the
      // core's fail-closed set is re-asserted here rather than once at boot.
      syncSignNetworks();
      const transportId = meta?.transport
        ? registerSignTransport(meta.transport)
        : signTransportId(dsessDurableTransport());

      if (method === 'wallet_switchEthereumChain') {
        const cp = params?.[0] as { chainId?: string } | undefined;
        dispatchSign({
          type: 'chain_switch_requested',
          id,
          transport_id: transportId,
          chain_id_param: cp?.chainId ?? null,
        });
        return;
      }

      // The sheet's stamps stay shell-side: the request's OWN identity only, so
      // `requestDApp(request, dappInfo)` keeps falling back to the live session
      // identity for an ordinary relay request, exactly as before.
      bindSignRequest(id, transportId, meta?.dapp ?? null);
      // What the RECORD is attributed to, resolved at arrival exactly as
      // `requestDApp(request, dappInfo)?.name ?? request.origin` resolved it.
      const identity = meta?.dapp ?? dsessDappInfo();
      const granted =
        signMetaRef.current.get(meta?.transport as DAppTransport)?.grantedAddress ??
        (meta?.transport as { requestAddress?: string } | undefined)?.requestAddress ??
        null;
      dispatchSign({
        type: 'request_arrived',
        id,
        method,
        params_json: JSON.stringify(params ?? []),
        origin,
        transport_id: transportId,
        // `__transport` truthy is what the owner-aware transport-drop clear
        // tested (`dapp-connection.tsx:429`); every transport-sourced request
        // carries one.
        dedicated_transport: !!meta?.transport,
        // EXTENSION / popup sign: chain is per-request (F4). An ordinary
        // bridge/WalletPair request carries none and uses the global chain.
        per_request_chain: meta?.chainId ?? null,
        dapp: identity ? { name: identity.name, url: identity.url ?? null } : null,
        granted_address: granted,
        // The popup entry still runs its own 4100 pinned-address check before it
        // ever builds a transport, so the core is never asked to repeat it.
        requested_address: null,
        // The payload TTL lives in `ExtensionBridgeTransport` (it refuses to emit
        // a stale request at all), so nothing arrives here with a timestamp.
        request_ts_ms: null,
        now_ms: Date.now(),
      });
      return;
    }

    // Network-bound reads go through the dedupe + concurrency gate so a flood
    // can't starve the signing path; instant local methods bypass it.
    const dispatch = INSTANT_READONLY_METHODS.has(method)
      ? handleReadOnlyRPC(method, params, addr, cid)
      : gateReadOnly(readOnlyKey(cid, addr, method, params), () => handleReadOnlyRPC(method, params, addr, cid));
    dispatch.then(res => {
      if (res.handled) owner?.sendResponse(id, res.result);
      else owner?.sendResponse(id, undefined, { code: -32603, message: `RPC failed: ${method}` });
    }).catch((err: any) => {
      // Gate overflow (too many concurrent reads) — answer with a retryable error.
      owner?.sendResponse(id, undefined, { code: err?.code ?? -32603, message: err?.message ?? `RPC failed: ${method}` });
    });
  }, []);

  // --- Where a live transport's requests go ---
  // The `dapp_session` executor wires every transport it builds and forwards
  // `request` here, stamped with the OWNING transport and its per-request chain
  // (F2/F4). Installed before the restore effect below, which is the first
  // thing that can create a transport.
  useEffect(() => {
    setDsessRequestSink((transport, id, method, params, origin, requestChainId) => {
      handleIncoming(id, method, params as any[], origin, { transport, chainId: requestChainId });
    });
    return () => setDsessRequestSink(null);
  }, [handleIncoming]);

  // --- Connect (Remote Inject) ---
  // Entry classification is the core's (invariant ⑨) and the Connect screen
  // hands over an already-parsed session, so the resident re-serialises it into
  // the canonical link the core's own parser reads back field-for-field.
  const connectToBridge = useCallback(async (sess: RemoteInjectSession) => {
    connectDsessBridge(sess);
  }, []);

  // --- Connect (WalletPair) ---
  const connectToWalletPair = useCallback(async (uri: string) => {
    connectDsessWalletPair(uri);
  }, []);

  // --- Confirm fingerprint (WalletPair) ---
  // Invariant ①: this event is the ONLY path to `ConfirmWalletPairJoin`. The
  // 120 s join watchdog it may arm afterwards is the core's, keyed to the
  // handle it watches, so a superseded pairing can never trip it.
  const confirmFingerprint = useCallback(async () => {
    dispatchDsess({ type: 'fingerprint_confirmed' });
  }, []);

  // --- Cancel fingerprint verification ---
  // Invariant ②: the core answers with an explicit `DisconnectTransport` for
  // the pending handle — prepare() minted an X25519 pair the relay never
  // accepted, and cancelling must release it.
  const cancelFingerprint = useCallback(() => {
    dispatchDsess({ type: 'fingerprint_cancelled' });
  }, []);

  // --- Disconnect ---
  const disconnectBridge = useCallback(() => {
    // Tears the session down and wipes BOTH stores; `errorMessage` is
    // deliberately not cleared, exactly as before.
    dispatchDsess({ type: 'disconnect_requested' });
    // No response goes out — the same nothing `setIncomingRequest(null)` did.
    dispatchSign({ type: 'dismiss_tapped' });
  }, []);

  // --- Manual reconnect ("Reconnect now") ---
  // Bypasses the 4 s grace window (invariant ③) and re-arms the 45 s stuck
  // prompt even when the status was already 'reconnecting' — the
  // `reconnectNonce` bump, now a rule inside the core.
  const reconnect = useCallback(() => {
    dispatchDsess({ type: 'manual_reconnect' });
  }, []);

  // --- Begin an extension sign (Safari extension → App Group, or web popup) ---
  // Installs `transport` into the TRANSIENT signTransportRef, NOT transportRef, and
  // does NOT call disconnectCurrent() — so a live WalletPair/bridge session survives.
  // It wires ONLY 'request' (stamping the owning transport + per-request chain +
  // identity for F2/F3/F4) and a scoped, identity-guarded 'disconnected' that clears
  // just its own slot — NEVER the sheet, NEVER transportRef. Deliberately not
  // wireTransport(), whose 'disconnected' handler would null transportRef.
  const beginExtensionSign = useCallback((transport: DAppTransport, meta?: ExtensionSignMeta) => {
    // Registered BEFORE connect() so the request it emits can be bound to it.
    registerSignTransport(transport);
    if (meta) signMetaRef.current.set(transport, meta);
    transport.on('request', (id, method, params, origin) => {
      let host = origin;
      try { host = new URL(origin).host || origin; } catch { /* keep origin */ }
      handleIncoming(id, method, params, origin, {
        transport,
        chainId: (transport as { requestChainId?: number }).requestChainId,
        dapp: { name: host, url: origin },
      });
    });
    transport.on('disconnected', () => {
      if (signTransportRef.current === transport) signTransportRef.current = null;
    });
    transport.on('error', (msg) => setExtErrorMessage(msg));
    signTransportRef.current = transport;
  }, [handleIncoming]);

  // --- Approve / reject / dismiss / funding — one event each ---

  const approveRequest = useCallback(async (opts?: ApproveRequestOptions) => {
    // The "what moved" preview the sheet just showed. Not core state: it is a
    // presentation blob the record stores for the Connections-panel replay, and
    // the core would only be forwarding it.
    setSignApproveExtras(opts?.assetSim ?? null);
    dispatchSign({
      type: 'approve_tapped',
      opts: {
        max_fee_per_gas: opts?.maxFeePerGas != null ? opts.maxFeePerGas.toString() : null,
        bundler_cost_wei: opts?.bundlerCostWei != null ? opts.bundlerCostWei.toString() : null,
        gas_fee_token: opts?.gasFeeToken ?? null,
        quoted_fee: opts?.quotedFee
          ? { amount: opts.quotedFee.amount.toString(), recipient: opts.quotedFee.recipient }
          : null,
        // The sheet quotes fee amount + recipient together, so the recipient it
        // displays IS the collector it would be checked against; `null` keeps
        // the floor half of the Tempo staleness guard and skips the tautology.
        fee_collector: null,
        params_override_json: opts?.paramsOverride ? JSON.stringify(opts.paramsOverride) : null,
        intent: opts?.intent ?? null,
      },
    });
  }, []);

  const rejectRequest = useCallback(() => {
    dispatchSign({ type: 'reject_tapped' });
  }, []);

  const dismissRequest = useCallback(() => {
    dispatchSign({ type: 'dismiss_tapped' });
  }, []);

  const handleFundingComplete = useCallback(() => {
    dispatchSign({ type: 'funding_complete_tapped' });
  }, []);

  const handleFundingCancel = useCallback(() => {
    dispatchSign({ type: 'funding_cancelled' });
  }, []);

  // --- Switch chain ---
  // The core is the single writer of the global chain: it validates support
  // (fail-closed) and cancels a pending GLOBAL-chain sign with 4001 before the
  // switch lands (invariant ⑥). The connected page hears about it through the
  // pushWalletInfo effect above, which keys off the projected chainId.
  const switchChain = useCallback((newChainId: number) => {
    syncSignNetworks();
    dispatchSign({
      type: 'chain_switch_requested',
      id: null,
      transport_id: null,
      chain_id_param: String(newChainId),
    });
  }, []);

  // --- Auto-reconnect on mount ---
  //
  // The shell reads BOTH stores and reports what exists; the CORE picks
  // remote-inject first (invariant ⑥), commits a restored relay session only on
  // a successful connect, cleans a stale one up silently, and gives a restored
  // WalletPair channel the 8 s `dropIfDead` window before it drops it AND wipes
  // the snapshot (BUG-5/6, invariant ⑤). `RestoreLoaded` is single-shot in the
  // core and refuses to run while anything is live, so a re-run of this effect
  // can never clobber a session the user just made.
  //
  // No teardown: the resident owns its transports for the lifetime of the tab,
  // which is what makes a connection survive navigation. The provider is
  // mounted once at the root, so the old unmount-disconnect only ever ran on a
  // hot reload.
  useEffect(() => {
    if (!state.hasWallet || state.isLoading) return;
    void restoreDsess();
  }, [state.hasWallet, state.isLoading]);

  // --- Resume in-flight txs left 'pending' (sheet closed / page reloaded
  //     mid-confirmation) so their status still resolves instead of showing as
  //     forever-pending in the Connections panel. ---
  //
  // `tx_tracker` owns this now. Starting the resident here keeps the trigger
  // exactly where the hand-rolled scan was (root provider, once the wallet is
  // loaded) and also installs the `sign_request` hand-off, so a dApp tx is
  // tracked from the moment the bundler accepts it. The scan itself is the
  // core's `LoadPendingTxs` sweep: same 24h cutoff, same `dapp_tx` records —
  // plus `send` records, and with the honest rule that an unreachable bundler
  // is never a failure.
  useEffect(() => {
    if (!state.hasWallet || state.isLoading) return;
    startTxTracker();
  }, [state.hasWallet, state.isLoading]);

  const value = useMemo(() => ({
    status, errorMessage, session, dappInfo,
    incomingRequest,
    isSigning: signView.is_signing,
    isSubmitting: signView.is_submitting,
    signError,
    pendingOpHash: signView.pending_op_hash,
    // §12.1.6 + invariant ⑦: the core's own gate, handed to the sheet so the
    // confirm control reflects it instead of two gates and zero ANDs.
    confirmGateOpen: signView.confirm_gate_open,
    chainId,
    connectionType, pendingFingerprint,
    connectToBridge, connectToWalletPair, confirmFingerprint, cancelFingerprint,
    disconnectBridge, beginExtensionSign, reconnect, reconnectStuck,
    approveRequest, rejectRequest, dismissRequest, switchChain,
    fundingNeeded, handleFundingComplete, handleFundingCancel,
  }), [
    status, errorMessage, session, dappInfo,
    incomingRequest, signView.is_signing, signView.is_submitting, signError,
    signView.pending_op_hash, signView.confirm_gate_open, chainId,
    connectionType, pendingFingerprint,
    connectToBridge, connectToWalletPair, confirmFingerprint, cancelFingerprint,
    disconnectBridge, beginExtensionSign, reconnect, reconnectStuck,
    approveRequest, rejectRequest, dismissRequest, switchChain,
    fundingNeeded, handleFundingComplete, handleFundingCancel,
  ]);

  return React.createElement(DAppConnectionContext.Provider, { value }, children);
}
