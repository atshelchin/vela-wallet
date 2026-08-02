# Feature Specification: iOS Catalog Build-Time Bundling

**Feature Branch**: `010-ios-catalog-bundling`

**Created**: 2026-08-02

**Status**: Draft

**Input**: User description: "iOS 语言目录零副本构建（Catalog build-time
bundling）：删除 `app-ios/VelaWallet/VelaWallet/Localization/Catalogs/` 下 15 个已
提交的 JSON 副本，改由 Xcode Run Script build phase 在构建期把 `public/i18n/*.json`
直接放进 `VelaWallet.app` —— 与 Android 的 Gradle Sync 任务对称。约束：
`ENABLE_USER_SCRIPT_SANDBOXING=YES` 必须保持开启，因此 script phase 必须用
`.xcfilelist` 声明 15 个 input（`$SRCROOT` 之外的 `public/i18n`）与 15 个 output；不
得给 Xcode 构建引入 node 依赖（用 bash/rsync）；`Loc.swift` 的
`Bundle.main.url(forResource:withExtension:)` 调用不变（文件仍落在 bundle 根）；单
测（hosted，`Bundle.main` = 宿主 app）必须继续通过；`public/i18n` 仍是唯一真源，15
locale 的 pin 不能丢；干净 checkout 首次构建必须一次成功（不能出现"第二次构建才有
资源"）；`sync-catalogs.mjs` 的 `--check` 漂移闸随副本消失而废止，需替换为
`.xcfilelist` 的漂移闸并更新 spec 009 的 quickstart/data-model/research D3 记录。"

## Why

Four platforms consume the same generated locale corpus, and three of them never
duplicate it into their own tree:

| Platform | How catalogs reach the product | Duplicate committed? |
| --- | --- | --- |
| web | fetched per locale at runtime (wasm size gate forbids embedding) | no |
| desktop | compiled into the binary via the `i18n-all` cargo feature | no |
| Android | Gradle `Sync` task copies `public/i18n/*.json` into build assets | no — build output, gitignored |
| iOS | 15 byte-identical JSON files committed under the app source tree | **yes — ~1 MB, 15 files** |

The iOS asymmetry is not a platform limitation. It is a consequence of spec 009
D9: the Xcode project uses a file-system-synchronized root group, which buys
zero per-file project churn at the price of "anything to be bundled must
physically live inside the app folder". Spec 009 D3 therefore chose the cheapest
route available at the time — commit the copies, guard them with a byte-compare
drift gate.

That choice has a running cost the other platforms do not pay:

- Every corpus regeneration produces a second, redundant ~1 MB diff across 15
  files, so translation review noise doubles and the real change is buried.
- The copies are only kept honest by a gate a contributor must remember to run;
  a hand-edit of the iOS copy is invisible to the corpus pipeline until someone
  runs `--check`.
- The repository now states the same 15 translations twice, and "which one is
  true" is answered by convention rather than by construction.

This feature removes the duplicate by making the iOS catalogs a build product,
the way Android already does. The corpus stays the single source; the app bundle
still ships all 15 locales offline; nothing about how the app looks or behaves
changes.

## User Scenarios & Testing

### User Story 1 - Regenerate translations without a duplicate diff (Priority: P1)

A contributor fixes a translation, regenerates the corpus, and commits. The diff
contains the corpus change only — no second copy under the iOS app. They build
and run the iOS app and see the corrected string.

**Why this priority**: This is the entire point of the feature; the duplicate
diff and the "two truths" problem disappear the moment this story lands.

**Independent Test**: Edit one string in the i18n corpus, regenerate, run
`git status` — only the corpus directory is modified. Build the iOS app with the
device language set to that locale and read the string on screen.

**Acceptance Scenarios**:

1. **Given** a clean working tree, **when** the corpus is regenerated after a
   translation edit, **then** `git status` reports changes only under
   `public/i18n/` and no changes anywhere under `app-ios/`.
2. **Given** that regenerated corpus, **when** the iOS app is built and launched
   with a supported non-English device language, **then** the screen shows the
   edited translation, not a key echo and not English.
3. **Given** the repository at any commit on this branch, **when** the tree is
   searched for locale catalog files, **then** the only ones tracked in version
   control are the 15 under `public/i18n/`.

---

### User Story 2 - Clean checkout builds correctly on the first attempt (Priority: P1)

A new contributor (or CI) clones the repository, follows the documented iOS
prerequisites, and builds once. The resulting app contains all 15 catalogs and
localizes correctly — no second build, no manual copy step.

**Why this priority**: A build product that only appears on the *second* build
is worse than the committed copy it replaced; this story is what makes the
change safe to adopt.

