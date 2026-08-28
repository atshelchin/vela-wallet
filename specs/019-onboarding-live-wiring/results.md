# Delivery Report — 019 Live Onboarding

**Branch**: `019-onboarding-live-wiring` · Started 2026-08-24

Filled in as phases land. Baselines first, because "did this grow?" has no answer after
the fact.

---

## Baselines (T002, T003, T004) — recorded 2026-08-24, before any change

### Artifact sizes (T002)

| Artifact | Bytes |
| --- | --- |
| `app-android/…/jniLibs/arm64-v8a/libvela_core_uniffi.so` | 4,342,328 |
| `app-android/…/jniLibs/armeabi-v7a/libvela_core_uniffi.so` | 2,815,036 |
| `app-android/…/jniLibs/x86_64/libvela_core_uniffi.so` | 3,811,840 |
| `app-ios/VelaCoreKit/Artifacts/VelaCoreFFI.xcframework` (whole) | 173 MB |
| └ `ios-arm64/libvela_core_uniffi.a` | 90,715,352 |
| └ `ios-arm64-simulator/libvela_core_uniffi.a` | 90,701,376 |
| `public/vela_core_bg.4e0414e01958.wasm` | 3,461,984 |

These are the T098 comparison points. The Android `.so`s are the honest instrument — the
iOS `.a` is an unstripped debug-symbol-carrying static archive, so its absolute size says
little; its **delta** is still the signal.

### Corpus (T003)

| Measure | Value |
| --- | --- |
| `onboarding` namespace leaves (`en`) | 163 |
| corpus leaves across 15 namespaces | 1,184 |
| SC-005 residency, cold start `ja` | 94,640 bytes of a 135,345 budget (90.4 % below the 990,499-byte whole corpus) |

40,705 bytes of residency headroom. The `u16` blob ceiling that spec 014 warned about is
not a constraint — the generator picks the offset width per locale and `ru` is already
`u32` (research D10).

### Green-before-touching (T004)

| Gate | Result |
| --- | --- |
| `cargo test -p vela-core --features crux,i18n-all` | **1,116 passed, 0 failed** |
| └ `tests/app_create_wallet.rs` | 27 |
| └ `tests/app_login.rs` | 23 |
| └ `tests/app_session.rs` | 31 |
| `cargo test --workspace --features vela-core/i18n-all` | ok |

**Finding worth carrying forward**: `cargo test --workspace --features vela-core/i18n-all`
— the command CI runs — reports **0 tests** for every workspace member, because the
integration suites are `#![cfg(feature = "crux")]` and that feature is not requested. The
81 onboarding tests only run under the explicit
`cargo test -p vela-core --features crux,i18n-all`. Whether CI is genuinely exercising
them, or has been relying on a feature-unification accident that no longer holds, is worth
checking before this feature's core changes land — a regression in `create_wallet.rs`
would currently be invisible to the workspace command.

| `npx tsc --noEmit` (repo root, the Expo client) | exit 0 |
| `npx jest` (repo root) | 196 suites, 2,498 passed, 1 skipped |

Phase 1 complete.

---

## Phase 2 — the core, and everything the core change broke

### What changed

| Change | Where |
| --- | --- |
| `ACK_COUNT` 4 → 2 | `rust/crates/vela-core/src/app/create_wallet.rs` |
| `KeyMethod { Platform, Hybrid, SecurityKey }` | `app/mod.rs`, on `Event::AddKey`, `ShellOperation::RegisterPasskey`, `CreateKeyRow` |
| corpus: 1 removed, 6 renamed, 14 rewritten, 31 added, × 15 locales | `i18n/locales/*/onboarding.json` |
| default passkey index → `p256-index-v2.getvela.app` | `network_admin.rs`, `models/types.ts` (owner instruction, separate commit) |

### Measured

| Measure | Before | After |
| --- | --- | --- |
| `onboarding` namespace leaves (`en`) | 163 | **193** |
| corpus leaves (`en`, 15 namespaces) | 1,184 | **1,214** |
| generated resources, 15 locales | 18,918 | **19,368** (+30 × 15) |
| shared path table | 1,359 (1,280 leaf + 79 branch) | **1,389** (1,310 + 79) |
| SC-005 residency, cold `ja` | 94,640 | **95,976** of 135,345 — 39,369 bytes of headroom |
| wasm artifact | 3,461,984 | **3,466,137** (+4,153) |
| core tests | 1,116 | **1,117** (+1 guard for the new field) |

### Gates

| Gate | Result |
| --- | --- |
| `cargo test -p vela-core --features crux,i18n-all` | 1,117 passed |
| `cargo clippy --workspace --all-targets -- -D warnings` | clean |
| `cargo fmt --check` | clean |
| `gen:i18n` / `lint:i18n` / `verify:i18n` | pass · 69,650 comparisons, zero divergences from i18next |
| `dump:vectors` | regenerated |
| `npx jest` | 196 suites, 2,498 passed |
| `npx tsc --noEmit` | clean |
| `npm run lint` | 0 errors (586 pre-existing warnings, none in touched files) |
| `build:wasm` + `verify:wasm` | 43,018 conformance cases green |
| **`npx playwright test onboarding`** | **8 passed** |

### The corpus lint, and what was fixed rather than baselined

`lint:i18n` flagged two new defect classes. One was avoidable and was fixed; one was not
and was baselined with its reason.

- **A5 `count_without_plurals`** — `create.keyCount` was `{{count}} / {{max}}`, which is a
  *ratio*, not a count, and only tripped the plural heuristic because of the variable's
  name. Renamed to `{{current}} / {{max}}` (matching `common.stepCounter`), which removes
  the defect instead of registering it. That took the new occurrences from 30 to 15.
  The remaining 15 are `create.progressSubtitle`, a genuine count-noun. It is baselined
  rather than given plural forms, because its neighbour `create.successMessage` has the
  same shape and 239 occurrences exist corpus-wide: the class deserves one deliberate
  pass, not a per-feature patch that leaves two adjacent sentences inconsistent.
- **A6 `significant_whitespace`** — all 24 are the `ack3*` → `ack1*` rename surfacing
  already-baselined trailing spaces under new names. Pure rename artefact.

### Two bugs this phase found in its own work

1. **`successMessage` was handed the wrong number.** The sentence was rewritten from "your
   address works on all {{count}} networks" to "any of your {{count}} keys can sign in",
   but the call site still passed `getAllNetworksSync().length` — so a one-key wallet's
   success screen read *"Any of your 12 keys can sign in on its own."* Caught by reading
   the rendered page in an e2e failure, not by any type or test. Now passes
   `flow.keys.length`.
2. **Two different things read identically in English.** `keyDeviceOnlyBadge` was
   shortened to "This device", which is exactly `methodPlatformTitle`. zh keeps them
   distinct (仅本机 vs 这台设备) and English now does too: "This device only".

### The onboarding e2e suite was already red, and is now green

All three onboarding specs failed on a clean tree before this feature — verified by
stashing every change and re-running. They rotted when the multi-key founding set landed
(2026-08-22) and nothing re-ran them since. Three independent causes:

1. **The network stubs knew only the pre-v2 endpoints** (`/api/health`, `/api/create`,
   `/api/query`). The interleaved create→confirm flow calls `POST /api/challenge` in
   member mode once per key, so `requestMemberChallenge` fell through to the catch-all
   JSON-RPC null and the executor read `.challenge` off `undefined` — the whole create
   path died at "Verifying identity…" with an unhandled `startsWith` on every run.
2. **Chrome's virtual authenticator leaves the backup flags clear**, which the core
   correctly reads as a device-bound key — so `needs_second_key` blocked a flow whose
   point was not the second-key gate. Fixed with `defaultBackupEligibility` /
   `defaultBackupState`.
3. **The founding-key list is a new step** the specs walked straight past, and a failed
   membership confirmation now lands there with a per-row `Confirm` retry rather than
   returning to the form's `Finish Verification`.

