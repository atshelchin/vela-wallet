import type { DAppInfo, DAppTransport, DAppTransportEvents, WalletInfo } from './dapp-transport';
import {
  VELA_WEB_CHANNEL,
  VELA_WEB_RESPONSE,
  type VelaWebRequest,
  type VelaWebResponseMessage,
} from '../../packages/vela-sdk/src/protocol';

export interface WebPopupPeer {
  sessionId: string;
  origin: string;
  dapp: DAppInfo;
  request: VelaWebRequest;
  port: MessagePort;
}

/** One HTTPS popup request. The MessagePort is capability-bound to the opener that
 * completed the origin-checked handshake; responses never use a wildcard target. */
export class WebPopupTransport implements DAppTransport {
  readonly name = 'Vela Web';
  private _connected = false;
  private _settled = false;
  private listeners = new Map<string, Set<Function>>();

  constructor(private readonly peer: WebPopupPeer) {}

  get connected(): boolean { return this._connected; }
  get requestChainId(): number { return this.peer.request.chainId; }
  get requestAddress(): string | undefined { return this.peer.request.address; }
  get requestOrigin(): string { return this.peer.origin; }

  async connect(): Promise<void> {
    if (this._connected || this._settled) return;
    this._connected = true;
    this.emit('connected', this.peer.dapp.name);
    this.emit('request', this.peer.request.id, this.peer.request.method, this.peer.request.params as any[], this.peer.origin);
  }

  disconnect(): void {
    if (this._settled) return;
    this.sendResponse(this.peer.request.id, undefined, { code: 4001, message: 'User rejected the request' });
  }

  sendResponse(id: string, result?: any, error?: { code: number; message: string }): void {
    if (this._settled) return;
    this._settled = true;
    const message: VelaWebResponseMessage = {
      channel: VELA_WEB_CHANNEL,
      type: VELA_WEB_RESPONSE,
      sessionId: this.peer.sessionId,
      id,
      ...(error ? { error } : { result: result ?? null }),
    };
    try { this.peer.port.postMessage(message); } finally {
      this.peer.port.close();
      this._connected = false;
      this.emit('disconnected');
    }
  }

  pushWalletInfo(_info: WalletInfo): void { /* one-shot channel */ }
  async fetchDAppInfo(): Promise<DAppInfo> { return this.peer.dapp; }

  on<K extends keyof DAppTransportEvents>(event: K, listener: DAppTransportEvents[K]): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return () => this.listeners.get(event)?.delete(listener);
  }

  private emit(event: string, ...args: any[]): void {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }
}

/**
 * WHICH ORIGINS MAY DRIVE THE WALLET POPUP AT ALL: https on any host, or http
 * on a strict loopback host (dev). Anything unparseable is refused.
 *
 * ---------------------------------------------------------------------------
 * OWNERSHIP: the shell's, and it stays here. This is the ruling; do not
 * re-adjudicate it.
 * ---------------------------------------------------------------------------
 *
 * The core has a NEIGHBOURING but different rule —
 * `dapp_permissions::is_insecure_public_origin` / `should_block_insecure_signing`
 * — and the two must not be confused:
 *   - the core's asks *"may this origin SIGN?"* for the in-app WebView browser
 *     (iOS/Android only). It exempts the whole private-LAN space (10/8,
 *     192.168/16, 172.16–31, 169.254/16, `.local`, `fc00::/7`, `fe80::`) so the
 *     on-device test dApp served over the LAN keeps working.
 *   - this one asks *"may this origin open a wallet popup and hand it a
 *     request over `postMessage`?"* — a web-only surface (there is no popup
 *     transport on native, so there is no second implementation of it and
 *     nothing to drift against).
 *
 * They are consistent by CONTAINMENT, not by equality: every origin admitted
 * here is one the core does NOT call an insecure public origin, and the
 * containment is asserted against the REAL Rust core in
 * `web-popup-origin-containment.test.ts`. The difference is one-directional on
 * purpose — a LAN-served http dApp can drive the native browser but not the web
 * popup — because a browser popup is reached from an arbitrary page over
 * `postMessage`, with no committed-origin evidence from a native WebView layer
 * behind it. Stricter is the safe direction; that containment test is what
 * keeps a future edit from making it the other one.
 *
 * `web-request.tsx` asks this ONCE, for both the INIT handshake and the dApp
 * logo. It must stay synchronous and fail-closed: it runs inside a `message`
 * listener that has to claim `event.ports[0]` in the same turn, and routing it
 * through the async wasm bridge would mean a wasm-load failure either opened
 * the gate or bricked every web dApp connection.
 */
export function isAllowedWebDAppOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' ||
      (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'));
  } catch {
    return false;
  }
}
