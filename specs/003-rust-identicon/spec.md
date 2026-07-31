# Feature Specification: Identicons in the shared Rust core

**Feature Branch**: `003-rust-identicon`

**Created**: 2026-07-30

**Status**: Implemented 2026-07-30 — US1 and US2 complete; US3 met with margin
(0.323 µs/identicon against a 2 µs budget, one allocation). `app-web`'s current
Expo web path is wired to the core; the four platform scaffolds
(`app-ios`/`app-android`/`app-desktop`/`app-web`) consume it through the binding
routes already generated, and adopting it inside those shells is follow-up work
tracked in [research.md](./research.md) open question 1. Measured results are
recorded in research.md.

**Input**: User description: "Reimplement the `identicons-esm` JS library completely and exactly in Rust, as a utility inside `rust/crates/vela-core`. It must be a 100% faithful reproduction, because the Rust implementation will be used from app-ios, app-web, app-android and app-desktop. Optimise for speed and memory — no memory blow-ups, no slow paths. Keep the API close to `identicons-esm`; variations and omissions are allowed, but the core rule is: the same input must produce the same logo."

## Why

The identicon is how a user recognises their own account. It is rendered next to
every address in the account list, on the signing sheet, and in the address
book — and it is the only account marker a user can check at a glance, since
`0xd8da…6045` and `0xd8db…6045` look alike but produce wildly different
identicons. In practice it is a security control: **users verify accounts by
avatar**, so two platforms that draw the same address differently do not have a
cosmetic bug, they have a broken verification signal.

Today that avatar comes from `identicons-esm@1.0.1`, a JavaScript library, via
`src/components/ui/Identicon.tsx`. That is fine while the wallet is one Expo/RN
codebase. It stops working the moment the platforms diverge:

- The native iOS/Android rewrite (the successor architecture
  `001-rust-core-bindings` was built for) has no JS engine on its rendering path.
- `app-desktop` and `app-web` would keep the JS library while native needed a
  second implementation — reintroducing exactly the hand-rolled-duplicate drift
  class that feature 001 removed for hashing and address math.

The identicon algorithm is unusually hostile to reimplementation, which is why
"just port it" is a specification-worthy task rather than an afternoon's work:
its hash is a **chaotic 64-bit floating-point iteration whose result is fed
through JavaScript's `Number.prototype.toString(10)`** and then sliced as a
*decimal string*. The output therefore depends on IEEE-754 double semantics, on
ECMAScript's shortest-round-trip float formatting (including its exponential form
and its tie-breaking rule), and on UTF-16 code-unit semantics for non-BMP
characters. A port that is 99.99% right produces a different avatar for a small
set of real addresses — the worst possible failure mode, because nothing catches
it except a user noticing that their account "changed face".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One exact identicon implementation (Priority: P1)

As the wallet's maintainer, I have an identicon implementation in `vela-core`
that is proven byte-identical to `identicons-esm@1.0.1` across a large
conformance corpus, so that every platform can derive avatars from one verified
implementation instead of maintaining a JS copy plus native reimplementations.

**Why this priority**: Nothing else in the feature is safe without it. It also
delivers value standalone: the corpus becomes the oracle any future platform
implementation must satisfy, and the Rust suite immediately cross-checks the JS
library the app ships today.

**Independent Test**: Run the Rust test suite. Every case in the committed
conformance corpus — extracted from the real `identicons-esm@1.0.1` package —
produces byte-identical hash strings, colour selections, section selections and
complete SVG documents. No app change required.

**Acceptance Scenarios**:

1. **Given** the conformance corpus of seeds (0x-hex addresses, Nimiq addresses,
   empty/whitespace strings, astral-plane characters, control characters and long
   inputs), **When** each seed is fed to the Rust core, **Then** the hash string,
   the three colours, the four section indices and the assembled SVG are
   byte-identical to the JS library's output.
2. **Given** a seed whose chaotic hash lands in a regime where the JS library
   itself produces a malformed identicon or throws, **When** that seed is fed to
   the Rust core, **Then** the core returns a typed error rather than a
   silently-wrong avatar, and the corpus records the JS behaviour as a documented
   divergence.
3. **Given** the same seed hashed twice, or hashed on two different CPU
   architectures (x86-64 and aarch64), **When** the identicon is generated,
   **Then** the output is bit-identical — the floating-point pipeline is not
   permitted to vary by platform, optimisation level or FMA contraction.

---

### User Story 2 - Every platform draws the same avatar (Priority: P2)

As a user with the wallet on iOS, Android, web and desktop, my account shows the
same identicon everywhere, so the avatar stays something I can trust as an
account identity check when moving between my devices.

**Why this priority**: This is the user-visible payoff, but it depends entirely on
P1 being proven first. It reuses the binding routes feature 001 already
established (uniffi for Kotlin/Swift, wasm-bindgen for web), so the incremental
work is exposure plus a corpus replay, not new infrastructure.