`onboarding-sync` needed one more change of substance: "block every external host" no
longer produces a sync failure, because it now kills the *challenge* before the publish
exists. It serves health and challenge and kills register/task, which is what the test's
own title claims it does.

**This matters beyond the tests.** These eight tests are the only automated proof that a
real passkey ceremony creates a real wallet — SC-010's evidence. Combined with the Phase 1
finding that `cargo test --workspace` runs zero core tests, two of this repository's three
onboarding safety nets were silently down.

### Phase 2 checkpoint: met

The whole repository — including `src/`, the shipping Expo client — builds, lints and
tests green, and creates and signs in for real under a virtual authenticator.

---

## Phase 3 — Web

### What shipped

| Layer | Where |
| --- | --- |
| effect loop, JSON/wasm adapter, on-demand loader | `src/lib/onboarding/core/{effect-loop,json-shell,wasm-client}.ts` |
| 18-operation executor + passkey / registry / storage / publish | `src/lib/onboarding/core/{executor,passkey,registry,storage,publish,copy,sessions}.ts` |
| the app-resident session | `src/lib/session/core/{session.svelte,executor}.ts` |
| the v2 journey | `src/lib/ui/onboarding/v2/` — flow shell, name, keys, add-method picker, progress, retry, done, prompt sheet |
| its own route | `src/routes/[locale]/create/` |
| sign-in, in place | `src/routes/[locale]/+page.svelte` |
| the state gallery, rebuilt | `src/routes/dev/gallery/` + `src/lib/onboarding/v2-fixtures.ts` |

### Gates

| Gate | Result |
| --- | --- |
| `pnpm check` (svelte-check) | 648 files, 0 errors, 0 warnings |
| `pnpm lint` (prettier + eslint) | clean |
| `pnpm test:unit` | 7 files, **156 passed** |
| `pnpm build` | built; the Worker bundle carries no wasm |
| `pnpm test:e2e` | **43 passed** |

Two e2e assertions were rewritten rather than deleted, and one was added:

- *the DEPLOY bundle contains no wasm* — still true and still checked. The
  onboarding machines are a static asset the CLIENT fetches; a Worker still
  cannot compile wasm from bytes.
- *the Welcome page loads no wasm until someone commits to a flow* — new, and
  the half that actually protects the landing page. 3.4 MB carrying all 25
  machines arrives whole or not at all, so the flow lives behind a route.
- *desktop CTAs swap the action pane in place* → *Create Wallet navigates to the
  flow*. Creating a wallet is a stepped journey and now owns a URL: back works
  and a reload strands nobody mid-ceremony. Signing in has no steps, so it stays
  on Welcome and speaks through the button's busy state.

### Corrections to this feature's own spec

1. **FR-024 was too strong.** "No new tokens" was true of the colours, which I
   checked against `docs/design-tokens.json`, and not of the type scale, which I
   had not: the v2 hero is 46/38 px and the DTCG scale tops out at 40. Six values
   are now declared through the generator's documented `WEB_ADDITIONS`
   mechanism (`text-hero`, `text-heroCompact`, `layout-flowColumn`,
   `layout-welcomeColumn`, `layout-promptCard`, `layout-galleryRail`) rather than
   sprinkled as literals — which is what that mechanism is for, and what spec 018
   used it for.

2. **Research D13 was wrong.** It said spec 014's eighteen `OutcomeKind`s would
   be "re-skinned, not reduced". They cannot be: the core does not express them.
   A transport failure and a 503 both arrive as `CreateFailed { detail }` with
   the platform's own words, so rendering them as distinct screens would mean
   classifying error strings in TypeScript — the one thing this architecture is
   built to prevent. What the core emits is **nine** prompts, and those are what
   the v2 sheet renders. The `onboarding.common.*` taxonomy survives as copy for
   a shell that IS handed a classification; it is not a state the core produces.
   The 014 state model (`states.ts`, `outcomes.ts`, `fixtures.ts`) is deleted
   with the panels it fed.

3. **The v2 Welcome was NOT applied, deliberately.** The design draws Welcome as
   mark + wordmark + hero + two buttons. This app's `/[locale]` is also the
   site's landing page: prerendered in 15 locales, canonical + hreflang, with a
   meta description and six feature cards written for it (spec 006). Deleting
   that is a marketing decision the onboarding design file was not making, so
   the page keeps its content and only its buttons changed. `welcome.heroTitle`
   / `heroSubtitle` are in the corpus and unused on web — the native shells,
   which have no landing page to preserve, will use them. **Needs a founder
   call.**

### Found while wiring

- `FLOW_FORM_KEYS` in `src/lib/i18n/messages.ts` still named `ack3*`, which the
  Phase 2 rename had removed. The build resolves flow copy from that manifest,
  so those four strings would have shipped as their own key names. Caught by a
  scan for dangling corpus keys, not by a test — the manifest is a list of
  strings, and nothing typed it against the corpus.

### The design pass (founder review, 2026-08-25)

Screenshots next to the design file showed the first implementation had drifted
in ways the gates could not see. Every gate was green and the screens were still
wrong. Fixed:

**Welcome**

| Design | First pass | Cause |
| --- | --- | --- |
| headline breaks across two lines | one line | the break was dropped as "text-wrap will handle it"; it will not, and should not — where a line breaks is a per-locale decision |
| the two ways in sit at the BOTTOM of the frame | directly under the subtitle | `align-items: center` + `flex: 0 1 auto` collapsed the column to its content height, so `space-between` had nothing to distribute |
| the two buttons share the row equally | already correct | — |

The break now lives in the corpus as a newline and renders with
`white-space: pre-line`, so each locale chooses its own — a Chinese line length
is not a German one. The design's own `<br>` would have exported Chinese line
breaks to fifteen languages.

**Name screen**

| Design | First pass |
| --- | --- |
| 「给钱包起个名字」 | 「创建钱包」 — the flow's label, reused as the screen's title |
| placeholder 「日常钱包」 | 「为您的账户输入名称」 |
| no helper line under the field | a helper line |
| custody gate → recovery assurance → terms gate | custody → terms → assurance |
| accent-coloured policy links | default underlined |
| field label small, uppercase, letter-spaced | 13 px semibold |

The placeholder change is the one worth naming: an EXAMPLE of a good answer
explains a field better than an instruction under it, which is why the design
shows one. `create.nameTitle` is a new corpus key (+1 leaf × 15 locales); the
old `accountNameHint` stays in the corpus, unused.

**What this says about the gates.** Type checks, lint, unit tests and 43 e2e
assertions all passed on a Welcome page whose headline was on the wrong number
of lines and whose buttons were in the wrong place. Nothing in the suite
compares a rendering to the design; `e2e/welcome-visual.e2e.ts` harvests
screenshots for a human to look at, and no human had. Worth remembering before
trusting "all gates green" as a statement about fidelity.

### The same pass over the remaining screens

The founder's review named two screens; the drift was a pattern, so the rest
got the same treatment.

**Key list** — three fixes, one of them serious:

- The provider line rendered `transports` verbatim: rows read
  **«internal,hybrid»**, **«usb»**. That is a machine's comma-joined wire list
  shown to a person reading their own key list. It now resolves from the
  METHOD through `providerLineFor` — 平台通行密钥 / 通行密钥 / 安全密钥. The design
  draws a richer line still («macOS · 密码 App», «YubiKey 5C · USB»), which needs
  the AAGUID resolved to a provider name and model over the network; the flow
  does not make that call, and this is the honest version of the same fact
  until it does.
- The three key glyphs shared a height and read as one rounded box. Proportion
  is the entire signal — a wide laptop, a tall phone, a squat key — because a
  person picks the row that looks like the thing in their hand.
- 确认 and 移除 sat side by side as two accent-weight text buttons, competing
  with each other and with the badge. The design gives a row ONE trailing slot:
  the retry now takes it (a key that has not confirmed has no status to show
  yet), and remove is a quiet × after it. The design draws no remove affordance
  at all — but the core lets a draft key be dropped, and without one the only
  way out of a mistaken key is starting the whole set over. Recorded as a gap in
  the design rather than resolved by inventing a control.

