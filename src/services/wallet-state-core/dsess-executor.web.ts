/**
 * The only place the `dapp_session` core touches the outside world.
 *
 * Seventeen operations, each one existing call on an existing service. No
 * branching on business meaning: the five-way entry classification, the phase
 * machine, the mutual exclusion between a WalletPair pairing and a
 * remote-inject session, and every one of the six timers (4 s grace, 45 s stuck
 * prompt, 120 s join watchdog, 60 s reconnect deadline, 8 s `dropIfDead`,
 * `min(1s·2ⁿ, 30s)` backoff) live in Rust. What lives HERE is exactly what the
 * core's module doc assigns to the shell:
 *
 * - **The transport table.** `session_ref` → the live `DAppTransport`. The core
 *   never sees a key, a message counter or an encrypted snapshot; it holds a
 *   number and a phase. A ref this table no longer knows is a no-op, which is
 *   the shell half of the "released handles must go quiet" contract.
 * - **The clock.** `StartTimer`/`CancelTimer` are `setTimeout`/`clearTimeout`
 *   and nothing else. The core owns every duration; the `kind` it sends is
 *   diagnostic only — the `id` is the identity, and a fired timer answers with
 *   its id or is dropped.
 * - **The wiring.** `connected` / `disconnected` / `reconnecting` / `error` /
 *   `request` are forwarded verbatim, stamped with the ref that owns them.
 *
 * Failure contract (shared effect loop): nothing rejects. Every rejection is
 * converted into the result variant that operation answers with — for this
 * machine that means a connect that throws becomes
 * `RemoteInjectConnectFailed { message }`, never a fault in the loop.
 *
 * ---------------------------------------------------------------------------
 * ONE DELIBERATE DIVERGENCE, and it is a safety one — `ReconnectTransport`
 * with `cause: 'backoff'` on a WalletPair transport is answered `ok: true`
 * WITHOUT calling `transport.reconnect()`.
 *
 * `WalletPairTransport` is not a dumb socket: it owns an internal
 * `scheduleReconnect()` implementing the very same `min(1_000 · 2ⁿ, 30_000)`
 * ladder (`walletpair-transport.ts:481-490`), armed from its own `phase ===
 * 'disconnected'` handler. That file is shared with native, where FR-202
 * forbids any behaviour change, so the shell cannot switch it off. Letting the
 * core's backoff timer ALSO call `reconnect()` would put two writers on one
 * relay channel: `WalletPairSession.connect()` does `detachSocket('replaced')`
 * and opens a second WebSocket while the first join is still in flight — the
 * exact dead-channel/fresh-pairing collision BUG-5/6 came from.
 *
 * So the backoff is *arbitrated* by the core (one armed timer at a time, only
 * while transport-down, doubling to a 30 s cap, cancelled on connect — all of
 * it observable and tested) and *executed* by the transport, whose ladder is
 * numerically identical. Every other cause — `manual`, `foreground`, `online`,
 * `restore` — calls `reconnect()` for real, and `restore` in particular must,
 * because the 8 s `dropIfDead` window (invariant ⑤) starts from its result.
 * ---------------------------------------------------------------------------
 */

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
import { clearSession, saveSession } from '@/models/dapp-connection-shape';

import type { DsessDappInfo } from './generated/DsessDappInfo';
import type { DsessRemoteInjectSession } from './generated/DsessRemoteInjectSession';
import type { DsessShellResult } from './generated/DsessShellResult';
import type { DsessEffect, DsessShellPorts } from './dsess-types';

// ---------------------------------------------------------------------------
// Wire ↔ service shapes
// ---------------------------------------------------------------------------

/** The core speaks snake_case; the transports speak camelCase. */
export function toWireSession(session: RemoteInjectSession): DsessRemoteInjectSession {
  return {
    server_url: session.serverUrl,
    session_id: session.sessionId,
    nonce: session.nonce,
    secret: session.secret,
  };
}

export function fromWireSession(session: DsessRemoteInjectSession): RemoteInjectSession {
  return {
    serverUrl: session.server_url,
    sessionId: session.session_id,
    nonce: session.nonce,
    secret: session.secret,
  };
}

/** `DAppInfo.icon` is optional; the core's is nullable. */
export function toWireDapp(info: DAppInfo): DsessDappInfo {
  return { name: info.name, url: info.url, icon: info.icon ?? null };
}

