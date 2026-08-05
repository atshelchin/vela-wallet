# Research: Crux-Owned Onboarding State

**Feature**: 011-crux-onboarding-state | **Date**: 2026-08-05

Every decision below was taken against a measured fact or an existing constraint
in this repository. Where a number appears, it was measured on this machine on
2026-08-05, not estimated.

---

## D1 — Does the state-machine framework fit inside the web size budget?

**Decision**: Yes. Proceed with `crux_core` compiled into the existing single wasm
artifact.

**Measurement** (isolated two-crate spike, this repo's release profile —
`lto = true`, `opt-level = "z"`, `codegen-units = 1`, wasm-opt via wasm-pack
0.15, rustc 1.97.1):

| Crate | Contents | wasm bytes |
| --- | --- | --- |
| `spike_base` | wasm-bindgen + serde + serde_json, one exported fn | 84,233 |
| `spike_crux` | same **plus** `crux_core` 0.19 with a complete App (Event/Model/ViewModel/Effect, `Core::process_event`, `Core::resolve`, request/abort plumbing) | 179,521 |
| **Marginal cost of the framework + one machine** | | **+95,288** |

Current committed artifact: **656,895** bytes against the `MAX_WASM_BYTES =
1_000_000` ceiling in `rust/scripts/build-web.mjs:42` — **343,105 bytes of
headroom**. One framework instance plus two machines is expected to land near
+110–150 KB (the framework cost is paid once; the second machine adds only its
own types and transitions), leaving ~190 KB of margin.

