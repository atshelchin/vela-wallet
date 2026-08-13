/**
 * Platform-neutral types for the `dapp_session` core (spec 017, group G11).
 *
 * Standalone for the reason `sign-types.ts` states for itself: the retired native stub needed these declarations without
 * the web service graph behind them. The stub is gone; the split stays
 * because the vocabulary has importers of its own and keeps the wasm graph
 * out of anything that must not load it.
 *
 * This module is also where the WORDS for the core's two semantic watchdogs
 * live. The core owns the *fact* ("the 120 s join watchdog fired", "the 60 s
 * reconnect deadline elapsed") and refuses to own the copy; every string below
 * is byte-identical to the one the TypeScript lifecycle produced for the same
 * situation, so nothing on screen changes:
 *
 * - `join_timeout` — `dapp-connection.tsx:430`'s `setErrorMessage(...)`.
 * - `reconnect_deadline` — `walletpair-transport.ts:366`'s `emit('error', ...)`.
 *
 * The second one matters more than it looks: on web the WalletPair transport
 * keeps its OWN 60 s deadline (see `dsess-executor.ts`'s divergence note),
 * so both the transport's `error` event and the core's `deadline` timer can
 * describe the same episode. Making them the same sentence makes the double
 * report idempotent instead of a flicker between two wordings.
 */

import type { DsessError } from './generated/DsessError';
import type { DsessEvent } from './generated/DsessEvent';
import type { DsessOperation } from './generated/DsessOperation';
import type { DsessView } from './generated/DsessView';
import type { DAppTransport } from '@/services/dapp-transport';
import type { SessionOptions } from './types';

/** One request from the core, carrying the id it will be answered by. */
export type DsessEffect = { id: number; operation: DsessOperation };

/** The wallet facts a `PushWalletInfo` needs; the core only supplies the chain. */
export interface DsessWalletInfo {
  address: string;
  name: string;
  accounts: { name: string; address: string }[];
}

/**
 * The live objects and re-entry points the core deliberately never holds.
 *
 * The core speaks `session_ref` (a `u32`) and nothing else about transports —
 * no X25519 key pair, no message counter, no encrypted snapshot. The shell
 * keeps the ref → instance table, and these ports are everything that has to
 * cross back the other way.
 */
export interface DsessShellPorts {
  /**
   * The core's re-entry point for facts the shell learns AFTER the operation
   * that produced them already answered: a timer the core armed has elapsed
   * (`TimerFired`), and the four transport phase events (`TransportConnected`,
   * `TransportDisconnected`, `TransportReconnecting`, `TransportError`), each
   * stamped with the `session_ref` that owns it. Nothing else is ever emitted
   * from the executor — user intent enters through the resident's own
   * dispatchers.
   */
  emit(event: DsessEvent): void;
  /**
   * An inbound JSON-RPC request from a live transport. Verbatim
   * `transport.on('request', …)` → `handleIncoming(…, { transport, chainId })`:
   * the OWNING transport is stamped so the response cannot go out over a
   * concurrent session's socket (F2).
   */
  request(
    transport: DAppTransport,
    id: string,
    method: string,
    params: unknown[],
    origin: string,
    chainId?: number,
  ): void;
  /**
   * The durable (WalletPair / remote-inject) transport changed —
   * `setSignDurableTransport(…)`, which is what the `sign_request` core's
   * `DURABLE_TRANSPORT_ID` sentinel resolves through.
   */
  durableTransportChanged(transport: DAppTransport | null): void;
  /**
   * A transport this session owned emitted `disconnected` — `sign_request`'s
   * owner-aware request clear. Only the requests THAT transport owns are torn
   * down, so a terminal relay drop never closes a concurrent extension sign.
   */
  transportDropped(transport: DAppTransport): void;
  /** Address / name / accounts for a `PushWalletInfo`. */
  walletInfo(): DsessWalletInfo;
  /** `router.push({ pathname: '/browser', params: { url } })`. */
  openBrowser(url: string): void;
  /** `showAlert(connect.list.invalidLink…)` — the shell owns the words. */
  alertInvalidLink(): void;
}

export type DappSessionOptions = SessionOptions<DsessView> & {
  ports: DsessShellPorts;
};

/**
 * The copy behind the core's semantic error vocabulary. Pure and
 * dependency-free so both the resident (which projects it) and any surface can
 * read it, on either platform.
 */
export function dsessErrorMessage(error: DsessError): string {
  switch (error.type) {
    case 'transport':
      // Shell-reported text rides verbatim — it already IS the message the
      // transport handed `setErrorMessage`.
      return error.message;
    case 'join_timeout':
      return 'Connection timed out. The relay may be unavailable — try scanning again.';
    case 'reconnect_deadline':
    default:
      return 'Still trying to reconnect to the dApp. Check your connection or reconnect manually.';
  }
}
