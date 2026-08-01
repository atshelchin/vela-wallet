# Implementation Plan: iOS Onboarding in SwiftUI

**Branch**: `009-ios-onboarding-swiftui` | **Date**: 2026-08-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-ios-onboarding-swiftui/spec.md`

## Summary

Turn the `app-ios/VelaWallet` Xcode template into a SwiftUI app rendering the
Onboarding welcome screen from the W1/W1L mobile mocks, on top of the shared
core: a generated Swift token layer sourced from `docs/design-tokens.json`
(drift-gated, mirroring web's `gen-tokens.mjs` pattern, D1), all copy through
`vela-core`'s i18n engine consumed via the uniffi Swift bindings packaged as a
local Swift package + XCFramework (D2), runtime JSON catalogs bundled from the
committed `public/i18n/*.json` artefacts (D3), reusable button/card/pager/logo
components, and a feature module that only composes. Research settled the risky
parts: deployment target drops from the template's 26.2 to 17.0 (D4), Plus
Jakarta Sans ships from the repo's own font packages with CJK falling to the
system face per DV-003 (D5), locale detection ports `shared.ts` semantics (D6),
and `VELA_THEME`/`VELA_LANG`-equivalent launch overrides keep the screenshot
matrix scriptable like 007 (D7).

## Technical Context

**Language/Version**: Swift 5 mode under Xcode 26.3 (template settings:
`SWIFT_APPROACHABLE_CONCURRENCY=YES`, default actor isolation `MainActor`);
deployment target lowered to iOS 17.0 (D4). Rust stable for the binding build
(targets `aarch64-apple-ios`, `aarch64-apple-ios-sim`).

**Primary Dependencies**: `vela-core-uniffi` (existing crate, no API changes)
via a new local Swift package `VelaCoreKit` (D2); no third-party Swift
dependencies. Node (already required repo-wide) for the token generator.

**Storage**: none. No onboarding state persists (spec assumption; 006/007
parity). Runtime I/O = reading bundled catalog JSON.

**Testing**: `xcodebuild test` on an iOS simulator — Swift Testing unit tests
(locale mapping, carousel state, token contrast SC-005) plus a launch smoke in
the UITest target; script gates: token drift + literal audit (SC-003), catalog
sync check (D3); screenshot matrix {light,dark} × {zh,en,de} via launch
overrides (SC-002/SC-004, D7).

**Target Platform**: iPhone only (`TARGETED_DEVICE_FAMILY=1`), iOS 17.0+.
Simulator is the verification vehicle; the device slice builds but unsigned
device deployment is out of scope.

**Project Type**: existing Xcode app project (objectVersion 77,
file-system-synchronized groups — source files land on disk and auto-join the
target; the only pbxproj surgery is settings + the local package dependency,
D9).

**Performance Goals**: none beyond SwiftUI defaults — one static screen with a
paging carousel; standard paging animation only (spec Out-of-scope defers the
rest).

**Constraints**: FR-011/SC-006 scope discipline — outside `app-ios/` and
`specs/009…/`, the only addition is `rust/scripts/build-ios-xcframework.sh`
(packaging for existing bindings); no RN/web/desktop/corpus edits (zero new
i18n keys, FR-006).

**Scale/Scope**: ~15 new Swift source files (~1,200 lines), 1 generated token
file, 4 bundled font files, 15 bundled catalog JSONs, 2 Node scripts, 1 shell
script, pbxproj edits.

## Constitution Check

`.specify/memory/constitution.md` is the unfilled template — no ratified
principles to gate against. Applied the repo's operative conventions instead:
spec-kit document set, generated-files-stay-generated (spec 004/006 pattern:
generator + committed output + `--check` drift gate), scope discipline per the
feature input, one authoritative implementation per capability (FR-009).

## Project Structure

```
app-ios/
├── scripts/
│   ├── gen-tokens.mjs            # docs/design-tokens.json → Tokens.swift (+ --check)   D1
│   └── sync-catalogs.mjs         # public/i18n/*.json → bundled catalogs (+ --check)    D3
├── VelaCoreKit/                  # local Swift package wrapping the uniffi surface      D2
│   ├── Package.swift             # binaryTarget VelaCoreFFI.xcframework + VelaCore target
│   ├── Sources/VelaCore/         # generated vela_core_uniffi.swift (committed)
│   └── Artifacts/                # VelaCoreFFI.xcframework (gitignored, script-built)
└── VelaWallet/
    ├── VelaWallet.xcodeproj      # settings edits + VelaCoreKit package dep             D9
    └── VelaWallet/
        ├── App/                  # VelaWalletApp, AppRoute, RootView (NavigationStack)
        ├── DesignSystem/
        │   ├── Tokens.swift      # GENERATED — only file naming color/size values
        │   ├── Theme.swift       # semantic palette resolution (light/dark), additions
        │   ├── Typography.swift  # type roles from token scales (design-system.md)
        │   └── Fonts/            # PlusJakartaSans 400/500/600/700 .ttf + OFL license   D5
        ├── Components/           # VelaButton, FeatureCard, PagerDots, BrandRow, VelaMark
        ├── Localization/
        │   ├── Loc.swift         # only i18n touchpoint: engine, t(), locale detect     D6
        │   └── Catalogs/         # SYNCED — 15 × <lng>.json from public/i18n
        └── Features/Onboarding/  # WelcomeScreen (composition + intent), placeholders
```

Module boundaries enforce FR-009: `DesignSystem/` is the only layer naming a
visual value (`Tokens.swift` generated; `Theme.swift`/`Typography.swift` the
only hand-written files composing them plus the documented additions block);
`Loc.swift` the only file touching `VelaCore`; `Components/` take theme +
already-resolved strings; `Features/Onboarding` alone maps taps to intents;
`App/` alone owns entry and navigation.

## Phase Log

- **Phase 0 (research)**: complete — [research.md](./research.md) D1–D10.
- **Phase 1 (design)**: complete — [data-model.md](./data-model.md) (token /
  locale / intent / carousel model), [quickstart.md](./quickstart.md)
  (build/run/verify). `contracts/` omitted — no external interface surface
  (007 precedent).
- **Phase 2 (tasks)**: [tasks.md](./tasks.md) via `/speckit-tasks`.
