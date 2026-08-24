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
cargo test                                   # 54 passed, 2 ignored
cargo test -- --ignored                      # 2 passed (network)
```

Desktop tests went 37 → 54. The seventeen added are the ones that would
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

### Still unverified — T089 and T091

**Nothing below has been run against a security key.** These are the claims a
person with a YubiKey has to check, and the order to check them in:

1. **The create flow with no key plugged in.** Expect `not_supported` with
   "No security key is plugged in", and expect plugging one in and retrying to
   work — that is the whole reason `supported()` does not look for a device.
2. **One key, quickstart scenario 1.** Watch for the touch prompt appearing on
   the `KEEPALIVE` rather than immediately.
3. **A key with a PIN.** The dialog should name the key and show the remaining
   attempts. Type it wrong once on purpose: expect one attempt spent, the count
   down by one, and the dialog back — not a failed ceremony.
4. **Two keys, scenario 2.** The second registration must be REFUSED by the
   same authenticator (`excludeList` doing its job → "use a different one").
5. **Scenario 4 and the one-signature path (T089).** One touch at sign-in, not
   two.
6. **Scenario 6**, the publish retry.

The riskiest untested surface is the report-id byte in `usb.rs::write`: a device
that uses report ids would need the first byte to be its id rather than zero,
and getting it wrong presents as an authenticator answering `INVALID_COMMAND` to
everything. FIDO devices do not use report ids, so zero is right — but that is
reasoning, not a measurement.
