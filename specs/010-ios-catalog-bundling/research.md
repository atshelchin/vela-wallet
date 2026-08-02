# Research: iOS Catalog Build-Time Bundling (Phase 0)

Decisions are numbered `D<n>` in the 007/008/009 house style. Each records what
was chosen, why, and what was rejected. Facts marked **verified** were checked
against the real project in a Phase 0 spike, not reasoned about.

## Baseline facts established before deciding

- The iOS project is `objectVersion = 77` with three
  `PBXFileSystemSynchronizedRootGroup`s and **zero** `PBXShellScriptBuildPhase`s
  — this feature adds the first script phase to the project.
- `ENABLE_USER_SCRIPT_SANDBOXING = YES` in both project-level configurations
  (`project.pbxproj` Debug and Release).
- `app-ios/VelaCoreKit/Artifacts/` is **gitignored** and rebuilt by
  `rust/scripts/build-ios-xcframework.sh`; only `Package.swift` and the
  generated `vela_core_uniffi.swift` are tracked. iOS therefore already has a
  documented "run a script before you build" step.
- The 15 committed copies under `Localization/Catalogs/` are byte-identical to
  `public/i18n/*.json` (~1.0 MB total) and are read only by `Loc.swift`
  (`Bundle.main.url(forResource:withExtension:)`, bundle root, no subdirectory).
- `VelaWalletTests` sets `TEST_HOST` — the unit tests are **hosted**, so their
  `Bundle.main` is `VelaWallet.app`. Catalogs delivered to the app bundle serve
  the tests with no extra work.
- The simulator slice of `VelaCoreFFI.xcframework` is **arm64-only**, so
  `-destination 'generic/platform=iOS Simulator'` fails at link (it also builds
  x86_64). All verification uses a concrete simulator destination.

## D1 — Route: copy into the app bundle from a build phase

**Decision**: Add one `PBXShellScriptBuildPhase` to the `VelaWallet` target that
copies the corpus catalogs into the produced app bundle at build time. Delete
the 15 committed copies outright — no gitignored staging directory inside the
app source tree.

**Rationale**: This is the exact analogue of Android's `syncVelaI18nAssets`
Gradle `Sync` task, which is the design the founder asked iOS to match. It keeps
spec 009 D9 intact (the file-system-synchronized group model is untouched — the
copies simply stop existing on disk, so the group has nothing to pick up), keeps
`Loc.swift` byte-identical (D2 puts the files where it already looks), and makes
the duplicate physically impossible rather than merely gate-checked.

**Alternatives rejected**:

- *Keep the copy script, just gitignore its output* (the "minimal" variant). It
  removes the git duplication but leaves the two-pass hazard of D2 below and
  leaves a directory of untracked files inside the app source tree that a
  contributor can hand-edit and never notice. Worse: forgetting the script
  yields a silent key-echo app, where forgetting the xcframework yields a loud
  link error.
