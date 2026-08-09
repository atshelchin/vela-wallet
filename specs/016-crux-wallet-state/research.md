# Research & Decisions: 016-crux-wallet-state

**Spec**: [spec.md](./spec.md) · **Inventory**: [inventory.md](./inventory.md)

Numbering continues the 011 style: each decision states what was chosen, why,
and what was rejected.

## D1 — Wave-1 scope: three small machines, not the P1 money machines

**Chosen**: Implement `display_currency`, `receive_watch`, `payment_request`;
deliver `send` / `sign_request` / `approval_guard` / `clear_signing` /
`fee_policy` / `tx_tracker` as fully-specified inventory entries for specs 017+.

**Why**: The hard constraint is "break nothing" with e2e that locates by
on-screen text. `useSendController` exposes ~90 fields consumed by three step
components with raw setters (`ConfirmStep` calls `setTxStatus` directly), and
`dapp-connection.tsx` is a 1,073-line provider wired to three transports. Those
integrations are each a spec-sized surface. The analysis's own migration-order
recommendation (`fee_policy` first) optimizes for *core* implementation ease,
but `fee_policy`'s call sites live in platform-shared TS (`safe-transaction.ts`)
used by native — swapping them for wasm calls requires the send-machine
restructuring anyway. The three chosen machines have single-file integration
surfaces, live e2e coverage (`parallel-receive`, `eip681-pay`, `smoke`), and
between them exercise every piece of infrastructure a later spec needs
(KV storage ops, timers, fetch ops, per-app vocabularies, per-app bindings,
resident-ish session for an app-wide hook).

**Rejected**: "Start with `send` because it hurts most" — highest chance of
violating FR-020; also blocked on inventory open question 1 (native strategy),
which is a product/architecture decision this spec must not smuggle in.

## D2 — Per-app operation vocabularies (no shared god-union)

**Chosen**: Each machine defines its own `Operation` / `ShellResult` enums in
its module (`display_currency::protocol`, etc.). Nothing is added to
`app::shell::ShellOperation` (onboarding's vocabulary).

**Why**: The tutorial's boundary rule — an operation is a domain sentence.
A shared union couples every app's wire to every other app's (one variant
rename regenerates all bindings and re-verifies all shells) and grows the
serde monomorphization for every consumer. Six of onboarding's operations were
shared *because both onboarding machines genuinely speak them*; these three
machines share nothing operational.

**Rejected**: Extending the onboarding union (couples wires); a generic
`KvRead/KvWrite/Http` capability layer (crux capabilities are the eventual
home for that, but introducing a capability framework now would change the 011
executor pattern the team already knows — deferred to the spec that migrates a
machine with a genuinely wide I/O surface, likely `rpc_pool`).

## D3 — Bindings generation: one registry script, per-app bins and out-dirs

**Chosen**: Rename the generator flow to `rust/scripts/gen-core-types.mjs`
holding a registry:

```js
const TARGETS = [
  { bin: 'generate_onboarding_bindings',   outDir: 'src/services/onboarding-core/generated' },
  { bin: 'generate_wallet_state_bindings', outDir: 'src/services/wallet-state-core/generated' },
];
```

Each target generates into its own committed directory with the same
byte-for-byte `--check` gate; `npm run gen:onboarding-types` stays as an alias
so muscle memory and older docs keep working. A new
`generate_wallet_state_bindings` bin (feature `bindings`) exports the three
wave-1 apps' roots.

**Why**: FR-016/FR-017 require the onboarding output stay untouched; separate
out-dirs mean separate ownership and no cross-app regeneration churn. The
registry makes machine №4 a two-line diff (SC-006).

**Rejected**: One bin exporting everything into one directory — cross-app churn,
and `export_all` walking shared names (`Operation`) across apps would collide.
Type names are therefore prefixed per app where they'd collide (e.g.
`CurrencyOperation`, `ReceiveWatchOperation`) via `#[ts(rename)]` / distinct
Rust names.

## D4 — wasm bridge: one generic `Bridge`, a per-app trait + declaration macro

