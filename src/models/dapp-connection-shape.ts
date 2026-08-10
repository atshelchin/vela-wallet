/**
 * The dApp connection context's SHAPE — every part of
 * `@/models/dapp-connection` that is the same on every platform: the status
 * vocabulary, the context value type, the React context, `useDAppConnection()`
 * and the remote-inject session storage helpers.
 *
 * Split out of `dapp-connection.tsx` for exactly one reason (the
 * `wallet-state-shape.ts` reason): on web the signing half of the provider is
 * driven by the Rust `sign_request` machine
 * (`rust/crates/vela-core/src/app/sign_request.rs`) instead of five synchronous
 * refs, so `dapp-connection.web.tsx` exists — and a `.web` file must NEVER
 * value-import its own base file (Metro resolves that specifier back to itself
 * and the module recurses at init, taking the whole app down; learned in 016).
 * Both platform variants import this neutral module instead, so there is
 * exactly ONE `DAppConnectionContext` object in any bundle and
 * `useDAppConnection()` is literally the same function on both.
 *
 * Nothing here touches a transport, the wasm or the signing pipeline.
 */
import { createContext, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DAppTransport, DAppInfo, RemoteInjectSession } from '@/services/dapp-transport';
import type { FundingNeeded } from '@/services/bundler-service';
import type { AssetSimResult } from '@/services/tx-simulation';
import type { BLEIncomingRequest } from '@/models/types';

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'vela.remoteInjectSession';

/**
 * Grace window before an automatic reconnect is surfaced in the UI. A relay blip
 * — the dApp momentarily blurring/reloading, a `channel_not_found` while it
 * re-establishes its own socket — usually self-heals within ~1s, so we keep the
 * connection shown as active for this long and only flip to "Reconnecting…" if it
 * hasn't recovered by then. Manual "Reconnect now" taps bypass this (the user
 * pressed it and wants immediate feedback).
 */
export const RECONNECT_GRACE_MS = 4000;

export async function saveSession(session: RemoteInjectSession): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export async function loadSession(): Promise<RemoteInjectSession | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
export type ConnectionType = 'remote-inject' | 'walletpair' | null;

/** The opts a slide-to-confirm hands the provider (`SigningSheet.confirm`). */
export interface ApproveRequestOptions {
  maxFeePerGas?: bigint;
  bundlerCostWei?: bigint;
  gasFeeToken?: string | null;
  quotedFee?: { amount: bigint; recipient: string };
  paramsOverride?: any[];
  assetSim?: AssetSimResult | null;
  intent?: string;
}

/** Per-request facts a one-shot sign transport knows before it emits. */
export interface ExtensionSignMeta {
  /**
   * §12.1.6 — the address the origin was GRANTED. The popup entry resolves it
   * from the grant store before it ever builds a transport, and a request that
   * pins no address of its own would otherwise leave the wallet signing from
   * whatever account happens to be active.
   */
  grantedAddress?: string;
}

export interface DAppConnectionContextValue {
  /** Current connection status. */
  status: ConnectionStatus;
  /** Error message (when status === 'error'). */
  errorMessage: string | null;
  /** The current session (if any). */
  session: RemoteInjectSession | null;
  /** DApp metadata (name, url, icon) from the relay session. */
  dappInfo: DAppInfo | null;
  /** Current incoming signing request (shown in global modal). */
  incomingRequest: BLEIncomingRequest | null;
  /** Whether a signing operation is in progress. */
  isSigning: boolean;
  /** True once the passkey/submit phase has STARTED (past the gas pre-check). At
   *  this point the tx is committed — a swipe-dismiss must dismiss (the op proceeds),
   *  never reject, or a "cancelled" tx would still broadcast (BUG-2 submit window). */
  isSubmitting: boolean;
  /** Last signing error message. */
  signError: string | null;
  /** UserOp hash once a tx is submitted, while awaiting the on-chain receipt. */
  pendingOpHash: string | null;
  /**
   * The signing machine's own approval gate: a reviewable request, the granted
   * account reconciled, nothing in flight. The sheet ANDs it with the approval
   * guard's `confirm_allowed` — that AND is the whole confirm gate
   * (`SignView.confirm_gate_open`'s stated contract).
   */
  confirmGateOpen: boolean;
  /** Current chain ID for the bridge connection. */
  chainId: number;
  /** Which transport is active. */
  connectionType: ConnectionType;
  /** 4-digit fingerprint pending user verification (WalletPair only). */
  pendingFingerprint: string | null;
  /** Connect to a remote-inject bridge. */
  connectToBridge: (session: RemoteInjectSession) => Promise<void>;
  /** Connect via WalletPair pairing URI. */
  connectToWalletPair: (uri: string) => Promise<void>;
  /** Confirm the WalletPair fingerprint and complete connection. */
  confirmFingerprint: () => Promise<void>;
  /** Cancel a pending WalletPair fingerprint verification. */
  cancelFingerprint: () => void;
  /** Disconnect from the current bridge. */
  disconnectBridge: () => void;
  /**
   * Begin a Safari-extension sign: install a one-shot ExtensionBridgeTransport
   * into the transient sign slot (never clobbers a live WalletPair/bridge session)
   * and render the real SigningRequestModal for it. Used only by src/app/sign.tsx.
   */
  beginExtensionSign: (transport: DAppTransport, meta?: ExtensionSignMeta) => void;
  /** Force an immediate reconnect of the active session ("Reconnect now"). */
  reconnect: () => void;
  /** True once an auto-reconnect has dragged on long enough to prompt the user. */
  reconnectStuck: boolean;
  /**
   * Approve the current incoming request. For transactions the modal passes the
   * quoted maxFeePerGas plus the raw bundler gas cost (for the funding
   * pre-check), the selected fee asset (gasFeeToken: null = native, else a
   * whitelisted stablecoin on in-band chains) and, for edited approvals, the
   * rewritten (capped) params.
   */
  approveRequest: (opts?: ApproveRequestOptions) => Promise<void>;
  /** Reject the current incoming request. */
  rejectRequest: () => void;
  /** Dismiss the modal after an error (response already sent). */
  dismissRequest: () => void;
  /** Switch chain for the bridge connection. */
  switchChain: (chainId: number) => void;
  /** Bundler funding needed (gas account underfunded during dApp tx). */
  fundingNeeded: FundingNeeded | null;
  /** Called when user has funded the gas account. Retries the pending request. */
  handleFundingComplete: () => void;
  /** Called when user cancels funding. Rejects the pending request. */
  handleFundingCancel: () => void;
}

export const DAppConnectionContext = createContext<DAppConnectionContextValue>({
  status: 'disconnected',
  errorMessage: null,
  session: null,
  dappInfo: null,
  incomingRequest: null,
  isSigning: false,
  isSubmitting: false,
  signError: null,
  pendingOpHash: null,
  confirmGateOpen: false,
  chainId: 1,
  connectionType: null,
  pendingFingerprint: null,
  connectToBridge: async () => {},
  connectToWalletPair: async () => {},
  confirmFingerprint: async () => {},
  cancelFingerprint: () => {},
  disconnectBridge: () => {},
  beginExtensionSign: () => {},
  reconnect: () => {},
  reconnectStuck: false,
  approveRequest: async () => {},
  rejectRequest: () => {},
  dismissRequest: () => {},
  switchChain: () => {},
  fundingNeeded: null,
  handleFundingComplete: () => {},
  handleFundingCancel: () => {},
});

export function useDAppConnection() {
  return useContext(DAppConnectionContext);
}
