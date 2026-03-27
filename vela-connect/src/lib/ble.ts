/**
 * Web Bluetooth client for Vela Connect.
 * Chrome extension acts as BLE Central, connects to phone (Peripheral).
 */
import {
  BLE,
  type BLERequest,
  type BLEResponse,
  type WalletInfo,
  type ConnectionState,
  type ConnectedDevice,
  encodeMessage,
  chunkData,
} from './protocol';

export type BLEEventHandler = {
  onStateChange: (state: ConnectionState, device?: ConnectedDevice) => void;
  onWalletInfo: (info: WalletInfo) => void;
  onResponse: (response: BLEResponse) => void;
  onDisconnect: () => void;
};

class BLEClient {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private requestChar: BluetoothRemoteGATTCharacteristic | null = null;
  private responseChar: BluetoothRemoteGATTCharacteristic | null = null;
  private handlers: BLEEventHandler | null = null;
  private _state: ConnectionState = 'disconnected';
  private _autoReconnect = false;
  private _reconnectAttempts = 0;
  private _responseBuffer = '';
  private _boundResponseHandler: ((event: Event) => void) | null = null;
  private _boundDisconnectHandler: (() => void) | null = null;

  private static readonly MAX_RECONNECT_ATTEMPTS = 10;
  private static readonly RECONNECT_INTERVAL_MS = 3000;

  get state(): ConnectionState { return this._state; }
  get connectedDevice(): ConnectedDevice | null {
    if (!this.device) return null;
    return { name: this.device.name || 'Vela Wallet', id: this.device.id };
  }

  setHandlers(handlers: BLEEventHandler) {
    this.handlers = handlers;
  }

  /** Scan for and connect to a Vela Wallet device. Requires user gesture. */
  async connect(): Promise<void> {
    // Reset reconnect state for fresh connection
    this._autoReconnect = true;
    this._reconnectAttempts = 0;

    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [BLE.SERVICE_UUID] }],
        optionalServices: [BLE.SERVICE_UUID],
      });

      if (!this.device) {
        this.setState('disconnected');
        return;
      }

      this.setState('searching');

      // Remove old disconnect handler if exists
      if (this._boundDisconnectHandler) {
        this.device.removeEventListener('gattserverdisconnected', this._boundDisconnectHandler);
      }
      this._boundDisconnectHandler = () => {
        console.log('[BLE] Device disconnected, will try to reconnect...');
        this.cleanup();
        this.setState('searching');
        this.autoReconnect();
      };
      this.device.addEventListener('gattserverdisconnected', this._boundDisconnectHandler);

      await this.connectGATT();
    } catch (error) {
      const msg = (error as Error).message || '';
      if (!msg.includes('cancel')) {
        console.error('[BLE] Connection failed:', msg);
      }
      this.cleanup();
      this.setState('disconnected');
      throw error;
    }
  }

  /** Connect to GATT server and set up characteristics (used for initial + reconnect). */
  private async connectGATT(): Promise<void> {
    this.server = await this.device!.gatt!.connect();
    const service = await this.server.getPrimaryService(BLE.SERVICE_UUID);

    this.requestChar = await service.getCharacteristic(BLE.REQUEST_UUID);
    this.responseChar = await service.getCharacteristic(BLE.RESPONSE_UUID);

    // Remove old response handler, add new one
    if (this._boundResponseHandler && this.responseChar) {
      this.responseChar.removeEventListener('characteristicvaluechanged', this._boundResponseHandler);
    }
    this._boundResponseHandler = this.onResponseReceived.bind(this);
    await this.responseChar.startNotifications();
    this.responseChar.addEventListener('characteristicvaluechanged', this._boundResponseHandler);

    // Read wallet info
    try {
      const walletInfoChar = await service.getCharacteristic(BLE.WALLET_INFO_UUID);
      const infoValue = await walletInfoChar.readValue();
      const text = new TextDecoder().decode(infoValue.buffer);
      const walletInfo = JSON.parse(text) as WalletInfo;
      this.handlers?.onWalletInfo(walletInfo);
    } catch (e) {
      console.warn('[BLE] Could not read wallet info:', e);
    }

    this.setState('connected', this.connectedDevice ?? undefined);
    console.log('[BLE] Connected to', this.device!.name);
  }

  /** Send a request to the phone. */
  async sendRequest(request: BLERequest): Promise<void> {
    if (!this.requestChar) {
      throw new Error('Not connected');
    }

    const data = encodeMessage(request);
    const chunks = chunkData(data);

    for (const chunk of chunks) {
      await this.requestChar.writeValueWithResponse(chunk);
    }
  }

  /** Disconnect from the phone. */
  disconnect(): void {
    this._autoReconnect = false;
    if (this.server?.connected) {
      this.server.disconnect();
    }
    this.cleanup();
    this.setState('disconnected');
  }

  static isAvailable(): boolean {
    return 'bluetooth' in navigator;
  }

  // ─── Private ───

  /**
   * Receive BLE notify data. Phone sends JSON terminated by \n\n.
   * Process ALL complete messages in the buffer (not just the first).
   */
  private onResponseReceived(event: Event) {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    if (!target.value) return;

    const chunk = new TextDecoder().decode(target.value.buffer);
    this._responseBuffer += chunk;

    // Process ALL complete messages in buffer
    let endIdx: number;
    while ((endIdx = this._responseBuffer.indexOf('\n\n')) !== -1) {
      const json = this._responseBuffer.substring(0, endIdx);
      this._responseBuffer = this._responseBuffer.substring(endIdx + 2);

      try {
        const response = JSON.parse(json) as BLEResponse;
        console.log('[BLE] Response:', response.id, json.length, 'bytes');
        this.handlers?.onResponse(response);
      } catch (e) {
        console.error('[BLE] Parse error:', (e as Error).message);
      }
    }
  }

  /** Try to reconnect to a previously paired device. */
  private async autoReconnect() {
    if (!this._autoReconnect || !this.device?.gatt) return;

    while (this._reconnectAttempts < BLEClient.MAX_RECONNECT_ATTEMPTS && this._autoReconnect) {
      this._reconnectAttempts++;
      console.log(`[BLE] Reconnect attempt ${this._reconnectAttempts}/${BLEClient.MAX_RECONNECT_ATTEMPTS}...`);

      await new Promise(r => setTimeout(r, BLEClient.RECONNECT_INTERVAL_MS));
      if (!this._autoReconnect) break;

      try {
        await this.connectGATT();
        this._reconnectAttempts = 0;
        return;
      } catch (e) {
        console.log(`[BLE] Reconnect failed: ${(e as Error).message}`);
      }
    }

    console.log('[BLE] Giving up reconnection');
    this.handlers?.onDisconnect();
    this.setState('disconnected');
  }

  private setState(state: ConnectionState, device?: ConnectedDevice) {
    this._state = state;
    this.handlers?.onStateChange(state, device);
  }

  private cleanup() {
    this.requestChar = null;
    this.responseChar = null;
    this.server = null;
    this._responseBuffer = ''; // Clear stale partial data
  }
}

/** Singleton BLE client */
export const bleClient = new BLEClient();