**Done screen** — the identicon was blank in the gallery. Not a bug in the
screen: the gallery renders fixture VALUES and never constructs a machine, so
the wasm was never initialised and `identiconSvgCircular` (vela-core's nimiq
identicon, seeded through the core's own `identiconNormalizeSeed` per spec 003's
drift rule) threw into the degrade path. The gallery now loads the core without
running any machine, so it draws what production draws. A gallery that showed a
blank circle where production shows artwork would be lying about the one thing
it exists to be honest about.

---

## Phase 4 — the CTAP2 module

`rust/crates/vela-core/src/ctap/`: framing, commands, PIN/UV. Bytes in, bytes
out — no clock, no randomness, no transport, checked by grep rather than
assumed.

| Piece | Tests |
| --- | --- |
| `hid.rs` — CTAPHID framing both directions | 14 |
| `commands.rs` — makeCredential / getAssertion / getInfo, status codes | 14 |
| `pin_uv.rs` — protocols One and Two | 11 + 4 known-answer |

Core suite 1,145 → **1,160**. clippy `-D warnings` and fmt clean.

**`ctap/cose.rs` was not written.** The task list called for one; `webauthn.rs`
already extracts the COSE key from attested credential data, and the CTAP path
reaches that code through `attestation_object()`. A second COSE module would be
a second answer to the same question, which is the thing this repository is
organised to avoid.

**The load-bearing test** is `a_reassembled_attestation_object_is_indistinguishable_from_a_browser_one`.
A real CTAP2 attestation object from the conformance vectors is taken apart into
the three fields a `makeCredential` response carries, reassembled by the new
encoder, and handed to the parsers the **browser** path already uses. They must
return the same public key and the same versioned attestation — including the
backup-state flag the second-key gate reads. If that drifts, a desktop-minted
key and a browser-minted key derive different addresses from the same
authenticator, and the wallet is two wallets.

**Known answers, not round trips.** A round trip proves the module is
self-consistent; it does not prove it is doing AES-256-CBC or HKDF-SHA-256.
Wiring the wrong HMAC into HKDF, or CBC-ing in the wrong direction, round-trips
perfectly and produces a token no authenticator will ever accept. So: NIST
SP 800-38A §F.2.5 for CBC-AES256, RFC 5869 Test Case 1 for HKDF-SHA-256, and a
published SHA-256 for the PIN hash.

**Dependencies**: `hkdf` 0.13, `hmac` 0.13, `aes` 0.9, `cbc` 0.2 — the same
RustCrypto generation as the `sha2` 0.11 the core already uses. Mixing
generations would pull a second copy of every trait crate. Measured
consequences: the wasm artifact went 3,466,137 → **3,466,071 bytes** (66 SMALLER
— the module is unreachable from the wasm bridge and is eliminated), and
`cargo tree -p vela-core-uniffi | grep -c crux` is still 0.

**Not yet done in this module**: the ECDH exchange (it needs randomness, so the
shell mints the key pair and hands over the shared X), `authenticatorClientPIN`
request/response encoding, and the `getPinUvAuthTokenUsingPinWithPermissions`
sequence. Phase 5 needs them before a security key with a PIN can be used.

---

## Phase 5 — Desktop

### What shipped

The desktop client creates and enters a wallet through a USB security key. It
is the first client with no system passkey service, so it performs the CTAP2
ceremonies itself — over `vela_core::ctap`, which is why there is no second
implementation of the protocol anywhere in the repository.

| Layer | File | What it owns |
| --- | --- | --- |
| driver | `core_host.rs` | `CoreHost<A>` — typed, no bridge, no JSON |
| cable | `ctap/usb.rs` | hidapi enumeration, 64-byte reports, KEEPALIVE |
| ceremonies | `executor/passkey.rs` | makeCredential / getAssertion, the PIN session, the ECDH |
| index | `executor/registry.rs` | the six registry calls, both `queryUnit` guards |
| storage | `executor/storage.rs` | one JSON file, the four shared keys |
| switch | `executor/mod.rs` | the 18 onboarding operations + the 7 session ones |
| screens | `onboarding.rs`, `onboarding_flow.rs`, `outcome.rs` | v2 Welcome, the five steps, the sheet |
| bridge to the UI | `ceremony.rs` | "touch your key", "type your PIN" |
| session | `session.rs`, `main.rs` | app-resident, `allowed_route` |

### The core grew first

Phase 4 deliberately left three things out of `ctap/`. Two of them landed here,
because a security key with a PIN cannot be used without them:
`authenticatorClientPIN` encoding and parsing (`ClientPin`, `parse_client_pin`,
`Permissions`) and the token sequence (`encrypt_pin_hash`, `decrypt_token`,
`PinUvAuthToken`). The third — the ECDH exchange — stayed out on purpose and is
in the shell, where the randomness is.

**No COSE module was written for the platform key, either.** The x/y-and-
on-curve check came out of `webauthn.rs` as `p256_from_cose_key`, and both
paths call it: an attested credential's public key and a `getKeyAgreement`
response are the same structure arriving by different roads. That shared check
is also the guard that stops an off-curve point from producing a shared secret
whose structure an attacker chose.

Core suite **1,160 → 1,170**.

### Research D3, measured

D3 asked whether hidapi's `linux-native` feature removes the libudev link. It
does not:

| Feature | Adds |
| --- | --- |
| `linux-native` | `udev` 0.9.3 + **`libudev-sys` 0.1.4** |
| `linux-native-basic-udev` | `basic-udev` 0.1.2 (pure-Rust `/sys` walk) |

Both skip cc-compiling the vendored hidapi C; only the second drops the
`libudev-sys` link and with it the `libudev-dev` build requirement, which is
what the offline-and-deterministic posture actually asks for. hidapi's
`build.rs` re-exports `feature="linux-native"` for it, so the same backend code
runs either way. `cargo tree --target x86_64-unknown-linux-gnu | grep -c
libudev-sys` is **0**.

### Deviation: ten outcomes on the sheet, not eighteen

Research D13 said spec 014's eighteen `OutcomeKind` values would be re-skinned
rather than reduced. Their COPY was re-skinned — every corpus key survives — but
eight of them are no longer sheets, because v2 gave them somewhere better:

| 014 outcome | v2 |
| --- | --- |
| `Created` | the Done screen |
| `SignedIn` | the wallet itself |
| `SyncFailed` | the Retry screen, with the whole key list intact |
| `VerifyStuck` | the Name screen, with the 完成验证 submit label |
| `CancelledSetup` / `CancelledVerify` / `LoginCancelled` | the Name screen's quiet status line |
| `AccountNotFound` | a `sign_in_failed` prompt carrying the registry's words |

Keeping all eighteen as sheet variants would have meant eight enum arms nothing
constructs — and, worse, would have kept 014's premise that a cancellation with
a filled-in form behind it is a modal. data-model §5 already says it is not.
`src/outcome.rs` carries the table above so the mapping is findable.

### Two things the core does not know about, and where they went

A CTAP2 ceremony has two moments that belong on screen and no place in
`ShellOperation`: **the key is blinking**, and **this key wants its PIN**.
Neither is a `PromptKind`, because neither is a decision a machine branches on —
they are facts about one piece of hardware on one desk, and pushing them into
the core would ask three clients that never touch an authenticator to carry a
concept they cannot have.

They travel on `ceremony.rs` instead. The ceremony thread BLOCKS while asking
for a PIN, which is deliberate: it is holding the device open, the PIN session
is per-connection, and releasing it to go and ask would spend one of a small
number of attempts on a retry nobody refused. The PIN is cached for the flow
(three keys on one authenticator would otherwise ask three times), dropped the
instant an attempt is refused, and dropped again when the flow closes.

### The `wait` operation is not cancellable, and that is checked

