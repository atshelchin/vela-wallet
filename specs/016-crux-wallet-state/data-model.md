# Data Model: 016-crux-wallet-state

**Spec**: [spec.md](./spec.md) · **Decisions**: [research.md](./research.md)

Three machines, each with its own module under
`rust/crates/vela-core/src/app/`, each with a private `Model`, a serde-tagged
`Event`, a per-domain `Operation`/`ShellResult` pair (D2), and a semantic
`ViewModel`. All enums: `#[serde(tag = "type", rename_all = "snake_case")]`
(fieldless enums: plain `rename_all`). All machines drop stale results via the
011 `attempt` pattern: every `ShellCompleted { attempt, result }` carrying an
attempt other than the model's current one is ignored without a state change.

---

## Machine 1: `display_currency`

The pair every money-showing surface reads. Source of truth today:
`src/services/currency.ts` (module globals `_code`, `_seedPromise`),
`src/hooks/use-display-currency.ts` (module global `_committed`).

### Model

```rust
struct Pair { code: String, rate: f64 }

enum Phase {
    Idle,                       // nothing in flight
    LoadingStored,              // ReadStoredCode in flight
    ResolvingDisplay { code: String },   // rate for a known choice
    ReadingDevice,              // first-launch seed: device region probe
    ResolvingSeed { candidate: String }, // strict rate check for the seed
    RecheckingStored { candidate: String, rate: f64 }, // race re-read before persisting the seed
}

struct Model {
    committed: Option<Pair>,    // None ⇒ render USD/1 (never stored-code/1)
    phase: Phase,
    attempt: u64,
}
```

### Events

| Event | Meaning |
| --- | --- |
| `refresh` | Screen focus / first mount — re-read the stored preference |
| `user_chose { code }` | Explicit pick in Settings. Bumps `attempt` (kills any in-flight seed) |
| `shell_completed { attempt, result }` | internal, `#[serde(skip)]` on attempt as in 011 |

### Operations → Results

| Operation | Result(s) | Shell executor |
| --- | --- | --- |
| `read_stored_code` | `stored_code { code: Option<String> }` | `AsyncStorage.getItem('vela.displayCurrency')`; error ⇒ `None` |
| `write_stored_code { code }` | `code_written` | best-effort setItem (errors swallowed, as today) |
| `read_device_currency` | `device_currency { code: Option<String> }` | expo-localization primary locale; `None` on web/regionless |
| `resolve_rate { code }` | `rate_resolved { code, rate: Option<f64> }` | Chainlink → FX endpoint chain; `None` = unpriceable now |

### Transition table

| State | Input | New state | Effect |
| --- | --- | --- | --- |
| any, `Idle`-ish | `refresh` | `LoadingStored` (attempt++) | `read_stored_code` |
| `LoadingStored` | stored `Some(code)` | `ResolvingDisplay{code}` | `resolve_rate{code}` |
| `LoadingStored` | stored `None`, committed already seeded this session | `Idle` | render (no re-seed churn) |
| `LoadingStored` | stored `None` (first time) | `ReadingDevice` | `read_device_currency` |
| `ResolvingDisplay{code}` | `rate_resolved{rate}` | `Idle`, commit `{code, rate.unwrap_or(1.0)}` | render |
| `ReadingDevice` | `None` / `"USD"` / non-`[A-Z]{3}` | `Idle`, commit `{USD, 1}` | render |
| `ReadingDevice` | `Some(cand)` | `ResolvingSeed{cand}` | `resolve_rate{cand}` |
| `ResolvingSeed{cand}` | rate `None` | `Idle`, commit `{USD, 1}` | render (key stays absent → retried next launch) |
| `ResolvingSeed{cand}` | rate `Some(r)` | `RecheckingStored{cand, r}` | `read_stored_code` (the user may have picked meanwhile) |
| `RecheckingStored{cand, r}` | stored `None` | `Idle`, commit `{cand, r}` | `write_stored_code{cand}` + render |
| `RecheckingStored{..}` | stored `Some(code)` | `ResolvingDisplay{code}` | `resolve_rate{code}` (their pick wins; seed not persisted) |
| any | `user_chose{code}` | `ResolvingDisplay{code}` (attempt++) | `write_stored_code{code}` + `resolve_rate{code}` |
| any | stale `shell_completed` | unchanged | none |

