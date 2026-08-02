# Tasks: iOS Catalog Build-Time Bundling

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Branch**: `010-ios-catalog-bundling`

**Contracts**: [contracts/build-phase.md](./contracts/build-phase.md) ·
**Decisions**: [research.md](./research.md) ·
**Verification**: [quickstart.md](./quickstart.md)

Tests are not generated as separate tasks: this feature ships no application
code, and its correctness is entirely observable through the existing test suite
plus the quickstart's build assertions. Verification tasks are therefore
explicit, numbered, and carry the SC they discharge.

---

## Phase 1: Setup

- [X] T001 Capture the pre-change baseline: clean-build `app-ios/VelaWallet/VelaWallet.xcodeproj` into a scratch derived-data dir with a concrete simulator destination, record `** BUILD SUCCEEDED **` and the bundled `*.json` count (expect 15) in `specs/010-ios-catalog-bundling/checklists/requirements.md`
- [X] T002 Record the simulator UDID and export it as `SIM_UDID` for every later step (`xcrun simctl list devices available`); note in the checklist that `generic/platform=iOS Simulator` is unusable because the xcframework simulator slice is arm64-only

---

## Phase 2: Foundational — the declaration and the phase (BLOCKING)

**Purpose**: Build the declaration and the phase. No user story can be verified
before this phase completes.

> **Revised during implementation**: this phase was written to prove the
> mechanism *while the committed copies were still in place*. That intermediate
> state does not build — both routes produce the same 15 bundle paths and the
> build system rejects it with `Multiple commands produce` (research D9.1). T007
> is therefore not executable as written, and the deletion (T015/T016) moved
> forward to be part of the mechanism rather than a step after it.

- [X] T003 [P] Create `app-ios/scripts/gen-catalog-filelists.mjs`: reads `public/i18n`, keeps `LOCALE_COUNT = 15` verbatim from the deleted `sync-catalogs.mjs`, writes `catalogs-input.xcfilelist` (`$(SRCROOT)/../../public/i18n/<lng>.json`) and `catalogs-output.xcfilelist` (`$(TARGET_BUILD_DIR)/$(UNLOCALIZED_RESOURCES_FOLDER_PATH)/<lng>.json`), per the gate contract in `contracts/build-phase.md`
- [X] T004 [P] Create `app-ios/scripts/bundle-catalogs.sh`: bash + `cp`, iterates `SCRIPT_INPUT_FILE_LIST_0` / `SCRIPT_OUTPUT_FILE_LIST_0` pairwise, hardcodes no path and no locale count, emits Xcode `error:`-format diagnostics for every failure row in `contracts/build-phase.md`, prints one summary line on success; `chmod +x`
- [X] T005 Generate the two file lists by running `node app-ios/scripts/gen-catalog-filelists.mjs`, and confirm `--check` then reports in-sync
- [X] T006 Add the `PBXShellScriptBuildPhase` to `app-ios/VelaWallet/VelaWallet.xcodeproj/project.pbxproj`: new phase object with the field values fixed in `contracts/build-phase.md` (name, full `buildActionMask`, `runOnlyForDeploymentPostprocessing = 0`, input/output file-list paths, `/bin/bash`, one-line body calling `bundle-catalogs.sh`) plus its entry appended to the `VelaWallet` target's `buildPhases` list — two edits, nothing else
- [X] T007 ~~Build once with the copies still committed…~~ **Not executable — superseded by research D9.1.** The attempt produced `error: Multiple commands produce '…/VelaWallet.app/de.json'`, which is itself the proof that the phase targets the correct destination. The sandbox question it existed to answer was settled one step later, on the first post-deletion build (T009): the phase read `public/i18n` from outside `SRCROOT` with sandboxing on, and no `deny file-read-data` appears in any log
- [X] T008 Verify `project.pbxproj` opens cleanly in Xcode (no project-format repair prompt, phase visible in Build Phases) before proceeding

**Checkpoint**: The catalogs now reach the bundle through the build phase; the
committed copies are redundant but harmless.

