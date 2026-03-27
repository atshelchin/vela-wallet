# Vela Wallet — Development Progress

## Architecture

Pure Passkey wallet based on Safe 1.4.1 + ERC-4337 + SafeWebAuthnSharedSigner.

- **Signing**: Passkey (WebAuthn P256) — no seed phrase, no SecureEnclave
- **Wallet**: Safe Smart Account, deterministic CREATE2 address from P256 public key
- **Transaction**: ERC-4337 UserOperations via Pimlico bundler
- **dApp Connection**: Bluetooth BLE → Vela Connect Chrome extension (planned)
- **Storage**: iCloud Key-Value Store (NSUbiquitousKeyValueStore) + local fallback
- **i18n**: String Catalog, English + Chinese, language switch with app restart

## Completed Features

### Core Wallet

- [x] **Passkey registration** — ASAuthorization, custom account name encoded in userID
- [x] **Passkey authentication** — login with existing passkey, name recovered from userID
- [x] **Safe address computation** — Keccak-256 + ABI encoding + CREATE2, verified against TypeScript reference implementation
- [x] **Public key upload** — to webauthnp256-publickey-index server, with retry and pending upload management
- [x] **Public key recovery** — fallback: LocalStorage → iCloud → server query
- [x] **Account switching** — multiple accounts, create new / login with existing passkey
- [x] **iCloud sync** — accounts, public keys, custom tokens, pending uploads all sync across devices
- [x] **AASA configured** — `getvela.app/.well-known/apple-app-site-association` verified working

### Transaction Signing (ERC-4337)

- [x] **UserOperation building** — v0.7 format with factory/factoryData split
- [x] **EIP-712 SafeOp hash** — domain separator + struct hash
- [x] **WebAuthn signature** — Passkey signs SafeOp hash via Face ID
- [x] **Contract signature format** — SafeWebAuthnSharedSigner format (r=signer, s=offset, v=0x00, dynamic data)
- [x] **DER → raw signature conversion** — ECDSA DER to 64-byte r||s
- [x] **clientDataFields extraction** — matches TypeScript reference (skip `",` after challenge, exclude trailing `}`)
- [x] **Gas estimation** — pimlico_getUserOperationGasPrice (fast tier), fallback to eth_gasPrice
- [x] **Deployed vs undeployed** — initCode generation for first deployment, nonce=0 for new wallets
- [x] **Bundler submission** — eth_sendUserOperation → poll eth_getUserOperationReceipt
- [x] **Native + ERC-20 transfers** — both working through executeUserOp

### UI — Onboarding

- [x] Welcome screen with sail logo
- [x] Create wallet — name input + Passkey registration + public key upload
- [x] Login with existing Passkey
- [x] Upload failure → retry / skip with full-screen overlay
- [x] Auto-restore accounts from iCloud on app launch

### UI — Wallet Home

- [x] Balance display with USD total
- [x] Account name + short address
- [x] Send / Receive action buttons
- [x] Token list — all networks mixed, sorted by USD value
- [x] Token logos — cached (memory + disk), chain logos + ERC-20 logos, text fallback
- [x] NFT grid — 2-column layout with cached images, IPFS support
- [x] Tokens / NFTs tab switcher
- [x] Add custom ERC-20 token — network selector, QR scan contract address, auto-fetch name/symbol/decimals
- [x] Auto-refresh every 30 seconds + pull-to-refresh
- [x] Bypass URLSession cache for fresh data

### UI — Send Flow

- [x] Step 1: Select token (skip if from token detail)
- [x] Step 2: Enter address + amount (QR scan, MAX button)
- [x] Step 3: Confirm — USD value, real gas estimate, Face ID sign
- [x] Success state with tx hash
- [x] Error display with retry

### UI — Receive

- [x] QR code generation (CIContext rendered)
- [x] Copy address + Share
- [x] Supported networks — 7 chain logos (cached)
- [x] Real deposit listening — polls /api/wallet every 10s, detects balance increase, haptic + banner notification
- [x] Risk warning text

### UI — Token Detail

- [x] Token logo + balance + USD value
- [x] Send / Receive buttons (send pre-selects token)
- [x] Token info card — name, symbol, network, decimals, contract (copyable), price

### UI — NFT Detail

- [x] Full image display with IPFS gateway
- [x] Name, collection, description
- [x] Contract address (copyable), token ID, type, network

### UI — Settings

- [x] Account management — switch, create new, login with passkey
- [x] Network configuration — RPC, Explorer, Bundler URLs editable per chain
- [x] Language picker — English / Chinese, restart prompt
- [x] Pending upload indicator with retry
- [x] About / version

### UI — Vela Connect (dApps tab)

- [x] Bluetooth pairing UI — steps, animation
- [x] Connected state UI
- [ ] Actual BLE implementation (planned)

### Crypto & Infrastructure

- [x] Keccak-256 — pure Swift, verified against 3 standard test vectors
- [x] ABI encoding — address, uint256, bytes32, function selector
- [x] CREATE2 address computation — verified: Swift output == TypeScript output
- [x] CBOR attestation parser — extracts P256 public key from WebAuthn attestation
- [x] DER signature parser — converts ECDSA DER to raw r||s
- [x] base64url encode/decode
- [x] Image cache — memory (NSCache) + disk, for chain logos and NFT images

### Tests

- [x] **EthCryptoTests** — keccak256 (3 vectors), function selectors (5), ABI encoding, CREATE2, EIP-712 type hashes, Data hex/base64url
- [x] **SafeAddressTests** — public key parsing, salt nonce, setup data hash, full address computation (all verified against TypeScript), contract constants, DER conversion, UserOperation format, error messages
- [x] **APIServiceTests** — APIToken (native/ERC20, USD, chainId, logoURL), APINFT (displayName, IPFS, id), CustomToken, service URLs
- [x] **ThemeTests** — colors, fonts, spacing, radius
- [x] **ViewSnapshotTests** — all views instantiate without crash
- [x] **UI Tests** — onboarding flow, tab navigation, send/receive sheets, Vela Connect pairing

### API Integration

- [x] `getvela.app/api/wallet` — token balances across 7 networks
- [x] `getvela.app/api/nft` — NFTs across all networks
- [x] `getvela.app/api/bundler` — ERC-4337 UserOp submission + gas estimation + RPC calls
- [x] `getvela.app/api/exchange-rate` — USD conversion
- [x] `webauthnp256-publickey-index.biubiu.tools` — public key storage + query

## Remaining Work

- [ ] Vela Connect Chrome extension — Bluetooth BLE communication
- [ ] Android app — same concepts, Kotlin implementation
- [ ] Transaction history display
- [ ] Token price charts
- [ ] ERC-721/1155 transfer (send NFT)
- [ ] Multi-call / batch transactions
- [ ] Paymaster integration (gas sponsorship)
- [ ] WalletConnect alternative via Vela Connect
- [ ] App Store submission
