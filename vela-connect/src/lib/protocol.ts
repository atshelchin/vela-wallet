/**
 * Vela Connect BLE Protocol
 *
 * Chrome extension (Central) ↔ iOS/Android app (Peripheral)
 *
 * Flow:
 *   dApp → Content Script → Background → BLE → Phone → Passkey Sign → BLE → Background → Content Script → dApp
 */

// ─── BLE Service & Characteristics ───

export const BLE = {
  /** Vela Connect BLE service UUID */
  SERVICE_UUID: '0000vela-0000-1000-8000-00805f9b34fb'.replace('vela', 'be1a'),

  /** Extension writes requests to this characteristic */
  REQUEST_UUID: '0001be1a-0000-1000-8000-00805f9b34fb',

  /** Phone notifies responses on this characteristic */
  RESPONSE_UUID: '0002be1a-0000-1000-8000-00805f9b34fb',

  /** Phone advertises wallet info (read) */
  WALLET_INFO_UUID: '0003be1a-0000-1000-8000-00805f9b34fb',

  /** BLE MTU minus overhead — chunk large messages */
  MAX_CHUNK_SIZE: 512,
} as const;

// ─── Message Types ───

export type MessageType =
  | 'eth_requestAccounts'
  | 'eth_accounts'
  | 'eth_chainId'
  | 'eth_sendTransaction'
  | 'eth_signTransaction'
  | 'personal_sign'
  | 'eth_signTypedData_v4'
  | 'wallet_switchEthereumChain'
  | 'wallet_addEthereumChain'
  | 'disconnect';

/** Request: extension → phone */
export interface BLERequest {
  id: string;
  method: MessageType;
  params: unknown[];
  origin: string;       // dApp origin (e.g. "https://app.uniswap.org")
  favicon?: string;
}

/** Response: phone → extension */
export interface BLEResponse {
  id: string;
  result?: unknown;
  error?: { code: number; message: string };
}

/** Wallet info from phone (read from WALLET_INFO characteristic) */
export interface WalletInfo {
  address: string;
  chainId: number;
  name: string;        // account name
}

// ─── Connection State ───

export type ConnectionState = 'disconnected' | 'searching' | 'connected';

export interface ConnectedDevice {
  name: string;
  id: string;
}

// ─── Content Script ↔ Background Messages ───

/** Content script sends to background */
export interface ProviderRequest {
  type: 'VELA_PROVIDER_REQUEST';
  id: string;
  method: string;
  params: unknown[];
  origin: string;
  favicon?: string;
}

/** Background sends to content script */
export interface ProviderResponse {
  type: 'VELA_PROVIDER_RESPONSE';
  id: string;
  result?: unknown;
  error?: { code: number; message: string };
}

/** Background broadcasts state changes */
export interface StateUpdate {
  type: 'VELA_STATE_UPDATE';
  connectionState: ConnectionState;
  walletInfo?: WalletInfo;
}

// ─── Popup ↔ Background Messages ───

export interface PopupMessage {
  type: 'VELA_POPUP_ACTION';
  action: 'startScan' | 'disconnect' | 'getState' | 'approveRequest' | 'rejectRequest';
  requestId?: string;
}

export interface PopupState {
  type: 'VELA_POPUP_STATE';
  connectionState: ConnectionState;
  device?: ConnectedDevice;
  walletInfo?: WalletInfo;
  pendingRequests: PendingRequest[];
}

export interface PendingRequest {
  id: string;
  method: string;
  params: unknown[];
  origin: string;
  favicon?: string;
  timestamp: number;
}

// ─── Chunked Transfer ───

/** For messages > MAX_CHUNK_SIZE, split into chunks */
export interface ChunkHeader {
  totalChunks: number;
  chunkIndex: number;
  messageId: string;
}

export function encodeMessage(msg: BLERequest | BLEResponse): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(msg));
}

export function decodeMessage<T>(data: ArrayBuffer): T {
  return JSON.parse(new TextDecoder().decode(data));
}

/** Split data into BLE-friendly chunks */
export function chunkData(data: Uint8Array, maxSize: number = BLE.MAX_CHUNK_SIZE): Uint8Array[] {
  if (data.length <= maxSize) return [data];
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < data.length; i += maxSize) {
    chunks.push(data.slice(i, i + maxSize));
  }
  return chunks;
}