`core_host.rs` documents why it has no `cancelled_effect_ids` list: the
machines keep one operation in flight per pipeline and stamp each request with
the attempt that asked, so a superseded answer is dropped by the CORE on
arrival. A desktop executor implementing cancellation would be implementing a
path the core never takes.

### Gates

```
cd app-desktop/vela-wallet
cargo check                                  # clean
cargo clippy --all-targets -- -D warnings    # clean
cargo fmt --check                            # clean
cargo test                                   # 56 passed, 2 ignored
cargo test -- --ignored                      # 2 passed (network)
```

Desktop tests went 37 → 56. The nineteen added are the ones that would
otherwise need hardware to notice:

- **The join with the browser path.** The clientDataJSON this client builds is
  accepted by `webauthn::validate_client_data` on both ceremonies, and
  `build_member_proof` finds its `"type"` and `"challenge"` offsets. If this
  drifts, a desktop-minted key signs fine and the registry accepts a proof whose
  offsets point at the wrong bytes.
- **The storage invariant.** A three-key account round-trips with three keys.
  Also: a legacy record keeps its empty `keys`, saving twice upserts rather than
  appends, a corrupt file reads as empty, a negative active index fails closed,
  and a sign-out leaves the pending-upload outbox AND the endpoint alone.
- **The one bit of classification a shell owns.** Only a status code means the
  server answered; `HostNotFound` is a request that never arrived.
- **The screen table.** data-model §3's mapping, including that
  `setting_up_identity` and both cancellations stay on the Name screen.

### What was checked in place of the hardware sweep

This build host has no FIDO2 key and no screen-recording permission — it can
neither press a key's button nor take a picture. What it can do:

- **`scripts/sweep-gallery.sh`** opens all **26** gallery states once each
  (`VELA_GALLERY_STATE=<n>`) and checks the process survives a frame in every
  one. A duplicate gpui element id, a panicking layout or a corpus key that
  resolves to nothing kills it. All 26 rendered.
- **The deployed registry, reached for real.** `cargo test -- --ignored` runs
  the health probe against `p256-index-v2.getvela.app` and a query for an
  unregistered key. Both pass, so the service identity this client accepts is
  still the one the server sends — a rename there would make every wallet report
  the index unreachable while it answers perfectly.
- **The default route.** The binary launches on onboarding, runs the health
  probe, and writes nothing to `VELA_STATE_DIR` until a wallet exists.
- **"No key plugged in" is support, not unsupport.** `supported()` asks whether
  HID is REACHABLE, and the test asserts it on this key-less host. Answering
  `false` for an empty USB port would make the core raise "this device cannot
  create a wallet" — untrue, and with no way back. A missing key arrives later
  as `not_supported` with a message naming it, which is the sheet the recovery
  path starts from.

### A bug Phase 5 found in Phase 4's status mapping

`Status::from_byte` had the PIN codes crossed. CTAP 2.1 §6.3 numbers three
adjacent errors `PIN_BLOCKED` (0x32), `PIN_AUTH_INVALID` (0x33) and
`PIN_AUTH_BLOCKED` (0x34); Phase 4 read 0x33 as blocked and 0x34 as
retry-the-PIN, and did not name 0x32 at all.

The consequence is a sentence, and it is the wrong one at the worst moment: a
key that had hit its blocked state would be offered a PIN retry loop it can
never satisfy, and a `pinUvAuthParam` that failed to verify — a CLIENT fault —
would tell somebody their security key is locked. A locked key's only exit is a
RESET, and a reset destroys the wallet's founding credential.

Fixed, with every byte pinned in `the_five_pin_codes_are_five_different_sentences`.
0x35 `PIN_NOT_SET` and 0x2b `UNSUPPORTED_OPTION` gained their own `PinNotSet`
status, because a key with no PIN cannot be helped by asking for one; 0x33 now
keeps its number so a bug report names it.

The shell acts on the same fact one step earlier: `verifiable()` reads `getInfo`
and refuses a key with neither a PIN nor a biometric BEFORE the ceremony, so a
brand-new key out of its box says "set a PIN with the manufacturer's tool"
instead of costing a touch to answer `UNSUPPORTED_OPTION`.

Core suite 1,170 → 1,171; desktop 54 → 56.

### Still unverified — T089 and T091

**Nothing below has been run against a security key.** These are the claims a
person with a YubiKey has to check, and the order to check them in:

1. **The create flow with no key plugged in.** Expect `not_supported` with
   "No security key is plugged in", and expect plugging one in and retrying to
   work — that is the whole reason `supported()` does not look for a device.
2. **One key, quickstart scenario 1.** Watch for the touch prompt appearing on
   the `KEEPALIVE` rather than immediately.
3. **A key with NO PIN.** Expect "set a PIN with the manufacturer's tool"
   before any touch is asked for — this is the fix above, and it is the case a
   key straight out of its box lands in.
4. **A key with a PIN.** The dialog should name the key and show the remaining
   attempts. Type it wrong once on purpose: expect one attempt spent, the count
   down by one, and the dialog back — not a failed ceremony, and NOT the word
   "locked".
5. **Two keys, scenario 2.** The second registration must be REFUSED by the
   same authenticator (`excludeList` doing its job → "use a different one").
6. **Scenario 4 and the one-signature path (T089).** One touch at sign-in, not
   two.
7. **Scenario 6**, the publish retry.

The riskiest untested surface is the report-id byte in `usb.rs::write`: a device
that uses report ids would need the first byte to be its id rather than zero,
and getting it wrong presents as an authenticator answering `INVALID_COMMAND` to
everything. FIDO devices do not use report ids, so zero is right — but that is
reasoning, not a measurement.


---

## Phase 5, on real hardware — what a plugged-in FIDO2 key found

The founder ran the desktop build on a Mac with a security key attached. Three
things were wrong and one thing was missing. **Sign-in worked on the first try**,
which is the load-bearing result: the HID enumeration, the CTAPHID framing, the
CTAP2 `getAssertion`, the registry lookup and the account restore all work
against a real authenticator on macOS. Everything below is above that line.

### 1. "Device not supported" on the first press of 继续

`passkey::register` refused any `method` that was not `SecurityKey`. But the
first founding key is minted from the Name screen, BEFORE the key screen that
offers methods exists, so the core sends `KeyMethod::default()` — the platform
authenticator — and `create_wallet.rs` says exactly what a shell is supposed to
do with it:

> `Default` is the platform authenticator, and a shell with none of its own
> (desktop) **overrides it at the ceremony**.

The guard was written as a defence against "a future caller" and instead
contradicted the contract it was meant to honour, on the only path a person can
actually take. The method is ignored at the ceremony now and still travels to
the core, which is what the contract asks for.

### 2. `zsh: trace trap` — the poll cancelling itself

`tick()` runs inside the ceremony-poll task, and it set `self.watcher = None`
when both machines went idle. That drops the `Task` handle for the task
currently executing; gpui cancels a task when its handle drops, and
self-cancellation aborts the process. It reproduced on dismissing the failure
sheet, which is precisely when the machines go idle.

Fixed by detaching the task and keeping a bool. The loop ends by RETURNING,
never by having its handle dropped.

**The general shape is worth keeping:** a gpui `Task` handle held in the state
that its own future mutates is a self-cancellation waiting to happen.

### 3. The sheet was reading mobile copy

`not_supported` rendered `onboarding.common.unsupportedBody` — "This device has
no usable biometric authentication." True of a phone with its fingerprint reader
turned off; a non-sequitur on a desktop, which has no biometric path at all and
never asked for one. It now pulls `onboarding.create.securityKeyRequiredBody`,
which the corpus already carried for this exact case.

Related: a key row's provider line was keyed off the METHOD, so the first key —
a USB key wearing the platform default — read "Platform passkey". It reads the
authenticator's own report first now, which is what `CreateKeyRow`'s three
report fields are for.

### 4. The one-way door