---

## Phase 3: User Story 2 — clean checkout builds correctly on the first attempt (Priority: P1)

**Goal**: A single build from a fresh derived-data directory produces an app
containing all 15 catalogs, in every configuration the app ships in.

**Independent test**: Delete derived data, build exactly once, list `*.json` in
the produced `.app`.

- [X] T009 [US2] Delete the scratch derived-data directory and build exactly once; assert `** BUILD SUCCEEDED **` and 15 `*.json` in `VelaWallet.app` — the first-build, no-two-pass proof (FR-003, SC-003)
- [X] T010 [US2] Run `xcodebuild … test` on the same destination; assert `** TEST SUCCEEDED **` with zero edits to any test file, `EngineSmokeTests` included (FR-008, SC-004)
- [X] T011 [US2] Build with `-configuration Release` and assert 15 catalogs in `Release-iphonesimulator/VelaWallet.app` (FR-011)
- [X] T012 [US2] Install the debug app on the simulator and launch it under `SIMCTL_CHILD_VELA_LANG` for `en`, `zh`, `de`; assert localized copy on screen with no `onboarding.…` key echo, and keep a screenshot per locale as evidence (SC-005)
- [ ] T013 [US2] **NOT VERIFIED — needs the Xcode UI.** Open the project and render a `WelcomeScreen` preview; assert translated strings, not key echoes (FR-013). Reasoned to work (previews build the app target, script phases included, into the same products dir) but not observed; see checklists/requirements.md → NOT VERIFIED
- [X] T014 [US2] Confirm the iOS prerequisites gained no new tool: the phase uses only bash and `cp`, and no `node` invocation exists anywhere in `project.pbxproj` (FR-005, SC-008)

**Checkpoint**: The build-time route is proven end to end. (Executed *after* the
Phase 4 deletion, not before — see the Phase 2 note and research D9.1.)

---

## Phase 4: User Story 1 — regenerate translations without a duplicate diff (Priority: P1)

**Goal**: `public/i18n` becomes the corpus's only tracked representation.

**Independent test**: Regenerate the corpus; `git status` shows changes under
`public/i18n/` only.

**Depends on**: nothing, as executed. The intended ordering (Phase 3 first, so a
failure here could only be about the deletion) turned out to be impossible: the
deletion is a *precondition* of any successful build with the phase wired, not a
step after it (research D9.1). T015–T017 therefore ran before T009–T014.

- [X] T015 [US1] `git rm` the 15 files under `app-ios/VelaWallet/VelaWallet/Localization/Catalogs/` and remove the now-empty directory (FR-001)
- [X] T016 [US1] `git rm app-ios/scripts/sync-catalogs.mjs` — its only job was maintaining the deleted copies (research D5)
- [X] T017 [US1] Confirm no `.gitignore` entry is added anywhere for the deleted directory: nothing is generated into the app source tree any more (research D7)
- [X] T018 [US1] Re-run the Phase 3 verification set from a fresh derived-data directory — build, test, three-locale launch — now with the copies gone (FR-002, FR-009, SC-003, SC-004, SC-005)
- [X] T019 [US1] Touch one string in a `public/i18n` catalog, rebuild, read it on screen, then `git status`: expect the new string in the app and modifications under `public/i18n/` only, nothing under `app-ios/` (SC-001, SC-002)

**Checkpoint**: The duplicate is gone and the app still localizes.

---

## Phase 5: User Story 3 — a corpus change cannot silently ship a partial locale set (Priority: P2)

**Goal**: Both drift directions fail loudly, at the gate and at the build.

**Independent test**: Break the corpus on purpose, in each direction, and read
the error.

