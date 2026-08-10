/**
 * The one `dapp_session` core the web app has — WEB only, and APP-RESIDENT.
 *
 * A dApp connection outlives every screen: the relay session survives
 * navigation, a reconnect episode keeps counting while the user is on Home, and
 * a page reload must pick up whatever the last process left connected. So the
 * core is a module-level singleton, the `session-resident.web.ts` pattern the
 * integration plan mandates for resident machines — created once, never
 * disposed, and told to restore exactly where the provider's mount-time
 * auto-reconnect effect used to run.
 *
 * Three things this module owes its consumers:
 *
 * - **A projection React can be handed whole.** Subscribers receive
 *   `DsessProjection`, not the raw view: the fields are already in the shapes
 *   the context exposes and the `session`/`dappInfo` objects keep their
 *   identity across commits that did not change them. That matters twice over
 *   — those identities feed `useMemo` dependency lists across the connect and
 *   home surfaces, and pushing a finished value is the only safe way to give
 *   React module state under the React Compiler (an untracked module read
 *   during render is cached forever; see `src/models/wallet-state.web.ts`).
 * - **A first frame identical to today's.** `INITIAL_VIEW` mirrors the core's
 *   pristine projection: disconnected, no session, chain 1 (`useState(1)`).
 * - **The two cross-machine bridges the provider used to make by hand.** A
 *   wired transport becomes `sign_request`'s durable transport, and a dropped
 *   one becomes its owner-aware `transport_dropped`. They are imported
 *   directly, not injected, exactly as `tx-tracker-resident.web.ts` imports the
 *   three residents it hands off to — so they cannot be missing at the moment a
 *   socket dies.
 *
 * Nothing here is read during render by anything but the lazy `useState`
 * initialiser the provider mounts with; every later value arrives by
 * subscription (the module-level-read trap documented in
 * `src/models/wallet-state.web.ts` applies to the whole codebase, and this
 * module holds the app's single most mutable state).
 *
 * Imported by explicit `.web` specifier on every side: `tsc` resolves a
 * `.web.ts` file's own imports to the base `.ts` variant, so a bare specifier
 * would type-check against a native module that does not exist.
 */

import { router } from 'expo-router';

import {
  dispatchSign,
  setSignDurableTransport,
  signTransportId,
} from '@/services/wallet-state-core/sign-resident.web';
import {
  createDappSession,
  type DappSessionCoreSession,
} from '@/services/wallet-state-core/dsess-session.web';
import {
  fromWireDapp,
  fromWireSession,
  remoteInjectLink,
  toWireDapp,
  toWireSession,
} from '@/services/wallet-state-core/dsess-executor.web';
import { dsessErrorMessage, type DsessWalletInfo } from '@/services/wallet-state-core/dsess-types';

import { loadSession } from '@/models/dapp-connection-shape';
import { loadWalletPairSnapshot } from '@/services/walletpair-transport';
import { showAlert } from '@/services/platform';
import i18n from '@/i18n';

import type { DAppInfo, DAppTransport, RemoteInjectSession } from '@/services/dapp-transport';
import type { ConnectionStatus, ConnectionType } from '@/models/dapp-connection-shape';
import type { DsessEvent } from './generated/DsessEvent';
import type { DsessView } from './generated/DsessView';

/** The machine's own initial projection — mirrored until the first view lands. */
const INITIAL_VIEW: DsessView = {
  status: 'disconnected',
  error: null,
  session: null,
  dapp_info: null,
  connection_type: null,
  pending_fingerprint: null,
  reconnect_stuck: false,
  chain_id: 1,
};

/**
 * The connection half of the dApp context, in the shapes it exposes. This is
 * what subscribers get — see the projection note in the module doc.
 */
export interface DsessProjection {
  status: ConnectionStatus;
  /** The connection error in words, or `null`. */
  errorMessage: string | null;
  session: RemoteInjectSession | null;
  dappInfo: DAppInfo | null;
  connectionType: ConnectionType;
  pendingFingerprint: string | null;
  reconnectStuck: boolean;
}

