# Implementation Plan: iOS Catalog Build-Time Bundling

**Branch**: `010-ios-catalog-bundling` | **Date**: 2026-08-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-ios-catalog-bundling/spec.md`

## Summary

Delete the 15 committed locale-catalog copies under
`app-ios/VelaWallet/VelaWallet/Localization/Catalogs/` and deliver the same 15
catalogs into `VelaWallet.app` from a build phase instead, so `public/i18n`
becomes the corpus's only representation in the repository — the arrangement
Android has had since spec 008.

The mechanism research settled: one `PBXShellScriptBuildPhase` on the app target
(the project's first) copying into `${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}`
rather than into the source tree, which is what makes a clean checkout correct on
its **first** build instead of its second (D2); two `.xcfilelist`s declaring the
15 reads and 15 writes, which is simultaneously what makes the sandbox permit
reading outside `SRCROOT`, what makes the phase incremental, and what makes the
locale set auditable (D3); a bash + `cp` script that iterates Xcode's *resolved*
copy of those lists so no path is hardcoded and no Node enters the Xcode build
(D3/D4); and the retired `sync-catalogs.mjs --check` replaced by
`gen-catalog-filelists.mjs --check`, which inherits the `LOCALE_COUNT = 15` pin
and additionally asserts that no catalog is tracked outside the corpus (D5).

Nothing about the app changes at runtime: `Loc.swift` is untouched, the catalogs
land at the bundle root where it already looks, and the hosted test target reads
them from its host app exactly as before.

## Technical Context

**Language/Version**: bash (build phase) and Node ≥ 20 (repo-root gate only,
never in the Xcode build — FR-005). No Swift source changes. Xcode 26.3,
Swift 5 mode, iOS 17.0 deployment target — all inherited from spec 009,
unchanged here.

**Primary Dependencies**: none added. The phase uses `cp` and shell builtins.
The gate uses `node:fs` only, matching the other `app-ios/scripts/*.mjs` gates.

**Storage**: N/A. The only I/O is copying 15 JSON files (~1.0 MB) from
`public/i18n` into the product bundle.

**Testing**: `xcodebuild build` and `xcodebuild test` on a **concrete** simulator
destination (`id=…`, iPhone 16 Pro) — `generic/platform=iOS Simulator` fails at
link because the `VelaCoreFFI.xcframework` simulator slice is arm64-only, a
pre-existing property unrelated to this feature. Bundle contents are asserted by
listing `*.json` inside the produced `.app`. Runtime proof for `en`/`zh`/`de`
via the `SIMCTL_CHILD_VELA_LANG` launch-override recipe from spec 009 D7.
Gates: `gen-catalog-filelists.mjs --check` joins the existing generated-layer
gate set.

**Target Platform**: iPhone, iOS 17.0+ — build-system change only; the shipped
app is byte-equivalent apart from where its catalogs came from.

**Project Type**: existing Xcode app project, `objectVersion = 77`,
file-system-synchronized groups. This feature adds the project's first
`PBXShellScriptBuildPhase` and touches `project.pbxproj` in exactly two places
(the new phase object, and the app target's `buildPhases` list).

**Performance Goals**: a no-change rebuild must do zero catalog work (FR-006);
a cold build's added cost is one `cp` per locale (~1.0 MB total), i.e. below
measurement noise.

**Constraints**: script sandboxing stays `YES` (FR-004); no Node in the Xcode
build (FR-005); `Loc.swift`'s lookup call site is byte-identical, so catalogs
must land at the bundle **root**, not in a subdirectory; the corpus and its
generator are out of scope (FR-014); Android, web, desktop and the Rust core are
untouched.

**Scale/Scope**: 15 locale files; 1 new build phase; 4 files added
(`bundle-catalogs.sh`, 2 `.xcfilelist`s, `gen-catalog-filelists.mjs`), 16 files
deleted (15 catalogs + `sync-catalogs.mjs`), 1 file edited (`project.pbxproj`),
plus spec 009 record updates.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled Spec Kit template
(`[PRINCIPLE_1_NAME]`, `[GOVERNANCE_RULES]` …), so there are no ratified
principles to gate against. In its place this plan holds itself to the standing
conventions the 007/008/009 features established and that the spec encodes as
constraints:

| Standing convention | How this plan complies |
| --- | --- |
| One authoritative implementation per capability | The whole point: the corpus becomes the single representation of the catalogs (FR-001). |
| Generated layers are drift-gated, never hand-maintained | The retired gate is replaced, not dropped (D5); the pin survives in exactly one file. |
| Spec 009 D9 — no per-file `project.pbxproj` churn | Two edits total; the 15 files leave the project by leaving the disk, not by a project edit. |
| Failure must be visible | Build fails loudly on missing/short/extra corpus (D5); the runtime failure mode (key echo) is never reached silently. |
| Cross-platform symmetry | Adopts Android's build-time-copy shape rather than inventing a third pattern. |

**Result**: PASS (pre-research and post-design — the design added no new
dependency, no new tool requirement, and no new hand-maintained artifact).

## Project Structure

### Documentation (this feature)

```text
specs/010-ios-catalog-bundling/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 — D1…D8
├── data-model.md        # Phase 1 — artifacts, ownership, gates
├── quickstart.md        # Phase 1 — runnable verification
├── contracts/
│   └── build-phase.md   # Phase 1 — the build-phase contract
└── checklists/
    └── requirements.md  # Spec quality gate (from /speckit-specify)
```

### Source Code (repository root)

```text
public/i18n/                              # corpus — SOURCE OF TRUTH, untouched
└── <lng>.json × 15

app-ios/
├── scripts/                              # outside the synced app tree (009 D9)
│   ├── bundle-catalogs.sh                # NEW — the build phase's script      D4
│   ├── catalogs-input.xcfilelist         # NEW — 15 declared reads             D3
│   ├── catalogs-output.xcfilelist        # NEW — 15 declared writes            D3
│   ├── gen-catalog-filelists.mjs         # NEW — generator + --check gate      D5
│   ├── sync-catalogs.mjs                 # DELETED — its job no longer exists  D5
│   ├── gen-tokens.mjs                    # unchanged
│   └── audit-literals.mjs                # unchanged
└── VelaWallet/
    ├── VelaWallet.xcodeproj/project.pbxproj   # EDITED — +1 phase, +1 list ref D6
    └── VelaWallet/
        └── Localization/
            ├── Loc.swift                 # UNCHANGED (FR-009)
            └── Catalogs/<lng>.json × 15   # DELETED                       D1/D7

app-android/vela-wallet/app/build.gradle.kts   # untouched — the model being copied
```

**Structure Decision**: Everything this feature adds lives in `app-ios/scripts/`,
which spec 009 D9 established as the home for anything that must **not** enter
the app bundle (the synchronized group would otherwise ship it). The app source
tree only loses files. `project.pbxproj` is edited by hand in two well-scoped
places rather than through Xcode's UI, so the diff is reviewable and the
synchronized-group model stays intact.

## Phase Sequencing

1. **Declaration first** — generate the two `.xcfilelist`s and the gate script,
   and confirm the gate fails on a deliberately broken corpus. These are
   verifiable without touching Xcode.
2. **Build phase and deletion together** — add `bundle-catalogs.sh`, wire the
   `PBXShellScriptBuildPhase`, and delete the 15 copies plus `sync-catalogs.mjs`
   in the same step, then build clean.
3. **Verify** — first-build-from-clean, tests, Release, incrementality, all
   three drift directions, and the three-locale simulator launch.
4. **Records last** — update spec 009's quickstart / data-model / research D3 to
   point at the new route (FR-010).

> **Revised during implementation.** This originally read "wire the phase while
> the copies are still committed, prove it, *then* delete", so that the one
> genuinely uncertain step — whether a sandboxed script phase may read declared
> inputs outside `SRCROOT` — would be proven with the old mechanism still in
> place. That intermediate state does not build: both routes produce the same 15
> bundle paths and the build system rejects it with `Multiple commands produce`.
> The routes are mutually exclusive by construction (research D9.1). The safety
> property survives in a different form — the collision error is itself proof the
> phase targets the right destination, and one `git checkout` restores the old
> design — and the sandbox question was answered on the first post-deletion
> build, which succeeded.

## Complexity Tracking

No constitution violations to justify. One deliberate complexity is worth
recording, since a reviewer will ask why the script does not simply
`cp public/i18n/*.json "$dest"`:

| Choice | Why the simpler form was rejected |
| --- | --- |
| Script iterates Xcode's **resolved** input/output file lists instead of globbing the corpus | A glob would copy whatever it finds, so a 16th locale would ship undeclared and untracked — the exact silent-partial-set failure US3 exists to prevent — and the copy would no longer match the sandbox's declared read set. Iterating the declaration makes the declaration authoritative and self-auditing (D3/D5). |