- [X] T020 [US3] Add a 16th catalog to `public/i18n`; assert `gen-catalog-filelists.mjs --check` exits non-zero naming the extra locale and the constant to update (FR-007)
- [X] T021 [US3] With that 16th catalog still present and the file lists deliberately not regenerated, run a build; assert it fails with an `error:` naming the undeclared locale — never a silently 15-of-16 app (US3 scenario 2). Restore the corpus afterwards
- [X] T022 [US3] Remove one catalog from `public/i18n`; assert both `--check` and the build fail, the build naming the missing declared input path (FR-012). Restore afterwards
- [X] T023 [US3] Point the corpus at a non-existent directory (temporarily rename `public/i18n`); assert the build fails with a message naming the expected corpus location rather than producing a catalog-less app (FR-012). Restore afterwards

---

## Phase 6: User Story 4 — incremental builds stay fast and correct (Priority: P3)

**Goal**: No catalog work when nothing changed; correct catalogs when something did.

**Independent test**: Build twice unchanged, then touch one catalog and build again.

- [X] T024 [US4] Rebuild with no changes; assert the phase is skipped (no summary line in the log) (FR-006, SC-007)
- [X] T025 [US4] Touch exactly one catalog in `public/i18n`, rebuild without a clean, and assert the phase ran and the bundled file carries the new content (FR-006, SC-007)

---

## Phase 7: Polish & records

- [X] T026 [P] Update `specs/009-ios-onboarding-swiftui/research.md` D3 with a superseded-by note pointing at this feature's D1–D3 (FR-010)
- [X] T027 [P] Update `specs/009-ios-onboarding-swiftui/quickstart.md` — replace the `sync-catalogs.mjs --check` gate line with `gen-catalog-filelists.mjs --check` (FR-010)
- [X] T028 [P] Update `specs/009-ios-onboarding-swiftui/data-model.md` — the `Localization/Catalogs/<lng>.json` row becomes the build-product row described in this feature's `data-model.md` (FR-010)
- [X] T029 [P] Update `specs/009-ios-onboarding-swiftui/plan.md`'s file tree so it no longer lists `sync-catalogs.mjs` as a live artifact (FR-010)
- [X] T030 Grep the repository for any remaining reference to `sync-catalogs` or to the deleted `Localization/Catalogs` path (docs, scripts, CI, checklists) and fix each hit
- [X] T031 Rewrite `specs/010-ios-catalog-bundling/checklists/requirements.md` into the 007/009 verification-gate house style, recording the actual observed evidence for every SC and FR — commands run, counts seen, error text quoted

---

## Dependencies

```text
Phase 1 (Setup)
      ↓
Phase 2 (Foundational — declaration + script + pbxproj)   ← BLOCKING
      ↓
Phase 3 (US2, P1 — build correctness, copies still present)
      ↓
Phase 4 (US1, P1 — delete the copies)                     ← the deliverable
      ↓
Phase 5 (US3, P2)  ──┐
Phase 6 (US4, P3)  ──┴→ Phase 7 (records)
```

- **US2 before US1** is deliberate and is the plan's core safety property: prove
  the new route while the old one still works, so a failure in Phase 4 can only
  be about the deletion.
- **US3 and US4 are independent of each other** and can run in either order once
  Phase 4 lands; both only read and restore the corpus.
- Phase 7 depends on nothing but should land last so the records describe what
  was actually observed.

## Parallel opportunities

- T003 and T004 are different files with no shared state — write both at once.
- T026–T029 touch four different spec-009 files — apply in parallel.
- Within Phase 5, T020/T022/T023 each mutate `public/i18n` and **must not** run
  in parallel with each other or with any build.

## Implementation strategy

**MVP** = Phase 1 → Phase 2 → Phase 3 → Phase 4. That sequence delivers the
entire user-visible outcome (single-source corpus, app still localized) and is a
committable, revertible unit on its own.

Phases 5 and 6 harden the result: they are what stop this from being a change
that works today and rots on the first locale change. Phase 7 keeps spec 009
from lying about a route that no longer exists.

**Rollback**: `git checkout` of `project.pbxproj` and the `Localization/Catalogs`
directory restores the previous design completely; nothing outside `app-ios/`
and `specs/` is touched, so no other platform can be affected by a revert.