**Rationale**: The build script's own comment forbids raising the ceiling
("Switch to the async public/-dir loading route … instead of raising this
limit"), and the founder's instruction is to trim first and escalate rather than
raise it. The measurement retires that risk before any code is written.

**Alternatives considered**:
- *A second, lazily-loaded wasm module for onboarding only.* Rejected: it buys
  nothing at 343 KB of headroom and costs a second `initSync` path, a second
  build artifact and a second `--check` gate.
- *Ship crux only in a dev build.* Rejected: the point is production ownership of
  the rules.

**Measured after implementation** (2026-08-05, both machines + the wasm bridge
linked): **817,738 bytes**, against the 1,000,000 ceiling — **182,262 bytes of
headroom** left. The real cost of the framework plus two complete state machines
was **+160,843 bytes** over the 656,895-byte baseline, above the +95,288 the
one-machine spike predicted: the second machine, the shared operation vocabulary
and ~20 serde-derived result variants each carry their own code. The prediction
was the right order of magnitude and the decision it supported holds.

The 40,905-case conformance corpus still replays green through the shipped
artifact (`npm run verify:wasm`), so the pure kernels are byte-identical in
behaviour.

---

## D2 — Where do the state machines live?

**Decision**: `rust/crates/vela-core/src/app/` — a new module tree behind a
**default-off** cargo feature named `crux`. `vela-core-wasm` depends on
`vela-core` with `features = ["crux"]`; `vela-core-uniffi` does not.

**Rationale**:
- Founder's choice (2026-08-05), and it puts the rules in the crate every
  platform already links, which is what makes specs 007/008/009 able to adopt
  them later.
- `vela-core`'s charter is "pure, deterministic, no I/O, no FFI deps". A Crux App
  is exactly that: it *declares* effects, it never performs them. The charter
  survives.
- Default-off keeps FR-005/FR-029 provable rather than merely intended: with the
  feature off the framework is not in the dependency graph at all, so the iOS
  static library and the Android `.so` cannot change.

**Verification** (must appear in tasks, not just in this document): 
`cargo tree -p vela-core-uniffi | grep -c crux` returns 0, and
`cargo tree -p vela-core-wasm | grep -c crux` returns non-zero.

**Alternatives considered**:
- *A separate `vela-core-app` crate.* Cleaner dependency isolation, but the
  feature gate already delivers the isolation that matters (nothing compiled), and
  a fourth crate adds a workspace member, a second lint config and another
  `--check` surface for no behavioural gain.
- *No feature gate.* Rejected: `crux_core` pulls `facet`, `bincode`,
  `crossbeam-channel` and `futures` into the mobile binaries for code mobile
  cannot execute.

---

## D3 — Explicit stage machine, or async orchestration inside a Command?

**Decision**: An **explicit stage enum in the Model**, advanced by
`ShellResult` → `Event` (the shape `crux-demo`'s `dashboard.rs` uses). No
`async` orchestration blocks.

**Rationale**: Crux 0.19 can express a linear pipeline as one async command
(`request_from_shell(...).await` chained). It reads well, but it hides the
intermediate state *inside a future*: a draft that survives a cancelled
verification, a retry counter, and "which step are we on" would be local
variables rather than model fields. That directly contradicts the two things this
feature exists to buy:
- the resumable draft (FR-007) must **outlive** the failed attempt, and
- every transition must be **independently assertable** (FR-032).

With a stage enum, a test is three lines: build a Model in the stage, feed one
result, assert the new stage. With an async block, the same test needs the whole
pipeline driven from the top.

**Alternatives considered**: async `Command::new(|ctx| async move { … })` for the
upload-retry loop only (three attempts with waits). Rejected for consistency —
the retry counter is business state that the sync-failed screen renders.

---

## D4 — One App or two?

**Decision**: **Two Apps** — `CreateWallet` and `Login` — sharing **one**
operation/result vocabulary (`app::shell::{Operation, ShellResult}`).

**Rationale**: The two flows have disjoint state and disjoint stages; fusing them
would produce a model where half the fields are always `None`. Sharing the
*vocabulary* means the web shell implements **one** effect executor that serves
both cores, and the generated TypeScript has one operation union instead of two
overlapping ones. Six of the eleven operations (passkey support probe, proof
signature, index query, account save, prompt, wait) are used by both flows.

---

## D5 — How does a modal question reach the user?

**Decision**: A **shell operation**, `Prompt { kind, confirmable }`, resolved by
`PromptAnswered { accepted }`.

**Rationale**: Today these are imperative `showAlert(...)` calls, including one
that is a genuine business branch (the recovery offer: *accept* leads to a second
signature, *cancel* ends the flow). Putting the prompt in the ViewModel instead
would force the shell to de-duplicate "already shown" across re-renders — a class
of bug the app has paid for before (the invisible stacked modal, 2026-07-06).
As an operation it inherits effect-id correlation for free, and a prompt that is
never answered simply leaves the flow parked, exactly as today.

The `kind` is a **semantic enum**, never a string of user-facing text (D7).

---

## D6 — Time, randomness and the challenge

**Decision**: The core never asks what time it is. Wall-clock and challenge
material enter as **fields on results the shell already returns**:
`PasskeyRegistered { …, now_iso }`, `ProofSigned { …, now_iso }`. The signing
challenge is minted by the shell inside the ceremony operation, exactly as today
(`'vela-verify-' + Date.now()`, `'vela-recover-' + Date.now()`).

**Rationale**: A `Now` effect would add a round trip per step and make every test
drive a clock. Reporting the observed instant alongside the observation keeps the
core a pure function of its inputs — which is what makes the tests deterministic.

**On the two-signature recovery invariant**: the second signature must be over a
*different* challenge, otherwise the two assertions cannot pin the public key
down. That invariant is enforced by the mathematics, not by trusting the shell:
`recover_public_key_from_assertions` returns `None` when the candidate sets do
not intersect in exactly one key, and the core maps `None` to the "could not
recover" outcome (FR-018). No shell mistake can turn it into a wrong key.

---

## D7 — Copy, translation and the "UI unchanged" requirement

**Decision**: The core emits **semantic enums** (`StatusKey`, `PromptKind`,
`FailureKind`); the web shell maps each variant to the existing `t('onboarding.…')`
key. No user-facing string crosses the boundary except server error detail, which
is already opaque text shown behind a disclosure.

**Rationale**: FR-028 freezes copy and translation keys. A mapping table in the
shell makes "same words as before" a diff a reviewer can read in one screen, and
it keeps 14 locales out of the wasm (the i18n catalogs are deliberately *not*
compiled in — see `vela-core/Cargo.toml`).

**Implementation note**: the mapping must be exhaustive over the enum. The
generated TypeScript union plus a `switch` with a `never` fallback makes a missed
variant a type error rather than a blank status line.

---

## D8 — Keeping the TypeScript wire types honest

**Decision**: Generate them. `ts-rs` (already the mechanism `crux-demo` uses)
behind a `bindings` feature, a `generate_bindings` bin, committed output under
`src/services/onboarding-core/generated/`, and a `--check` mode wired into the
same place the other drift gates live.

**Rationale**: The boundary is JSON. Hand-written mirrors of ~40 variants across
events, operations, results and two view models will drift, and a drifted variant
fails at *runtime*, in a branch the e2e suites do not cover (incompatible
provider, non-discoverable credential). This repo already prefers
generate-and-gate over trust — `verify:i18n`, `verify:identicon`, `build:wasm
--check`, the iOS `.xcfilelist` gate. This is the same pattern.

**Alternatives considered**: hand-written types pinned by sample vectors.
Cheaper to set up, but it detects drift only for variants someone remembered to
sample — the exact failure mode being avoided.

---

## D9 — Web shell plumbing

**Decision**: Port `crux-demo`'s `effect-loop.ts` + `json-wasm-shell.ts` into
`src/services/crux/`, **trimmed** to what this feature needs: no devtools
timeline, no agent-bridge origins, no pending-by-origin accounting. Keep:
effect execution with `AbortController`, cancellation, failure→result mapping,
and view commit.

**Rationale**: The loop is product-agnostic plumbing that two cores (and later
more) share. Copying it wholesale would import an observer/devtools surface with
no consumer in this repo; copying nothing would mean re-deriving cancellation
semantics that `crux-demo` already got right.

**React specifics that must be handled** (each becomes a task):
- The core instance is created once per screen and **freed** on unmount
  (`core.free()`), including React 19 StrictMode's dev double-mount.
- View updates arrive from outside React: commit through `useState` in the loop's
  `onView`, and drop late commits after dispose.
- `initSync` already runs at import of `@/services/vela-core` (web entry). The
  session module imports that facade first so the wasm is initialised before any
  core is constructed.

---

## D10 — How much of the index-upload procedure moves into the core?

**Decision**: All of it. The core issues `IndexCreateRecord`, `IndexQueryRecord`,
`IndexQueryByWalletRef`, `RemovePendingUpload` and `Wait` as separate operations
and owns the decision table between them. The shell's handlers are thin calls to
the existing `PublicKeyIndex.*` client functions.

**Rationale**: The interesting rules are *between* those calls, and each was
bought by an incident:
- a failed `create` is not a failure if `query` confirms the stored key matches
  (covers "already exists" and "write landed, response lost");
- a mismatched stored key **is** a failure;
- the credential record being present is **not** the signal to clear the pending
  entry — only wallet-reference resolution is (issue #89: cleared too early, the
  bundler never saw the key, sponsorship never paid);
- a failed wallet-reference check must not block onboarding.

Leaving `uploadPublicKey()` as one opaque operation would leave four decisions in
TypeScript and make FR-001 false.

**Consequence to manage**: `src/services/public-key-upload.ts` keeps existing —
native uses it, and `retryPendingUploads()` runs it at app launch on every
platform. Two implementations of one decision table now exist. The mitigation is
a shared decision table in `contracts/` plus a core test per row, and a note in
the TypeScript file pointing at it. Convergence happens when native adopts the
core; it is explicitly out of scope here.

---

## D11 — Where the platform split lands

**Decision**: One controller hook per flow, with the standard Expo platform-file
split:

```text
src/hooks/use-create-wallet.ts      # native — today's logic, moved verbatim
src/hooks/use-create-wallet.web.ts  # web    — crux-driven
src/hooks/use-onboarding-login.ts   # native — today's logic, moved verbatim
src/hooks/use-onboarding-login.web.ts
```

The screens import `@/hooks/use-create-wallet` and render from the returned
object. Metro resolves `.web.ts` on web; `tsc` and native resolve the base `.ts`.

**Rationale**: This is the pattern already load-bearing in this repo
(`use-color-scheme`, `file-io`, `polyfills`, and the `vela-core` facade itself).
It makes "native is untouched" mechanically true — the native file is a move, not
a rewrite — and it is what allows the screens to become platform-neutral.

**Type-resolution constraint**: `tsconfig.json` sets no `moduleSuffixes`, so
`tsc` type-checks `.web.ts` files but resolves *their imports* to the base `.ts`
module. Every module the web controller imports must therefore expose the same
export names in its base variant. For the wasm session module that means a
`session.ts` (native) whose functions throw "not available on this platform" —
the same shape `file-io.ts` uses.

**The two hooks must return the identical shape.** A shared
`src/hooks/onboarding-controller-types.ts` declares it, and both implementations
are typed against it, so a divergence is a compile error rather than a
web-only or native-only runtime surprise.

---

## D12 — Regression strategy

**Decision**: The two existing Playwright suites are the acceptance gate and must
not be edited (FR-027). New deterministic Rust tests cover the rules and the
races. No new e2e is added for behaviour that already has one.

**Why this is credible here**: `e2e/onboarding-verify.spec.ts` drives real
`create()`/`get()` ceremonies through a CDP virtual authenticator, and gates
`navigator.credentials.get()` behind a resumable latch to simulate a credential
vanishing between creation and first use — deterministically. That suite already
covers the happy path, the dead-passkey path, the resume-without-second-passkey
rule and the "nothing persisted" invariant; `onboarding-sync.spec.ts` covers the
index-sync failure surface. Those are precisely the paths this refactor is most
likely to break.

**What implementation found** (2026-08-05): both suites were **already red on
`main`**. The last acknowledgment row wraps around inline links, and a
centre-of-box click could land on one — opening a tab instead of ticking the box.
Font-metric dependent, so it was silently environment-specific rather than
reliably broken.

That changed how equivalence had to be shown, and arguably showed it better:
scratch copies differing only in click position were run against **both**
implementations, and both went 3/3. Only then was the one-line position fix
applied to the committed suites (no assertion touched). A gate that cannot be
trusted when red cannot be trusted when green.

**The sign-in gap is now closed too.** Sign-in had no e2e at all, so
`e2e/onboarding-signin.spec.ts` was written: local hit, index hit, two-signature
recovery, recovery declined, and unreachable-index. The recovery test asserts the
recovered address **equals** the address created at the start — the invariant
that makes the index a cache rather than a single point of failure, previously
verified by nothing but hand.

---

## Landmines found while researching

1. **Hermes has no WebAssembly.** The mobile app cannot run this core at all;
   the native path must stay TypeScript. This is the reason for D11, and it is
   the single most important constraint in the feature.
2. **`vela-core` denies `unwrap`/`expect`/`panic` at crate level**
   (`#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]`,
   `#![forbid(unsafe_code)]`). Macro-generated code from `#[effect]` expands
   inside this crate. If the expansion trips a lint, the fix is a narrowly scoped
   `#[allow]` **on the generated item only** — never widening the crate lint.
3. **`build-web.mjs --check` compares a source fingerprint over every `.rs` and
   `Cargo.toml` in `rust/crates/`.** Any Rust edit in this feature invalidates the
   committed `rust/pkg-web/`, so rebuilding and committing that artifact is part
   of the work, not an afterthought.
4. **`wasm-bindgen` glue is patched post-build** to remove `import.meta.url`
   (metro cannot parse it) and the patch *asserts* the pattern exists. New
   `#[wasm_bindgen]` classes do not change that, but a wasm-bindgen version bump
   would — do not bump it in this feature.
5. **Two onboarding entry points**: the `/onboarding` route and the embedded
   dApp-popup flow in `src/app/web-request.tsx`, which passes `onComplete` to
   resume the request that opened it. The completion operation must preserve both
   (FR-031).
6. **`getRelyingPartyId()` is environment-derived** (hostname, or an override the
   WebAuthn proxy extension injects). It stays entirely in the shell; the core
   never learns it, so no core test can depend on a domain.
