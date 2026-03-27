# Vela Connect — Chrome Extension

Bluetooth bridge between Vela Wallet (phone) and dApps (browser). Injects an EIP-1193 provider into web pages, routes signing requests to your phone via BLE.

## For Users

### Install

1. Clone and build the extension (see Development below)
2. Open `chrome://extensions`, enable Developer Mode
3. Click "Load unpacked" and select `.output/chrome-mv3/`

### Usage

1. Open Vela Wallet on your phone and go to the **dApps** tab
2. Tap **Start Bluetooth Pairing** — the phone starts advertising
3. Click the **Vela Connect** icon in Chrome toolbar
4. Click **Pair with phone** — Chrome scans for the phone
5. Once connected, visit any dApp (e.g. app.uniswap.org)
6. The dApp detects Vela as the wallet provider
7. Transaction/sign requests appear on your phone for approval via Face ID

### Supported dApp Methods

| Method | Description |
|--------|-------------|
| `eth_requestAccounts` | Connect wallet |
| `eth_accounts` | Get connected accounts |
| `eth_chainId` | Get current chain ID |
| `eth_sendTransaction` | Send transaction (routed to phone) |
| `personal_sign` | Sign message (routed to phone) |
| `eth_signTypedData_v4` | Sign typed data (routed to phone) |
| `wallet_switchEthereumChain` | Switch network (routed to phone) |

## For Developers

### Tech Stack

- **WXT** — Chrome extension framework (Manifest V3)
- **Svelte 5** — Popup UI
- **TypeScript** — Type safety
- **Web Bluetooth API** — BLE Central (Chrome side)
- **CoreBluetooth** — BLE Peripheral (iOS side)

### Project Structure

```
src/
├── entrypoints/
│   ├── background.ts              Service worker: BLE connection, request routing
│   ├── content.ts                  Content script: bridges page ↔ background
│   ├── provider.content/
│   │   └── index.ts                EIP-1193 Provider injected into MAIN world
│   └── popup/
│       ├── App.svelte              Popup UI (4 states)
│       ├── app.css                 Design system
│       ├── main.ts                 Svelte mount
│       └── index.html              Popup HTML
├── lib/
│   ├── protocol.ts                 BLE protocol: UUIDs, message types, chunking
│   ├── ble.ts                      Web Bluetooth client
│   └── __tests__/
│       └── protocol.test.ts        Protocol unit tests
└── assets/
```

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Web Page                                                │
│  window.ethereum.request({method, params})                │
│       │  (provider.content — MAIN world)                 │
│       ▼                                                  │
│  window.postMessage('VELA_PROVIDER_REQUEST')             │
└───────┬─────────────────────────────────────────────────┘
        │
┌───────▼─────────────────────────────────────────────────┐
│  Content Script (ISOLATED world)                         │
│  Listens for VELA_PROVIDER_REQUEST                       │
│  → chrome.runtime.sendMessage → Background               │
│  ← response → window.postMessage('VELA_PROVIDER_RESPONSE')│
└───────┬─────────────────────────────────────────────────┘
        │
┌───────▼─────────────────────────────────────────────────┐
│  Background Service Worker                               │
│  ├── Local methods: eth_accounts, eth_chainId            │
│  └── Remote methods: eth_sendTransaction, personal_sign  │
│       │                                                  │
│       ▼  BLE write (requestChar)                         │
│  ┌─────────────────────┐                                 │
│  │  Web Bluetooth API  │                                 │
│  └─────────┬───────────┘                                 │
│            │  BLE notify (responseChar)                   │
│            ▼                                             │
│  Route response back to content script                   │
└─────────────────────────────────────────────────────────┘
        │
   ── Bluetooth Low Energy ──
        │
┌───────▼─────────────────────────────────────────────────┐
│  iOS App (CBPeripheralManager)                           │
│  ├── Receive request → Show approval UI                  │
│  ├── User confirms → Passkey sign (Face ID)              │
│  └── Send response back via BLE notify                   │
└─────────────────────────────────────────────────────────┘
```

### Development

```bash
# Install dependencies
bun install