const INITIAL_PROJECTION: DsessProjection = {
  status: 'disconnected',
  errorMessage: null,
  session: null,
  dappInfo: null,
  connectionType: null,
  pendingFingerprint: null,
  reconnectStuck: false,
};

let current: DsessView = INITIAL_VIEW;
/** Structural key of `current`, so an unchanged view never re-renders the app. */
let currentKey = JSON.stringify(INITIAL_VIEW);

let currentSession: RemoteInjectSession | null = null;
let currentSessionKey = 'null';
let currentDapp: DAppInfo | null = null;
let currentDappKey = 'null';
let currentProjection: DsessProjection = INITIAL_PROJECTION;

const listeners = new Set<(projection: DsessProjection) => void>();
let session: DappSessionCoreSession | null = null;

/** The transport the `sign_request` core's `DURABLE_TRANSPORT_ID` resolves to. */
let durableTransport: DAppTransport | null = null;

// ---------------------------------------------------------------------------
// Shell-side inputs the core deliberately does not carry
// ---------------------------------------------------------------------------

type RequestSink = (
  transport: DAppTransport,
  id: string,
  method: string,
  params: unknown[],
  origin: string,
  chainId?: number,
) => void;

/**
 * Where an inbound JSON-RPC request goes. Installed by the provider, which owns
 * `handleIncoming` (the read-only gate and the `sign_request` dispatch both
 * live there). Until it is installed nothing can arrive: a transport only
 * exists once the provider has dispatched a connect.
 */
let requestSink: RequestSink | null = null;

export function setDsessRequestSink(sink: RequestSink | null): void {
  requestSink = sink;
}

/**
 * Address / name / accounts for a `PushWalletInfo`. The core supplies only the
 * chain — the wallet identity is the provider's, read at push time exactly as
 * `addressRef`/`accountNameRef`/`accountsRef` were.
 */
let walletInfoSource: (() => DsessWalletInfo) | null = null;

export function setDsessWalletInfoSource(source: (() => DsessWalletInfo) | null): void {
  walletInfoSource = source;
}

// ---------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------

/** `remote_inject` / `wallet_pair` → the hyphenated names the context uses. */
function toConnectionType(kind: DsessView['connection_type']): ConnectionType {
  switch (kind) {
    case 'remote_inject':
      return 'remote-inject';
    case 'wallet_pair':
      return 'walletpair';
    default:
      return null;
  }
}

/** The latest committed view. Synchronous — that is the whole point. */
export function dsessView(): DsessView {
  return current;
}

/** The latest committed projection. Safe as a lazy `useState` initialiser. */
export function dsessProjection(): DsessProjection {
  return currentProjection;
}

/** The dApp identity behind the session — read at REQUEST time, never in render. */
export function dsessDappInfo(): DAppInfo | null {
  return currentDapp;
}

/** The transport a request with no transport of its own is answered through. */
export function dsessDurableTransport(): DAppTransport | null {
  return durableTransport;
}

