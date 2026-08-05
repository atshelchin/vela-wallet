# Contract: Portable Lottie Subset

**Feature**: `012-launch-animation-lottie` | **Requirement**: FR-005, FR-006, FR-007

This file is the single definition referred to by FR-005. It is written for two
readers: a designer deciding what to export, and `scripts/lint-lottie-assets.mjs`,
which enforces it. **If the two ever disagree, the linter is wrong** — fix the
linter, not this file.

## Why a subset exists

Vela renders Lottie with three different engines (Airbnb's Core Animation engine
on iOS, Airbnb's Canvas renderer on Android, Airbnb's `lottie_light` DOM/SVG
renderer on web, ThorVG on desktop). They agree on the core of the format and
diverge — subtly, silently, and differently from each other — on its edges. The
subset below is the region where they agree.

All eight existing launch files already sit inside it (research D0), so this rule
costs nothing today. It is written down so the *fourth* animation does not
quietly leave it.

## Permitted

| Category | Allowed |
| --- | --- |
| Layer types | shape layers only — `ty: 4` |
| Shape items | path `sh`, group `gr`, group transform `tr`, rect `rc`, ellipse `el`, star/polygon `sr`, solid fill `fl`, solid stroke `st` |
| Layer transform (`ks`) | opacity `o`, position `p`, scale `s`, rotation `r`, anchor `a`, skew `sk`/`sa` |
| Value forms | static (`a: 0`) and keyframed (`a: 1`) scalars and vectors, with bezier (`i`/`o`) or hold (`h: 1`) interpolation |
| Layer timing | `ip`, `op`, `st`, `sr` |
| Blend mode | normal only — `bm: 0` |
| Structural | `assets: []` (empty), 2-D only (`ddd: 0`), `ao: 0` |

## Rejected, with the reason each is rejected

| Feature | JSON marker | Why |
| --- | --- | --- |
| Gradient fill / stroke | `ty: "gf"`, `ty: "gs"` | Interpolation and dithering differ visibly between the four engines |
| Dashed strokes | `d` on a stroke | Phase and cap handling differ between Canvas and ThorVG |
| Trim paths | `ty: "tm"` | Multi-subpath trim ordering is a classic cross-renderer divergence |
| Merge paths | `ty: "mm"` | Unsupported or approximated by several renderers |
| Masks | `masksProperties`, `hasMask` | Mask modes beyond `add` are inconsistently implemented |
| Track mattes | `tt`, `td` | Forces Airbnb's iOS Core Animation engine to fall back to main-thread rendering — the exact property this feature was chosen for |
| Effects | `ef` | Effectively renderer-specific |
| Text layers | `ty: 5`, `t`, `fonts` | Requires font resolution and shaping; four different text stacks |
| Image layers | `ty: 2`, non-empty `assets` | External resources to bundle and resolve per platform |
| Precomps | `ty: 0` | Nested time remapping is a divergence source; also defeats the flat-layer linting below |
| 3-D layers | `ddd: 1` | No consistent camera model |
| Expressions | `x` on any property | Requires a JS engine; ThorVG's support is a build flag this project deliberately does not enable |
| Time remapping | `tm` on a layer | Same reason as precomps |
| Auto-orient | `ao: 1` | Rotation derivation differs |
| Non-normal blend modes | `bm != 0` | Compositing differs, especially against a transparent background |

## Linter contract

```
node scripts/lint-lottie-assets.mjs              # gate design/
node scripts/lint-lottie-assets.mjs --self-test  # prove the gate can fail
node scripts/lint-lottie-assets.mjs --report     # print the measured geometry
```

**Scope**: every `*.json` under `design/**/` that parses as a Lottie document
(has `v`, `w`, `h`, `fr`, `ip`, `op`, `layers`).

**Exit codes**: `0` all files legal; `1` at least one violation or unreadable
file.

**Output** — one line per violation, naming file, layer and feature, in the style
of `scripts/lint-i18n-corpus.mjs`:

```
design/onboarding/launch/vela-wallet-launch-phone-core-dark.json
  layer 3 "Wordmark / 03 / l": gradient fill (ty:"gf") — see specs/012-launch-animation-lottie/contracts/portable-subset.md
```

### Naming rule

```
vela-wallet-{animation}-{phone|desktop}-{core|full}-{dark|light}.json
             ^name       ^form factor    ^framing    ^appearance
```

The animation **name is a field**, not the literal `launch`. It was hardcoded at
first, in both this linter and `app-ios/scripts/gen-animation-filelists.mjs`,
which meant adding a second animation required editing two scripts — a
build-configuration edit in all but name, and exactly what FR-004 forbids.
Caught by actually dropping a second animation into the directory and watching
both reject it, not by re-reading the requirement.

