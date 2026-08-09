/**
 * Global dApp connection context — WEB, with the signing half driven by the
 * portable Rust state machine (spec 017,
 * `rust/crates/vela-core/src/app/sign_request.rs`).
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
 * What stays here is the connection lifecycle the `dapp_session` machine will
 * eventually own — transports, the relay session, reconnect/grace, WalletPair
 * pairing — plus the read-only RPC routing, unchanged from native.
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
import {
  RemoteInjectTransport,
  type DAppTransport,
  type DAppInfo,
  type RemoteInjectSession,
} from '@/services/dapp-transport';
import {
  WalletPairTransport,
  clearWalletPairSession,
} from '@/services/walletpair-transport';
import { isSigningMethod, handleReadOnlyRPC, INSTANT_READONLY_METHODS } from '@/hooks/use-dapp-signing';
import { gateReadOnly, readOnlyKey } from '@/services/readonly-rpc-gate';
import { updateTransaction, loadTransactions } from '@/services/storage';
import { waitForReceipt } from '@/services/safe-transaction';
import {
  bindSignRequest,
  dispatchSign,
  registerSignTransport,
  setSignAccounts,
  setSignApproveExtras,
  setSignDurableTransport,
  signRequestFunding,
  signRequestPending,
  signRequestView,
  signTransportId,
  subscribeSignRequest,
  syncSignNetworks,
} from '@/services/wallet-state-core/sign-resident.web';
import { signErrorMessage } from '@/services/wallet-state-core/sign-types';
import type { SignView } from '@/services/wallet-state-core/generated/SignView';
import {
  DAppConnectionContext,
  RECONNECT_GRACE_MS,
  clearSession,
  loadSession,
  saveSession,
  type ApproveRequestOptions,
  type ConnectionStatus,
  type ConnectionType,
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

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [session, setSession] = useState<RemoteInjectSession | null>(null);
  const [dappInfo, setDappInfo] = useState<DAppInfo | null>(null);
  const [connectionType, setConnectionType] = useState<ConnectionType>(null);
  const [pendingFingerprint, setPendingFingerprint] = useState<string | null>(null);
  const [reconnectStuck, setReconnectStuck] = useState(false);
  // Bumped on each manual "Reconnect now" so the stuck timer re-arms even though
  // `status` stays 'reconnecting' (a same-value setState wouldn't re-run the effect).
  const [reconnectNonce, setReconnectNonce] = useState(0);

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

  // Holds the grace-window timer that debounces the "Reconnecting…" indicator, so
  // a brief, self-healing reconnect never flickers the UI off "connected".
  const reconnectGraceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearReconnectGrace = useCallback(() => {
    if (reconnectGraceTimer.current) { clearTimeout(reconnectGraceTimer.current); reconnectGraceTimer.current = null; }
  }, []);
  // Don't let a pending grace timer fire setStatus after the provider unmounts.
  useEffect(() => () => clearReconnectGrace(), [clearReconnectGrace]);

  // If an auto-reconnect drags on (relay down / session expired), surface a
  // manual-recovery prompt instead of spinning "Reconnecting…" forever.
  useEffect(() => {
    if (status !== 'reconnecting') { setReconnectStuck(false); return; }
    setReconnectStuck(false);
    const timer = setTimeout(() => setReconnectStuck(true), 45_000);
    return () => clearTimeout(timer);
  }, [status, reconnectNonce]);

  const transportRef = useRef<DAppTransport | null>(null);
  /** Holds WalletPairTransport during fingerprint verification (before connect). */
  const pendingWpTransportRef = useRef<WalletPairTransport | null>(null);
  /**
   * Transient slot for a Safari-extension / web-popup sign transport
   * (beginExtensionSign). SEPARATE from transportRef so a live WalletPair/bridge
   * session is NOT clobbered by an extension sign. Responses route per-request
   * through the core's `transport_id` (F2), never through this ref.
   */
  const signTransportRef = useRef<DAppTransport | null>(null);
  /** The per-transport facts a one-shot sign transport was installed with. */
  const signMetaRef = useRef(new WeakMap<DAppTransport, ExtensionSignMeta>());

  const addressRef = useRef(address);
  const accountNameRef = useRef(accountName);
  const accountsRef = useRef(state.accounts);
  const dappInfoRef = useRef(dappInfo);

  useEffect(() => { addressRef.current = address; }, [address]);
  useEffect(() => { accountNameRef.current = accountName; }, [accountName]);
  useEffect(() => { accountsRef.current = state.accounts; }, [state.accounts]);
  useEffect(() => { dappInfoRef.current = dappInfo; }, [dappInfo]);

  // Push wallet info when account/chain changes while connected
  useEffect(() => {
    if (status === 'connected' && transportRef.current?.connected) {
      transportRef.current.pushWalletInfo({
        address,
        chainId,
        name: accountName,
        accounts: state.accounts.map(a => ({ name: a.name, address: a.address })),
      });
    }
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
    // The transport that OWNS this request. Responses MUST route here, never a
    // shared transportRef — with a concurrent WalletPair session live, using
    // transportRef would deliver an extension signature over the WP socket (F2).
    const owner = meta?.transport ?? transportRef.current;

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
        : signTransportId(transportRef.current);

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
      const identity = meta?.dapp ?? dappInfoRef.current;
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

  // --- Wire transport events (shared by both transport types) ---
  const wireTransport = useCallback((transport: DAppTransport, type: ConnectionType) => {
    transport.on('connected', () => {
      // Recovered (possibly within the grace window) — cancel any pending
      // "Reconnecting…" flip so a self-healing blip never showed at all.
      clearReconnectGrace();
      setStatus('connected');
      setConnectionType(type);
      transport.pushWalletInfo({
        address: addressRef.current,
        chainId: signRequestView().global_chain_id,
        name: accountNameRef.current,
        accounts: accountsRef.current.map(a => ({ name: a.name, address: a.address })),
      });
    });

    transport.on('disconnected', () => {
      clearReconnectGrace();
      setStatus('disconnected');
      setConnectionType(null);
      // Owner-aware: only clear a request THIS transport owns. Otherwise a terminal
      // WalletPair/bridge drop would tear down a concurrent extension sign's modal
      // (which lives in the same shared sheet but is owned by the ext transport).
      // The core applies the rule; the shell only reports which transport died.
      dispatchSign({ type: 'transport_dropped', transport_id: signTransportId(transport) });
      transportRef.current = null;
      setSignDurableTransport(null);
    });

    transport.on('reconnecting', () => {
      // Transient disconnect — WalletPair is auto-reconnecting. Keep transport ref and
      // dApp info intact. Don't flip the indicator immediately: hold "connected"
      // for the grace window so a sub-second blip self-heals invisibly, and only
      // surface "Reconnecting…" if it hasn't recovered by then. Already-pending
      // timer is left to run (don't extend the window on repeated blips).
      if (reconnectGraceTimer.current) return;
      reconnectGraceTimer.current = setTimeout(() => {
        reconnectGraceTimer.current = null;
        setStatus('reconnecting');
      }, RECONNECT_GRACE_MS);
    });

    // Stamp the OWNING transport on every inbound request so responses route back
    // to it, not a shared ref (matters once a second transport — the extension
    // sign slot — can be live at the same time; see F2).
    transport.on('request', (id, method, params, origin, requestChainId) => {
      handleIncoming(id, method, params, origin, { transport, chainId: requestChainId });
    });

    transport.on('error', (msg) => {
      setErrorMessage(msg);
    });

    transportRef.current = transport;
    setSignDurableTransport(transport);
  }, [handleIncoming, clearReconnectGrace]);

  // --- Disconnect any active transport ---
  const disconnectCurrent = useCallback(() => {
    clearReconnectGrace();
    // A pairing awaiting fingerprint approval has not persisted a resumable
    // snapshot, but it already owns an ephemeral X25519 key pair. Replacing it
    // or disconnecting must release that key explicitly.
    const pendingWalletPair = pendingWpTransportRef.current;
    pendingWpTransportRef.current = null;
    pendingWalletPair?.disconnect();
    setPendingFingerprint(null);
    if (transportRef.current) {
      transportRef.current.disconnect();
      transportRef.current = null;
      setSignDurableTransport(null);
    }
  }, [clearReconnectGrace]);

  // --- Connect (Remote Inject) ---
  const connectToBridge = useCallback(async (sess: RemoteInjectSession) => {
    disconnectCurrent();

    setStatus('connecting');
    setErrorMessage(null);
    setSession(sess);

    const transport = new RemoteInjectTransport(sess);
    wireTransport(transport, 'remote-inject');

    try {
      await transport.connect();
      const [info] = await Promise.all([
        transport.fetchDAppInfo().catch(() => null),
        saveSession(sess),
      ]);
      setDappInfo(info);
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message ?? 'Connection failed');
      transportRef.current = null;
      setSignDurableTransport(null);
    }
  }, [wireTransport, disconnectCurrent]);

  // --- Connect (WalletPair) ---
  const connectToWalletPair = useCallback(async (uri: string) => {
    disconnectCurrent();

    setStatus('connecting');
    setErrorMessage(null);
    setSession(null);

    try {
      const { fingerprint, dappInfo: info, transport } = WalletPairTransport.prepare(uri);
      setPendingFingerprint(fingerprint);
      setDappInfo(info);
      pendingWpTransportRef.current = transport;
      // Wait for user to call confirmFingerprint()
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message ?? 'Failed to prepare WalletPair session');
    }
  }, [disconnectCurrent]);

  // --- Confirm fingerprint (WalletPair) ---
  const confirmFingerprint = useCallback(async () => {
    const transport = pendingWpTransportRef.current;
    if (!transport) return;

    setPendingFingerprint(null);
    pendingWpTransportRef.current = null;

    wireTransport(transport, 'walletpair');

    try {
      await transport.connect();

      // If still not connected after confirmJoin resolved, start a timeout.
      // The relay may silently drop the join message (e.g. CF Worker hibernation),
      // leaving both sides stuck in waiting_accept with no transport-level error.
      if (!transport.connected) {
        const timeout = setTimeout(() => {
          if (!transport.connected && transportRef.current === transport) {
            setStatus('error');
            setErrorMessage('Connection timed out. The relay may be unavailable — try scanning again.');
            transport.disconnect();
            transportRef.current = null;
            setSignDurableTransport(null);
          }
        }, 120_000);

        // Clear timeout if connection succeeds before deadline
        const unsub = transport.on('connected', () => {
          clearTimeout(timeout);
          unsub();
        });
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message ?? 'WalletPair connection failed');
      // A failed confirmation must not leave a retry loop or join key behind.
      transport.disconnect();
      if (transportRef.current === transport) {
        transportRef.current = null;
        setSignDurableTransport(null);
      }
    }
  }, [wireTransport]);

  // --- Cancel fingerprint verification ---
  const cancelFingerprint = useCallback(() => {
    // prepare() generated a wallet identity even though the relay has not yet
    // accepted the join. Explicit cancellation must zero it as well.
    pendingWpTransportRef.current?.disconnect();
    pendingWpTransportRef.current = null;
    setPendingFingerprint(null);
    setStatus('disconnected');
    setDappInfo(null);
    setErrorMessage(null);
  }, []);

  // --- Disconnect ---
  const disconnectBridge = useCallback(() => {
    disconnectCurrent();
    setStatus('disconnected');
    setConnectionType(null);
    setSession(null);
    setDappInfo(null);
    // No response goes out — the same nothing `setIncomingRequest(null)` did.
    dispatchSign({ type: 'dismiss_tapped' });
    clearSession();
    clearWalletPairSession();
  }, [disconnectCurrent]);

  // --- Manual reconnect ("Reconnect now") ---
  const reconnect = useCallback(() => {
    const transport = transportRef.current;
    if (!transport) return;
    clearReconnectGrace(); // manual tap → show "Reconnecting…" now, don't wait out the grace
    setStatus('reconnecting');
    setReconnectStuck(false);
    setReconnectNonce((n) => n + 1); // re-arm the stuck timer even if status was already 'reconnecting'
    transport.reconnect?.().catch(() => { /* WalletPair keeps retrying; UI stays reconnecting */ });
  }, [clearReconnectGrace]);

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
    transport.on('error', (msg) => setErrorMessage(msg));
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
  useEffect(() => {
    if (!state.hasWallet || state.isLoading) return;

    // Try Remote Inject first, then WalletPair
    (async () => {
      const sess = await loadSession();
      if (sess) {
        // Try auto-reconnect — on failure, clear stale session silently
        const transport = new RemoteInjectTransport(sess);
        wireTransport(transport, 'remote-inject');
        try {
          await transport.connect();
          setSession(sess);
          const info = await transport.fetchDAppInfo().catch(() => null);
          setDappInfo(info);
          await saveSession(sess);
        } catch {
          // Stale session — clean up silently, don't show error
          transport.disconnect();
          transportRef.current = null;
          setSignDurableTransport(null);
          await clearSession();
        }
        return;
      }

      // Try restoring a WalletPair session
      try {
        const wpTransport = await WalletPairTransport.restore();
        if (wpTransport) {
          wireTransport(wpTransport, 'walletpair');
          const info = await wpTransport.fetchDAppInfo();
          setDappInfo(info);
          const dropIfDead = () => {
            // A restored session whose channel is gone (the relay answers a join with
            // `terminate: channel_not_found`) can NEVER come back. Left alone, the session
            // treats it as the durable session and the snapshot restore-loops on every
            // launch — and a live reconnect attempt to a dead channel collides with a
            // fresh pairing on the relay (BUG-6, and a contributor to BUG-5). So if it
            // isn't live shortly after the reconnect attempt, drop it AND clear the
            // snapshot so the next launch starts clean.
            if (transportRef.current === wpTransport && !wpTransport.connected) {
              wpTransport.disconnect();
              if (transportRef.current === wpTransport) {
                transportRef.current = null;
                setSignDurableTransport(null);
              }
              clearWalletPairSession();
            }
          };
          try {
            await wpTransport.reconnect();
            setTimeout(dropIfDead, 8000); // real reconnects settle well under this; dead channels 404 fast
          } catch {
            dropIfDead();
          }
        }
      } catch {
        // WalletPair restore failed — clean up
        clearWalletPairSession();
      }
    })();

    return () => {
      transportRef.current?.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.hasWallet, state.isLoading]);

  // --- Resume in-flight dApp txs left 'pending' (sheet closed / page reloaded
  //     mid-confirmation) so their status still resolves instead of showing as
  //     forever-pending in the Connections panel. ---
  //
  // This is `tx_tracker`'s job the day it lands (see `setSignTrackerSink` in
  // `sign-resident.web.ts`); until then it stays exactly where it was.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumedRef.current || !state.hasWallet || state.isLoading) return;
    resumedRef.current = true;
    (async () => {
      const txs = await loadTransactions().catch(() => []);
      const cutoff = Math.floor(Date.now() / 1000) - 24 * 3600; // ignore ancient stuck ops
      const pending = txs.filter(
        (t) => t.status === 'pending' && (t.type ?? '') === 'dapp_tx' && !!t.userOpHash && t.timestamp >= cutoff,
      );
      for (const t of pending) {
        waitForReceipt(t.userOpHash, t.chainId)
          .then((txHash) => updateTransaction(t.id, { status: 'confirmed', txHash }))
          .catch(() => { /* still unconfirmed or dropped — leave for the user to clear */ });
      }
    })();
  }, [state.hasWallet, state.isLoading]);

  const value = useMemo(() => ({
    status, errorMessage, session, dappInfo,
    incomingRequest,
    isSigning: signView.is_signing,
    isSubmitting: signView.is_submitting,
    signError,
    pendingOpHash: signView.pending_op_hash,
    chainId,
    connectionType, pendingFingerprint,
    connectToBridge, connectToWalletPair, confirmFingerprint, cancelFingerprint,
    disconnectBridge, beginExtensionSign, reconnect, reconnectStuck,
    approveRequest, rejectRequest, dismissRequest, switchChain,
    fundingNeeded, handleFundingComplete, handleFundingCancel,
  }), [
    status, errorMessage, session, dappInfo,
    incomingRequest, signView.is_signing, signView.is_submitting, signError,
    signView.pending_op_hash, chainId,
    connectionType, pendingFingerprint,
    connectToBridge, connectToWalletPair, confirmFingerprint, cancelFingerprint,
    disconnectBridge, beginExtensionSign, reconnect, reconnectStuck,
    approveRequest, rejectRequest, dismissRequest, switchChain,
    fundingNeeded, handleFundingComplete, handleFundingCancel,
  ]);

  return React.createElement(DAppConnectionContext.Provider, { value }, children);
}