**Independent Test**: Replay the shared conformance corpus through the Kotlin,
Swift and wasm binding surfaces; all three produce byte-identical results to the
Rust suite. Then render the account list in `app-web` against the core and confirm
the avatars are unchanged from the JS library's output.

**Acceptance Scenarios**:

1. **Given** the shared conformance corpus, **When** it is replayed through each
   binding surface (Kotlin, Swift, wasm), **Then** every output matches the Rust
   result byte-for-byte.
2. **Given** `app-web` switched from `identicons-esm` to the core, **When** the
   account list, signing sheet and address book render, **Then** every identicon
   is byte-identical to what the JS library drew for the same account — including
   the wallet's circular variant, not just the library's stock hexagonal output.
3. **Given** an account created before this feature shipped, **When** the user
   opens the wallet after upgrading, **Then** its avatar is unchanged.

---

### User Story 3 - Cheap enough for a scrolling list (Priority: P3)

As a user scrolling a long account list or address book on a low-end phone, the
avatars appear without stutter and the app's memory does not grow with the number
of distinct addresses I have viewed.

**Why this priority**: Correctness first, but a port that is exact and slow is not
shippable on the rendering path. The requester called this out explicitly:
optimise time and memory, and do not introduce unbounded growth.

**Independent Test**: Benchmark identicon generation in isolation and assert the
per-call budget; assert the crate holds no per-seed state, so repeated generation
over unbounded distinct seeds has flat memory.

**Acceptance Scenarios**:

1. **Given** a 42-character 0x-hex address, **When** an identicon SVG is
   generated, **Then** it completes within the per-call time budget (SC-004) and
   performs a bounded, documented number of heap allocations.
2. **Given** one million distinct seeds generated in sequence, **When** memory is
   sampled, **Then** resident memory attributable to the core is flat — the core
   keeps no per-seed cache that can grow without bound.

---

### Edge Cases

- **The chaotic hash decays toward zero as the seed gets longer.** Past roughly 93
  characters the float's decimal form switches to exponential notation, and
  somewhere past ~1,000 characters (the exact threshold depends on which
  characters the seed contains) the exponent reaches three digits — at which point
  the JS library indexes its colour palette with `NaN` and emits the literal string
  `fill="undefined"` into the SVG. Real seeds (42-character addresses) are nowhere
  near this, but the core must define behaviour rather than inherit an accident.
- **A vanishingly rare second regime makes the JS library throw.** When the
  float's shortest decimal representation is exactly 7 characters long, the
  library's pad character becomes `.`, the section indices parse as `NaN`, and
  `sectionToSvg` throws. The core must fail as a typed error here, not panic.
- **Non-BMP characters.** The JS hash iterates by *code point* but reads the
  *leading UTF-16 code unit*, so an emoji contributes its high surrogate
  (`0xD83D`), not its code point. A port that iterates Rust `char`s naively
  diverges on any astral input.
- **Empty seed.** Produces the all-zeros hash and a specific, well-defined
  identicon — it must not be treated as an error.
- **Duplicate SVG element ids.** The library's stock output hardcodes
  `clipPath id="a"`; when several identicons share one DOM, `url(#a)` resolves
  document-wide to the first `#a` and the clip silently breaks. The wallet already
  avoids this by assembling a circular variant with no SVG ids; the core must
  reproduce that variant exactly, or the web migration regresses.
- **Existing accounts' avatars MUST NOT change.** Any divergence is a release
  blocker, not a bug to triage — the same standing rule feature 001 applies to
  counterfactual addresses.
- **Floating-point reproducibility.** No fused-multiply-add contraction, no
  fast-math, no reassociation: the multiply order in the hash is part of the
  contract, and a "harmless" algebraic simplification changes user avatars.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The core MUST implement the identicon computation of
  `identicons-esm@1.0.1`: the chaotic float hash, the derivation of colour and
  section indices from the hash's decimal digits, the collision-avoidance rule
  that keeps the three colours distinct, the 84 embedded section artworks, and the
  assembly of a complete SVG document.
- **FR-002**: For every seed in the conformance corpus, the core's output MUST be
  byte-identical to `identicons-esm@1.0.1`'s output — for the hash string, the
  parameters (colours and sections), the stock SVG document, and the base64
  data-URI form.
- **FR-003**: The core MUST additionally produce the wallet's **circular**
  identicon variant byte-identically to the current `Identicon.tsx` output, since
  that — not the library's stock hexagonal form — is what the app renders today.
- **FR-004**: Where the JS library produces a malformed identicon or throws, the
  core MUST return a typed error instead. Each such case MUST be enumerated as a
  documented divergence in the corpus, with the JS behaviour recorded. The core
  MUST NOT panic on any input.
- **FR-005**: The core MUST additionally offer a bug-compatible mode that
  reproduces the JS library's malformed output byte-for-byte, so the parity claim
  in FR-002 can be proven across the *entire* input domain rather than only the
  well-behaved part of it.
