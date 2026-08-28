# Research — 019 Live Onboarding

**Date**: 2026-08-24 · **Feature**: [spec.md](./spec.md)

Every decision below was reached by reading this repository (and, where stated, by
running a command). Figures are measured, not estimated.

---

## D1 — Where the state machines actually run, per client

**Decision**

| Client | How the core executes | Cost |
| --- | --- | --- |
| `app-web/vela-wallet` | the committed wasm artifact `rust/pkg-web`, loaded **in the browser, on demand** | new client-side load path |
| `app-ios/VelaWallet` | a new uniffi-exported JSON bridge | new bridge + `crux` on the uniffi crate |
| `app-android/vela-wallet` | the same uniffi bridge | same |
| `app-desktop/vela-wallet` | `crux_core` directly — the crate already depends on `vela-core` by path | one cargo feature |

**Rationale**: these are the only paths that exist. The reference driver
(`src/services/crux/effect-loop.ts` + `src/services/crux/json-wasm-shell.ts`) is already
product-agnostic — it takes any object with `dispatch` / `resolve_effect` / `view` — so
the shape it expects is the shape all four bridges must present.

**Alternatives rejected**: re-implementing the machines per platform (that is the exact
duplication spec 011 was written to end); running the core in a hidden WebView on mobile
(a second JavaScript runtime and an IPC hop for something uniffi already does).

---

## D2 — `crux` on `vela-core-uniffi`, or a second uniffi crate?

**Decision**: turn `crux` on in the existing `vela-core-uniffi`, and rewrite the
invariant it breaks.

Today `rust/crates/vela-core/Cargo.toml` documents:

```
#   cargo tree -p vela-core-uniffi | grep -c crux   # must be 0
#   cargo tree -p vela-core-wasm   | grep -c crux   # must be > 0
```

with the reasoning "web is the only runtime that can execute it (Hermes has no
WebAssembly)". That premise was about the **Expo React Native app**, whose JavaScript
engine could not run wasm. `app-ios` and `app-android` are native Swift and Kotlin; they
have no Hermes and no wasm need — they consume Rust through uniffi. The invariant is
therefore obsolete for them, not violated by them.

**Verified**: `cargo check -p vela-core-uniffi --features vela-core/crux` → exit 0 in 31 s.
`crux_core` builds cleanly in the uniffi dependency graph.

**Still to measure (a task, not an assumption)**: the size delta on
`app-android/.../jniLibs/*/libvela_core_uniffi.so` and
`app-ios/VelaCoreKit/Artifacts/VelaCoreFFI.xcframework`. The plan carries a second uniffi
crate as the fallback if the delta is unacceptable.

**Alternatives rejected**: a second uniffi crate (`vela-core-crux-uniffi`) keeps the
existing binary byte-stable but ships two uniffi runtimes, two `.so`s and two
xcframeworks, and forces a judgement call at every future type about which crate owns it.
Held in reserve, chosen only if the measurement says so.

**Bridge shape**: uniffi objects are `Arc<Self>` and must be `Send + Sync`, so the bridge
holds its `Core<A>` and its outstanding-request map behind a `Mutex`. Methods mirror
`bridge_class!` in `rust/crates/vela-core-wasm/src/bridge.rs` exactly — including its rule
that an unknown effect id means *the answer outlived the question*: return the current
view and change nothing.

---

## D3 — How the desktop client reaches a security key

**Decision**: `hidapi` (Rust bindings, MIT) in `app-desktop/vela-wallet`, filtering for
HID usage page `0xF1D0` / usage `0x01`, 64-byte reports.

**Rationale**: FIDO over USB is HID, not raw USB — on macOS the kernel HID driver owns the
device, so a raw-USB crate (`nusb`, `rusb`) cannot claim it. That leaves per-OS HID APIs:
IOKit `IOHIDManager`, Linux `hidraw`, Windows HID. `hidapi` wraps all three, is mature,
compiles from vendored C via `cc`, and its 2.x API exposes `usage_page`/`usage` on every
platform, which is what the FIDO filter needs.

**To verify in Phase 1 of implementation**: whether the `linux-native` feature (pure-Rust
`/sys` enumeration) removes the libudev link, keeping the Linux build as
dependency-light as `app-desktop`'s existing offline-and-deterministic posture demands
(see the `dotlottie-rs` comment block in its `Cargo.toml`, which rejects a feature purely
because its `build.rs` downloads archives).