- *Folder reference / external synchronized group to `../../public/i18n`*
  (spec 009 D3's rejected alternative). Genuinely zero-copy, but it changes the
  bundle layout to an `i18n/` subdirectory, which forces a `subdirectory:`
  argument into `Loc.swift` — the request explicitly pins that call site — and
  it requires hand-editing `project.pbxproj` with a path that reaches outside
  `SRCROOT`, which Xcode's UI is prone to rewrite.
- *Compile the catalogs into the XCFramework (`i18n-all`, the desktop route)*.
  Conceptually the cleanest — the app would ship no JSON at all — and spec 009
  D2's "committing the XCFramework" objection turns out not to apply, since
  `Artifacts/` is gitignored. It still loses on two counts: `vela-core-uniffi`
  is **shared with Android**, which reads catalogs from assets and would pay for
  an unused embedded blob, and a per-platform cargo feature split would fork the
  single committed Kotlin binding copy that spec 008 D1 deliberately maintains.
  It also forfeits the lazy-locale-loading future spec 009 D2 reserved. Parked,
  not dead: if iOS ever wants offline-first catalogs without a bundle, this is
  the route.

## D2 — Destination: the built product, not the source tree

**Decision**: The phase writes to
`${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}` — i.e. straight into
`VelaWallet.app/` — bypassing the Copy Bundle Resources phase entirely.

**Rationale**: This is the whole reason the feature is safe on a clean checkout
(FR-003). A file-system-synchronized group enumerates the app folder when the
build is **planned**; a script that writes new files into that folder during the
build is too late for the current build's resource plan, so the first build
after a clean checkout would produce a catalog-less app and only the *second*
build would be correct. Writing into the product side-steps planning altogether:
the files are in the bundle the moment the phase runs, on every build, first
included.

`TARGET_BUILD_DIR` rather than `BUILT_PRODUCTS_DIR` because the two diverge for
`install`/archive builds — `TARGET_BUILD_DIR` is the one that points at the
bundle being assembled for the product (FR-011). This is the same variable
CocoaPods' resource script uses, for the same reason.

**Alternatives rejected**: writing into `Localization/Catalogs/` and letting the
synced group bundle them (the two-pass trap above); writing into
`$DERIVED_FILE_DIR` (that directory feeds compilation inputs, not bundle
resources, so something would still have to copy them onward).

## D3 — Declaration: two `.xcfilelist`s, consumed by the script itself

**Decision**: The phase declares
`app-ios/scripts/catalogs-input.xcfilelist` (15 corpus paths, written as
`$(SRCROOT)/../../public/i18n/<lng>.json`) and
`app-ios/scripts/catalogs-output.xcfilelist` (15 bundle paths). The script does
**not** hardcode either path: Xcode resolves each list into DerivedData with all
build settings expanded and hands the script the resolved paths as
`SCRIPT_INPUT_FILE_LIST_0` / `SCRIPT_OUTPUT_FILE_LIST_0`. The script reads those
two files and copies line *i* of the input list to line *i* of the output list.

**Rationale**: Three requirements collapse into this one choice.

1. **Sandbox (FR-004)**: with `ENABLE_USER_SCRIPT_SANDBOXING = YES` the phase
   runs under a sandbox profile built from its declared inputs and outputs.
   Reading the corpus — which lives outside `SRCROOT` — is permitted *because*
   it is declared, and for no other reason. Declaring the corpus as a directory
   instead would be accepted but is a known-weak dependency node (directory
   inputs are not watched recursively), so the 15 files are enumerated.
2. **Incrementality (FR-006)**: declared inputs and outputs give the build
   system a real dependency node. Unchanged corpus → the phase is skipped
   entirely; one changed catalog → the phase re-runs and the next build carries
   the change with no clean.
3. **Single source for "what is a locale"**: because the script iterates the
   resolved declaration rather than globbing the corpus, the declaration is the
   authority, and a corpus that has drifted from it is detectable (D5) instead
   of silently copied.

**Alternatives rejected**: inline `inputPaths`/`outputPaths` arrays in
`project.pbxproj` (30 entries of churn in the file spec 009 D9 wanted kept
clean); a single directory input (weak dependency tracking, and it would let a
16th locale slip in unannounced); no declarations at all with
`alwaysOutOfDate = 1` (breaks the sandbox, breaks incrementality, and re-copies
1 MB on every build).

## D4 — Implementation language: `bash` + `cp`, no Node

**Decision**: `app-ios/scripts/bundle-catalogs.sh`, POSIX-ish bash with
`set -euo pipefail`, copying with `cp`.

**Rationale**: FR-005 forbids putting Node into the Xcode build. Xcode Cloud, a
fresh CI runner, and a designer's machine all have bash and `cp`; requiring
`node` in a build phase is the single most common cause of "builds on my machine
only". `rsync` was in the original request but buys nothing here: the file set is
fixed and pair-wise, and `cp` per declared pair is both simpler and exactly what
the declaration describes. Node stays where it already is — in the repo-root
verification gates (D5), which are not part of the Xcode build.

**Alternatives rejected**: `rsync -a --include='*.json'` over the directory
(re-introduces globbing, defeating D3's "declaration is the authority");
reusing `sync-catalogs.mjs` from the phase (Node dependency, FR-005).

## D5 — The pin and its gate move to the declaration

**Decision**: `app-ios/scripts/sync-catalogs.mjs` is deleted and replaced by
`app-ios/scripts/gen-catalog-filelists.mjs`, which owns the same
`LOCALE_COUNT = 15` pin, generates both `.xcfilelist`s from the corpus, and in
`--check` mode fails when they would change. `--check` additionally fails if any
locale catalog is tracked in git outside `public/i18n/` (FR-001, SC-002).

The build script carries the second half of the gate at build time: it fails if
the two resolved lists differ in length, if a declared input is missing or
empty, or if the corpus directory holds a `.json` the declaration does not
mention (FR-007, FR-012, US3).

**Rationale**: Deleting the copies deletes the only thing the old `--check`
guarded, so the gate has to move rather than disappear — that was the committed
copy's one virtue. Keeping the pin in exactly one file (the generator) preserves
today's property that adding a 16th locale is a conscious, single-place edit.
Splitting the gate across generate-time and build-time is deliberate: the
repo-root gate catches drift before commit, the build-time gate catches a
contributor who edits the corpus and builds without running gates.

**Alternatives rejected**: dropping the pin (a silently missing language is
exactly the failure the pin exists to prevent); pinning in both the generator and
the shell script (two pins drift); a git pre-commit hook (not how this repo
gates — everything is a runnable script listed in the quickstart).

## D6 — Phase placement and configuration coverage

**Decision**: The phase is the last entry in the `VelaWallet` target's
`buildPhases` (after Sources, Frameworks, Resources), with
`buildActionMask = 2147483647` and `runOnlyForDeploymentPostprocessing = 0`.

**Rationale**: Code signing is not a phase — it runs after all of a target's
phases — so any position before the end of the target is signable, and last is
the position where the bundle directory is guaranteed to exist. The full
`buildActionMask` plus `runOnlyForDeploymentPostprocessing = 0` is what makes it
run for build, test, and archive alike, in Debug and Release (FR-011). Nothing is
added to the test or UI-test targets: they are hosted (baseline fact above).

## D7 — No `.gitignore` entry is needed

**Decision**: `Localization/Catalogs/` is deleted from the working tree and from
git, and nothing replaces it on disk.

**Rationale**: Because D2 writes into the product rather than the source tree,
no generated file ever lands under `app-ios/VelaWallet/VelaWallet/` — so there is
nothing to ignore. This is strictly better than the gitignored-staging-directory
variant: an ignored directory of real files inside the synced group is an
invitation to hand-edit something the corpus pipeline cannot see.

## D8 — Verification vehicle

**Decision**: `xcodebuild ... -destination 'platform=iOS Simulator,name=iPhone
16 Pro'` for build and `test`; bundle contents asserted by listing
`*.json` in the produced `.app`; runtime proof by launching the simulator app
under `SIMCTL_CHILD_VELA_LANG` for `en` / `zh` / `de` (the launch-override recipe
spec 009 D7 established).

**Rationale**: SC-005 exists because hosted tests can pass off a stale bundle;
only an on-screen string proves the delivered app is correct. A concrete
simulator destination is mandatory (baseline fact: arm64-only simulator slice).
The three locales are the ones spec 009's engine smoke tests already pin, so a
failure is attributable.

**Alternatives rejected**: `generic/platform=iOS Simulator` (link failure,
unrelated to this feature); trusting `xcodebuild test` alone (the stale-bundle
blind spot SC-005 was written for).

## D9 — Two findings from implementation that changed the design

Recorded here because both contradict something this document asserted before
the code existed.

### D9.1 — The two routes cannot coexist, so the planned "prove it first" step is impossible

`plan.md` sequenced the work as: wire the phase **while the copies are still
committed**, prove the mechanism, then delete. That step cannot run. With the
copies on disk, the synchronized group's Copy Bundle Resources and the new
script phase both produce the same 15 paths, and the build system refuses:

```text
error: Multiple commands produce '…/VelaWallet.app/de.json'
    note: That command depends on command in Target 'VelaWallet': script phase "Bundle locale catalogs"
```

**Consequence**: the deletion is not the last step of the mechanism, it is part
of it — the old and new routes are mutually exclusive by construction. The
safety property the sequencing was buying still holds, just differently: the
error above is itself proof the phase is wired to the right destination, and
`git checkout` of `project.pbxproj` plus the deleted directory restores the old
design in one command.

**Verified**: the collision error, then a clean build after deletion producing
`[bundle-catalogs] bundled 15 locale catalogs from …/public/i18n` and
`** BUILD SUCCEEDED **` with 15 `.json` in the app.

### D9.2 — The file list alone does not notice an *added* locale; the corpus directory must also be a declared input

D3 argued a directory input was a weak dependency node and enumerated the 15
files instead. That is right for change detection and wrong for **addition**
detection: dependency analysis only re-runs the phase when a *declared* input
changes, so dropping a 16th catalog into the corpus and touching nothing else
left the phase skipped — and the build-time extra-locale guard never ran. The
first test that appeared to prove the guard only passed because an unrelated
catalog had been restored in the same window.

**Decision**: declare `$(SRCROOT)/../../public/i18n` in `inputPaths` **in
addition to** the 15-file input list. The list keeps precise per-file change
tracking; the directory contributes the "something appeared or vanished here"
signal that a file list structurally cannot carry.

**Verified**: with the directory declared, a no-op rebuild still skips the phase
(zero catalog work, SC-007 intact), while adding `xx.json` and touching nothing
else now fails the build with
`error: [bundle-catalogs] xx.json exists in the corpus but is not declared…`.

**Also verified in the same spike** — the question this feature's design most
depended on: with `ENABLE_USER_SCRIPT_SANDBOXING = YES`, a script phase **may**
read declared inputs outside `SRCROOT`, and **may** list the directory
containing them. No `deny file-read-data` appears in any build log.