/** Subscribe to every committed projection. Returns the unsubscribe. */
export function subscribeDsess(listener: (projection: DsessProjection) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ---------------------------------------------------------------------------
// The session
// ---------------------------------------------------------------------------

export function ensureDappSession(): DappSessionCoreSession {
  if (!session) {
    session = createDappSession({
      onView: (view: DsessView) => {
        const key = JSON.stringify(view);
        if (key === currentKey) return;
        currentKey = key;
        const sessionKey = JSON.stringify(view.session);
        if (sessionKey !== currentSessionKey) {
          currentSessionKey = sessionKey;
          currentSession = view.session ? fromWireSession(view.session) : null;
        }
        const dappKey = JSON.stringify(view.dapp_info);
        if (dappKey !== currentDappKey) {
          currentDappKey = dappKey;
          currentDapp = view.dapp_info ? fromWireDapp(view.dapp_info) : null;
        }
        current = view;
        currentProjection = {
          status: view.status,
          errorMessage: view.error ? dsessErrorMessage(view.error) : null,
          session: currentSession,
          dappInfo: currentDapp,
          connectionType: toConnectionType(view.connection_type),
          pendingFingerprint: view.pending_fingerprint,
          reconnectStuck: view.reconnect_stuck,
        };
        listeners.forEach((listener) => listener(currentProjection));
      },
      onError: (error) => console.error('[dapp_session] core fault:', error),
      ports: {
        emit: (event) => dispatchDsess(event),
        request: (transport, id, method, params, origin, chainId) => {
          requestSink?.(transport, id, method, params, origin, chainId);
        },
        durableTransportChanged: (transport) => {
          durableTransport = transport;
          setSignDurableTransport(transport);
        },
        transportDropped: (transport) => {
          dispatchSign({ type: 'transport_dropped', transport_id: signTransportId(transport) });
        },
        walletInfo: () =>
          walletInfoSource?.() ?? { address: '', name: 'Wallet', accounts: [] },
        openBrowser: (url) => {
          router.push({ pathname: '/browser', params: { url } });
        },
        alertInvalidLink: () => {
          showAlert(
            i18n.t('connect.list.invalidLinkTitle'),
            i18n.t('connect.list.invalidLinkBody'),
          );
        },
      },
    });
    // `start` commits the core's pristine view — the frame `INITIAL_VIEW`
    // already mirrors — and asks for nothing else. `RestoreLoaded` is
    // single-shot in the core and must carry BOTH stores, so it is issued by
    // `restoreDsess()` once the wallet is loaded, where the provider's
    // auto-reconnect effect always ran.
    session.start({ type: 'wallet_changed', chain_id: INITIAL_VIEW.chain_id });
  }
  return session;
}

export function dispatchDsess(event: DsessEvent): void {
  ensureDappSession().dispatch(event);
}

// ---------------------------------------------------------------------------
// Intent — one function per thing the user (or the app) can do
// ---------------------------------------------------------------------------

/**
 * Connect to a remote-inject bridge from an ALREADY-PARSED session — the
 * `connectToBridge(session)` the Connect screen and Home have always called.
 *
 * The core owns entry classification (invariant ⑨) and its only door is
 * `InputSubmitted { raw }`, so the session is re-serialised into the canonical
 * link its own `parse_remote_inject_url` reads back field-for-field. That keeps
 * ONE classifier in the app instead of a second one here.
 */
export function connectDsessBridge(session_: RemoteInjectSession): void {
  dispatchDsess({ type: 'input_submitted', raw: remoteInjectLink(session_) });
}

/** Connect via a WalletPair pairing URI — the raw scanned/pasted string. */
export function connectDsessWalletPair(uri: string): void {
  dispatchDsess({ type: 'input_submitted', raw: uri });
}

/**
 * Mount-time restore. The shell reads BOTH stores and reports what exists; the
 * CORE picks remote-inject first (invariant ⑥). Only the WalletPair snapshot's
 * plain dApp metadata crosses — never the snapshot, never the key.
 *
 * A snapshot whose metadata is unreadable is still reported (as an empty
 * identity) rather than swallowed: that is what makes the core issue
 * `RestoreWalletPair`, whose `WalletPairTransport.restore()` wipes exactly the
 * unusable snapshot today's code wiped. Reporting `null` instead would leave it
 * on disk forever.
 */
export async function restoreDsess(): Promise<void> {
  const [remote, snapshot] = await Promise.all([
    loadSession().catch(() => null),
    loadWalletPairSnapshot().catch(() => null),
  ]);
  let walletPair: DAppInfo | null = null;
  if (snapshot) {
    walletPair = { name: '', url: '' };
    try {
      const parsed = JSON.parse(snapshot) as { dapp?: DAppInfo };
      if (parsed.dapp?.name && parsed.dapp.url) walletPair = parsed.dapp;
    } catch {
      /* an unreadable snapshot still has to reach the restore path to be wiped */
    }
  }
  dispatchDsess({
    type: 'restore_loaded',
    remote_inject: remote ? toWireSession(remote) : null,
    wallet_pair: walletPair ? toWireDapp(walletPair) : null,
  });
}
