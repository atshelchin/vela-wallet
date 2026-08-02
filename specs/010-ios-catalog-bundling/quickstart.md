# Quickstart: iOS Catalog Build-Time Bundling

Verify the feature from a clean checkout. All commands from the repo root.
Every step maps to a spec requirement or success criterion.

## Prerequisites

Unchanged from spec 009 — this feature adds **no** new tool requirement
(SC-008):

- macOS with Xcode 26.3+ and an iOS simulator runtime.
- Rust with the iOS targets on the repo-pinned toolchain, then
  `rust/scripts/build-ios-xcframework.sh` (produces the gitignored
  `app-ios/VelaCoreKit/Artifacts/VelaCoreFFI.xcframework`).
- Node ≥ 20 for the repo-root gates — **not** needed by the Xcode build itself.

> Use a **concrete** simulator destination. `generic/platform=iOS Simulator`
> also builds x86_64 and fails at link, because the xcframework's simulator
> slice is arm64-only. Get a UDID with `xcrun simctl list devices available`.

## Generated-layer gates

```sh
node app-ios/scripts/gen-tokens.mjs --check            # token drift
node app-ios/scripts/gen-catalog-filelists.mjs --check # catalog declaration drift (replaces sync-catalogs)
node app-ios/scripts/audit-literals.mjs                # no visual literals outside DesignSystem/
```

Expected: `catalog file lists in sync (15)`.
Run without `--check` to regenerate after the i18n corpus legitimately changes.

## SC-002 — no catalog is tracked outside the corpus

```sh
git ls-files 'app-ios/**/*.json' | wc -l
```

Expected: `0`. Scoped to `app-ios/` deliberately — the upstream corpus at
`rust/crates/vela-core/i18n/locales/` legitimately contains per-namespace files
with the same basenames, so a repo-wide filename match would be wrong.
(`gen-catalog-filelists.mjs --check` asserts the same thing; this is the manual
cross-check of the gate itself.)

## SC-003 — one build from clean produces all 15 catalogs

```sh
DD=$(mktemp -d)/dd
xcodebuild -project app-ios/VelaWallet/VelaWallet.xcodeproj \
  -scheme VelaWallet -destination "id=$SIM_UDID" \
  -derivedDataPath "$DD" build
ls "$DD"/Build/Products/Debug-iphonesimulator/VelaWallet.app/*.json | wc -l
```

Expected: `** BUILD SUCCEEDED **` and `15`. Note this is the **first** build in
a fresh derived-data directory — no second pass (FR-003).

Confirm the phase actually ran and the sandbox allowed the read:

```sh
xcodebuild … build 2>&1 | grep -i "Bundle locale catalogs" -A3
```

Expected: the phase's summary line, and no `Sandbox: … deny file-read-data`.

## SC-007 — incrementality

```sh
xcodebuild … -derivedDataPath "$DD" build   # 2nd run, nothing changed
```

Expected: the catalog phase is skipped (no summary line).

```sh
touch public/i18n/de.json
xcodebuild … -derivedDataPath "$DD" build   # 3rd run, one catalog touched
```

Expected: the phase runs again, no clean needed.

## SC-004 — hosted unit tests, unmodified

```sh
xcodebuild -project app-ios/VelaWallet/VelaWallet.xcodeproj \
  -scheme VelaWallet -destination "id=$SIM_UDID" test
```

Expected: `** TEST SUCCEEDED **`, including `EngineSmokeTests` — which asserts
verbatim `zh` values, `de` non-echo, and the missing-key echo. These pass only
if the catalogs really reached the host app bundle.

## SC-005 — real strings on screen (the anti-stale-bundle check)

Tests are hosted, so a stale bundle could in principle pass them. Launch the app
and read the screen:

```sh
xcrun simctl boot "$SIM_UDID" 2>/dev/null || true
xcrun simctl install "$SIM_UDID" "$DD"/Build/Products/Debug-iphonesimulator/VelaWallet.app
SIMCTL_CHILD_VELA_LANG=zh xcrun simctl launch --console "$SIM_UDID" app.getvela.VelaWallet
```

Repeat for `en` and `de`. Expected: localized copy, no `onboarding.…` key echo.
Screenshot with `xcrun simctl io "$SIM_UDID" screenshot out.png` for the record.

## US3 — a broken corpus fails loudly

Both directions must fail. Restore the corpus afterwards.

```sh
cp public/i18n/en.json public/i18n/xx.json          # 16th locale
node app-ios/scripts/gen-catalog-filelists.mjs --check   # expect: exit 1, names xx
xcodebuild … build                                   # expect: build error naming xx
rm public/i18n/xx.json

mv public/i18n/de.json /tmp/de.json                  # 14 locales
node app-ios/scripts/gen-catalog-filelists.mjs --check   # expect: exit 1, LOCALE_COUNT message
xcodebuild … build                                   # expect: build error naming the missing input
mv /tmp/de.json public/i18n/de.json
```

Expected in every case: non-zero exit with a message naming the offending
locale and the file to fix — never a produced app with 14 or 16 catalogs.

## FR-011 — release configuration

```sh
xcodebuild -project app-ios/VelaWallet/VelaWallet.xcodeproj \
  -scheme VelaWallet -configuration Release -destination "id=$SIM_UDID" \
  -derivedDataPath "$DD" build
ls "$DD"/Build/Products/Release-iphonesimulator/VelaWallet.app/*.json | wc -l
```

Expected: `15`.

## FR-013 — previews

Open `app-ios/VelaWallet/VelaWallet.xcodeproj` in Xcode and render any
`WelcomeScreen` preview. Expected: translated copy, not `onboarding.…` keys.
This is the one step with no CLI equivalent; if it regresses, the cause is the
preview build not running the phase, and the fallback is documented in
`research.md` D2.

## SC-001 — the point of the whole feature

```sh
node scripts/gen-i18n.mjs   # or edit one string in public/i18n directly
git status --short
```

Expected: changes under `public/i18n/` only. Nothing under `app-ios/`.
