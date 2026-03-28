# Vela Wallet — Development Progress

## Architecture

Pure Passkey wallet based on Safe 1.4.1 + ERC-4337 + SafeWebAuthnSharedSigner.

- **Signing**: Passkey (WebAuthn P256) — no seed phrase, no SecureEnclave
- **Wallet**: Safe Smart Account, deterministic CREATE2 address from P256 public key
- **Transaction**: ERC-4337 UserOperations via Pimlico bundler
- **dApp Connection**: Bluetooth BLE → Vela Connect Chrome extension
- **Platforms**: iOS (SwiftUI) + Android (Kotlin/Jetpack Compose)
- **Storage**: iOS iCloud (NSUbiquitousKeyValueStore) + Android SharedPreferences
- **i18n**: English + Chinese, language switch (iOS: restart, Android: instant)
- **RPC**: 3-tier fallback (user custom → getvela.app proxy → public RPC), per-chain config persisted

## Completed Features

### Core Wallet (iOS + Android)

- [x] **Passkey registration** — iOS ASAuthorization / Android CredentialManager
- [x] **Passkey authentication** — login with existing passkey, name recovered from userID
- [x] **Safe address computation** — Keccak-256 + ABI encoding + CREATE2, verified across iOS/Android/TypeScript
- [x] **Public key upload** — to webauthnp256-publickey-index server, with retry and pending upload management
- [x] **Public key recovery** — fallback: LocalStorage → iCloud/SharedPrefs → server query
- [x] **Account switching** — multiple accounts, create new / login with existing passkey
- [x] **Cross-device sync** — iOS: iCloud sync; Android: local SharedPreferences
- [x] **AASA configured** — `getvela.app/.well-known/apple-app-site-association`
- [x] **Android assetlinks** — `getvela.app/.well-known/assetlinks.json` with release + debug fingerprints

### Transaction Signing (ERC-4337)

- [x] **UserOperation building** — v0.7 format with factory/factoryData split
- [x] **EIP-712 SafeOp hash** — domain separator + struct hash (identical across platforms)
- [x] **WebAuthn signature** — Passkey signs SafeOp hash via Face ID / biometrics
- [x] **Contract signature format** — SafeWebAuthnSharedSigner (r=signer, s=offset, v=0x00, dynamic data)
- [x] **DER → raw signature conversion** — ECDSA DER to 64-byte r||s
- [x] **clientDataFields extraction** — matches TypeScript reference
- [x] **Gas estimation** — pimlico_getUserOperationGasPrice → fallback eth_gasPrice × 1.5
- [x] **Deployed vs undeployed** — initCode for first deployment, nonce=0 for new wallets
- [x] **Bundler submission** — eth_sendUserOperation → poll eth_getUserOperationReceipt (120s timeout)
- [x] **Native + ERC-20 transfers** — both working through executeUserOp
- [x] **NFT transfers** — safeTransferFrom(from, to, tokenId) via contract call

### Vela Connect — Chrome Extension + BLE

- [x] **Chrome Extension** — Manifest V3, WXT framework, Svelte 5 popup
- [x] **EIP-1193 Provider** — injected window.ethereum with request(), on(), enable()
- [x] **EIP-6963** — announceProvider with uuid, name, icon, rdns
- [x] **BLE Central (Chrome)** — Web Bluetooth API, chunked message protocol with \n\n delimiter
- [x] **BLE Peripheral (iOS)** — CoreBluetooth GATT server, 4 characteristics (service/request/response/walletInfo)
- [x] **BLE Peripheral (Android)** — BluetoothGattServer, MTU negotiation, same protocol
- [x] **Signing methods** — eth_sendTransaction, personal_sign, eth_signTypedData_v4, generic sign
- [x] **RPC forwarding** — non-signing methods forwarded to proxy with public RPC fallback
- [x] **Account/chain sync** — wallet_switchAccount, wallet_switchEthereumChain, accountsChanged events
- [x] **Signing UI** — popup shows tx details, personal_sign hex decode, signTypedData domain+message display

### UI — Onboarding (iOS + Android)

- [x] Welcome screen with sail logo
- [x] Create wallet — name input + Passkey registration + public key upload
- [x] Login with existing Passkey
- [x] Upload failure → retry / skip with full-screen overlay
- [x] PendingUploadOverlay on app start if uploads pending
- [x] Auto-restore accounts from storage on launch

### UI — Wallet Home (iOS + Android)

- [x] Balance display with USD total (dollar + cents split)
- [x] Account name + short address (copyable)
- [x] Send / Receive action buttons
- [x] Token list — all networks, sorted by USD value
- [x] Token logos — Coil (Android) / CachedAsyncImage (iOS), deterministic color fallback
- [x] Add custom ERC-20 token — QR scan contract address, auto-fetch name/symbol/decimals
- [x] Auto-refresh every 30 seconds + pull-to-refresh

