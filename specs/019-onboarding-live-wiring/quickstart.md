# Quickstart — Validating 019

**Feature**: [spec.md](./spec.md) · **Contracts**: [shell-operations.md](./contracts/shell-operations.md)

How to run each client and prove the feature works. Every scenario here maps to a success
criterion; the gallery is *not* proof — SC-001 through SC-004 are only satisfied by
running the real flow with a real authenticator.

---

## Prerequisites

| Need | For |
| --- | --- |
| a passkey provider signed in (iCloud Keychain / Google Password Manager) | web, iOS, Android |
| a FIDO2 USB security key (e.g. YubiKey 5) | **desktop — mandatory**, and any `SecurityKey` add on web |
| a second physical device with the same passkey account | SC-002 cross-device sign-in |
| network reachability to the registry and index services | publishing and rebuild |
| Xiaomi `alioth` over `adb` (serial `9d5f42fb`) | Android on-device |

The reference multi-key wallet for SC-003 address comparison is the recorded golden Safe
`0x88cCA0…6894`.

---

## Core — run this before touching any client

```bash
cd rust
cargo test -p vela-core --features crux,i18n-all
cargo clippy --workspace --all-targets --features vela-core/i18n-all -- -D warnings
cargo fmt --check
```

The onboarding machines' own suites are `tests/app_create_wallet.rs`,
`tests/app_login.rs`, `tests/app_session.rs`, driven by `tests/support/mod.rs` with real
conformance vectors (a genuine attestation object and a genuine assertion pair). The new
CTAP module's tests live beside them and replay vectors ported from
`/Volumes/data/production2/securitykeys` (RFC 5869 HKDF, canonical CBOR ordering).

Regenerate whatever the core change touches, and commit the results — these are committed
artifacts, not build output:

```bash
cd /Volumes/data/production/vela-wallet
npm run gen:i18n && npm run lint:i18n && npm run verify:i18n && npm run dump:vectors
npm run gen:core-types          # add --check in CI
npm run build:wasm              # add --check in CI
npm run verify:wasm
```

Then confirm the invariant rewrite is real, not assumed:

```bash
cd rust
cargo tree -p vela-core-uniffi | grep -c crux   # was required to be 0; now expected > 0
ls -l ../app-android/vela-wallet/app/src/main/jniLibs/arm64-v8a/libvela_core_uniffi.so
du -sh ../app-ios/VelaCoreKit/Artifacts/VelaCoreFFI.xcframework
```

Record both sizes before and after. If the delta is unacceptable, the fallback is the
second uniffi crate described in [research.md D2](./research.md).

---

## Web — `app-web/vela-wallet`

```bash
cd app-web/vela-wallet
pnpm install
pnpm dev                        # http://localhost:5173/zh  ·  /dev/gallery
```

Gates before commit:

```bash
pnpm gen:tokens --check && pnpm check && pnpm lint \
  && pnpm test:unit -- --run && pnpm build && pnpm test:e2e
```

Two web-specific things to check by hand, because they are architecture, not features:

1. **The Welcome page still ships no wasm.** Open it with the network panel filtered to
   `.wasm` — nothing loads until you activate 创建钱包 or 我已有钱包.
2. **The Worker still ships no wasm.** `pnpm build`, then confirm the deploy bundle
   contains no `.wasm` — this is what `e2e/welcome-ssr.e2e.ts` asserts, rewritten for the
   client-side path (research D5).

---

## Desktop — `app-desktop/vela-wallet`

```bash
cd app-desktop/vela-wallet
cargo check && cargo clippy --all-targets -- -D warnings && cargo test
VELA_SKIP_LAUNCH_ANIMATION=1 cargo run
VELA_GALLERY=1 VELA_THEME=dark VELA_LANG=zh VELA_SKIP_LAUNCH_ANIMATION=1 cargo run
```

**Plug in the security key before starting the create flow.** With no key present, the
expected behaviour is the `securityKeyRequired` sheet — not a generic failure. Verify
both: run once with nothing plugged in, then plug in and retry from the same sheet.

---

## Android — `app-android/vela-wallet`

