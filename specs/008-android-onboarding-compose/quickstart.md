# Quickstart: Android Onboarding (Jetpack Compose)

**Branch**: `008-android-onboarding-compose`

## One-time prerequisites

```bash
# Rust Android targets + cargo-ndk. NOTE: rust/rust-toolchain.toml pins the
# workspace toolchain — the targets must be installed on THAT toolchain
# (a bare `rustup target add` outside rust/ lands on your default and is ignored).
rustup target add --toolchain 1.97.1 aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
cargo install cargo-ndk

# Android SDK with NDK 27.x (ANDROID_HOME or ~/Library/Android/sdk); JDK 17+ to launch
# Gradle (daemon JVM 21 auto-provisions via foojay — no manual JDK 21 install needed)
```

## Build the native i18n library (per checkout / after Rust changes)

```bash
# From repo root — cross-compiles libvela_core_uniffi.so for arm64-v8a, armeabi-v7a, x86_64
# into app-android/vela-wallet/app/src/main/jniLibs/ (gitignored)
rust/scripts/build-android.sh
```

The Gradle build runs this automatically via the `cargoNdkBuild` task; pass
`-PvelaSkipRustBuild` to skip when the `.so`s are already in place (e.g. IDE sync).

## Build & install the app

```bash
cd app-android/vela-wallet
./gradlew :app:assembleDebug           # SC-001
./gradlew :app:installDebug            # to a connected API 31+ device/emulator
```

Locale catalogs are synced from `public/i18n/*.json` into build assets automatically
(`syncVelaI18nAssets`); regenerate them only via `npm run gen:i18n` when the corpus
changes — never hand-edit.

## Run the tests (SC-002)

```bash
# Host dylib for the JVM engine tests builds automatically (rustHostLib task); or manually:
cargo build --release -p vela-core-uniffi

cd app-android/vela-wallet
./gradlew :app:testDebugUnitTest
```

Covers: token drift vs `docs/design-tokens.json`, engine smoke (en/zh Welcome keys,
`zh-Hant-TW → zh-TW`, unsupported → `en`), locale-resolver ladder table.

## Manual verification

1. **US1**: Launch → Welcome (dark if system dark). Swipe 6 cards, dots track, ends stop. Tap both CTAs → placeholder screens, back works.
2. **US2**: System language 中文(简体) → relaunch → fully Chinese. Unsupported locale → English.
3. **US3**: Toggle system dark mode → palettes swap. Long-press the sailboat mark → settings sheet → pick Light → restart → still light.
4. **Checklist**: run `specs/008-android-onboarding-compose/checklists/requirements.md` commands (rg audits, scope diff).

## Troubleshooting

- **`Error type 3: Activity class {…} does not exist` on install/launch** — this is a
  DEVICE-side condition, not an APK defect (root-caused 2026-08-01: a long-lived
  emulator AVD's corrupted /data filtered *all* side-loaded apps out of activity
  resolution; the pristine template APK failed identically). Fixes: emulator →
  `emulator -avd <name> -wipe-data`; physical device → uninstall any stale install
  of the same applicationId (`adb uninstall app.getvela.wallet`) and reboot;
  Xiaomi/MIUI → in developer options ensure the "MIUI optimization" toggle is ON.
- **cargo-ndk says a target is missing although you installed it** — targets must be
  added to the toolchain pinned by `rust/rust-toolchain.toml` (see prerequisites),
  not your default rustup toolchain.
- **Per-app locale testing without changing device language**:
  `adb shell cmd locale set-app-locales app.getvela.wallet --user 0 --locales zh-CN`.