**Alternatives rejected**:
- `fido-hid-rs` (from the local `webauthn-rs` checkout) is exactly FIDO-shaped and has
  good per-OS backends, but its own README states it is "an internal implementation
  detail… no guarantees of API stability, and is not intended for use by other parties",
  and it is MPL-2.0. Excellent as a **reference** for the three OS backends; not a
  dependency to bet on.
- `async-hid` is pure Rust and async but young; the desktop client has a background
  executor and does not need async HID.

---

## D4 — Where the CTAP2 protocol lives

**Decision**: a new sans-IO module `rust/crates/vela-core/src/ctap/` — CTAPHID framing,
canonical CBOR command/response encoding for `authenticatorMakeCredential`,
`authenticatorGetAssertion`, `authenticatorGetInfo`, `authenticatorClientPIN`, COSE key
handling, and PIN/UV auth protocols One and Two. Bytes in, bytes out; no transport, no
clock, no randomness.

**Rationale**: three reasons converge. (1) It is the same rule-versus-performance split
the whole repository is built on — the desktop shell should own the USB cable and nothing
else. (2) Feature 020 needs exactly this layer on five platforms; writing it in the shell
now means writing it again later, in four languages. (3) `vela-core` already carries
`ciborium`, `p256`, `sha2` and the whole of `webauthn.rs` (COSE extraction, client-data
validation, low-S normalisation, candidate recovery) — the marginal surface is smaller
than it looks.

New dependencies: `hkdf` and `aes-gcm` (both RustCrypto, pure Rust, `no_std`-capable) for
the PIN/UV protocols. Both are already transitively present in the lockfile's ecosystem
and neither pulls a C toolchain.

**Reference reading, not a dependency** — `/Volumes/data/production2/webauthn-rs`:
`webauthn-authenticator-rs/src/ctap2/commands/*` (complete CTAP2.0/2.1 message
definitions), `ctap2/pin_uv.rs` (both PIN/UV protocols), `usb/framing.rs` (CTAPHID
framing), and `cable/mod.rs:1-291` (the only public write-up of caBLE v2.1, which 020
will need). MPL-2.0 permits reading, using and forking. Two things not to take on:
- **Not a runtime dependency.** Its `ctap2` feature forces `crypto` → OpenSSL, and the
  orchestration layer is async with `futures::executor::block_on` inside synchronous
  trait methods (`ctap2/ctap20.rs:571,599,643,668`). Neither fits a pure core, and
  neither compiles for Android, iOS or wasm.
- **No upstream relationship.** Its README states the project does not and will not
  support blockchain use cases, so no issue or PR of ours will be received. If we ever
  vendor and modify its MPL files, those files must be published under MPL-2.0.

**Conformance oracles**: `/Volumes/data/production2/apppasskeysdemo` (Kotlin CTAP2 client,
four transports) and `/Volumes/data/production2/securitykeys` (Kotlin CTAP2
authenticator) carry byte-level tests with known vectors — RFC 5869 HKDF, canonical CBOR
ordering, Noise KNpsk0 round-trip. Those vectors port straight into Rust tests, giving
the new module two independent implementations to agree with.

---

## D5 — Getting wasm into the browser without breaking the web architecture

**Decision**: load the wasm **lazily, on the first create or sign-in intent**, never on
the Welcome page.

**The constraint**: `app-web/vela-wallet` uses vela-core at *build time only* today —
`src/lib/i18n/wasm-init.server.ts` reads `public/vela_core_bg.<hash>.wasm` from disk and
`initSync`s it while prerendering, and `e2e/welcome-ssr.e2e.ts:145` asserts the deployed
bundle contains no wasm, because the Cloudflare Worker cannot compile wasm from bytes.

**Measured**: the artifact is **3,461,984 bytes** (`public/vela_core_bg.4e0414e01958.wasm`).
It carries all 25 state machines, the i18n engine and the identicon renderer; wasm is not
tree-shaken, so the whole thing arrives or none of it does.

**Consequences accepted**:
- The prerendered, wasm-free Welcome page is unchanged — the 3.4 MB is only fetched when
  a person commits to a flow, behind the loading state the design already has.
- The e2e assertion is rewritten rather than deleted: the **Worker** still ships no wasm
  (the i18n engine stays build-time); the wasm becomes a static asset the **browser**
  fetches on demand.
- `rust/pkg-web` is built `--target web`, so the browser path is `init(WASM_URL)` from the
  generated `vela_core_wasm_url.js` — the same fingerprinted URL the server path uses. A
  build step copies the fingerprinted asset into the app's static output.