**Invariants** (each is a test): commit is the *only* place `committed`
changes and always writes code+rate together; a seed never persists without a
real rate; `user_chose` makes every in-flight seed result stale; an absent key
is never written by anything but a successful seed or an explicit choice.

### ViewModel

```rust
struct CurrencyView {
    code: String,        // "USD" until a commit
    rate: f64,           // 1.0 until a commit
    committed: bool,     // false ⇒ the USD/1 placeholder
}
```

Shell derives `symbol` from the TS currency catalog and keeps `fmt`
(formatting is locale, not business).

---

## Machine 2: `receive_watch`

Deposit detection while Receive is open. Source of truth today: the
`useEffect` at `ReceiveScreen.tsx:93-154`.

### Constants (core-owned)

`FAST_INTERVAL_MS = 3_000`, `SLOW_INTERVAL_MS = 60_000`,
`FAST_PHASE_MS = 60_000`, `TOTAL_LISTEN_MS = 300_000`.

### Model

```rust
struct TokenSnapshot {           // shell maps APIToken → this
    id: String,                  // tokenId(tk) — the baseline key
    symbol: String,
    chain_id: u32,
    balance: f64,                // tokenBalanceDouble semantics (D6)
    price_usd: Option<f64>,
}

struct DepositItem { symbol: String, amount: f64, chain_id: u32, usd: Option<f64> }
struct DepositEntry { at_epoch_ms: f64, items: Vec<DepositItem> }

enum Phase { Awaiting,           // a fetch is in flight
             Waiting,            // a Wait op is in flight
             Stopped }           // 5min elapsed, or an inactive tick (D6)

struct Model {
    started_at_ms: Option<f64>,  // stamped from the first result's now_ms
    baseline: Option<Vec<TokenSnapshot>>,   // advances ONLY on detection (D6)
    deposits: Vec<DepositEntry>, // newest first
    phase: Phase,
    attempt: u64,
}
```

### Events / Operations

| Event | Meaning |
| --- | --- |
| `start` | Screen opened (session is per-address; a switch builds a new session) |
| `shell_completed { attempt, result }` | internal |

| Operation | Result(s) | Shell executor |
| --- | --- | --- |
| `fetch_tokens` | `tokens_fetched { tokens, now_ms }` \| `fetch_failed { now_ms }` \| `inactive` | checks `isAppActive()` FIRST (as today); if active, `fetchTokens(address, {forceRefresh: true})`; rejection ⇒ `fetch_failed` |
| `wait { ms }` | `waited { now_ms }` | `setTimeout` |
| `signal_deposit` | `signalled` | `hapticSuccess()` |

### Transition table