Signing in worked and then stranded the user. `SessionView::allowed_route` sends
a signed-in desktop to the wallet, and **no control anywhere could send it
back** — the desktop wallet page has no sign-out row, which this file had
already recorded as a known gap. Recording it did not make it less of a trap:
wiring a route guard without wiring its exit produces an app you cannot leave.

The wallet sidebar now carries the sign-out row and the core's confirmation.
`pending_upload_warning` is the session machine's answer after it asks storage,
not the screen's guess, and the dialog does not open until it has one. Esc
dismisses. Copy is `settings.signOut.*`, already translated in all fifteen
locales — **no corpus change**. `settings.signOut.desc` is deliberately skipped:
it ends "your passkey stays in Face ID / fingerprint", and on this platform the
passkey is on the key in the person's hand.

Pinned by tests, in `session.rs`: `Boot → AccountEstablished → SignOut →
SignOutConfirmed` returns `allowed_route` to `Onboarding` and a relaunch agrees;
cancelling changes nothing; an unconfirmed public key raises the warning.

### What this changes about T091

Scenario 1's first half is now known-good on real hardware in one direction:
sign-in. Creation had never been reached, because it failed at the first press.
The remaining list in "Still unverified" stands, and the ORDER matters more now
— item 1 (no key plugged in) and item 3 (a key with no PIN) are the two that
were never exercised, and item 2 is the one that just got its first real run.

Desktop tests 56 → 61.

---

## Phase 6 — the uniffi bridge (T095–T100)

### What shipped

`rust/crates/vela-core-uniffi/src/onboarding_bridge.rs` — three uniffi objects
(`CreateWalletCore`, `LoginCore`, `SessionCore`) with the surface the web has had
since spec 011: `dispatch(eventJson)`, `resolveEffect(effectId, resultJson)`,
`view()`, all JSON in and JSON out.

The generic half is a straight port of `vela-core-wasm/src/bridge.rs`, and the
correlation rules are the same three, in the same order, for the same reasons:
monotonic ids, an unknown id means the answer outlived the question, a `resolve`
error means the command was aborted before the answer arrived. Two things differ,
and only because the language forces them:

| | wasm | uniffi |
| --- | --- | --- |
| Mutation | `&mut self`, single-threaded | `Mutex` per core — an exported object is `Send + Sync` and its methods take `&self` |
| Errors | `JsValue` | `CoreError::Internal`, the crate's existing flat error |

A poisoned lock is **reported, not recovered**. It means a previous dispatch
panicked mid-mutation, and continuing over a half-updated model is how one bug
becomes a wrong wallet address.

### T098 — the size delta, and the decision it gates

The raw `.so` is not the number that ships; the Android Gradle Plugin strips debug
symbols on packaging. So the honest instrument is a **stripped** comparison, and
producing one meant rebuilding the pre-change tree (`git stash`, build, strip) —
the T002 baseline was recorded unstripped.

| arm64-v8a `libvela_core_uniffi.so` | Bytes |
| --- | --- |
| Baseline, stripped (no `crux`) | 2,369,528 |
| With `crux`, stripped | 3,155,392 |
| **Delta** | **+785,864 (+33.2 %)** |

Unstripped, for continuity with the T002 table:

| Artifact | T002 baseline | Now | Delta |
| --- | --- | --- | --- |
| `jniLibs/arm64-v8a/…so` | 4,342,328 | 6,979,424 | +2,637,096 |
| `jniLibs/armeabi-v7a/…so` | 2,815,036 | 4,392,996 | +1,577,960 |
| `jniLibs/x86_64/…so` | 3,811,840 | 6,059,000 | +2,247,160 |
| `VelaCoreFFI.xcframework` (whole) | 173 MB | 238 MB | +65 MB |
| └ `ios-arm64/libvela_core_uniffi.a` | 90,715,352 | 124,468,120 | +33,752,768 |

The iOS `.a` is an unstripped debug-symbol-carrying static archive that the linker
dead-strips into the app binary; its absolute size has never meant anything and its
delta means less than the Android figure. **+768 KiB per ABI, stripped, is the number.**

**Decision: proceed. Do not take the second-crate fallback** — and the measurement
is what says so, in a direction worth naming. The fallback in
[research D2](./research.md) was held in reserve "if the delta is unacceptable", but
it cannot *reduce* shipped bytes: a second uniffi crate keeps the existing `.so`
byte-stable by shipping a **second** `.so` beside it, so the app carries 2.37 MB plus
a crux-bearing library plus a duplicate uniffi runtime. It is strictly larger. The
fallback buys isolation, not size, and nothing here asked for isolation.

Recorded in `rust/crates/vela-core/Cargo.toml` and `rust/README.md` as the gate that
replaced the old prohibition (T099): a future change that moves +785,864 materially
is a decision to take again, not a diff to wave through.

### T099 — the invariant that stopped being true

```
cargo tree -p vela-core-uniffi | grep -c crux   # must be 0
```

This rule was **correct about the runtime it was written for and wrong about the
one it was applied to**. Its stated reason was "web is the only runtime that can
execute it (Hermes has no WebAssembly)" — a fact about the Expo React Native
client, whose JavaScript engine genuinely cannot load wasm. `app-ios` and
`app-android` are native Swift and Kotlin: no Hermes, no wasm, Rust only through
uniffi. The rule was obsolete for them, not violated by them.

Keeping it would not have protected anything. It would have obliged the two native
clients to re-implement the onboarding rules by hand — the precise duplication
`vela-core` exists to prevent, and the one this whole feature is about ending.

Rewritten in both places to say what replaced it: a measurement instead of a
prohibition, plus the half that is still an invariant
(`cargo tree -p vela-core-wasm | grep -c crux # > 0`, verified: 3).

### T100 — the smoke harnesses

Both harnesses now drive a real create-wallet dispatch through the bridge, and both
stop short of `register_passkey`: performing that needs Credential Manager and an
Activity on Android, AuthenticationServices and a presentation anchor on iOS, and
neither exists in a JVM or command-line harness. What they do assert:

- filling the form produces **no effect at all** (it is pure model), and leaves
  `can_submit` true;
- `submit` produces exactly one effect, `check_passkey_support`, with id `1`;
- answering it leads to `generate_group_key`;
- **rule 2**: re-answering a resolved id produces no work and does not move the
  view, and does not throw — a bridge that threw here would turn every raced
  ceremony on a phone into a crash;
- a malformed event throws `invalid event from shell`, because a shell bug must be
  loud;
- `LoginCore` start probes the index, and a fresh `SessionCore` is in `loading`.

| Gate | Result |
| --- | --- |
| `cargo check -p vela-core-uniffi` | exit 0 |
| `cargo clippy -p vela-core-uniffi --all-targets -- -D warnings` | exit 0 |
| `rust/scripts/build-ios-xcframework.sh` | exit 0 |
| `rust/scripts/build-android.sh` | 3 ABIs |
| `rust/scripts/smoke-kotlin.sh` | 43,063 conformance cases + bridge green |
| `rust/scripts/smoke-swift.sh` | 43,063 conformance cases + bridge green |

### Deviation: "commit `rust/bindings/`" cannot be done

T097 asks for `rust/bindings/swift/` and `rust/bindings/kotlin/` to be committed.
They are **gitignored by an existing repo rule** (`rust/.gitignore:2 bindings/`), as
is `app-ios/VelaCoreKit/Artifacts/` — both are build outputs regenerated by the two
build scripts. The one generated file that *is* committed is
`app-ios/VelaCoreKit/Sources/VelaCore/vela_core_uniffi.swift`, which
`build-ios-xcframework.sh` copies into place; it carries the three new classes and
is in this commit. The task text assumed a layout the repo does not have.

---

## Phase 7 — Android (T105–T121)

### What shipped