All three tokens are mandatory. A file under `design/onboarding/launch/` that
does not match is a violation — the parsed name is what feeds every cross-file
assertion below, so an unparseable name means an unchecked file.

*(The delivered set originally left tokens implicit — `…-core-dark` meant the
phone crop and `…-phone-dark` meant the full-bleed phone framing. Both were
regularised on 2026-08-05, before anything consumed them: with implicit tokens
the pairing logic needs four special cases and a third form factor would be
ambiguous, which is the whole reason the founder chose a regular scheme.)*

### Per-file structural assertions

1. `assets` is present and empty; no `fonts` key.
2. `ip`/`op`/`fr`/`w`/`h` are finite numbers and `op > ip`.
3. Content is **vertically centred** within ±0.5 units of the canvas centre,
   measured over the whole timeline.
4. **No keyframe is clipped** by the canvas — the content bounding box swept over
   every keyframe lies inside `[0, w] × [0, h]`.

### Repository-wide assertion

`design/onboarding/launch` is the only place an animation may live (FR-001 /
SC-004). The linter greps `git ls-files` for any tracked file whose basename
matches a real asset outside `design/`, because a committed copy under an app
would still build, still run, and quietly go stale — nothing else in the repo
would notice.

### Cross-file assertions

Cheap, and only possible because eight related files exist:

5. **Within one animation**, all framings agree on `fr`, `ip`, `op`. Grouped by
   name, because two different animations may legitimately differ in duration,
   palette and crop — only a single animation's framings must agree with each
   other.
6. Each form-factor pair (`X` and `X-core`, each in both appearances) agrees on
   fill colours, layer count and layer names — catching a re-export of one
   framing only.
7. Per animation, `core canvas width ÷ full-bleed canvas width` equals the
   `BOX_W_RATIO` the apps use (`350/390`, `680/1920`). This is the assertion that keeps the apps'
   only geometric constant a **derivation from the assets** rather than a
   transcribed number: re-crop in After Effects and CI reports drift instead of
   the design silently changing.

### Three key-collision traps this linter must not fall into

All three were found by scanning the real files (research D0/D6), not by
reasoning about the format:

- **`x` is not always an expression — this is the dangerous one.** Every file
  contains **22 `x` keys**, and *none* is an expression: they are the bezier
  ease handles `o:{x,y}` / `i:{x,y}` on the 11 animated keyframes. The expression
  marker is `x` **as a sibling of `k`/`a` on a property object**. A recursive
  search for the `x` key rejects all eight legal files — and looks correct while
  doing it, because expressions genuinely are on the rejected list.
- **`ao` is present in every legal file, as `"ao": 0`.** Check the *value*
  (`ao === 1` is the violation), never key presence.
- **`ty` and `sr` are overloaded by position.** `"tm"` means *trim path* as a
  shape item but *time remapping* as a layer property; `sr` means *star* as a
  shape item but *time stretch* as a layer property. The scan must walk
  shape-item arrays and layer objects separately, not do a blind recursive key
  search.

### Self-test (SC-005)

`--self-test` is a mode of the linter rather than a separate test file: the
repository's jest config is scoped to `src/**/__tests__/**/*.test.ts`, so a test
under `scripts/` would never have run. One command, run in CI ahead of the gate
itself.

It covers the three ways this linter can be inert:

1. **The naming rule** — a table of names it must accept and names it must reject.
2. **Per-file fixtures** in `scripts/__fixtures__/lottie/`, each exactly one
   mutation away from a real asset so a rejection can only be attributed to that
   mutation. Every `illegal-*` fixture must be rejected **for the reason its name
   claims** (`EXPECTED_REASON` in the linter); "was rejected" is far too weak a
   claim, since a fixture broken in some unrelated way would otherwise read green.
   `legal-control.json` is an unmodified copy and is the most important case in
   the set — it carries the 22 bezier ease handles a naive `x`-key search would
   report as expressions.
3. **Cross-file fixture sets** in `scripts/__fixtures__/lottie-crossfile/<case>/`,
   where the *set* must be rejected, one directory per cross-file assertion.

The cross-file layer earned its place immediately: the `ratio` set exposed a real
defect in the first implementation, which skipped cross-file checks for any file
that had a per-file problem — so a broken crop hid the ratio drift it had caused.

## Changing this contract

Adding a feature to the permitted set requires: (a) confirming all four engines
render it identically for the intended usage, (b) a golden-frame case that would
catch it if they stop, (c) editing this file and the linter in the same commit.