| State | Input | New state | Effect |
| --- | --- | --- | --- |
| fresh | `start` | `Awaiting` (attempt++) | `fetch_tokens` |
| `Awaiting` | `inactive` | `Stopped` | render (faithful to today's silent stop, D6) |
| `Awaiting`, no baseline | `tokens_fetched` | schedule | baseline := tokens (no report) |
| `Awaiting` | `tokens_fetched` with `tokens.len() < baseline.len()` | schedule | none (chain likely failed — no diff, D6) |
| `Awaiting` | `tokens_fetched`, some `balance > prev` (missing-from-prev ⇒ prev = 0) | schedule | prepend entry, baseline := tokens, `signal_deposit` + render |
| `Awaiting` | `tokens_fetched`, no increases | schedule | none — baseline NOT advanced (D6) |
| `Awaiting` | `fetch_failed` | schedule | none |
| `Waiting` | `waited` | `Awaiting` | `fetch_tokens` |
| any | stale result | unchanged | none |

**schedule** (pure): `elapsed = now_ms − started_at_ms`; `≥ 300_000` ⇒
`Stopped` (render); else `wait { ms: elapsed < 60_000 ? 3_000 : 60_000 }`,
phase `Waiting`.

### ViewModel

```rust
struct ReceiveWatchView {
    detected: bool,
    deposits: Vec<DepositEntry>,   // shell formats amount/usd/time per locale
}
```

---

## Machine 3: `payment_request`

Three orthogonal sub-machines in one module (D7): acknowledge gate, request
builder, `/pay` validator. Sources today: `ReceiveScreen.tsx:39,57-70`
(gate), `ReceiveRequestControls.tsx` (builder), `PayScreen.tsx:44-96` +
`services/eip681.ts` build half (validator).

### Model

```rust
struct Asset {                    // facts of the picked asset (catalog stays shell)
    chain_id: u32,
    token_address: Option<String>,
    symbol: String,
    decimals: u32,
    network_name: String,
}

enum Gate { Loading, Unacknowledged, Acknowledged }

enum Mode { Address, Request }

struct PayRequest {               // the validated /pay landing state
    recipient: String,
    chain_id: u32,
    token_address: Option<String>,
    amount: Option<String>,       // human decimal, display == encoded (D8)
    amount_base: Option<String>,  // decimal string, string-shift arithmetic (D9)
    symbol: String,               // display hint; "tokens" fallback as today
    decimals: u32,
    network_name: String,         // "Chain {id}" fallback as today
}

enum PayParse { NotOpened, Invalid, Valid(PayRequest) }

struct Model {
    // gate
    account: String,
    gate: Gate,
    // builder
    base_url: String,             // shell-provided origin + /pay (D7)
    recipient: String,
    mode: Mode,
    asset: Asset,                 // defaults to native ETH @ 1, as today
    amount: String,               // sanitized (see sanitize table)
    // /pay
    pay: PayParse,
    attempt: u64,
}
```

### Events

| Event | Sub-machine | Meaning |
| --- | --- | --- |
| `start { account, recipient, base_url }` | gate+builder | Receive screen session start |
| `mode_changed { mode }` | builder | address ↔ request toggle |
| `asset_picked { ..Asset }` | builder | re-clamps `amount` to the new decimals |
| `amount_changed { text }` | builder | input already dot-normalized by shell; core sanitizes |
| `acknowledge` | gate | the warning's confirm button |
| `link_opened { to, chain, token, amount, sym, dec, net }` | validator | `/pay` raw query, all `Option<String>`, untrusted |
| `shell_completed { attempt, result }` | — | internal |

### Operations → Results

| Operation | Result(s) | Shell executor |
| --- | --- | --- |
| `read_ack { account }` | `ack_flag { acknowledged }` | getItem(`vela.receiveWarned.{account}`); error ⇒ false (as today) |
| `write_ack { account }` | `ack_written` | best-effort setItem `'1'` |

(The builder and validator are pure — no other operations.)

### Sanitize (exact port of `sanitizeAmount`)

1. strip every char not in `[0-9.]`;
2. if the *stripped* text has > 1 dot ⇒ result is the raw input minus its last
   char (today's quirk, ported verbatim);
3. else truncate fractional digits beyond `asset.decimals`.

### Build rules (exact port of `buildEIP681` / `buildPayLink`)

- has_amount ⇔ amount parses > 0 (parseFloat semantics: leading numeric).
- token: `ethereum:{token}@{chain}/transfer?address={recipient}` +
  `&uint256={base}`; native: `ethereum:{recipient}@{chain}` + `?value={base}`.
- pay-link: `{base_url}?to=&chain=&token?=&amount?=&sym=&dec=&net?=`,
  URL-encoded, ordered exactly as today.
- `qr_value` = built URI, else bare recipient; `copy_payload` = pay-link in
  request mode, bare address in address mode (FR-015).

### /pay grammar (D8 — strict)

`to` must match `^0x[0-9a-fA-F]{40}$`; `chain` a base-10 integer; `dec`
defaults 18 (`parseInt || 18` semantics preserved for valid inputs); `amount`,
when present, must match `^\d+(\.\d+)?$` with ≤ `dec` fractional digits —
otherwise `Invalid`. `sym` defaults `"tokens"`, `net` defaults `"Chain {id}"`.
Valid ⇒ `PayRequest` with `amount_base` and the same locked-Send params the
screen passes today.

### ViewModel

```rust
struct PaymentRequestView {
    // gate
    gate_loading: bool, acknowledged: bool, can_copy: bool, can_save: bool,
    // builder
    mode: Mode, asset: Asset, amount: String,
    eip681_uri: String, pay_link: String, qr_value: String, copy_payload: String,
    has_amount: bool,             // drives summaryAmount vs summaryOpen i18n key
    // /pay
    pay_valid: Option<bool>,      // None until link_opened
    pay: Option<PayRequest>,
}
```

---

## Wire notes (all machines)

- All numbers cross as JSON numbers (`f64`) except base-unit amounts, which
  are decimal strings (D9). No `u64` on the wire.
- `now_ms` rides on results (011's `now_iso` pattern) — no clock in any core.
- View models are exported via ts-rs into
  `src/services/wallet-state-core/generated/` (D3).
