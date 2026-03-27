# Vela Wallet — iOS

Ethereum Smart Wallet based on Passkey + Safe 1.4.1 + ERC-4337.

## Requirements

- Xcode 26+
- iOS 18.0+
- Swift 5+
- Associated Domain: `webcredentials:getvela.app`

## Project Structure

```
VelaWallet/
├── VelaWalletApp.swift              App entry, restores accounts from iCloud
├── ContentView.swift                RootView, OnboardingFlow, MainTabView, PendingUploadOverlay
├── Localizable.xcstrings            i18n (English + Simplified Chinese)
│
├── Theme/
│   └── VelaTheme.swift              Colors, fonts, spacing, button styles
│
├── Models/
│   └── WalletState.swift            Observable state, Account, Network (7 chains), Token
│
├── Services/
│   ├── PasskeyService.swift         WebAuthn registration/authentication/signing (ASAuthorization)
│   ├── EthCrypto.swift              Keccak-256, ABI encoding, CREATE2, EIP-55 checksum
│   ├── SafeAddressComputer.swift    Deterministic Safe address from P256 public key
│   ├── SafeTransactionService.swift ERC-4337 UserOp build + sign + submit
│   ├── AttestationParser.swift      CBOR attestation → P256 public key, DER → raw signature
│   ├── WalletAPIService.swift       getvela.app API client (balances, NFTs, bundler, exchange rate)
│   ├── PublicKeyIndexService.swift  Public key storage/retrieval server client
│   ├── LocalStorage.swift           iCloud KV Store (accounts, custom tokens, pending uploads)
│   └── LanguageManager.swift        Language persistence (restart to apply)
│
├── Views/
│   ├── Components/
│   │   ├── VelaComponents.swift     NavBar, SectionHeader, TokenIcon, NetworkIcon, SailLogo
│   │   ├── CachedAsyncImage.swift   Disk + memory cached image loader
│   │   ├── ChainLogo.swift          Chain logo with remote URL + text fallback
│   │   ├── TokenLogo.swift          Token logo (native chain / ERC-20 / fallback)
│   │   └── QRScannerView.swift      Camera QR code scanner with overlay
│   ├── Onboarding/
│   │   ├── WelcomeView.swift        Welcome screen with create / login
│   │   └── CreateWalletView.swift   Name input → Passkey → public key upload → retry/skip
│   ├── Wallet/
│   │   ├── HomeView.swift           Balance, tokens/NFTs tabs, auto-refresh
│   │   ├── SendView.swift           Token select → address/amount → confirm → success
│   │   ├── ReceiveView.swift        QR code, copy, share, network logos, deposit listening
│   │   ├── TokenDetailView.swift    Token info + send/receive
│   │   ├── NFTDetailView.swift      NFT image + metadata + contract
│   │   └── AddTokenView.swift       Custom ERC-20 token (QR scan, auto-fetch info)
│   ├── Connect/
│   │   └── VelaConnectView.swift    Bluetooth pairing UI (BLE not yet implemented)
│   └── Settings/
│       └── SettingsView.swift       Accounts, networks (RPC/Explorer/Bundler), language, pending uploads
│
├── Info.plist                       Camera + Bluetooth permissions
└── VelaWallet.entitlements          Push, iCloud KV, Associated Domains
```

## Architecture

- **UI**: SwiftUI with `@Observable` state management
- **Signing**: Passkey (WebAuthn P256) via `ASAuthorization` — no seed phrase
- **Wallet**: Safe 1.4.1 + SafeWebAuthnSharedSigner + Safe4337Module
- **Address**: Deterministic via CREATE2, same on all EVM chains
- **Transactions**: ERC-4337 UserOperations via Pimlico bundler (`getvela.app/api/bundler`)
- **Storage**: iCloud KV Store + UserDefaults fallback, syncs across devices
- **dApp Connection**: Bluetooth BLE to Vela Connect Chrome extension (planned)
- **i18n**: String Catalog, English + Chinese

## Supported Networks

Ethereum, BNB Chain, Polygon, Arbitrum, Optimism, Base, Avalanche

## Key Design Decisions

1. **Pure Passkey** — no SecureEnclave, no Recovery Module. Security = Apple account security.
2. **Passkey is immutable** — never changes after creation. Changing it would alter the CREATE2 address.
3. **Lazy deployment** — Safe is deployed on-chain only when the first transaction is sent (initCode in UserOp).
4. **Username in userID** — `"name\0uuid"` encoded in Passkey userID, survives device wipes.
5. **Public key indexed** — uploaded to server for recovery, with local iCloud backup.
6. **Unified naming** — API names and concepts match the planned Android implementation.

## Build & Run

1. Open `VelaWallet.xcodeproj` in Xcode
2. Set signing team and bundle ID (`app.getvela.VelaWallet`)
3. Ensure Associated Domain `webcredentials:getvela.app` is configured
4. Run on a real device (Passkey requires physical device, not simulator)

## Tests

```bash
# Unit tests (keccak256, Safe address, ABI encoding, models)
xcodebuild test -project VelaWallet.xcodeproj -scheme VelaWallet \
  -destination 'platform=iOS Simulator,name=iPhone 16'

# Specific test suites
-only-testing:VelaWalletTests/Keccak256Tests
-only-testing:VelaWalletTests/SafeAddressComputerTests
-only-testing:VelaWalletTests/APITokenTests
```

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `getvela.app/api/wallet?address=` | Token balances (7 networks) |
| `getvela.app/api/nft?address=` | NFTs (7 networks) |
| `getvela.app/api/bundler` | ERC-4337 bundler + RPC proxy |
| `getvela.app/api/exchange-rate` | USD exchange rates |
| `webauthnp256-publickey-index.biubiu.tools` | Public key storage |