- **FR-006**: The identicon computation MUST be deterministic across CPU
  architectures, optimisation levels and binding surfaces. The build MUST NOT
  enable any floating-point transformation that could alter results.
- **FR-007**: The core MUST be consumable from Android (Kotlin), iOS (Swift), web
  (JS/TS) and desktop, and MUST produce identical results on all of them for the
  shared conformance corpus.
- **FR-008**: The core MUST hold no mutable per-seed state: generating identicons
  for unboundedly many distinct seeds MUST NOT grow the core's memory. Caching is
  the caller's decision, at the caller's chosen bound.
- **FR-009**: The embedded section artwork MUST be generated from the
  `identicons-esm` package itself by a committed, re-runnable generator, not
  transcribed by hand, and a test MUST detect any drift between the embedded table
  and the package.
- **FR-010**: The public API MUST stay recognisably close to `identicons-esm`'s
  (`makeHash`, `getIdenticonsParams`, `assembleSvg`, `createIdenticon`, the
  palettes, the shared shape fragments), so the JS call sites being migrated map
  across without redesign.
- **FR-011**: The core MUST include property-based tests asserting that no input
  panics, that output is stable across repeated calls, and that the hash's
  reachable value domain holds.
- **FR-012**: The conformance corpus MUST be regenerable from a clean checkout
  with documented commands, and MUST be byte-identical on re-run, so any diff is a
  real behaviour change.

### Key Entities

- **Seed**: the string an identicon is derived from — in Vela, an account address.
  Case- and length-normalisation before hashing is a caller policy that MUST be
  shared across platforms, since it changes the avatar.
- **Identicon hash**: the 13-to-17 character decimal digit string produced from
  the chaotic float; every downstream choice is an index read out of it.
- **Identicon params**: the three chosen colours (main, background, accent) and the
  four chosen section artworks (top, sides, face, bottom) — the complete
  description of an identicon, independent of how it is drawn.
- **Section artwork**: one of 84 fixed SVG fragments (21 per section), addressed by
  section name and index.
- **Core error**: the existing flat `CoreError` type, extended with the
  classification for seeds the algorithm cannot render.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the conformance corpus passes, with zero byte differences
  against `identicons-esm@1.0.1`, across at least 100,000 generated seeds covering
  hex addresses, Nimiq addresses, unicode (BMP and astral), control characters,
  empty input and the long-input regimes.
- **SC-002**: The corpus produces byte-identical results on Rust, Kotlin, Swift and
  wasm.
- **SC-003**: Zero avatar changes for existing accounts: every account address
  present in the app's own fixtures renders the same identicon before and after the
  migration.
- **SC-004**: A single identicon SVG is generated from a 42-character address in
  **under 2 µs** on a development machine (target: under 1 µs), with **at most one
  heap allocation** for the returned document.
- **SC-005**: Memory attributable to the core is **flat** across one million
  distinct seeds, and the embedded artwork table costs a fixed, documented amount
  of read-only program data (no heap, no lazy initialisation).
- **SC-006**: A contributor can regenerate the artwork table and the conformance
  corpus, and run the full suite, with documented commands on a clean checkout.

## Assumptions

- **Technology mandate (from the requester, fixed)**: the implementation language
  is Rust; it lives in `rust/crates/vela-core` (the requester wrote
  "velac-core"; the crate in this repository is `vela-core`, and that is the
  target). Distribution reuses the binding routes feature 001 established —
  uniffi 0.32 for Kotlin/Swift, wasm-bindgen for web — rather than adding new
  ones. `app-desktop` consumes the same core through whichever of those routes its
  shell uses.
- **`identicons-esm@1.0.1` is the behavioural source of truth**, exactly as pinned
  in `package.json` today. Not the upstream Nimiq original, not a newer release:
  the version the app ships is the version whose avatars users already have.
- **The behaviour to preserve is the app's, not just the library's.** The wallet
  renders a circular variant it assembles itself from the library's params, and it
  lowercases and length-caps the seed first. Those choices are part of "the same
  logo" and are in scope.
- **API parity is by shape, not by signature.** Rust returns `Result` where JS
  throws or returns `undefined`, uses `&'static str` where JS returns interned
  strings, and omits the browser-only surface of the library (object URLs, web
  components, workers, batch/streaming helpers, the `shiny` material variants) —
  none of which are computation, and all of which belong to a rendering layer
  rather than to a shared core. This is the "variations and omissions allowed"
  latitude the requester granted.
- **Nimiq address validation is ported for completeness**, so `createIdenticon`'s
  full contract exists, but Vela's call sites bypass it: Vela addresses are EVM
  addresses, and validating them as Nimiq addresses would return the placeholder
  for every account.
- **Caching stays outside the core.** The app's existing bounded LRU in
  `Identicon.tsx` is the right layer for it; putting a cache in a pure core would
  be the memory-growth risk FR-008 exists to prevent.
- **Rendering is out of scope.** The core returns SVG source; turning that into
  pixels remains each platform's job (`react-native-svg` today).