```bash
cd app-android/vela-wallet
./gradlew :app:testDebugUnitTest :app:assembleDebug -PvelaSkipRustBuild
./gradlew :app:installDebug -PvelaSkipRustBuild
adb -s 9d5f42fb shell am start -n app.getvela.wallet/.MainActivity \
    --ez vela.skipLaunchAnimation true
# gallery:
adb -s 9d5f42fb shell am start -n app.getvela.wallet/.MainActivity --ez vela.gallery true
```

Rebuild the native library and bindings when the core changes:

```bash
rust/scripts/build-android.sh && rust/scripts/smoke-kotlin.sh
```

Check the relying-party association actually resolves before blaming the code — a missing
or stale `assetlinks.json` makes every registration fail identically to a bug.

---

## iOS — `app-ios/VelaWallet`

```bash
rust/scripts/build-ios-xcframework.sh && rust/scripts/smoke-swift.sh
node app-ios/scripts/gen-tokens.mjs --check
xcodebuild -project app-ios/VelaWallet/VelaWallet.xcodeproj -scheme VelaWallet \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build test
SIMCTL_CHILD_VELA_GALLERY=1 SIMCTL_CHILD_VELA_THEME=dark SIMCTL_CHILD_VELA_LANG=zh \
SIMCTL_CHILD_VELA_SKIP_LAUNCH_ANIMATION=1 \
  xcrun simctl launch --terminate-running-process booted app.getvela.VelaWallet
```

The deployment target moves to **17.4** (research D6). Confirm both the app target's
`IPHONEOS_DEPLOYMENT_TARGET` and `app-ios/VelaCoreKit/Package.swift`'s `platforms:` line
were changed together — a mismatch fails at link time, not at compile time.

Passkey ceremonies do not work on a simulator without a paired provider; the create and
sign-in scenarios need a device.

---

## The fifth shell — `src/` (the shipping Expo web client)

SC-010. It consumes the same core and the same wasm, so it breaks if the core changes and
it is not updated.

```bash
npx tsc --noEmit && npx jest && npm run lint
npm run web           # then create a wallet and sign in for real
```

---

## End-to-end scenarios

Run all seven on every client. Each names the criterion it satisfies.

### 1. Create (SC-001)

Fresh install, no stored state. 创建钱包 → name it → accept both acknowledgements → add
keys → 创建钱包 → address appears → 进入钱包.

Expect: the wallet home shows the name you typed and the address the done screen showed.

### 2. The second-key gate (SC-006)

Create with exactly one key that your provider stores **only on this device** (turn off
the sync provider, or use a USB key). At the key screen the title must read 再加一把才能创建,
the warning strip must be present, and the CTA must read 先添加第 2 把密钥 and do nothing.
Add any second key — the CTA must become 创建钱包 and work.

### 3. Address agreement (SC-003)

Create a wallet on client A with two or more keys. Sign in on client B. The addresses
must be identical, character for character.

### 4. Restart (SC-004)

After scenario 1, force-quit and relaunch. Expect the wallet home, same wallet, no
authentication prompt. Then sign out and confirm you land on Welcome and the wallet routes
are unreachable.

### 5. Cross-client sign-in (SC-002)

On a client that has never stored this account, 我已有钱包. Expect **one** passkey prompt
and then the wallet — the registry recognises the key and the whole founding group is
rebuilt. Count the prompts: two means the common path regressed to recovery.

### 6. Cancellation loses nothing (SC-007)

Dismiss the passkey sheet at each of: the first registration, an added key's registration,
a membership confirmation. Expect, in order: back to the name screen with the name intact;
back to the key list with the keys intact; the one unconfirmed row offering a retry with
finishing blocked.

### 7. Publish failure is recoverable (SC-008)

Cut the network after the keys are minted but before the publish lands (airplane mode
mid-flow, or point the endpoint at an unreachable host in settings). Expect the retry
screen with the full key set preserved and technical details available. Restore the
network and retry — no key may be re-minted.

### Index unreachable (SC-005, partly)

Point the index endpoint at an unreachable host from the Welcome screen's settings. After
three probes two seconds apart, the settings surface must open itself with a warning — and
我已有钱包 must still be attemptable, not disabled.

### Locale sweep (SC-009)

Run the gallery in `zh` and one right-to-left-free non-CJK locale (`ru` is the largest
catalog, so it also exercises the widened offsets). No key may render as its own name, and
no string may overflow its container.