**Independent Test**: From a fresh clone with no prior build output, run the
documented build command exactly once and inspect the produced app for all 15
catalog files.

**Acceptance Scenarios**:

1. **Given** a fresh checkout with no derived build data, **when** the app is
   built once, **then** the produced app contains all 15 locale catalogs.
2. **Given** that same single build, **when** the hosted unit tests run, **then**
   every existing localization test passes without modification.
3. **Given** a build in the release/archive configuration, **when** the produced
   app is inspected, **then** it contains the same 15 catalogs as the debug
   build.
4. **Given** the app is opened in the IDE, **when** a component preview is
   rendered, **then** it displays real translated strings rather than key
   echoes.

---

### User Story 3 - A corpus change cannot silently ship a partial locale set (Priority: P2)

Someone adds a 16th locale to the corpus, or removes one. The build or the
documented verification run fails loudly and names the mismatch, instead of
quietly shipping an app that is missing a language.

**Why this priority**: The committed-copy design had exactly one virtue — the
`--check` gate made drift visible. Removing the copies must not remove that
protection; it must relocate it.

**Independent Test**: Add a placeholder 16th catalog to the corpus, run the
documented verification, and confirm it fails with a message naming the new
locale and the file that must be updated.

**Acceptance Scenarios**:

1. **Given** a corpus containing a number of catalogs other than 15, **when** the
   documented verification runs, **then** it fails and names both the mismatch
   and the file to update.
2. **Given** a corpus whose locale set changed but whose build declaration was
   not updated, **when** the app is built, **then** the build fails or the
   verification gate fails — the app is never produced with a stale locale set
   presented as complete.
3. **Given** the corpus directory is missing or empty at build time, **when** the
   app is built, **then** the build fails with an actionable message rather than
   producing an app with no catalogs.

---

### User Story 4 - Incremental builds stay fast and correct (Priority: P3)

A developer editing Swift code all day does not pay a catalog cost on every
build, but the one time they change a translation, the very next build picks it
up without a clean.

**Why this priority**: Correctness is covered by P1/P2; this story protects the
day-to-day build loop from a naive "copy everything, every time" implementation.

**Independent Test**: Build twice with no changes, then change one catalog and
build again; observe the catalog step being skipped in the first case and
running in the second.

**Acceptance Scenarios**:

1. **Given** a completed build, **when** the app is rebuilt with no source or
   catalog change, **then** the catalog step performs no work.
2. **Given** a completed build, **when** exactly one catalog in the corpus is
   modified, **then** the next build without a clean produces an app carrying
   the modified content.

### Edge Cases

- **Stale build output from before this change**: derived data produced by the
  old design may still contain catalogs copied from the deleted source files. A
  clean build must produce a correct app; a stale app bundle must never be the
  reason a test passes.
- **Sandbox denial**: if the build's file-access sandbox refuses to read the
  corpus (because a declared input was missed), the build must fail visibly.
  Silently producing an app with no catalogs is the unacceptable outcome,
  because at runtime that degrades to key echo rather than a crash.
- **Locale count drift in either direction**: 16 catalogs (added language) and
  14 catalogs (removed language) must both be caught.
- **Test and UI-test targets**: the unit test target is hosted by the app, so it
  resolves catalogs from the app bundle; no separate catalog delivery may be
  required for tests to pass.
- **Reverting this feature**: nothing outside `app-ios/` and the spec 009 records
  may need to change to restore the previous behavior.

## Requirements

### Functional Requirements

- **FR-001**: No locale catalog file may be tracked in version control outside
  `public/i18n/`; the 15 copies under the iOS app source tree MUST be deleted
  from the repository.
- **FR-002**: Building the iOS app target MUST place all 15 locale catalogs into
  the produced app bundle at the same lookup location the app reads today, so
  that the app's localization lookup code needs no change.
- **FR-003**: A single build from a clean checkout MUST produce an app
  containing all 15 catalogs — no two-pass behavior, no manual pre-step beyond
  the prerequisites already documented for the iOS build.
- **FR-004**: The iOS build MUST keep its file-access sandbox enabled; the
  catalog step MUST declare the corpus files it reads and the bundle files it
  writes.
- **FR-005**: The iOS build MUST NOT acquire a Node.js dependency; the catalog
  step MUST run with tools already present on a macOS build machine.
- **FR-006**: A rebuild with no catalog change MUST perform no catalog work; a
  rebuild after a catalog change MUST refresh the bundled content without a
  clean build.
- **FR-007**: The 15-locale pin MUST survive: a corpus whose catalog count
  differs from the pinned set MUST fail a documented gate that names the
  mismatch and the file to update.