# Development (auto-reload)
bun run dev

# Build for Chrome
bun run build

# Build for Firefox
bun run build:firefox

# Package as zip
bun run zip

# Run tests
bun test

# Type check
bun run check
```

### Adding a New dApp Method

1. Add the method name to `MessageType` union in `src/lib/protocol.ts`
2. In `background.ts`, decide if it's handled locally or forwarded to phone:
   - **Local**: handle in `handleProviderRequest()` before the BLE forwarding
   - **Remote**: it will automatically be forwarded via BLE
3. On the iOS side, handle the method in `VelaConnectView.approveRequest()`

### Popup States

| State | Trigger | UI |
|-------|---------|-----|
| `disconnected` | No BLE connection | Pair button |
| `searching` | User clicked Pair | Pulse animation |
| `connected` | BLE connected, no pending requests | Device card + wallet info |
| `pending request` | dApp sent signing/tx request | Request card + confirm on phone |

## BLE Protocol Specification

### Service & Characteristics

| Name | UUID | Direction | Properties |
|------|------|-----------|------------|
| **Vela Service** | `0000BE1A-0000-1000-8000-00805F9B34FB` | — | Primary service |
| **Request** | `0001BE1A-0000-1000-8000-00805F9B34FB` | Extension → Phone | Write |
| **Response** | `0002BE1A-0000-1000-8000-00805F9B34FB` | Phone → Extension | Notify |
| **Wallet Info** | `0003BE1A-0000-1000-8000-00805F9B34FB` | Phone → Extension | Read |

### Roles

- **Phone (iOS/Android)**: BLE **Peripheral** — advertises service, accepts connections
- **Chrome Extension**: BLE **Central** — scans, connects, reads/writes characteristics

### Message Format

All messages are UTF-8 encoded JSON.

**Request** (extension → phone):
```json
{
  "id": "vela_1711000000_1",
  "method": "eth_sendTransaction",
  "params": [{"to": "0x...", "value": "0x1", "data": "0x"}],
  "origin": "https://app.uniswap.org",
  "favicon": "https://app.uniswap.org/favicon.ico"
}
```

**Response** (phone → extension):
```json
{
  "id": "vela_1711000000_1",
  "result": "0xabcdef..."
}
```

**Error Response**:
```json
{
  "id": "vela_1711000000_1",
  "error": { "code": 4001, "message": "User rejected the request" }
}
```

**Wallet Info** (read from characteristic):
```json
{
  "address": "0x7a3F8c2D...",
  "chainId": 1,
  "name": "Personal"
}
```

### Chunked Transfer

Messages larger than the BLE MTU (typically 512 bytes) are split into sequential chunks. The receiver buffers incoming data and attempts JSON parse after each chunk. When parsing succeeds, the full message is processed.

### Error Codes

Standard EIP-1193 error codes:

| Code | Meaning |
|------|---------|
| `4001` | User rejected the request |
| `4100` | Unauthorized (not connected) |
| `4900` | Disconnected |
| `-32603` | Internal error |
| `-32601` | Method not supported |

### Connection Lifecycle

```
1. Phone starts advertising (user taps "Start Bluetooth Pairing")
2. Extension scans for service UUID 0000BE1A
3. Extension connects to GATT server
4. Extension discovers service + characteristics
5. Extension subscribes to Response characteristic (notify)
6. Extension reads Wallet Info characteristic
7. Connection established — ready for requests

   ... dApp interaction ...

8. Either side can disconnect:
   - Extension: GATT disconnect
   - Phone: stop advertising
9. All pending requests are rejected with code 4900
```

### Security Considerations

- BLE pairing requires physical proximity (Bluetooth range)
- All signing happens on the phone with biometric verification (Face ID / Touch ID)
- The extension never has access to private keys
- Each transaction/sign request requires explicit user approval on the phone
- The phone can reject any request
