# Vela Wallet

A self-custodial smart wallet for EVM networks.

Vela Wallet uses ERC-4337 account abstraction with WebAuthn (passkey) authentication — no seed phrases, no private keys to manage.

The React Native + Expo codebase runs on **iOS** and **Android**. The **web** build now comes from the SvelteKit shell in [app-web/vela-wallet](app-web/vela-wallet/README.md), and **desktop** is a separate native client.

> ### 🚧 Migrating off Expo
>
> Vela is moving away from React Native and Expo. The Expo app in [src/](src/) is what ships today, and it is not going anywhere yet: nothing has been deleted, every command in this README still works, and it remains the app that holds real funds.
>
> Next to it, the wallet is being rebuilt as **one shared Rust core plus one native shell per platform** — SwiftUI on iOS, Jetpack Compose on Android, SvelteKit on the web, gpui on desktop. The two architectures live side by side in this repo while the move happens, screen by screen.
>
> What the new one is, why it exists, and how far it has got: [The new architecture](#the-new-architecture).

## Features

- **Passkey authentication** — Sign transactions with Face ID, Touch ID, or fingerprint. No seed phrases or private key management.
- **Smart contract wallet** — Built on [Safe](https://github.com/safe-fndn/safe-smart-account/tree/release/v1.4.1) with ERC-4337 account abstraction. Your wallet is a Safe smart account.
- **12 EVM networks** — Ethereum, BNB Chain, Polygon, Arbitrum, Optimism, Base, Avalanche, Gnosis, Unichain, Tempo, Monad, World Chain. Custom networks supported.
- **Multi-chain portfolio** — Balances and USD prices across all chains in one view. Native tokens, stablecoins, wrapped assets, and custom ERC-20s.
- **On-chain pricing** — DEX quotes (Uniswap V3, PancakeSwap, Aerodrome) with Chainlink oracle fallback. No third-party price API dependency.
- **Deposit detection** — Real-time balance monitoring with haptic notification when incoming transfers land.
- **DApp Connect** — Pair with compatible dApps over WalletPair's encrypted WebSocket relay to sign transactions from Vela.
- **HTTPS Web Wallet** — dApps can integrate `@vela-wallet/sdk` and open `wallet.getvela.app` for account consent and passkey signing, without a native app or extension.
- **Cross-device recovery** — Passkeys sync through the platform provider (iCloud Keychain on iOS, Google Password Manager on Android). Wallet metadata backs up via iCloud Key-Value Store (iOS) and Android Auto Backup.
- **Fully self-hostable** — All four backend services (chain data, passkey index, bundler, currency rates) are published on GitHub and can be self-deployed.

## Architecture (the Expo app, shipping today)

```
┌─────────────────────────────────────────────┐
│  React Native + Expo Router                 │
│  (iOS / Android / Web)                      │
├─────────────────────────────────────────────┤
│  Native Modules                             │
│  ┌──────────┐ ┌──────────┐ ┌─────────────┐ │
│  │ Passkey  │ │ CloudSync│ │ BLE Connect │ │
│  │ WebAuthn │ │ iCloud / │ │ DApp Pairing│ │
│  │ P-256    │ │ AutoBackup│ │             │ │
│  └──────────┘ └──────────┘ └─────────────┘ │
├─────────────────────────────────────────────┤
│  Services                                   │
│  ┌──────────────────┐ ┌──────────────────┐  │
│  │ RPC Pool         │ │ Safe Transaction │  │
│  │ Multi-source     │ │ ERC-4337 UserOp  │  │
│  │ Auto-failover    │ │ WebAuthn signing │  │
│  │ Latency scoring  │ │ Bundler submit   │  │
│  └──────────────────┘ └──────────────────┘  │
│  ┌──────────────────┐ ┌──────────────────┐  │
│  │ Wallet API       │ │ Price Service    │  │
│  │ Multicall3 batch │ │ DEX quotes       │  │
│  │ Progressive load │ │ Chainlink oracle │  │
│  └──────────────────┘ └──────────────────┘  │
├─────────────────────────────────────────────┤
│  EVM Networks (12 chains)                   │
│  ETH · BNB · POL · ARB · OP · BASE          │
│  AVAX · GNO · UNI · TEMPO · MON · WLD       │
└─────────────────────────────────────────────┘
```

## The new architecture

### Why we are leaving Expo

Two structural problems that no amount of care inside the React Native codebase fixes:

- **The code that must not be wrong existed several times over.** Keccak-256 was hand-rolled twice — TypeScript and a parallel Swift copy — alongside SHA-256, a dynamic ABI decoder and P-256 curve math on BigInt. Counterfactual Safe address derivation was maintained in three places, including byte-matched constants in the bundler repo. A divergence in any copy silently loses funds or makes the signing sheet lie about what is being approved. ([rust/README.md](rust/README.md))
- **The rules that guard your money lived inside React components.** Rules bought with incidents — a passkey must *prove* it can sign before anything persists, a cancelled verification must resume from the signature instead of minting a second passkey — sat in `useState` cells and mutable refs, untestable without a browser. One send controller alone holds ~40 state cells whose ordering is maintained by comments and discipline. ([specs/011](specs/011-crux-onboarding-state/spec.md), [specs/016](specs/016-crux-wallet-state/spec.md))

So the computation and the rules move down into one Rust crate, and each platform gets a shell that renders it with that platform's own UI toolkit — not a cross-platform runtime pretending to be four.

```
┌────────────────┬────────────────┬────────────────┬────────────────┐
│  iOS           │  Android       │  Web           │  Desktop       │
│  SwiftUI       │  Compose       │  SvelteKit     │  gpui (Rust)   │
│  app-ios/      │  app-android/  │  app-web/      │  app-desktop/  │
└───────┬────────┴───────┬────────┴───────┬────────┴───────┬────────┘
        │ UniFFI/Swift   │ UniFFI/Kotlin  │ wasm-bindgen   │ crate dep
        └────────────────┴───────┬────────┴────────────────┘
                                 ▼
          ┌──────────────────────────────────────────────┐
          │  vela-core  (rust/crates/vela-core)          │
          │  ┌────────────────────────────────────────┐  │
          │  │ Crux state machines — business rules   │  │
          │  │ send · sign_request · fee_policy ·     │  │
          │  │ rpc_pool · dapp_session · contacts · … │  │
          │  ├────────────────────────────────────────┤  │
          │  │ primitives · abi · eip712 · safe ·     │  │
          │  │ webauthn · identicon · i18n (15 locs)  │  │
          │  └────────────────────────────────────────┘  │
          │  pure, deterministic — no I/O, no network    │
          └──────────────────────────────────────────────┘
```

### What lives in the core

- **Deterministic computation, zero I/O**: hex/base64url/quantity, keccak256, sha256, EIP-55, CREATE2, runtime calldata decoding, `eth_signTypedData_v4` digests, counterfactual Safe and splitter addresses, WebAuthn COSE/DER handling and two-assertion public-key recovery, account identicons, and the i18n engine with all 15 locale catalogs compiled in.
- **Business state as [Crux](https://github.com/redbadger/crux) machines**: the core owns every decision. A shell translates input into Events, executes the effects the core asks for (passkey ceremony, storage, RPC), hands the results back, and renders the ViewModel it gets. Rules become testable without a browser, a device, or a network.
- **No hand-rolled primitives, ever**: hashing, curve math, ABI coding and CBOR come from alloy-core, sha2, p256/ecdsa and ciborium/coset, at pinned versions.

One implementation reaches four surfaces: UniFFI generates the Swift and Kotlin bindings, `vela-core-wasm` produces the committed web artifact in `rust/pkg-web`, and the desktop client depends on the crate directly.

### The shells

| Platform | Directory | Stack | Run it |
| --- | --- | --- | --- |
| iOS | [app-ios/VelaWallet](app-ios/VelaWallet) | SwiftUI + VelaCoreKit (SPM package wrapping the xcframework) | open `VelaWallet.xcodeproj`, ⌘R |
| Android | [app-android/vela-wallet](app-android/vela-wallet) | Kotlin + Jetpack Compose | `./gradlew :app:installDebug` |
| Web | [app-web/vela-wallet](app-web/vela-wallet/README.md) | SvelteKit 2 / Svelte 5 on Cloudflare Workers | `pnpm install && pnpm dev` |
| Desktop | [app-desktop/vela-wallet](app-desktop/vela-wallet/README.md) | Rust + [gpui](https://github.com/zed-industries/zed) | `cargo run` |

### One source of truth for everything shared

The four shells are only worth having if they cannot drift apart. Each shared asset has exactly one origin, a generator, and a CI gate that regenerates it and fails on a non-empty diff:

| Shared asset | Source of truth | Generated into |
| --- | --- | --- |
| Translations (15 locales) | `rust/crates/vela-core/i18n/locales/` | compiled-in Rust catalogs, `public/i18n/`, `src/i18n/resources.ts` (`npm run gen:i18n`) |
| Design tokens | [docs/design-tokens.json](docs/design-tokens.json) (Penpot DTCG export) | `tokens.css` / `tokens.ts` for web, `Tokens.swift` for iOS — literals are test-banned in product UI |
| Behavior | conformance corpus extracted from the TypeScript implementations | replayed through Rust, the Kotlin bindings, the Swift bindings and the shipped web artifact |
| App icons | [design/icon/](design/icon/) | every platform's icon set (see [App icons](#app-icons)) |

Two parity suites compare the Rust ports against the JavaScript the app still ships: the full 17,115 locale/key cross-product plus 50,000 fuzzed option bundles for i18n, and every address literal in the repo plus 200,000 random seeds for identicons.

### Where it stands

- **Shipping**: the Expo app. All wallet functionality — RPC pool, ERC-4337 signing and submission, dApp connect, portfolio, pricing — runs there.
- **Already served by the core**: in the Expo **web** build, onboarding (create + sign in) and a growing set of wallet-state machines drive the real screens through wasm — the `.web.ts` controllers in `src/`. On iOS and Android the TypeScript path still runs, because Hermes has no WebAssembly: the same rules, two engines, held together by the conformance corpus. Those machines are what the SvelteKit shell picks up as it takes over the web target.
- **Built in the new shells**: onboarding, wallet home and contacts, on all four platforms, against fixture data (specs [014](specs/014-onboarding-flow-ui/), [015](specs/015-wallet-home-ui/), [018](specs/018-contacts-ui/)). They already take their translations and identicons from the core — `Loc.swift`, `I18nRuntime.kt`, the build-time wasm engine on web — but not yet its state machines: the `crux` feature is compiled out of the UniFFI builds, so iOS and Android link the computation layer only. Nothing in these shells touches a network, a passkey or the bundler yet.
- **Not started**: the send, signing and dApp surfaces in the new shells, and the cutover of any platform's store build.

Feature specs, plans and delivery reports live in [specs/](specs/), numbered in the order they landed.

## Get Started (the Expo app)

1. Install dependencies

   ```bash
   npm install
   ```
2. Start the app

   ```bash
   # iOS / Android
   npx expo start

   # Web
   npx expo start --web
   ```

The new native shells build and run independently of this — see [The shells](#the-shells) for the per-platform commands, and [rust/README.md](rust/README.md) for the shared core they all link against.

## Platform Support


| Feature            | iOS                      | Android                     | Web                         |
| -------------------- | -------------------------- | ----------------------------- | ----------------------------- |
| Passkey (WebAuthn) | Native (ASAuthorization) | Native (Credential Manager) | `navigator.credentials` API |
| Cloud Sync         | iCloud Key-Value Store   | SharedPreferences + Auto Backup | IndexedDB (local only)      |
| QR Scanner         | expo-camera              | expo-camera                 | `getUserMedia` + jsQR       |
| Haptic Feedback    | expo-haptics             | expo-haptics                | No-op                       |
| Clipboard          | expo-clipboard           | expo-clipboard              | `navigator.clipboard`       |
| In-App Browser     | expo-web-browser         | expo-web-browser            | `window.open`               |
| BLE (DApp Connect) | VelaBLE native module    | VelaBLE native module       | Not supported (v1)          |
| Animated Balance   | Reanimated worklet       | Reanimated worklet          | Plain text (no animation)   |

### Web Notes

- **Passkey rpId**: Uses the registrable domain (e.g. `getvela.app`) so passkeys work across subdomains and are consistent with native.
- **Cloud Sync**: Web uses IndexedDB for local persistence. No cross-device sync — accounts are stored in the browser only.
- **DApp Connect**: BLE connection is not available on web. This is planned for a future release.
- **Native APIs**: All platform-specific APIs (Alert, Clipboard, Haptics, AppState, Linking) are abstracted via `src/services/platform.ts`.

### Desktop

The desktop client is a **separate native application** — Rust on
[gpui](https://github.com/zed-industries/zed), not React Native — in
[app-desktop/vela-wallet](app-desktop/vela-wallet). It shares the `vela-core`
crate and the design sources with the app above, but none of its TypeScript, so
the table does not describe it.

Installable packages are built from that directory, for x64 and ARM64:

| Platform | Package | Command |
| --- | --- | --- |
| Windows 10/11 | Inno Setup installer | `./scripts/build-windows-installer.ps1` |
| macOS 11+ | `.app` bundle | `./scripts/build-macos-app.sh` |
| Fedora, RHEL, openSUSE | `.rpm` | `./scripts/build-linux-packages.sh --formats rpm` |
| Debian, Ubuntu | `.deb` | `./scripts/build-linux-packages.sh --formats deb` |
| Any Linux, sandboxed | Flatpak bundle | `./scripts/build-flatpak.sh` |

Setup, system dependencies and release steps are in
[app-desktop/vela-wallet/README.md](app-desktop/vela-wallet/README.md).

### App icons

Every icon in the repository — iOS, Android, both native projects, the desktop
packages and this site's favicons — is rendered from one vector source,
[design/icon/](design/icon/). Nothing is hand-exported, so the platforms cannot
drift apart:

```bash
./scripts/gen-app-icons.sh                                   # Expo, app-ios, app-android, getvela.app
app-desktop/vela-wallet/scripts/generate-desktop-icons.sh    # Linux hicolor, Windows .ico, macOS .iconset
```

Both scripts commit their output and encode the per-platform rules that
otherwise fail silently — iOS rejecting alpha, Android's 66.7% safe zone,
Windows resolving the icon by resource id. The details are in the desktop
README under [Icons](app-desktop/vela-wallet/README.md#icons).

## Build for Web (Cloudflare Workers)

The web build comes from [app-web/vela-wallet](app-web/vela-wallet/README.md) — the SvelteKit shell, deployed as the Cloudflare Worker `vela-wallet-web`:

```bash
cd app-web/vela-wallet
pnpm install
pnpm build      # tokens drift check + worker types + prerender all 15 locales
pnpm preview    # wrangler dev of the built worker on :4173
```

`pnpm build` runs the vela-core wasm i18n engine in Node to prerender each `/{locale}` page, so no translation runtime and no wasm reach the deployed Worker. Cloudflare builds the same command from the repo; CI runs it too, so a broken build fails the PR rather than the deploy.

The Expo web bundle (`npm run build:web` → `dist/`, deployed to Cloudflare Pages) is no longer the production web build and is no longer built in CI. The command still exists while the Expo app does.

## Self-Deploy Service Endpoints

Vela Wallet relies on four backend endpoints. Default instances are provided, but you can deploy your own for full self-custody.

Configure custom endpoints in **Settings > Advanced > Service Endpoints**.


| Service                  | Description                                       | Repository                                                                                                                      |
| -------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Chain Data Index**     | Network info, token data, chain logos             | [atshelchin/ethereum-data](https://github.com/atshelchin/ethereum-data)                                                         |
| **Passkey Index**        | Public key storage for cross-device recovery      | [atshelchin/webauthnp256-publickey-index.biubiu.tools](https://github.com/atshelchin/webauthnp256-publickey-index.biubiu.tools) |
| **Bundler Service**      | ERC-4337 transaction bundler                      | [mondaylabsltd/vela-relay](https://github.com/mondaylabsltd/vela-relay)                                                           |
| **Exchange-Rate Source** | USD-based fiat rates that drive the currency list | [mondaylabsltd/vela-currency](https://github.com/mondaylabsltd/vela-currency) (Frankfurter-compatible, ECB daily rates)              |

The first three are Vela services that each expose a `/api/health` endpoint. The wallet validates three checks before accepting a custom endpoint for them:

1. **HTTPS** — only secure connections accepted
2. **Reachable** — server responds within 10 seconds
3. **Valid response** — `/api/health` returns the correct `service` identifier and `status: "ok"`

The **Exchange-Rate Source** is any USD-based FX API — the default is `https://vela-currency.getvela.app/v2/rates?base=USD`, served by [mondaylabsltd/vela-currency](https://github.com/mondaylabsltd/vela-currency), Vela's small Frankfurter-compatible service (ECB daily reference rates, dual-runtime Deno / Cloudflare Workers). It's validated by returning a parseable USD-based rate set (not `/api/health`). A self-hosted [Frankfurter](https://frankfurter.dev) instance works as a drop-in alternative. Pin the base to USD (`?base=USD`), or every conversion is silently wrong. For the response shapes Vela accepts, the Chainlink fallback, and a porting guide, see [docs/fiat-price.md](docs/fiat-price.md).

## Gas & Fee Model

Vela Wallet uses ERC-4337 account abstraction, so transactions are relayed by a **bundler** instead of being submitted directly by the user. This means:

### How Gas Fees Work

Each transaction incurs a gas fee deducted from **your Safe wallet** — in the network's native token by default, or in a supported stablecoin where the bundler offers ERC-20 settlement (Tempo has no native coin, so gas there is always settled in USD stablecoins). The fee consists of:

- **On-chain gas cost** — The actual cost to execute the transaction on the blockchain.
- **Relayer service fee** — The total charge is a fixed multiple of the raw on-chain cost: currently **3× on standard networks** (`INBAND_MARKUP`, `src/services/safe-transaction.ts`) and **2× on Tempo** (`TEMPO_FEE_MARGIN`, `src/services/tempo.ts`), with minimums of 0.00001 native units or $0.01 in stablecoins. The margin pays the relayer that fronts the gas and runs the infrastructure.

The confirmation screen shows a single quoted total in the fee asset and in USD. The quoted amount and its recipient are part of the signed payload, so the relayer is paid exactly what was shown.

### Gas Relayer Account

Before your first transaction on a network, you need to fund a **dedicated gas relayer account** (bundler EOA). This is a one-time setup:

- The deposit amount is based on the actual transaction gas requirement.
- The deposit is **non-refundable** — it serves as the relayer's initial operating balance.
- The relayer address **may change** due to service upgrades, requiring a new deposit.
- After the initial deposit, the relayer is self-sustaining: it earns back gas costs from each transaction via EntryPoint refunds.

### Max Send

When sending the maximum amount of a native token (ETH, BNB, etc.), the wallet automatically reserves enough for the transaction's gas fee (EntryPoint prefund). This prevents "insufficient balance" failures.

## WebAuthn Proxy Extension (Domain Recovery / Dev Passkeys)

If the production domain (`getvela.app`) becomes unavailable, passkeys bound to it will stop working on the new hosting domain because WebAuthn ties credentials to the rpId (relying party ID). The included Chrome extension solves this by proxying WebAuthn calls through the extension's own origin, which has `host_permissions` for `getvela.app`.

This also enables local development and preview deployments to authenticate with production passkeys.

### How rpId is resolved


| Environment                                           | Without extension | With extension |
| ------------------------------------------------------- | ------------------- | ---------------- |
| `getvela.app` / `*.getvela.app`                       | `getvela.app`     | `getvela.app`  |
| `localhost` / `127.0.0.1`                             | `localhost`       | `getvela.app`  |
| Preview domains (`*.pages.dev`, `*.vercel.app`, etc.) | current hostname  | `getvela.app`  |

Without the extension, each environment uses its own rpId and maintains independent passkeys. With the extension installed, all environments share the `getvela.app` rpId and the same set of passkeys.

### Supported preview domains

`pages.dev`, `workers.dev`, `github.io`, `vercel.app`, `netlify.app`, `deno.dev`, `fly.dev`, `railway.app`, `render.com`, `surge.sh`, `ngrok-free.app`, `trycloudflare.com`

### Setup

1. Open `chrome://extensions/` and enable **Developer mode**.
2. Click **Load unpacked** and select the `app-browser-extension/chrome-ext-webauthn-proxy/` directory.
3. Grant the requested permissions when prompted.
4. Navigate to your dev/preview URL — the extension activates automatically.

When a page calls `navigator.credentials.create()` or `.get()` with a non-matching rpId, the extension intercepts the call, opens a small popup window, and performs the WebAuthn ceremony with `rpId: "getvela.app"`. The system authenticator prompt (Touch ID / Windows Hello) appears as usual, and the result is passed back to the page.

### How it works

```
Page JS (any domain)
  │  navigator.credentials.create/get intercepted
  ▼
inject.js (MAIN world, document_start)
  │  serialize options, window.postMessage
  ▼
bridge.js (ISOLATED world, has chrome.runtime API)
  │  chrome.runtime.sendMessage
  ▼
background.js (service worker)
  │  chrome.windows.create → opens popup
  ▼
webauthn.html/js (extension origin, has host_permissions)
  │  navigator.credentials.create/get({ rpId: "getvela.app" })
  │  → System authenticator prompt (Touch ID / Windows Hello)
  ▼
Result flows back: webauthn.js → background → bridge → inject → page
```

### Important notes

- The `clientDataJSON.origin` in the WebAuthn response will be `chrome-extension://<id>`, not the page origin. Your relying party server must accept this origin when validating credentials created through the extension.
- The extension sets `window.__VELA_WEBAUTHN_PROXY_RPID__` in the page context. The app's `getRelyingPartyId()` reads this global to ensure public key uploads and server queries use the same rpId as the WebAuthn call.
- This extension is for development and disaster recovery only. Do not publish it to the Chrome Web Store.

### Safe owner recovery extension

The repository also includes [`packages/safe-recovery-extension`](packages/safe-recovery-extension/README.md),
which lets `app.safe.global` control a Safe whose owner list contains Vela's
shared WebAuthn signer contract. The contract owner only authorizes the SafeTx;
it cannot originate an outer transaction. The extension therefore uses a local,
gas-only EOA relayer to submit the signed `execTransaction`, after simulating it
and checking that the Safe calldata contains the WebAuthn contract signature.

## Recipient Identity Resolution

When sending tokens, the wallet resolves recipient addresses to human-readable names for verification. Resolution queries run in parallel across multiple name services, returning the first match by priority:


| Priority | Service       | Chain            | Registry            | Pattern          |
| ---------- | --------------- | ------------------ | --------------------- | ------------------ |
| 1        | Passkey Index | —               | Vela API            | walletRef lookup |
| 2        | .bnb          | BSC (56)         | `0x08CEd32a...`     | Standard ENS     |
| 3        | .arb          | Arbitrum (42161) | `0x4a067EE5...`     | Standard ENS     |
| 4        | .g            | Gravity (1625)   | `0x5dC881dd...`     | Standard ENS     |
| 5        | Basename      | Base (8453)      | `0xb9470442...`     | ENSIP-19         |
| 6        | ENS           | Mainnet (1)      | `0x00000000000C...` | Standard ENS     |

- **Standard ENS**: `namehash(addr.addr.reverse)` → `registry.resolver(node)` → `resolver.name(node)`
- **ENSIP-19** (Basenames): `reverseRegistrar.node(addr)` → chain-specific reverse node → same flow
- Only positive results are cached (AsyncStorage, 24h TTL)
- No third-party API dependencies — all queries use direct on-chain RPC calls

To add a new name service, add an entry to `NAME_SERVICES` in `src/services/recipient-identity.ts`.

## Security Model

- **No private key access** — Signing uses WebAuthn P-256 keys managed by your OS (iCloud Keychain / Google Password Manager). Vela Wallet never has access to the private key.
- **Safe smart account** — Your wallet is a Safe proxy contract, audited and battle-tested with billions in TVL.
- **On-device only** — Transaction construction, signing, and signature verification all happen locally. The bundler only receives the signed UserOperation.
- **Passkey-scoped** — Each wallet is bound to a passkey credential. Transactions require biometric verification (Face ID / fingerprint) every time.

## License

MIT