`feature/onboarding/core/` is the whole outside world: `CoreDriver` over the uniffi
bridge, `PasskeyExecutor` over `androidx.credentials`, `RegistryClient` over
`HttpURLConnection`, `AccountStore` over DataStore, and the eighteen-operation
`OnboardingExecutor` + seven-operation `SessionExecutor`. `feature/onboarding/flow/` is
the v2 journey: `FlowShell` + Name / Keys / Progress / Retry / Done, each rendering
`CreateView` and nothing else.

**The spec-014 presentation types are deleted, not adapted.** `CreatePanelState`,
`LoginPanelState`, `OutcomeSpec` and their `CreatePanel`/`LoginPanel` renderers were a
second model of one flow — and the gallery drove THEM while the app drove nothing, so a
fixture could look right in the gallery and wrong in the app with no test able to notice.
Every fixture now goes through the same `screenFor` the app does.

### The failure contract, and the check the compiler cannot do

The bridge is JSON, so the eighteen-way branch is a `when` over strings rather than the
desktop's `match` over an enum. `OnboardingExecutorTest` is that check: every operation
name must produce a failure variant, and an unknown one must throw rather than answer.
An operation with no failure variant leaves the core waiting forever, which presents as a
spinner that never stops and no error anywhere.

### Gates

| Gate | Result |
| --- | --- |
| `./gradlew :app:testDebugUnitTest` | **64 passed, 0 failed** |
| `./gradlew :app:assembleDebug` | green |
| `DesignTokenDriftTest` | green (inside the suite) |
| T117 — `assetlinks.json` | **verified live**: `200`, lists `app.getvela.wallet` with `delegate_permission/common.get_login_creds` and three SHA-256 fingerprints, one of which is this host's debug keystore (`24:EA:D0:…:4A:B0`) |

Android tests went 51 → 64.

### The build environment, twice

`./gradlew` picked up a JRE from a VS Code extension and failed on a missing `jlink`;
every command here runs with `JAVA_HOME` pinned to the JDK 17 install and
`--no-configuration-cache` (AGP 9 cannot serialize `JdkImageInput`). Worth knowing before
the next person spends twenty minutes on it.

### Three bugs a real Android found

The emulator run is in this feature's second Android commit; in short:

1. **`UnsatisfiedLinkError` at launch.** The packaged `.so` predated the three
   `registry_*` uniffi functions while the generated Kotlin already called them.
   `-PvelaSkipRustBuild` is what let the bindings and the binary drift a whole feature
   apart. The same drift then appeared on iOS an hour later — see the deviations file.
2. **A link that looked tappable and was not.** The two policy phrases inside the consent
   sentence were accent-coloured, on a row whose entire area is the checkbox's touch
   target. Emphasis now, with the real links on a line of their own.
3. **System back left the app** from an open gallery fixture instead of returning to the
   list.

### What the emulator DID prove

- The WebAuthn JSON this client builds is accepted by the real Credential Manager, and
  the wallet name reaches the system sheet.
- `setting_up_identity` renders as the Name screen's status line, not as a progress
  screen — `data-model §3`, confirmed by eye.
- **Cancelling the system passkey sheet lands back on the Name screen with the form
  intact and a quiet "设置已取消。"** — the v2 behaviour spec 014 drew as a modal, and the
  single most-taken failure path in the whole flow.
- Every gallery fixture renders, in `zh` and in `ru`.

What it could not prove: a completed registration. The emulator has no enrolled passkey
provider, so Credential Manager offers only the hybrid QR path. See deviations §9.

---

## Phase 8 — iOS (T125–T142)

### What shipped

The same shape as Android in Swift: `Features/Onboarding/Core/` (driver, passkey,
registry, store, both executors, the app-resident `SessionController`) and the five v2
screens in `CreatePanel.swift`. The 014 presentation types are deleted here too; two
fragments survived because both are genuinely the shell's — `ActionId` (two cases, routing
an inline link tap) and `TechDetails`.

`I18nKeys.swift` (T137) ends iOS being the one client with no centralised key file. It was
tolerable at six inline literals and stops being tolerable at the ~100 this feature needs:
a typo now fails to compile instead of rendering its own key path at a person, and the
audit can find every key by reading one file.

### T125 — the deployment target, and why both halves move together

`ASAuthorizationPlatformPublicKeyCredentialProvider`'s `excludedCredentials` landed in
17.4, and a founding key set cannot be built without it: registering a second passkey with
no exclude list lets the provider silently REPLACE the first, and the Safe address depends
on every key in the set — so the wallet would derive to an address nothing can deploy.
`IPHONEOS_DEPLOYMENT_TARGET` (4 sites) and `Package.swift` moved together; a package
allowing 17.0 while the app requires 17.4 compiles and then fails to link on the older
runtime it claimed to support.

### T138 found a blocker rather than confirming one

`VelaWallet.entitlements` was an **empty dict**. Without
`com.apple.developer.associated-domains` the passkey provider refuses every ceremony for
`getvela.app` — the entire feature inert on a device, while building and passing tests
perfectly. The other half was already live and correct:

```
GET https://getvela.app/.well-known/apple-app-site-association  → 200, application/json
{"webcredentials":{"apps":["F9W689P9NE.app.getvela.VelaWallet", …]}, "applinks":{…}}
```

and `PRODUCT_BUNDLE_IDENTIFIER` / `DEVELOPMENT_TEAM` match it exactly. Both halves are in
place now.

### Gates

| Gate | Result |
| --- | --- |
| `node scripts/gen-tokens.mjs --check` | tokens in sync |
| `node scripts/audit-literals.mjs` | clean, 71 files |
| `xcodebuild … build test` | **BUILD SUCCEEDED · TEST SUCCEEDED — 107 passed, 0 failed** |

iOS tests went 84 → 107.

### T142 — not verified by eye

The app builds, installs, launches and stays alive on the iOS 26.2 simulator (PID alive
under `launchctl`, no crash report), and the 107 tests run inside that simulator. The
simulator's **display never rendered** on this host: `simctl io screenshot` returned the
springboard across a SpringBoard restart and a full device erase. **Every iOS screen is
therefore unverified visually.** No physical iPhone was available either.

---

## Phase 9 — Polish & cross-cutting (T145–T151)

### T145 — cross-client address agreement, done differently and more strongly

The task asks for a multi-key wallet created on one client and signed into on the other
three. The property behind SC-003 is not really about four devices: all four clients derive
the address by calling `compute_safe_address_multi` in `vela-core`, so what has to agree is
the four SURFACES that one function is reached through. Four people with four phones would
be testing the same function four times and calling it evidence.

The golden multi-key Safe is now pinned in all four, from the same three parallel-space
fixture keys:

| Surface | Address |
| --- | --- |
| Rust — `app-desktop` links `vela-core` directly | `0x88cCA0EeDbF2C4426110bbFc998F048689266894` |
| wasm — `app-web`, browser extension | same (`src/__tests__/services/passkey-fixture.test.ts`) |
| uniffi Kotlin — `app-android` | same (`rust/harness/kotlin/Harness.kt`, added here) |
| uniffi Swift — `app-ios` | same (`rust/harness/swift/main.swift`, added here) |

A derivation change is now a conscious edit in four places rather than a silent drift in
one. The end-to-end walk still wants doing once hardware allows — it would catch a
*storage* or *wire* divergence this check cannot.

### T146 — the locale sweep

Mechanically, over all **161** onboarding keys the two native clients reference:

> all 15 locales cover every referenced key, none empty, none echoing its own name

By eye, on the Android emulator: `zh` through the live create walkthrough, and `ru` —
which carries the longest bodies after `de` — through the key list at its 7-key cap and
the recovery-offer sheet (158 characters, the longest Russian string in the set). Nothing
overflowed; the "Синхронизирован" badge fits its capsule and both CTAs fit their pills.

### T147 / T148 — the two superseded documents

- `specs/011-crux-onboarding-state/contracts/onboarding-core.md` now carries a supersession
  header naming what drifted: `index_create_record` / `index_query_record` / `wallet_ref`
  and a four-variant `CreateStage`, against the shipped eighteen operations and
  `Form | AddKeys | SyncFailed | Created`. Its title was also no longer true — "↔ Web
  Shell" was accurate when web was the only runtime that could execute the machines.