export function fromWireDapp(info: DsessDappInfo): DAppInfo {
  return info.icon == null
    ? { name: info.name, url: info.url }
    : { name: info.name, url: info.url, icon: info.icon };
}

/**
 * The canonical remote-inject link for a session the app already holds — the
 * `?session=` shape of `parseRemoteInjectURL`, which is the one whose every
 * field is percent-decoded on the way back (the `/s/{id}` shape reads the id
 * straight out of the path, so an id needing encoding would not round-trip).
 *
 * It exists because entry classification is the CORE's (invariant ⑨) and the
 * only door into it is `Event::InputSubmitted { raw }`, while
 * `connectToBridge(session)` — the context API the Connect screen has always
 * called — hands over an already-parsed session. Re-serialising here keeps the
 * classifier the single decision site instead of adding a second one.
 */
export function remoteInjectLink(session: RemoteInjectSession): string {
  const query = [
    `session=${encodeURIComponent(session.sessionId)}`,
    `n=${encodeURIComponent(session.nonce)}`,
    `k=${encodeURIComponent(session.secret)}`,
  ].join('&');
  return `${session.serverUrl}/bridge?${query}`;
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

interface Handle {
  transport: DAppTransport;
  /**
   * True for a transport that runs its own reconnect ladder — see the
   * divergence note at the top of this file.
   */
  selfHealing: boolean;
  unsubscribes: (() => void)[];
}

export function createDsessExecutor(ports: DsessShellPorts) {
  /** `session_ref` → the live transport. The core holds only the number. */
  const handles = new Map<number, Handle>();
  /**
   * Refs the core released before the operation that would have registered
   * them answered. `PrepareWalletPair` is the only one that can lose this race
   * (a second scan while the first prepare is still in the microtask queue),
   * and losing it would strand an ephemeral X25519 pair the user just
   * cancelled — invariant ② says that key gets released, so a handle arriving
   * for a dead ref is disconnected on the spot instead of being stored.
   */
  const deadRefs = new Set<number>();

  function adopt(sessionRef: number, handle: Handle): boolean {
    if (deadRefs.delete(sessionRef)) {
      handle.transport.disconnect();
      return false;
    }
    handles.set(sessionRef, handle);
    return true;
  }

  /** Timer id → the platform handle. The core holds only the id. */
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  /** The transport `DURABLE_TRANSPORT_ID` currently resolves to. */
  let durable: DAppTransport | null = null;

  function setDurable(transport: DAppTransport | null): void {
    durable = transport;
    ports.durableTransportChanged(transport);
  }

  /**
   * `wireTransport` — verbatim, minus every decision. The handlers report a
   * fact keyed by the ref that owns it; what that fact MEANS (grace window,
   * status flip, owner-aware clear) is the core's.
   */
  function wire(sessionRef: number, handle: Handle): void {
    const { transport } = handle;
    handle.unsubscribes.push(
      transport.on('connected', () =>
        ports.emit({ type: 'transport_connected', session_ref: sessionRef }),
      ),
      transport.on('disconnected', () => {
        // `sign_request`'s owner-aware clear: only the requests THIS transport
        // owns are torn down. The core applies the rule; the shell only reports
        // which transport died.
        ports.transportDropped(transport);
        if (durable === transport) setDurable(null);
        ports.emit({ type: 'transport_disconnected', session_ref: sessionRef });
      }),
      transport.on('reconnecting', () =>
        ports.emit({ type: 'transport_reconnecting', session_ref: sessionRef }),
      ),
      transport.on('request', (id, method, params, origin, requestChainId) => {
        ports.request(transport, id, method, params, origin, requestChainId);
      }),
      transport.on('error', (message) =>
        ports.emit({ type: 'transport_error', session_ref: sessionRef, message }),
      ),
    );
    setDurable(transport);
  }

  function release(sessionRef: number): Handle | undefined {
    const handle = handles.get(sessionRef);
    if (!handle) return undefined;
    handles.delete(sessionRef);
    return handle;
  }

  function messageOf(error: unknown, fallback: string): string {
    const message = (error as { message?: unknown } | null)?.message;
    return typeof message === 'string' && message ? message : fallback;
  }

  async function execute(effect: DsessEffect): Promise<DsessShellResult> {
    const operation = effect.operation;
    switch (operation.type) {
      case 'prepare_wallet_pair': {
        try {
          // Synchronous, and it mints the ephemeral X25519 pair — from this
          // moment the handle owns key material only `DisconnectTransport` may
          // release (invariant ②).
          const prepared = WalletPairTransport.prepare(operation.uri);
          adopt(operation.session_ref, {
            transport: prepared.transport,
            selfHealing: true,
            unsubscribes: [],
          });
          return {
            type: 'wallet_pair_prepared',
            fingerprint: prepared.fingerprint,
            dapp: toWireDapp(prepared.dappInfo),
          };
        } catch (error) {
          return {
            type: 'wallet_pair_prepare_failed',
            message: messageOf(error, 'Failed to prepare WalletPair session'),
          };
        }
      }

      case 'connect_remote_inject': {
        const transport = new RemoteInjectTransport(fromWireSession(operation.session));
        const handle: Handle = { transport, selfHealing: false, unsubscribes: [] };
        if (!adopt(operation.session_ref, handle)) {
          return { type: 'remote_inject_connect_failed', message: 'Connection failed' };
        }
        // Wired BEFORE connect, exactly as `connectToBridge` wired it: the
        // 'connected' event fires from inside `connect()`.
        wire(operation.session_ref, handle);
        try {
          await transport.connect();
          return { type: 'remote_inject_connect_finished' };
        } catch (error) {
          return {
            type: 'remote_inject_connect_failed',
            message: messageOf(error, 'Connection failed'),
          };
        }
      }

      case 'confirm_wallet_pair_join': {
        const handle = handles.get(operation.session_ref);
        if (!handle) return { type: 'join_failed', message: 'Connection failed' };
        wire(operation.session_ref, handle);
        try {
          await handle.transport.connect();
          // `transport.connected` at THIS moment — `false` is what arms the
          // 120 s join watchdog, exactly as today.
          return { type: 'join_finished', connected: handle.transport.connected };
        } catch (error) {
          return {
            type: 'join_failed',
            message: messageOf(error, 'WalletPair connection failed'),
          };
        }
      }

      case 'reconnect_transport': {
        const handle = handles.get(operation.session_ref);
        if (!handle) return { type: 'reconnect_finished', cause: operation.cause, ok: false };
        if (operation.cause === 'backoff' && handle.selfHealing) {
          // The transport's own ladder is already driving this episode. See the
          // divergence note at the top of this file — calling reconnect() here
          // would open a second relay socket for the same channel.
          return { type: 'reconnect_finished', cause: 'backoff', ok: true };
        }
        try {
          // Optional per transport: remote-inject has none, and `?.()`
          // short-circuits the whole chain exactly as `reconnect()` did.
          await handle.transport.reconnect?.();
          return { type: 'reconnect_finished', cause: operation.cause, ok: true };
        } catch {
          return { type: 'reconnect_finished', cause: operation.cause, ok: false };
        }
      }

      case 'disconnect_transport': {
        const handle = release(operation.session_ref);
        if (!handle) {
          // The operation that mints this handle has not answered yet — mark
          // the ref so it is disconnected the moment it appears (invariant ②).
          deadRefs.add(operation.session_ref);
          return { type: 'ack' };
        }
        handle.unsubscribes.forEach((off) => off());
        handle.unsubscribes.length = 0;
        if (durable === handle.transport) setDurable(null);
        handle.transport.disconnect();
        return { type: 'ack' };
      }

      case 'ping_transport': {
        // `DAppTransport` exposes no ping: WalletPair's is the private
        // heartbeat inside the transport, which also owns the foreground/online
        // recovery this operation belongs to (`AppForegrounded`/`NetworkOnline`
        // are therefore never dispatched on web). Unreachable today, and an ack
        // is the only honest answer if it ever is reached.
        return { type: 'ack' };
      }

      case 'push_wallet_info': {
        const handle = handles.get(operation.session_ref);
        if (!handle) return { type: 'ack' };
        const info = ports.walletInfo();
        handle.transport.pushWalletInfo({
          address: info.address,
          chainId: operation.chain_id,
          name: info.name,
          accounts: info.accounts,
        });
        return { type: 'ack' };
      }

      case 'persist_wallet_pair_counters': {
        // The counter write itself is the protocol object's own: it awaits
        // `persistCounters()` before it ever sets phase 'connected'
        // (`walletpair-protocol.ts:819-821`), so by the time this operation can
        // be issued — from `TransportConnected` — the snapshot on disk already
        // carries the sequence numbers the next seal will use. The core's role
        // here is the ORDERING contract (invariant ⑦: no ciphertext for a nonce
        // that is not durable yet), and it is satisfied because the push is
        // only ever issued from this operation's `ok: true`.
        const handle = handles.get(operation.session_ref);
        return { type: 'counters_persisted', ok: !!handle };
      }

      case 'restore_wallet_pair': {
        try {
          const transport = await WalletPairTransport.restore();
          if (!transport) return { type: 'wallet_pair_restore_finished', restored: false };
          const handle: Handle = { transport, selfHealing: true, unsubscribes: [] };
          if (!adopt(operation.session_ref, handle)) {
            return { type: 'wallet_pair_restore_finished', restored: false };
          }
          wire(operation.session_ref, handle);
          return { type: 'wallet_pair_restore_finished', restored: true };
        } catch {
          // `restore()` already wiped a snapshot it could not validate; the
          // core issues its own `ClearWalletPairSnapshot` on top, idempotently.
          return { type: 'wallet_pair_restore_finished', restored: false };
        }
      }

      case 'fetch_dapp_info': {
        const handle = handles.get(operation.session_ref);
        if (!handle) return { type: 'dapp_info_fetched', info: null };
        // `.catch(() => null)` verbatim — a failed fetch sets null, it is not
        // an error the user is shown.
        const info = await handle.transport.fetchDAppInfo().catch(() => null);
        return { type: 'dapp_info_fetched', info: info ? toWireDapp(info) : null };
      }

      case 'save_remote_inject_session': {
        await saveSession(fromWireSession(operation.session));
        return { type: 'ack' };
      }

      case 'clear_remote_inject_session': {
        await clearSession();
        return { type: 'ack' };
      }

      case 'clear_wallet_pair_snapshot': {
        await clearWalletPairSession();
        return { type: 'ack' };
      }

      case 'start_timer': {
        // `kind` is diagnostic only; `id` is the identity. A timer whose id the
        // core has already forgotten answers into a stale-by-id drop.
        const existing = timers.get(operation.id);
        if (existing) clearTimeout(existing);
        timers.set(
          operation.id,
          setTimeout(() => {
            timers.delete(operation.id);
            ports.emit({ type: 'timer_fired', id: operation.id });
          }, operation.ms),
        );
        return { type: 'ack' };
      }

      case 'cancel_timer': {
        const timer = timers.get(operation.id);
        if (timer) {
          clearTimeout(timer);
          timers.delete(operation.id);
        }
        return { type: 'ack' };
      }

      case 'open_browser': {
        ports.openBrowser(operation.url);
        return { type: 'ack' };
      }

      case 'alert_invalid_link': {
        ports.alertInvalidLink();
        return { type: 'ack' };
      }
    }
  }

  /**
   * The defensive tail. Every operation above converts its own failures, so
   * this is only ever reached by a fault in the plumbing — and the safe answer
   * is always the one that leaves the core knowing the attempt did NOT succeed
   * rather than leaving it waiting.
   */
  function toFailure(effect: DsessEffect): DsessShellResult {
    const operation = effect.operation;
    switch (operation.type) {
      case 'prepare_wallet_pair':
        return {
          type: 'wallet_pair_prepare_failed',
          message: 'Failed to prepare WalletPair session',
        };
      case 'connect_remote_inject':
        return { type: 'remote_inject_connect_failed', message: 'Connection failed' };
      case 'confirm_wallet_pair_join':
        return { type: 'join_failed', message: 'WalletPair connection failed' };
      case 'reconnect_transport':
        return { type: 'reconnect_finished', cause: operation.cause, ok: false };
      case 'restore_wallet_pair':
        return { type: 'wallet_pair_restore_finished', restored: false };
      case 'fetch_dapp_info':
        return { type: 'dapp_info_fetched', info: null };
      case 'persist_wallet_pair_counters':
        // Never push a nonce whose counters are not known-durable (⑦): the
        // core answers a failed persist by closing and wiping the session.
        return { type: 'counters_persisted', ok: false };
      default:
        return { type: 'ack' };
    }
  }

  return { execute, toFailure };
}