**Chosen**: Generalize `vela-core-wasm/src/onboarding.rs`'s private `Bridge<A>`
into `bridge.rs`, generic over the app's effect enum through a 3-line
`SplitEffect` trait (`fn into_shell(self) -> Option<Request<Op>>`), and declare
each exported class with a small `macro_rules!` (`bridge_class!`). The two
onboarding classes are re-declared through the same macro with identical names
and identical wire behavior (dispatch/resolve_effect/view, monotonic effect id,
unknown-id ⇒ report-view-and-change-nothing).

**Why**: The bridge's semantics (stale answers, abort forgiveness) were
reviewed once in 011 and must not fork per app. FR-017 requires onboarding
byte-compatibility — the macro emits the same method surface, and the
onboarding wire is covered by existing e2e.

**Rejected**: Copy-pasting the bridge per app (semantic fork risk); exporting
one class multiplexing all apps (couples lifecycles — a Receive unmount must
not free the currency core).

## D5 — display_currency boundary and lifecycle

**Chosen**: The core owns: atomic `{code, rate}` commit, the
seed-from-device-region decision tree, "user choice wins", and the
`resolveRate` (strict, `Option<f64>`) vs display fallback-to-1 split (FR-007).
The shell owns: rate *sources* (Chainlink → FX endpoint chain stays in
`fiat-rates.ts`/`fiat-fx.ts`, executed for a `ResolveRate` operation), the
currency catalog (names/symbols), number formatting, and the storage key
`vela.displayCurrency` (unchanged).

Lifecycle: **one lazy module-level session** shared by all
`useDisplayCurrency` mounts, mirroring today's module-level `_committed` — the
first machine to outlive a screen. This is deliberately the *smallest* step
toward the resident-core paradigm (no pending timers across screens, no
persistence beyond the one key), and it is what the current semantics already
require: hook instances must share one committed pair.

**Why not per-screen sessions**: each would race its own seed/rate resolution
and re-introduce the exact partial-pairing flicker the module-level pair
exists to prevent.

## D6 — receive_watch: faithful port, including the inactive-tick stop

**Chosen**: Reproduce today's decisions exactly, including two quirks the
analysis flagged:

1. A poll that finds the app backgrounded **stops the watcher for good**
   (today `checkDeposit` early-returns without rescheduling). The shell
   reports activity as part of the fetch result (`inactive` variant); the core
   transitions to `Stopped`.
2. The baseline advances **only when a deposit is detected** — never on a
   no-change or shrunken fetch (so a withdrawal followed by a re-deposit up to
   the old level stays undetected). Recorded as inventory open question 11;
   changing it is a product decision, not a port.

Balance math stays `f64` (`tokenBalanceDouble` semantics) so detection
thresholds are bit-identical to today. The core emits epoch-ms timestamps and
structural entries; the shell formats (this de-hardcodes the `en-US` time
format as a consequence of the boundary — on web, `isAppActive()` is
`document.visibilityState`-based, so both branches are reachable and tested).

**Rejected**: "Fix" the inactive-death or baseline rule in passing — every
behavior change in a money-communication surface needs its own decision record.

## D7 — payment_request: one module, three orthogonal sub-machines

**Chosen**: One `payment_request` app whose model composes three orthogonal
parts (tutorial §5.4): the **acknowledge gate** (per-account, KV-backed), the
**request builder** (asset + amount → EIP-681 URI, pay-link, QR value, copy
payload), and the **/pay validator** (untrusted query → typed
`PayRequest`/`PayLinkError`). The Receive screen's session drives gate +
builder; the `/pay` screen's session drives the validator. Base-unit
conversion is implemented as **decimal-string arithmetic** (pad/shift/trim —
no floats, no bignum, no overflow), shared by both directions so encode and
display can never diverge (FR-012).

The token *catalog* (picker list, `includeZeroBalance` fetch) stays a shell
concern: it is picker UI, and the core only needs the picked asset's facts
(`chain_id`, `token_address?`, `symbol`, `decimals`, `network_name`).
`payLinkBase()`'s `window.location` probe becomes a `base_url` fact the shell
passes at `Start` — the core never touches a browser global.

## D8 — /pay strict amount grammar (defect fix, pinned here)

**Chosen**: The `/pay` `amount` query param must match plain non-negative
decimal `^\d+(\.\d+)?$` **and** have ≤ `dec` fractional digits. Anything else
(`1e18`, `1,5`, `0x10`, negative, over-precision) → `malformed_amount` → the
existing invalid-request surface. Valid inputs produce byte-identical
behavior to today.