- `specs/014-onboarding-flow-ui/deviations.md` now says which of its items stopped
  describing shipped UI, item by item — including that the elapsed-ring "unify the sweep"
  follow-up is moot, because the ring is gone from the create flow entirely.

### T151 — every gate, one last time

| Shell | Gate | Result |
| --- | --- | --- |
| core | `cargo test -p vela-core --features crux,i18n-all` | **1,172 passed, 0 failed** |
| core | `cargo clippy --workspace --all-targets` + `cargo fmt --check` | clean |
| core | `rust/scripts/smoke-kotlin.sh` | 43,063 conformance + bridge + golden Safe |
| core | `rust/scripts/smoke-swift.sh` | 43,063 conformance + bridge + golden Safe |
| desktop | `cargo check` · `clippy -D warnings` · `fmt --check` · `cargo test` | clean · clean · clean · **66 passed** |
| web (`app-web`) | `svelte-check` | **650 files, 0 errors, 0 warnings** |
| web (repo root) | `npx tsc --noEmit` · `npx jest` | exit 0 · **196 suites, 2,498 passed, 1 skipped** |
| Android | `:app:testDebugUnitTest` · `:app:assembleDebug` | **64 passed, 0 failed** · green |
| iOS | `gen-tokens --check` · `audit-literals` · `xcodebuild build test` | in sync · clean · **107 passed, 0 failed** |

Test counts across the feature: core 1,116 → 1,172 · desktop 37 → 66 · Android 51 → 64 ·
iOS 84 → 107.

### What is left

`deviations.md` §9 is the honest list. In one line: **no create has been completed end to
end on real hardware on any client.** Desktop reached sign-in on a security key (Phase 5);
Android reached the real Credential Manager sheet and the cancel-recovery path on an
emulator with no passkey provider; iOS ran and was never seen. Everything that can be
checked without a finger on an authenticator has been.

---

## On real hardware, 2026-08-25 — a Galaxy S22 and an iPhone 11

The founder connected both devices over USB. Everything below happened in about
twenty minutes, and **none of it could have been found any other way** — the
emulator, the simulator and 1,400 tests were all green through all three bugs.

### The first create that finished

| Step | Device | Result |
| --- | --- | --- |
| Create a wallet | Galaxy S22 (`SM-S901U`, Android 15) | wallet home with a real address and a core-derived identicon |
| Sign out | same | back to Welcome, both CTAs live |
| Sign back in | same | **one passkey selection → the wallet.** T119 |

The system passkey picker listed every Vela credential the device had minted —
`tonyp`, `daddy 🧑`, a CJK-named one — all under Google Password Manager, which is
what `residentKey: required` + `requireResidentKey: true` is FOR (issue #1). A
non-discoverable credential would not have appeared there at all.

### Bug 1 — the manifest still claimed to be offline

```
Permission denied (missing INTERNET permission?)
```

`AndroidManifest.xml` said, in as many words, `<!-- No permissions: this slice is
fully offline (spec FR-012). -->`. That was true of spec 014 and stopped being
true the moment onboarding was wired to the registry — five of the eighteen
operations reach `p256-index-v2.getvela.app`.

The failure order is what makes it serious: **minting the passkey SUCCEEDED**, and
only the membership confirmation failed. The person is left holding a credential
in their provider for a wallet that does not exist.

`ACCESS_NETWORK_STATE` is deliberately *not* requested alongside it. The shell's
one job in classifying a failure is `network` — did the request reach the server —
and that is answered by what the call did, not by what the radio claims. A
connectivity check says "connected" behind a captive portal and "no network" on a
working VPN, and either answer puts the wrong sheet in front of somebody.

### Bug 2 — the one-way door, on both phones this time

Phase 5 found it on desktop and fixed it there:

> Signing in worked and then stranded the user. `SessionView::allowed_route` sends
> a signed-in desktop to the wallet, and **no control anywhere could send it
> back**. […] wiring a route guard without wiring its exit produces an app you
> cannot leave.

Both phones shipped without an exit, and the founder hit it on iOS a minute after
their first successful create. The desktop's lesson had been *recorded* and not
*generalised* — which is the failure mode worth naming, because the fix took ten
minutes and the recording had been sitting in this very file for a day.

The Settings tab has existed since spec 015 with an `onSelect` hook nothing used.
It is the way out now, on both phones, with the session machine's own
confirmation sheet and its `pendingUploadWarning`.

### Bug 3 — the one-way door replaced by a dead end

After signing out, **both Welcome buttons were disabled.** `login.rs` parks in
`Stage::Completing` forever after a successful sign-in — deliberately, because
the machine is done and will never act again — and `busy` is derived as
`stage != Idle`, so it reads `true` from then on. Welcome renders `busy` as a
disabled CTA.

The machine was right. Rendering "done" as "working" was the bug, and a finished
machine is dropped now rather than kept to disable buttons on the next visit.

### Also fixed from the same session

The Name screen's policy-link row was clipped against the CTA with the keyboard
up: `adjustResize` was necessary and not sufficient, and `imePadding()` is what
keeps the scrolling region and the pinned button apart.

### What is still not done

| Task | State |
| --- | --- |
| T089 / T091 — desktop with a FIDO2 key | blocked, unchanged: no key on this host |
| T121 — Android scenarios 2, 3, 7 | untried: the second-key gate, cross-client address agreement, publish-failure recovery |
| T140 — the iOS one-signature sign-in | needs a finger on the iPhone |

Scenarios 1, 4, 5 and 6 are done on Android; the numbering above is
`quickstart.md`'s, not the shorthand used earlier in this file.

### The iOS screenshot path, solved

`simctl io screenshot` returns the springboard on this host, and
`idevicescreenshot` needs a Developer Disk Image mounted through lockdown — which
iOS 17+ replaced with a personalized DDI over CoreDevice's tunnel that
libimobiledevice does not speak. Both dead ends are recorded because the next
person will try them in that order.

`VelaWalletUITests/ScreenshotSweepTests` sidesteps both: the screenshot is taken
BY the test process running on the device, so nothing is captured host-side and
no TCC prompt is involved. **Nineteen screens off a physical iPhone 11**, one
launch per fixture, extracted with `xcresulttool export attachments`. The command
is in the file's header comment.

Every iOS screen has now been looked at. What it shows: the flow renders
correctly in dark mode and Chinese, the identicon is derived from the address,
the seven-key list, all five journey screens and five prompt sheets are right.
⚠ Two cosmetic notes for the founder: at the seven-key cap the last row is
clipped mid-glyph by the scroll edge (honest scroll behaviour, but it reads as
broken at rest), and the dev gallery's list rows render in system blue rather
than house style.

Gates after the fixes: Android **64 passed, 0 failed** + `assembleDebug` green;
iOS `BUILD SUCCEEDED` + `TEST SUCCEEDED`, `audit-literals` clean.

---

## Against a real YubiKey, 2026-08-25

A FIDO2 key was plugged into the build host, so T089/T091 stopped being blocked
and became two tests instead of a manual walk — which is the better shape, since
a manual walk is not a gate.

### `a_plugged_in_key_answers_get_info` — no touch required

This is the measurement this file asked for and could not take:

> The riskiest untested surface is the report-id byte in `usb.rs::write` […]
> FIDO devices do not use report ids, so zero is right — **but that is reasoning,
> not a measurement.**

It is a measurement now. An `INIT` that allocates a channel and a `getInfo` that
parses proves the report-id byte, the 64-byte framing, the init/continuation
split and the canonical CBOR decoder all agree with real silicon:

```
product: YubiKey FIDO+CCID
versions: ["U2F_V2", "FIDO_2_0", "FIDO_2_1_PRE", "FIDO_2_1", "FIDO_2_3"]
pin protocols: [2, 1]
resident key capable: true
client pin set: true
```

The three assertions are the three facts the create flow branches on: CTAP2 at
all, resident-key capable (a founding key that is not discoverable signs fine and
never appears in a picker), and at least one PIN/UV protocol.

Worth noting for feature 020: this key advertises **`FIDO_2_3`**.

### `register_then_assert` — one touch, which is the claim

The full round trip through the app's own `passkey::register` / `passkey::assert`,
counting touch prompts. Its load-bearing assertion is T089's sentence:

```
assert_eq!(for_assertion, 1,
    "signing in asked for {n} touches; T089 says it must be exactly one \
     (two means the common path regressed to recovery)")
```

It also checks that the attestation yields a 32/32-byte P-256 point, because the
address derivation, the on-chain verifier and two-signature recovery are all
ES256 and none of them would work otherwise.

**Waiting on a PIN.** The key has one set (8 retries), and the PIN belongs to the
person at the desk rather than to this repository, so it comes from the
environment:

```bash
VELA_TEST_PIN=… cargo test register_then_assert -- --ignored --nocapture
```

Run without it, the test does something useful anyway: the PIN request returns
`None`, the ceremony reports `Cancelled`, and that is the "declined the PIN"
path behaving correctly.

### T140 — done

The founder verified the iOS one-signature sign-in on the physical iPhone 11:
我已有钱包 raises **one** passkey prompt and lands on the wallet.

---

## Closing — 2026-08-25

### Every gate, at the close

| Shell | Gate | Result |
| --- | --- | --- |
| core | `cargo test -p vela-core --features crux,i18n-all` | **1,172 passed, 0 failed** |
| core | `clippy -D warnings` · `fmt --check` | clean |
| core | `smoke-kotlin.sh` · `smoke-swift.sh` | 43,063 conformance + bridge + golden Safe, each |
| desktop | `cargo test` | **70 passed, 0 failed, 5 ignored** |
| desktop | `clippy -D warnings` · `fmt --check` | clean |
| desktop | `cargo test -- --ignored` | 3 pass without a PIN (2 network, 1 CTAP `getInfo`); 2 wait on one |
| web (`app-web`) | `svelte-check` | **650 files, 0 errors, 0 warnings** |
| web (repo root) | `tsc --noEmit` · `jest` | exit 0 · **196 suites, 2,498 passed** |
| Android | `testDebugUnitTest` · `assembleDebug` | **64 passed, 0 failed** · green |
| iOS | `gen-tokens --check` · `audit-literals` · `xcodebuild build test` | in sync · clean · **109 passed** |

Test counts across the feature: core 1,116 → 1,172 · desktop 37 → 70 ·
Android 51 → 64 · iOS 84 → 109.

### Verified on real hardware

| Claim | Where |
| --- | --- |
| Create a wallet end to end | Galaxy S22, Google Password Manager |
| Sign in costs ONE passkey prompt | Galaxy S22 **and** iPhone 11 (T119, T140) |
| Sign out returns to Welcome with live CTAs | Galaxy S22 |
| Cancelling a ceremony keeps the form and the draft | Galaxy S22, emulator |
| Founding keys are discoverable | the system picker listed every one |
| CTAPHID framing, report-id byte, CBOR | YubiKey `FIDO_2_3`, no touch needed |
| Every iOS screen, by eye | 19 screenshots off the iPhone 11 |
| Sign-in on a security key | Mac + YubiKey (Phase 5) |

### What a human still has to do

Three items, all needing a finger or a second device. None is a code gap.

1. **`VELA_TEST_PIN=… cargo test register_then_assert excluded_credential_is_refused -- --ignored`**
   on the Mac with the YubiKey. Closes T089 and most of T091: the touch count,
   the attestation's P-256 point, and the exclude-list refusal.
2. **T091's two remaining hardware states** — a key with NO PIN set (the
   "set one with the manufacturer's tool" path), and a PIN typed wrong once
   (the attempt count must go down by one and the word "locked" must not
   appear). Both need a second key or a PIN reset, so neither is scriptable.
