/**
 * Web Bluetooth client for Vela Connect.
 *
 * Chrome extension acts as BLE Central, connects to phone (Peripheral).
 * Must be called from a user gesture (popup button click).
 */
import {
  BLE,
  type BLERequest,
  type BLEResponse,
  type WalletInfo,
  type ConnectionState,
  type ConnectedDevice,
  encodeMessage,
  decodeMessage,
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
  private _autoReconnect = true;
  private _reconnectAttempts = 0;
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
    this.setState('searching');

    try {
      // Request device with Vela service
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [BLE.SERVICE_UUID] }],
        optionalServices: [BLE.SERVICE_UUID],
      });

      if (!this.device) {
        this.setState('disconnected');
        return;
      }

      // Listen for disconnection — auto-reconnect
      this.device.addEventListener('gattserverdisconnected', () => {
        console.log('[BLE] Device disconnected, will try to reconnect...');
        this.cleanup();
        this.setState('searching');
        this.autoReconnect();
      });

      // Connect GATT
      this.server = await this.device.gatt!.connect();
      const service = await this.server.getPrimaryService(BLE.SERVICE_UUID);

      // Get characteristics
      this.requestChar = await service.getCharacteristic(BLE.REQUEST_UUID);
      this.responseChar = await service.getCharacteristic(BLE.RESPONSE_UUID);

      // Subscribe to responses
      await this.responseChar.startNotifications();
      this.responseChar.addEventListener('characteristicvaluechanged', this.onResponseReceived.bind(this));

      // Read wallet info
      try {
        const walletInfoChar = await service.getCharacteristic(BLE.WALLET_INFO_UUID);
        const infoValue = await walletInfoChar.readValue();
        const walletInfo = decodeMessage<WalletInfo>(infoValue.buffer);
        this.handlers?.onWalletInfo(walletInfo);
      } catch (e) {
        console.warn('[BLE] Could not read wallet info:', e);
      }

      this.setState('connected', this.connectedDevice ?? undefined);
      console.log('[BLE] Connected to', this.device.name);
    } catch (error) {
      console.error('[BLE] Connection failed:', error);
      this.cleanup();
      this.setState('disconnected');
      throw error;
    }
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

  /** Check if Web Bluetooth is available. */
  static isAvailable(): boolean {
    return 'bluetooth' in navigator;
  }

  // ─── Private ───

  private onResponseReceived(event: Event) {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    if (!target.value) return;

    try {
      const response = decodeMessage<BLEResponse>(target.value.buffer);
      console.log('[BLE] Response:', response.id, response.error ? 'ERROR' : 'OK');
      this.handlers?.onResponse(response);
    } catch (e) {
      console.error('[BLE] Failed to parse response:', e);
    }
  }

  private setState(state: ConnectionState, device?: ConnectedDevice) {
    this._state = state;
    this.handlers?.onStateChange(state, device);
  }

  /** Try to reconnect to a previously paired device (no user gesture needed). */
  private async autoReconnect() {
    if (!this._autoReconnect || !this.device?.gatt) return;

    while (this._reconnectAttempts < BLEClient.MAX_RECONNECT_ATTEMPTS && this._autoReconnect) {
      this._reconnectAttempts++;
      console.log(`[BLE] Reconnect attempt ${this._reconnectAttempts}/${BLEClient.MAX_RECONNECT_ATTEMPTS}...`);

      await new Promise(r => setTimeout(r, BLEClient.RECONNECT_INTERVAL_MS));
      if (!this._autoReconnect) break;

      try {
        this.server = await this.device!.gatt!.connect();
        const service = await this.server.getPrimaryService(BLE.SERVICE_UUID);
        this.requestChar = await service.getCharacteristic(BLE.REQUEST_UUID);
        this.responseChar = await service.getCharacteristic(BLE.RESPONSE_UUID);
        await this.responseChar.startNotifications();
        this.responseChar.addEventListener('characteristicvaluechanged', this.onResponseReceived.bind(this));

        // Re-read wallet info
        try {
          const infoChar = await service.getCharacteristic(BLE.WALLET_INFO_UUID);
          const infoVal = await infoChar.readValue();
          const walletInfo = decodeMessage<WalletInfo>(infoVal.buffer);
          this.handlers?.onWalletInfo(walletInfo);
        } catch {}

        this._reconnectAttempts = 0;
        this.setState('connected', this.connectedDevice ?? undefined);
        console.log('[BLE] Reconnected!');
        return;
      } catch (e) {
        console.log(`[BLE] Reconnect failed: ${(e as Error).message}`);
      }
    }

    // All attempts failed
    console.log('[BLE] Giving up reconnection');
    this.handlers?.onDisconnect();
    this.setState('disconnected');
  }

  private cleanup() {
    this.requestChar = null;
    this.responseChar = null;
    this.server = null;
  }
}

/** Singleton BLE client */
export const bleClient = new BLEClient();
