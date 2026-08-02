# Data Model: iOS Catalog Build-Time Bundling

There is no application data model — this feature moves bytes at build time and
changes no runtime state. What follows is the artifact model: who owns each
file, what derives it, and what stops it from drifting.

## Artifacts

| Artifact | Count | Derived from | Owner / generator | Gate | Tracked in git |
| --- | --- | --- | --- | --- | --- |
| `rust/crates/vela-core/i18n/locales/**` | 240 | hand-authored | translators | existing corpus gates | yes |
| `public/i18n/<lng>.json` | 15 | the 240-file corpus above | `scripts/gen-i18n.mjs` (repo root, **out of scope**) | existing corpus gates | yes |
| `app-ios/scripts/catalogs-input.xcfilelist` | 1 | `public/i18n` listing | `gen-catalog-filelists.mjs` | `--check` (D5) | yes |
| `app-ios/scripts/catalogs-output.xcfilelist` | 1 | `public/i18n` listing | `gen-catalog-filelists.mjs` | `--check` (D5) | yes |
| `app-ios/scripts/bundle-catalogs.sh` | 1 | hand-written | — | executed every build; fails loudly (contract) | yes |
| `VelaWallet.app/<lng>.json` | 15 | `public/i18n/<lng>.json` | `bundle-catalogs.sh` at build time | build-time assertions + `quickstart` bundle listing | **no — build product** |
| ~~`app-ios/…/Localization/Catalogs/<lng>.json`~~ | ~~15~~ | ~~`public/i18n`~~ | ~~`sync-catalogs.mjs`~~ | ~~`--check`~~ | **deleted by this feature** |

The row that disappears is the feature: the corpus's only tracked representation
becomes `public/i18n`.

## Ownership rules

1. **`public/i18n` is the single *consumed* catalog artifact.** It is itself
   generated from `rust/crates/vela-core/i18n/locales/`, but no platform reads
   that upstream corpus directly — every consumer reads `public/i18n` or a build
   product derived from it, in one direction, by exactly one generator per hop.
   Note the basename collision: `.../locales/zh.json` is a namespace file, not a
   catalog, so duplicate-detection must be path-scoped, never filename-matched.
2. **The `.xcfilelist` pair is the authority on "which locales exist" for iOS.**
   The build script copies what the lists declare — never what a glob finds — so
   an undeclared locale cannot reach the bundle (D3).
3. **The pin lives in exactly one place**: `LOCALE_COUNT = 15` inside
   `gen-catalog-filelists.mjs`, inherited verbatim from the deleted
   `sync-catalogs.mjs`. The build script derives its expected count from the
   resolved lists, so it never re-states the number.
4. **Nothing generated lands inside `app-ios/VelaWallet/VelaWallet/`.** That
   directory is a file-system-synchronized group: anything on disk there enters
   the app bundle, so generated files there are both invisible to review and a
   shipping hazard (spec 009 D9). All new files live in `app-ios/scripts/`.

## Path contract

| Role | Path form | Resolved example |
| --- | --- | --- |
| Declared read | `$(SRCROOT)/../../public/i18n/<lng>.json` | `<repo>/public/i18n/zh.json` |
| Declared write | `$(TARGET_BUILD_DIR)/$(UNLOCALIZED_RESOURCES_FOLDER_PATH)/<lng>.json` | `…/Build/Products/Debug-iphonesimulator/VelaWallet.app/zh.json` |
| Runtime read | `Bundle.main.url(forResource: lng, withExtension: "json")` | bundle root — **unchanged by this feature** |

`SRCROOT` is `app-ios/VelaWallet`, so `../../` reaches the repository root.
`TARGET_BUILD_DIR` (not `BUILT_PRODUCTS_DIR`) is used because the two diverge for
`install`/archive builds and only the former tracks the bundle being assembled
(D2).

## Locale set

The 15 pinned locales, in the order the corpus lists them:

`de`, `en`, `es-MX`, `fr`, `id`, `it`, `ja`, `ko`, `pt-BR`, `ru`, `tr`, `vi`,
`zh`, `zh-HK`, `zh-TW`

This set mirrors `vela_core::i18n::resolve::SUPPORTED`, `Loc.supported` in
`Loc.swift`, and `src/i18n/shared.ts#SUPPORTED_LANGUAGES`. This feature does not
change it and must not be the reason it changes.

## State transitions (the build phase)

| Build situation | Phase behavior | Result |
| --- | --- | --- |
| Clean checkout, first build | runs; copies 15 | app has 15 catalogs on the **first** build (FR-003) |
| Rebuild, nothing changed | skipped by dependency analysis | zero catalog work (FR-006, SC-007) |
| Rebuild, one catalog changed | runs; copies the declared set | app carries the change without a clean (FR-006) |
| Corpus has a 16th `.json`, lists not regenerated | **fails**, naming the extra locale | no partial-set app (FR-007, US3) |
| A declared input missing or empty | **fails**, naming the expected path | no catalog-less app (FR-012) |
| Corpus directory absent | **fails** at the first declared input | actionable error, not key echo |
| Archive / Release configuration | runs (full `buildActionMask`) | same 15 catalogs (FR-011) |
| Hosted unit tests | inherit the host app bundle | tests unchanged (FR-008) |

## Failure model

Unchanged from spec 009 at runtime — a missing key echoes itself, a dead engine
echoes every key, a missing catalog falls back to English cleanly. This feature's
contribution is to make sure the *build* never reaches those states silently: the
runtime signal is a last resort for a shipped app, not a substitute for a build
error. Every way the catalogs can go missing is turned into a non-zero exit
before the app is produced.
