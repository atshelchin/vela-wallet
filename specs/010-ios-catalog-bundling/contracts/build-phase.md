# Contract: the catalog build phase

The one interface this feature exposes is a build-phase script. This is its
contract — what Xcode must hand it, what it guarantees, and how it fails.

## Registration (project.pbxproj)

A single `PBXShellScriptBuildPhase` on the `VelaWallet` target:

| Field | Value | Why |
| --- | --- | --- |
| `name` | `Bundle locale catalogs` | shown in build logs and the phase list |
| position in `buildPhases` | **last** (after Sources, Frameworks, Resources) | bundle directory is guaranteed to exist; signing still runs after all phases (D6) |
| `buildActionMask` | `2147483647` | runs for build, test, archive, install |
| `runOnlyForDeploymentPostprocessing` | `0` | must run in Debug too, not only when installing |
| `alwaysOutOfDate` | absent (= `0`) | dependency analysis is what makes it incremental (FR-006) |
| `inputFileListPaths` | `app-ios/scripts/catalogs-input.xcfilelist` (via `$(SRCROOT)/../scripts/…`) | declares the 15 corpus reads — this is what the sandbox grants (FR-004) |
| `outputFileListPaths` | `app-ios/scripts/catalogs-output.xcfilelist` | declares the 15 bundle writes |
| `shellPath` | `/bin/bash` | |
| `shellScript` | `"$SRCROOT/../scripts/bundle-catalogs.sh"` | the phase body is one line; the logic is a reviewable file |

The script file lives in `app-ios/scripts/`, **outside** the
file-system-synchronized app folder, so it is never bundled (spec 009 D9).

## Inputs the script may rely on

Provided by Xcode in the environment:

| Variable | Meaning |
| --- | --- |
| `SCRIPT_INPUT_FILE_LIST_COUNT` | number of input file lists (must be `1`) |
| `SCRIPT_INPUT_FILE_LIST_0` | path to Xcode's **resolved** copy of the input list — one absolute path per line, all `$(…)` already expanded |
| `SCRIPT_OUTPUT_FILE_LIST_COUNT` | number of output file lists (must be `1`) |
| `SCRIPT_OUTPUT_FILE_LIST_0` | path to the resolved output list, same form |

The script MUST NOT hardcode `public/i18n`, the bundle path, or the locale list.
Everything it needs is in those two resolved lists; that is what keeps the
declaration authoritative (D3) and keeps every read inside the sandbox grant.

## Guarantees

1. For each index *i*, the file at input line *i* is copied to output line *i*.
2. Destination directories are created if absent.
3. The copy is content-complete before the phase exits — no partial writes left
   behind on failure.
4. Nothing outside the declared output paths is written.
5. Nothing is read outside the declared input paths, except the corpus
   *directory listing* used for the extra-locale check below (a listing of the
   directory that contains a declared input).
6. On success the phase prints one summary line naming how many catalogs were
   bundled.

## Failure conditions (all non-zero exit, all before the app is usable)

| Condition | Message must name | Requirement |
| --- | --- | --- |
| `SCRIPT_INPUT_FILE_LIST_COUNT` ≠ 1 or `SCRIPT_OUTPUT_FILE_LIST_COUNT` ≠ 1 | the phase's own misconfiguration | contract integrity |
| input and output lists differ in length | both counts | D3 pairing invariant |
| either list is empty | the list path | FR-012 |
| a declared input does not exist | the missing absolute path | FR-012 |
| a declared input is empty (0 bytes) | the offending path | FR-012 |
| the corpus directory contains a `.json` not present in the input list | the extra locale's filename **and** `gen-catalog-filelists.mjs` as the fix | FR-007, US3 |
| a copy fails | source and destination | FR-012 |

Failure messages are emitted in Xcode's `error:` format so they surface in the
Issue navigator rather than only in the raw log.

## Non-goals

- The script does not validate JSON contents. Catalog validity is the corpus
  generator's job; duplicating it here would create a second authority.
- The script does not delete stale catalogs from the bundle. A locale removed
  from the corpus disappears from the declaration, which fails the extra/short
  checks and forces a regenerate; incremental bundles are rebuilt from a clean
  product directory by Xcode when the output list changes.
- The script does not know the number 15. Only
  `gen-catalog-filelists.mjs` pins the locale count (D5); the script derives its
  expectation from the resolved lists.

## Gate contract (`gen-catalog-filelists.mjs`)

| Invocation | Behavior |
| --- | --- |
| `node app-ios/scripts/gen-catalog-filelists.mjs` | regenerates both `.xcfilelist`s from `public/i18n`; prints how many entries were written |
| `node app-ios/scripts/gen-catalog-filelists.mjs --check` | exit 0 and print "catalog file lists in sync (15)" when both lists match the corpus **and** no catalog JSON is tracked in git anywhere under `app-ios/`; otherwise exit 1 naming every difference |

The tracked-copy scan is scoped to `app-ios/` on purpose: the upstream corpus at
`rust/crates/vela-core/i18n/locales/` contains per-namespace files with the same
basenames (`zh.json` there is a namespace, not a catalog), so a
repository-wide filename match would be wrong.

`--check` is the replacement for the retired `sync-catalogs.mjs --check` and
takes its place in the documented generated-layer gate set (FR-010).
Both modes fail when the corpus does not hold exactly `LOCALE_COUNT` catalogs,
with a message telling the reader to update that constant if the change was
deliberate — the same contract the deleted script had.