- **FR-008**: All existing iOS unit tests MUST pass unmodified, including the
  ones that assert real translated values and key-echo behavior.
- **FR-009**: The app's runtime localization behavior MUST be unchanged —
  same resolved-language ladder, same English fallback, same key echo on a
  missing key.
- **FR-010**: The retired byte-compare drift gate MUST be replaced by a gate
  protecting the new build declaration, and the spec 009 records that describe
  the old route (quickstart, data-model, research D3) MUST be updated to
  describe the new one.
- **FR-011**: The catalog step MUST apply to every build configuration the app
  ships in, not only the debug configuration.
- **FR-012**: If the corpus is missing, empty, or unreadable at build time, the
  build MUST fail with a message that names the expected corpus location.
- **FR-013**: Component previews in the IDE MUST continue to render real
  translated strings.
- **FR-014**: `public/i18n`, the upstream locale corpus, and the generator
  between them MUST NOT be modified by this feature; the merged runtime
  catalogs stay the single artifact every platform consumes.

### Non-Negotiable Constraints

These are set by the request, not derived, and bound the solution space:

- The Xcode file-system-synchronized group model stays (spec 009 D9) — no
  reversion to per-file project entries.
- Script sandboxing stays enabled; the fix must work *with* it, not by
  disabling it.
- The app's catalog lookup call site stays byte-identical; catalogs land at the
  bundle root, not in a subdirectory.
- Android, web, desktop and the Rust core are out of scope and unchanged.

### Key Entities

- **Merged runtime catalogs**: the 15 `<lng>.json` files under `public/i18n`.
  Themselves generated — the upstream source is the 240-file corpus at
  `rust/crates/vela-core/i18n/locales/`, merged by the repo-root i18n generator
  — but they are the single *consumed* artifact: every platform reads these, or
  a build product derived from them, and nothing else. Unchanged by this
  feature. "The corpus" below always means this merged set.
- **Bundled catalog set**: the 15 catalogs inside the produced iOS app,
  consumed offline at launch. Becomes a build product instead of a committed
  artifact.
- **Locale pin**: the constant asserting the corpus holds exactly 15 locales.
  Moves from the copy script to whatever guards the new build declaration.
- **Build declaration**: the enumeration of corpus files the build reads and
  bundle files it writes. New artifact, must not drift from the corpus.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Regenerating the corpus after a translation edit produces a diff
  in exactly one directory — down from 2 directories and 15 duplicated files
  (~1 MB) today.
- **SC-002**: The number of locale catalog files tracked in version control
  outside `public/i18n` is 0.
- **SC-003**: From a fresh clone, one build command produces an app containing
  all 15 catalogs, verified by inspecting the app bundle.
- **SC-004**: 100% of the existing iOS unit tests pass with zero test-code
  changes.
- **SC-005**: The app resolves and displays real translations for at least
  `en`, `zh`, and `de` from that single build — verified on a simulator, not
  only in tests.
- **SC-006**: A deliberately broken corpus (16 or 14 catalogs) fails the
  documented verification run 100% of the time, with a message naming the
  offending locale.
- **SC-007**: A no-change rebuild performs zero catalog work; a
  single-catalog-change rebuild refreshes the app without a clean build.
- **SC-008**: The documented iOS build prerequisites gain no new tool
  requirement.

## Assumptions

- `public/i18n` remains generated-and-committed (from
  `rust/crates/vela-core/i18n/locales/` via the repo-root generator) and remains
  the artifact the web app serves. This feature does not question that, and does
  not touch either side of that pipeline.
- The upstream corpus contains per-namespace files that share basenames with the
  merged catalogs (`.../locales/zh.json` is a namespace file, not a catalog), so
  any "no duplicate catalogs" check must be scoped to the iOS tree rather than
  matched by filename repository-wide.
- The 15-locale pin is a deliberate gate, not an accident; a locale change
  should require a conscious edit in exactly one place.
- iOS builds run on macOS with the Xcode version already documented in the spec
  009 quickstart, and standard shell file-copy tooling is available there.
- The unit test target stays hosted by the app target, so the app bundle is the
  catalog source for tests. If that ever changes, the test target needs its own
  catalog delivery.
- Nothing outside the iOS build consumes the deleted copies — verified: they are
  referenced only by the app's localization loader and its own sync script.
- The replacement gate is expected to live alongside the existing generated-layer
  gates in the documented verification run, so contributors keep running one
  command set, not two.
- Stale derived build data from the previous design may exist on developer
  machines; a clean build is an acceptable one-time cost and will be documented.