**Why each case**: `1e18` crashes today (BigInt SyntaxError in render);
`0x10` is *silently hex-parsed* after zero-padding (`BigInt('0x10'+zeros)`)
into ≈7.5×10⁴ tokens prefilled into a locked Send; over-precision silently
truncates, making the encoded amount differ from the displayed headline. All
three violate "what you see is what is encoded". The EIP-681 *scanner* parse
(`parseEIP681`, tolerant, accepts `2.014e18`) is untouched — it remains in the
send/scan domain (wave 2) and its inputs are QR payloads, not URL bait.

## D9 — Numbers on the wire

**Chosen**: `rate`, balances and USD values cross the boundary as JSON `f64`
(exactly what today's `parseFloat` semantics produce); base-unit amounts cross
as **decimal strings** (the `StoredAssetSim` precedent; JS `bigint` cannot
`JSON.stringify`). No `u64` crosses the wire (the ts-rs `bigint` trap noted in
`shell.rs`'s `Wait { ms: u32 }` comment); epoch timestamps are `f64` ms.
This pre-answers inventory open question 4 for every future machine.

## D10 — Test & regression strategy

- Core: `npm run test:core` — transition-table tests per machine (rule-named,
  011 style), including the race cases: stale rate after `UserChose`, seed
  losing to an explicit pick, shrunken-fetch skip, inactive stop, phase
  boundaries at exactly 60s/300s, `/pay` grammar table, build↔parse
  round-trips.
- Shell: existing jest suites unchanged; `eip681.test.ts` keeps testing the TS
  module (still the native path). New thin tests only where a shell mapping
  has behavior (e.g. `/pay` param → event mapping).
- e2e gate (FR-020): `parallel-receive.spec.ts`, `eip681-pay.spec.ts`,
  `smoke.spec.ts`, `onboarding-verify.spec.ts`, `onboarding-sync.spec.ts` —
  unmodified.
- Drift gates: `gen-core-types.mjs --check`, `build-web.mjs --check`,
  `cargo tree -p vela-core-uniffi` must not contain `crux_core`.

## D11 — wasm size

011 measured +95,288 bytes for the framework against a 343,105-byte headroom
(artifact ~535 KB of the 1,000,000 cap). Wave 1 adds three small apps and two
serde vocabularies but no new framework. Measured after implementation and
recorded here; the gate in `build-web.mjs` remains the hard stop (FR-018).

**Measured**: `build-web.mjs` reports **982,770 bytes** (gate 1,000,000 —
PASS, ~17 KB headroom). The pre-016 artifact was ≈ 820 KB (derived from the
committed base64 length), so the three machines + two vocabularies cost
≈ 162 KB — ~54 KB per machine, dominated by per-app `Core<A>`/serde_json
monomorphization, consistent with 011's +95 KB for its two machines.

**⚠ Consequence for wave 2**: the next machine does NOT fit. Before spec 017
lands anything, it must include a size workstream — candidates: sharing one
serde_json path across bridges, dropping `Debug`/`PartialEq` from wire types
in wasm builds, `wasm-opt -Oz` tuning, or splitting cores into a separately
loaded chunk. Raising `MAX_WASM_BYTES` is not an option (011 FR-030 stands).
The ~17 KB margin also means cross-machine build variance could flip the gate
— if a teammate's `build:wasm` fails the gate on this branch, that is this
measurement's variance, not their error. Recorded as inventory.md open
question 15.

## Landmines carried forward from 011

1. `tsc` resolves `.web.ts` imports to the base `.ts` — platform pairs must
   export matching names (`use-receive-watch.ts` / `.web.ts`).
2. `#[effect]` macro expansion vs the crate's `deny(unwrap/expect/panic)`
   lints — narrowly-scoped `#[allow]` on generated items only, if tripped.
3. Any `.rs` edit requires `npm run build:wasm` and committing `rust/pkg-web/`
   (fingerprint check).
4. Hand-written `INITIAL_VIEW` mirrors in hooks can drift silently — each
   wave-1 hook derives its initial view from the machine's `Default` model via
   a `view()` call at session start instead of a hand-written literal wherever
   possible (the session's `start()` commits the core's own initial view
   before the first event).
