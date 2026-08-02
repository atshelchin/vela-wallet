# Checklist: Requirements & Quality Gates

Verification gates in the 007/009 house style. The pre-planning spec-quality
checklist (all-pass) lives in this file's git history.

Environment for every run below: `xcodebuild` against
`id=4E24C75F-EA9C-4223-AD98-2D1CCEA2F0F2` (iPhone 16 Pro simulator).
A **concrete** destination is mandatory — `generic/platform=iOS Simulator` also
builds x86_64 and fails at link, because the `VelaCoreFFI.xcframework`
simulator slice is arm64-only. That is pre-existing and unrelated to this
feature; it cost one wasted build before it was understood.

## CHK-BASELINE (T001/T002)

- [x] Pre-change clean build: `** BUILD SUCCEEDED **`, 15 `*.json` in
  `VelaWallet.app` — delivered by the synchronized group from the committed
  copies. This is the behavior the feature had to preserve.

## CHK-MECHANISM (FR-002/FR-003/FR-004 / SC-003)

- [x] **The sandbox permits it.** With `ENABLE_USER_SCRIPT_SANDBOXING = YES`,
  the phase read `public/i18n` from outside `SRCROOT` and listed that directory:
  `[bundle-catalogs] bundled 15 locale catalogs from /Volumes/…/public/i18n`.
  No `deny file-read-data` in any build log. This was the feature's one
  genuinely uncertain premise.
- [x] First build in a fresh derived-data directory → `** BUILD SUCCEEDED **`
  and 15 `*.json` in the app. No two-pass (FR-003).
- [x] `Loc.swift` unmodified; catalogs land at the bundle root, so
  `Bundle.main.url(forResource:withExtension:)` is byte-identical (FR-009).
- [x] `project.pbxproj` passes `plutil -lint`; the diff is exactly two hunks
  (the new phase object, the target's `buildPhases` entry) plus the `inputPaths`
  line added by D9.2.

## CHK-SCOPE (FR-001/FR-014 / SC-001/SC-002)

- [x] `git ls-files -- app-ios | grep -cE '/(de|en|…|zh-TW)\.json$'` → **0**.
- [x] `git status` after the whole exercise shows **zero** modifications under
  `public/i18n/` — the corpus and its generator were never touched (FR-014).
- [x] Changed directories: `app-ios/`, `specs/009…`, `specs/010…`, plus the
  `.specify/feature.json` pointer. Nothing under `android/`, `app-android/`,
  `app-web/`, `app-desktop/`, `rust/`, `src/`.
- [x] No `.gitignore` entry was added: nothing is generated into the app source
  tree any more (research D7).

## CHK-TESTS (FR-008 / SC-004)

- [x] `xcodebuild … test` → `** TEST SUCCEEDED **`, 40 test cases passed,
  0 failures, **zero edits to any test file**. Includes `EngineSmokeTests`
  (verbatim `zh` values, `de` non-echo, missing-key echo) and the
  `VelaWalletUITests.testWelcomeSmoke()` launch smoke.

## CHK-RUNTIME (SC-005) — the anti-stale-bundle check

Hosted tests read `Bundle.main` of the host app, so they could in principle pass
off a stale bundle. Screenshots from a freshly installed build:

- [x] `zh` → 「您的密钥，您的资产」/「不用助记词」/「创建钱包」/「我已有钱包」
- [x] `de` → "Ihre Schlüssel, Ihr Vermögen" / "Keine Seed-Phrase" /
  "Wallet erstellen" / "Ich habe bereits eine Wallet"
- [x] `en` → "Your keys, your assets" / "No seed phrase" / "Create Wallet"
- [x] No `onboarding.…` key echo visible in any of the three.

## CHK-CONFIG (FR-011)

- [x] `-configuration Release` → phase ran once, 15 `*.json` in
  `Release-iphonesimulator/VelaWallet.app`.

## CHK-INCREMENTAL (FR-006 / SC-007)

- [x] No-op rebuild → phase **skipped** (zero `bundled` lines in the log).
- [x] One catalog changed (`de.json` string set to `ZZTEST-DE`) → phase re-ran,
  and `VelaWallet.app/de.json` carried `ZZTEST-DE` without a clean build.

## CHK-DRIFT (FR-007/FR-012 / US3)

All four failure modes fail loudly; the corpus was restored after each.

- [x] 16th locale, gate: `expected exactly 15 locale files … found 16` naming
  `xx.json` and `LOCALE_COUNT`, exit 1.
- [x] 16th locale, build:
  `error: [bundle-catalogs] xx.json exists in the corpus but is not declared…`,
  exit 65.
- [x] **Added-only case (the hole D9.2 closed)**: adding `xx.json` and touching
  nothing else. Before adding the corpus directory to `inputPaths` the phase was
  skipped and the guard never ran; after, the build fails as above while a no-op
  rebuild still skips. Both states verified.
- [x] Removed locale, build:
  `error: [bundle-catalogs] declared catalog is missing: …/public/i18n/de.json`.
- [x] Corpus directory absent, build:
  `error: [bundle-catalogs] locale corpus directory not found: …/public/i18n`.

## CHK-GATES

- [x] `node app-ios/scripts/gen-tokens.mjs --check` → "tokens in sync"
- [x] `node app-ios/scripts/gen-catalog-filelists.mjs --check` →
  "catalog file lists in sync (15)"
- [x] `node app-ios/scripts/audit-literals.mjs` → "clean (11 files scanned)"
- [x] No `node`/`npm`/`npx` anywhere in `project.pbxproj` — the Xcode build
  gained no tool requirement (FR-005, SC-008).

## CHK-RECORDS (FR-010)

- [x] spec 009 `research.md` D3 carries a SUPERSEDED banner pointing here, with
  the original text preserved as the record.
- [x] spec 009 `quickstart.md`, `data-model.md`, `plan.md` updated to the new
  gate and the new artifact set.
- [x] spec 009 `tasks.md` T005 and its checklist are left as-is: they are the
  historical record of what was done then, and the D3 banner tells a reader the
  route has changed.

## NOT VERIFIED

- [ ] **FR-013 / T013 — SwiftUI previews.** Requires the Xcode UI; there is no
  CLI equivalent, and this session had none. The reasoning is that previews
  build the app target (script phases included) into the same products
  directory, so the catalogs are present — but that is an argument, not an
  observation. **Open a preview once in Xcode before merging.** If it regresses,
  the cause is the preview build skipping script phases, and the fallback is
  research D1's rejected alternative list.

## Deviations from the plan, and why

- **T007 is not executable.** The plan sequenced "wire the phase while the
  copies still exist, prove it, then delete". Both routes produce the same 15
  bundle paths, so that state fails with `Multiple commands produce`. The
  routes are mutually exclusive by construction (research D9.1). The collision
  error is itself proof the phase targets the right destination.
- **`inputPaths` was added after the fact** (research D9.2). The original
  declaration could not detect an *added* locale, because dependency analysis
  only re-runs on declared-input changes. The first test appeared to pass only
  because an unrelated catalog had been restored in the same window — worth
  recording as a near-miss in a gate whose entire job is catching drift.