### UI — NFT Gallery (iOS + Android, independent tab)

- [x] Collection-based gallery — group by collection name, collapsible cards
- [x] View mode toggle — collections ↔ all grid
- [x] Stats bar — collection count + NFT count
- [x] 3-column mini grid inside collection cards
- [x] 2-column grid in "all" view
- [x] NFT image loading (Coil/CachedAsyncImage) with IPFS support
- [x] Add NFT Collection — input contract, auto-fetch name + ERC721 detection
- [x] Empty state with "Add Collection" CTA
- [x] Pull-to-refresh

### UI — Send Flow (iOS + Android)

- [x] Step 1: Select token (skip if from token detail)
- [x] Step 2: Enter address + amount (QR scan, MAX button)
- [x] Step 3: Confirm — USD value, gas estimate, passkey sign
- [x] Success state with tx hash
- [x] QR scanner — CameraX/ZXing (Android), AVFoundation (iOS)

### UI — NFT Send (iOS + Android)

- [x] NFT preview card with image + name + collection + tokenId
- [x] Recipient address input with QR scan
- [x] safeTransferFrom(from, to, tokenId) via SafeTransactionService
- [x] Success state with tx hash

### UI — Receive (iOS + Android)

- [x] QR code generation (ZXing/CIFilter, generated off main thread)
- [x] Copy address + Share
- [x] Supported networks — 7 chain logos
- [x] Deposit listening — polls every 10s, detects balance increase, haptic + banner
- [x] Risk warning text

### UI — Token Detail (iOS + Android)

- [x] Token logo + balance + USD value
- [x] Send / Receive buttons (send pre-selects token)
- [x] Token info card — name, symbol, network, decimals, contract (copyable), price

### UI — NFT Detail (iOS + Android)

- [x] Full image display with IPFS gateway
- [x] Name, collection, description
- [x] Contract address (copyable), token ID, type, network
- [x] Send NFT button → NFT Send flow

### UI — Settings (iOS + Android)

- [x] Account management — switch, create new, login with passkey
- [x] Network configuration — RPC, Explorer, Bundler URLs editable per chain, persisted
- [x] Language picker — English / Chinese
- [x] Logout button
- [x] About / version

### UI — dApps / Connect (iOS + Android)

- [x] Bluetooth pairing UI — steps, Bluetooth icon, animation
- [x] Advertising state with pulsing animation
- [x] Connected state — device card, wallet info, account switcher
- [x] Request approval modal — method display, chain badge, tx details
- [x] Approve/Reject with passkey signing
- [x] BLE permission request (Android runtime)

### RPC & Network

- [x] 3-tier fallback — user RPC → getvela.app proxy → public RPC
- [x] Network config persistence — edits saved to LocalStorage, loaded by RPCAdapter
- [x] 7 supported chains — Ethereum, BNB, Polygon, Arbitrum, Optimism, Base, Avalanche
- [x] JSON-RPC error detection in responses — throws for fallback

### Localization

- [x] English + Chinese (90+ string resources)
- [x] App name: "Vela Wallet" / "Vela 钱包"
- [x] iOS: String Catalog (Localizable.xcstrings) + InfoPlist.strings
- [x] Android: values/strings.xml + values-zh-rCN/strings.xml

### Crypto & Infrastructure

- [x] Keccak-256 — pure implementation, verified against standard test vectors
- [x] ABI encoding — address, uint256, bytes32, function selector
- [x] CREATE2 address computation — verified: iOS == Android == TypeScript
- [x] CBOR attestation parser — extracts P256 public key from WebAuthn attestation
- [x] DER signature parser — converts ECDSA DER to raw r||s
- [x] EIP-55 checksum addresses
- [x] base64url encode/decode

### Tests

- [x] **iOS**: EthCryptoTests, SafeAddressTests, APIServiceTests, BLETests, ThemeTests, ViewSnapshotTests, UITests
- [x] **Android** (77 tests): EthCryptoTest, SafeAddressComputerTest, UtilityTest, BLEProtocolTest, ApiServiceTest
- [x] All test vectors match cross-platform (same keccak256 outputs, same Safe address for same public key)

### API Integration

- [x] `getvela.app/api/wallet` — token balances across 7 networks
- [x] `getvela.app/api/nft` — NFTs across all networks
- [x] `getvela.app/api/bundler` — ERC-4337 + RPC proxy
- [x] `getvela.app/api/exchange-rate` — USD conversion
- [x] `webauthnp256-publickey-index.biubiu.tools` — public key storage + query

## Remaining Work

- [ ] Transaction history display
- [ ] Token price charts
- [ ] Multi-call / batch transactions
- [ ] Paymaster integration (gas sponsorship)
- [ ] WalletConnect alternative via Vela Connect
- [ ] AddToken/AddNFT contract type auto-detection (ERC-165 supportsInterface)
- [ ] App Store / Google Play submission