**Noted for later, not done here**: a second, onboarding-only wasm target would be a
fraction of the size. That is a build-pipeline feature of its own, and it should be
measured against real load data rather than guessed at now.

---

## D6 — iOS: excluding already-registered credentials

**Decision**: raise the iOS deployment target from **17.0 to 17.4** (both the app target
and `VelaCoreKit`'s `platforms:`).

**Rationale**: FR-011 requires that adding a founding key exclude the keys the address
already depends on — without it a provider can silently replace one and the wallet
becomes unspendable at an address nothing can deploy. On Apple platforms the property
that expresses this for **platform** passkeys,
`ASAuthorizationPlatformPublicKeyCredentialRegistrationRequest.excludedCredentials`, is
new in iOS 17.4 (it has existed longer for *security key* requests). There is no
workaround: a pre-17.4 device cannot express the exclusion at all.

Given the choice between shipping an invariant we cannot enforce and dropping iOS
17.0–17.3, the invariant wins. 17.4 shipped in March 2024.

**Alternative rejected**: allow creation on 17.0–17.3 without exclusion and detect the
duplicate afterwards. The core already refuses a duplicate public key at registration,
so the wallet would not be corrupted — but the person would have burned a passkey prompt
and, worse, on a provider that *replaces* rather than duplicates, the replaced key is
already gone by the time we see it.

## D7 — Android: the same ceremony, as JSON

**Decision**: `androidx.credentials.CreatePublicKeyCredentialRequest(requestJson)` and
`GetCredentialRequest` with `GetPublicKeyCredentialOption(requestJson)`.

**Rationale**: Android's Credential Manager takes and returns WebAuthn JSON verbatim —
`PublicKeyCredentialCreationOptions` in, `registrationResponseJson` out — including
`excludeCredentials`, `authenticatorSelection`, and `attestation`. The client therefore
assembles the same JSON the web path already builds and parses the same response shape,
which makes the Android executor the closest of the four to the reference implementation.
The dependency (`androidx.credentials` + play-services-auth) is already declared in
`app-android/vela-wallet/app/build.gradle.kts`.

**Not available, and accepted**: Android does not surface the `credProps.rk` extension
result. The web path throws `NOT_DISCOVERABLE` when `credProps.rk === false`; on Android
(and iOS) platform credentials are discoverable by construction, so the absence of the
check is not a gap. `FailureKind::NotDiscoverable` remains reachable on those platforms
only through the provider's own error.

---

## D8 — The two acknowledgements

**Decision**: `ACK_COUNT` becomes 2.

1. **Self-custody** — the private keys are held by this device's credential manager;
   Vela cannot recover them.
2. **Terms** — agreement to the privacy policy and the terms of service, with both
   documents linked inline.

The v2 name screen's other two lines ("自托管钱包。私钥由设备的密码管理器保管，不经过
VELA WALLET。" and "丢失设备后，用已添加的其他通行密钥登录。") become **static assurances
with a filled tick**, not checkboxes — which is exactly how the v2 design draws them.

**Rationale**: the core's comment is right that the gate is a business rule; the question
is how many gates the business wants. The founder's answer is two: one that records the
person acknowledged the irreversibility of self-custody, and one that records legal
assent. Four checkboxes measurably reduce comprehension of all four.

**Consequence**: `onboarding.create.ack2` and `ack3` are removed from the corpus in all
15 locales; `ack0`/`ack1` are rewritten to the two above.

---

## D9 — Driving the progress screen from a core that has no clock

**Decision**: three task rows and a percentage, both derived in the client from the
core's reported stage. No timer, no clock in the core.

| Task row | Reported stage | Percentage when active |
| --- | --- | --- |
| 校验通行密钥公钥 | `verifying_identity`, `extracting_key` | 33 % |
| 推导账户地址 | `computing_address` | 62 % |
| 写入密钥索引 | `syncing_key` | 100 % |

Rows before the active one render done, rows after render pending — which is precisely
what the design draws (`✓` / `●` / `○`). The design's own "62%" is the middle row active,
confirming the mapping.

**Dropped**: spec 014's five-segment stepped bar and its >3 s elapsed-seconds ring. The
v2 progress screen has neither — the percentage bar is the "still working" affordance.
The `StepProgress` and `ElapsedRing` components stay in each client's library (the sign-in
flow still uses a single bar); only the create screen stops using them. This is a real
deviation from 014 and is recorded as such.

---

## D10 — The i18n corpus ceiling: a stale worry

**Decision**: no pre-work needed. Add keys normally.