3. **T121's Android scenarios 2, 3 and 7** — the second-key gate with a
   device-only key, cross-client address agreement against a second client, and
   publish-failure recovery with the network cut mid-flow.

### What this feature actually changed

Four clients stopped having four opinions about onboarding. The create and login
rules live in `vela-core` and are reached by four routes — directly on desktop,
through wasm on web and the extension, through the uniffi bridge on iOS and
Android — and the golden Safe address is now pinned on all four so a derivation
change cannot drift on one.

The bugs worth remembering are in `deviations.md` §11, as classes rather than
incidents: a comment that documented an obsolete invariant, a lesson recorded
but not generalised, and a view field read outside its lifecycle.

---

## The matrix, at the close — 2026-08-28

T178's record: platform × method × (create, sign-in), each cell **pass** with its
evidence, **unavailable** with its reason, or **not exercised** by name. "app-owned"
cells consult no domain association and no Google service (FR-009c).

| Platform | This device | USB security key | Scan (caBLE) |
| --- | --- | --- | --- |
| **Web** | pass — browser sheet; the golden e2e suite drives create and sign-in | browser sheet (same ceremony, the browser arbitrates) | browser sheet QR |
| **Android, GMS** (S22, Xiaomi) | pass — create + sign-in via Credential Manager (2026-08-25/26); Samsung Android 15 sign-in capped by the CredMan parcel ceiling at ~50 stored wallets — platform defect, documented in deviations and reportable to Google, create unaffected | pass — app-owned CTAP over USB host, YubiKey 5C as FIRST key, three clean runs (2026-08-26); assert likewise | responder role proven daily; initiator on GMS devices rides the system sheet's cross-device route — *not separately exercised* (the app-owned client below is the same code) |
| **Android, GMS-free** (OnePlus 5T) | unavailable with reason — no provider; the CredMan provider-configuration exception reroutes to the app-owned paths | pass — app-owned CTAP (2026-08-26), now behind the insert-key waiter with the OTG hint (2026-08-28) | **pass — full sign-in E2E on a device with no Google services (2026-08-28)**, behind the Bluetooth-enable and location gates |
| **iOS** (iPhone 15 Pro) | pass — ASAuthorization platform provider, in daily use through create/sign-in/recovery | pass at YubiKey firmware **5.8+** (app-owned FIDO over CCID, device-verified 2026-08-28); firmware 5.7 does not offer FIDO over CCID — unavailable with reason, the spec's floor is real | pass — app-owned client, BLE-only L2CAP **and** WebSocket tunnel, recovery's full two-signature chain (2026-08-28) |
| **Desktop, macOS** | unavailable by design — gpui has no platform-authenticator API (spec matrix ⛔) | pass — CTAP2 over USB HID, the founding path since Phase 5, one-touch assert pinned on hardware (2026-08-25) | pass — QR + btleplug scan + tunnel, E2E against an iPhone and an Android responder (2026-08-27) |
| **Desktop, Windows / Linux** | *not exercised* — no built client has run on either; the spec matrix's columns describe the design, and closing them is future work, not a silent claim | *not exercised* | *not exercised* |

Android NFC (IsoDep over the core's `ApduCable`) has its cable in the core and no
shell transport — deliberately out of this feature's task list; the matrix row it
would fill stays honest by not existing.

### The final human sweep (closes T091 / T121 / T142)

Everything below is the residue of three older sweep tasks, consolidated. One
pass each, tick and date them here:

- [ ] Desktop: start create with NO key plugged in, recover from that state by
  plugging one in (T091's last scenario)
- [ ] Android: a two-key founding set on device; the endpoint sheet opened and
  a custom registry URL round-tripped; one publish retry exercised (T121's
  scenarios 3 / 5 / 6)
- [ ] iOS: quickstart scenarios walked once on the iPhone 15 Pro — create,
  sign-in, sign-out, recover (T142's sweep, on current hardware)

When those three boxes are ticked, every task in `tasks.md` is closed and 019
is done.