Spec 014's `deviations.md` §8 warns that the `ru` locale sits at 64,300 of a 65,535-byte
`u16` ceiling with ~1.2 KB of headroom, and that "the next corpus growth of this size
likely needs the blob offset format widened".

**That was fixed.** `rust/crates/vela-core/src/i18n/catalog.rs:14-20` documents that the
offset width is chosen **per locale**, and `scripts/gen-i18n.mjs:252-290` implements it —
emitting `u32` for any locale whose blob outgrows `u16` and failing loudly only past
`u32`. Verified in the generated output: `src/i18n_catalogs/mod.rs:132` already constructs
`ru` as `StaticOffsets::U32(&ru::OFFSETS)` while the other fourteen remain `U16`.

The only budget still worth watching is SC-005's residency figure, which measures `ja` +
`en` — both far from any ceiling.

---

## D11 — Carrying the add method into the core

**Decision**: a new `KeyMethod { Platform, Hybrid, SecurityKey }` on
`Event::AddKey`, on `ShellOperation::RegisterPasskey`, and on `CreateKeyRow`.

**Rationale**: the design's add control is a three-way choice and the client cannot run
the right ceremony without knowing which. Putting it on the event rather than in client
state keeps the rule "the client holds no flow state" intact, and putting it on the row
lets the key list render the icon and provider line the design specifies without
re-deriving it from `transports`/`aaguid` heuristics.

The existing `authenticator_attachment`, `transports` and `aaguid` fields are untouched —
they remain what the *authenticator reported*, while `method` is what the *person chose*.
The two can legitimately disagree (a platform choice that resolves to a cross-platform
authenticator), and the row shows the report while the ceremony followed the choice.

**Also**: `Hybrid` exists in the enum from day one even though this feature cannot execute
it, so 020 adds a transport rather than a core type, and so the client can render the
method as present-but-unavailable rather than absent.

---

## D12 — The fifth shell

**Decision**: `src/` — the currently shipping Expo web client — is updated in lockstep
with D8 and D11, and is **not** redesigned to v2.

**Rationale**: it consumes the same core through the same wasm. `ACK_COUNT: 4 → 2` breaks
its acknowledgement list; a new field on `RegisterPasskey` breaks its executor's switch.
Neither is optional, both are small, and leaving them broken would mean the production
web wallet cannot create a wallet — a far worse outcome than any this feature is fixing.
SC-010 makes it a gate.

Its add-method control: the browser already offers platform, cross-device and security-key
choices inside its own passkey UI, so the Expo client sends `KeyMethod::Platform` and lets
the browser present the rest. No UI change.

---

## D13 — The failure catalog survives the redesign

**Decision**: spec 014's eighteen `OutcomeKind` values are re-skinned into the v2 sheet,
not reduced.

The v2 design file demonstrates the sheet with two examples ("验证已取消",
"这台设备上没有可用的通行密钥"). It is a **pattern**, not a catalog — the other sixteen
kinds (network, timeout, server, incompatible, storage, recovery offer, …) still occur and
still need copy. Their strings already exist under `onboarding.common.*` and
`onboarding.create.*`.

Reduced from 014: the `ActionId` list loses the ids that only made sense inside 014's
container, and the technical-details disclosure remains on the outcomes that carry real
diagnostics (publish failure, index failure) rather than on every outcome with a fixture.

---

## D14 — Session, natively

**Decision**: wire `rust/crates/vela-core/src/app/session.rs` on all four clients in this
feature.

**Rationale**: it is not optional scope. `CompleteOnboarding { CompletionMode }` is the
only exit from both machines, and `session.rs` is what receives it
(`Event::AccountEstablished { mode }`), persists the account and the active index, and
exposes `SessionView::allowed_route` as the route guard. Without it, "create a wallet"
ends with the core handing the client a wallet nobody catches — and every manual test
would have to re-run the whole creation because nothing survives a relaunch.

It has its own operation vocabulary (`SessionOperation`, `SessionShellResult`), so each
client's storage layer serves two small executors rather than one large one. The machine
is app-resident — constructed once per process, outliving every screen — unlike the
per-screen create and login machines.

**The trap to avoid**, already documented in
`src/services/wallet-state-core/session-executor.ts:61-70`: mapping `Account` field by
field and dropping `keys` does not merely lose data — the core derives the address from
*all* keys, so a multi-key account stripped to its scalar key is silently "repaired" into
a different, wrong, single-key Safe on every restore. Every mapper on every client carries
`keys`.
