# Delivery Report — 026 Web Money Wiring

**Branch**: `026-web-money-wiring` · Started 2026-09-04 · Base: `main` @ f9bcb278
(PR #183 merged; not stacked).

---

## Baselines (T201, T202) — recorded @ a9761c16

- Core artifact: `static/vela_core_bg.4603c8421603.wasm` = **3,630,664 B**
  (must close byte-identical — SC-207; every money machine is already aboard).
- Corpus pins: 1536 leaf + 84 branch paths (unchanged since 024). Send/signing
  copy already in the corpus: `send` 144 keys · `clearSigning` 84 ·
  `componentsTx` 52 · `componentsUi.signing*` (131 fields resolved by the web
  signing manifest) — a `failed` receipt TITLE is the one known gap (D29).
- Port-provenance surface @ f9bcb278 — **51 files, 12,992 lines**:
  kernels wrapper `vela-core/{index 577, convert 88, js-helpers 101,
  safe-constants 74, types 60}` · `safe-transaction` 2,838 · `bundler-service`
  839 · `tx-reconciler` 252 · `token-reads` 84 · `recipient-risk` 84 · `eip681`
  263 · `batch-send` 201 · `dapp-history` 206 · `approval-guard` 488 ·
  `selector-registry` 95 · simulation `tx-simulation 212, sim-assets 245,
  sim-engine-rpc 100, sim-engine-tevm 113, sim-trust 95, sim-corroboration 82`
  · `recipient-table` 324 · hooks `use-dapp-signing` 764, `use-fee-quote` 340 ·
  wallet-state-core `send 524/37/317 · fee 211/33/34 · guard 88/39/17 · sign
  400/495/39/107 · clear 168/50/123 + clear-batch 158 · tx-tracker
  280/249/41/42 · batch-import 85/38/18` · dev `passkey-fixture 309,
  parallel-space 291, fault-injection 274`. NOT ported (Rust owns): the TS
  twins `clear-signing.ts` 1,321, `approval-guard-editor.ts` 173,
  `local-descriptors.ts` 524; `deployer-api.ts` (create-wallet path);
  `transfer-monitor.ts` (025's receive path, already ported).
- Green tree: 025's close-out numbers stand on this exact tree (the merge is
  the 025 branch tip): check 1233/0 · lint clean · unit 491 · e2e 99/99 on
  three engines · 9 e2e suites.

### Decisions recorded up front (T202)

- **Two new app-web dependencies**: `@noble/curves` (the fixture signer's
  P-256; dynamic import behind the dev gate) and `xlsx` (SheetJS; lazy import
  in the batch importer). Both asserted absent from the startup chunk and from
  Welcome (T262).
- **Runtime dev gate instead of `__DEV__`** (D18): Expo's passkey override is
  a compile-time no-op in release; the web e2e runs the PRODUCTION artifact,
  so the override and the fixture module gate on the 025 dev gate
  (`import.meta.env.DEV || vela.dev.console === '1'`) with the badge rendering
  unconditionally when the space is active. Deviation, with rationale.
- **No local bundler** exists in the program; the live sweep (SC-202) spends
  dust from a fixture Safe through the real relay, opt-in only (D30).
- **T203 (literal-audit dirs)** lands with the phases that create the dirs
  (`lib/dev` in Phase 3, `signing/core` in Phase 5; `flows/core` exists since
  025 and is already audited) — recorded here so it is not forgotten.

---

## Phase 2 — the foundation (T210–T219)

**What shipped**: everything the money path stands on, ported from the Expo
tree with provenance headers and no logic changes.

- **Kernels** (`$lib/core/kernels.ts` + `safe-constants.ts`, D15): the pure
  wasm facade — Safe address derivation (single + multi-key + per-key signer
  proxy), ABI encode/decode, typed-data hashing, WebAuthn verification and DER
  conversion, the contract addresses and the splitter's pinned bytecode. The
  Expo module's import-time `initSync` and its Node byte-planting are gone (the
  web has `loadCore()`); everything else is verbatim. `client.ts` keeps the
  onboarding/identicon exports; money code imports kernels only.
- **`safe-transaction.ts` (2,838 lines) verbatim** — the ONLY submit entry
  (`sendBatchCalls`: one call stays a single `executeUserOp`, N become a
  MultiSend), the WebAuthn signature envelope, fee estimation, nonce, submit
  and receipt wait. Its Jest vector suite came with it (30 cases: fee-limit
  reservation, the gas-price ladder, the tip-inclusive basis and the bundler
  acceptance gate, calldata layouts, initCode, the Tempo plain-transfer
  classifier).
- **The relay client and its neighbours**: bundler-service (839),
  tx-reconciler (252), rpc-adapter, tempo, format-eth, token-autoadd,
  token-reads, recipient-risk, eip681 (+ its 24 vectors), batch-send (+ 20),
  dapp-history, approval-guard (+ 40 vectors incl. the never-unlimited
  enforcement), selector-registry, and the six simulation modules under
  `services/sim/`.
- **`dapp-submit.ts`** — Expo's `use-dapp-signing.ts` (a hook in name only;
  it never used React). Web deltas: static kernels import, `signWithAny` for
  the passkey, the stored account from onboarding storage, and no
  public-key-index fallback (a web session is always a stored account, so a
  missing one is an error rather than a lookup). `SubmitGuardOwner` semantics
  unchanged — the default stays the guarded value.
- **The store writer** (D20): `saveTransaction(s)` / `updateTransaction(s)`
  under the existing `withTxLock`, atomic per batch, de-duped, capped at 200.
- **`accounts.ts`**: the stored wallet as the SIGNER needs it — one adapter
  from the generated `Account` (snake_case, `keys[]`) to the camelCase key set
  `keySetOf` was written against, so the 2,838-line port stays verbatim.
- **The passkey seam** (D18): `signWithAny(challengeHex, credentials[])`
  (every founding credential in the allow-list, transports preserved),
  `cancelSign()`, and `setPasskeyOverride()` — one substitution covering every
  ceremony, for Phase 3's fixture signer.
- **The amount codec** (D25) in its own module with vectors.
- **Fault arms**: `forceFunding` and `zeroGasQuote` joined the console (the
  hooks `bundler-service` and `safe-transaction` call).

**The golden addresses — the FIFTH surface** (`core/golden-addresses.test.ts`):
the three fixture public keys derive `0xD400…130b` / `0x031d…772b` /
`0x58cd…1d3d`, and all three founding one wallet derive
`0x88cCA0…6894`; key ORDER is pinned as part of the address, N=1 equivalence
is pinned, and a malformed key throws rather than deriving something
plausible. Rust, Kotlin, Swift and the Expo wasm already pin these; the web
is the fifth.

**One finding, pinned rather than fixed**: `decimalToHex('-1')` emits `0x-1` —
not valid hex. Every downstream consumer re-parses that string and THROWS, so
a negative amount fails loudly; coercing it to `0x0` would silently sign a
zero-value transfer, which is the worse failure. The test pins the loud
refusal so a future "cleanup" cannot quietly turn it into a wrong number.

**Recorded deviations**: three ported files keep `any` where Expo had it
(`safe-transaction`, `approval-guard`, `selector-registry`, the three
simulation engines) behind a file-level lint exemption — they walk dynamic
wire shapes (blocks, gas quotes, receipts, decoded params, simulation results)
and narrowing them is a rewrite, not a port. `safe-transaction` additionally
exempts two parity exports and four re-thrown estimation errors that
deliberately replace the transport's words with the person's. Where the web's
pool answers `result: unknown` (Expo's was `any`), three read sites got an
explicit shape rather than a blanket cast.

**Gates**: check 1266/0 · lint clean · unit **680** · build ×15 · e2e **99/99**
(chromium + firefox + webkit) · wasm byte-identical · zero corpus delta.

---

## Phase 3 — the parallel space (T220–T227)

**What shipped**: the verification environment the founder chose as this
feature's primary route — the real app with exactly one substitution.

- **The fixture signer** (`lib/dev/passkey-fixture.ts`): the three fixed P-256
  keys, the assertion builder (client data in the field order the validator
  checks, 37-byte authenticator data with UP|UV, a low-s DER signature), the
  frozen `0x45` attestation, the registration cursor and the preferred-signer
  seam. Its unit test proves the assertions are REAL: the core's client-data
  validator accepts them, `derSignatureToRaw` parses them, and the signature
  verifies against the account's public key over the exact bytes a device
  would have signed.
- **Enter / leave / boot** (`lib/dev/parallel-space.ts`): the wallet swap with
  a backup that survives re-entry, the fixture contact seeded and removed by
  exact address, and the boot re-arm that runs unconditionally — skipping it
  would boot a fixture wallet UNMARKED, which is the audited P0 this design
  exists to prevent.
- **The badge**: rendered whenever the space is active, on every page, in a
  deliberately non-product violet (whitelisted in the literal audit for that
  reason), and it is the door back out.
- **`/{locale}/parallel`**: prerendered ×15 like every route, English on
  purpose (a developer switch is not product chrome, and its words stay out of
  the corpus), listing the fixture Safes with the warning that their keys are
  public.
- **Relay faults** (T223): `failRelay`, `emptyTreasury`, `rejectSubmit` and
  `silentReceipt` join the console — the gap the Expo harness's own
  TEST-OUTLINE names — at the bundler chokepoint, each answering the shape the
  relay really produces. `__VELA_FAULT_INIT__` applies faults at module load,
  so the FIRST read already runs under them.
- **`stubRelay` + `happyRelay`** (T224): the JSON-RPC methods the client
  speaks plus the three REST endpoints, and a one-object happy path whose
  receipt state a test can drive.
- **The test requester** (T225): the seam a transport will plug into, with the
  promise semantics a dApp sees (4001 on rejection). Phase 5 binds it to
  `sign_request`; 027 replaces it with a real transport.
- **Sponsorship** short-circuits to denied while the space is active: the
  fixture Safes were seeded, never created through the flow, so their keys were
  never indexed and a sponsorship request is doomed by construction (founder
  decision 2026-07-06).

**Two findings, both fixed**:
1. **The fixture module could not be imported before the core was aboard.**
   Deriving a Safe address is a core call, and the Expo module derives at
   import time (its core is `initSync`'d). On the web that threw
   `__wbindgen_malloc` of undefined the moment the page loaded the module. The
   derivation is now lazy and memoised, and every entry point awaits
   `loadCore()` first — the same rule every machine already follows.
2. **The e2e sign-in seed re-imposed its wallet on every navigation.**
   `addInitScript` runs before EVERY document, so the parallel space's swap
   looked like it had failed when the very next page re-seeded the test
   account over it. The seed is now conditional (only when no wallet exists),
   which is also what "this person already had a wallet" actually means.

**e2e (`parallel-entry.e2e.ts`)**: entering swaps the wallet, marks it and
seeds the fixture contact; the badge leads back out and leaving restores the
person's wallet byte-for-byte along with their untouched contacts; the space
survives a reload (re-armed, not remembered); and — the budget promise — a
normal visit loads no chunk containing the fixture private key, shows no
badge, and exposes no parallel verbs.

**Gates**: check 1290/0 · lint clean · unit **698** · build ×15 · e2e
**102/102** (chromium + firefox + webkit) · wasm byte-identical · zero corpus
delta.

---

## Phase 4 — the send spine (T230–T238) 🎯 MVP

**What shipped**: the web wallet sends money. Pick a token, type an address
and an amount, see the relay's fee, confirm, the passkey signs, the relay
accepts, the record is durable, the tracker brings the receipt home.

- **`fee_policy`** (`flows/core/fee-*` + `fee-quote.svelte.ts`): ONE live
  session per surface, the Expo hook ported as a reactive class — the quote
  the core pre-checks against, the quote on screen and the quote that is
  signed are one object with one owner. Four earlier integrations failed by
  splitting that.
- **`send`** (`flows/core/send-*`): all 19 arms, every wording regex, the
  persist-then-track ordering, the passkey ceremony through `signWithAny`.
- **`tx_tracker`** (`wallet/core/tracker-*`): the app-resident poller that
  replaces four separate ones, async-booted because the web fetches its core.
- **The overlays** (`flows/live-send.ts`): send-pick, send-form, send-confirm,
  send-receipt and the fee-coin sheet, filled from `SendView`/`FeeView` and
  worded from the corpus. No new corpus keys — the trust line reuses the
  signing sheet's first-time tag.
- **The drawn gaps, closed as props**: `SendForm` gained a CTA handler (it had
  none), `AmountInput` and `RecipientField` become editable when a handler is
  present (the balance hero's tap-to-hide pattern), and `FlowsMobile` takes an
  optional set of send actions — absent, the gallery renders the drawn journey
  exactly as 021 drew it.
- **The route** translates taps into core events and lets the core's `stage`
  decide which screen shows; the nav stack is not consulted while a send is
  live, because the machine already knows where the person is.

**Four findings, all fixed**:
1. **A module-level kernel call took down every page that imported the
   module.** `safe-transaction.ts` hashed two EIP-712 typehashes at import
   time (fine on Expo, whose core is `initSync`'d). On the web the core is
   fetched, so importing the module from the wallet route made the whole page
   a 500. Now computed on first use. This is the same class of bug as Phase
   3's fixture derivation — recorded twice on purpose.
2. **The tracker only started when the send flow opened**, so an operation
   left pending by a closed tab was never swept. It now starts on every wallet
   boot — which is what "money in flight outlives every screen" has to mean.
3. **The receipt screen read the wrong field.** The core flips `tx_status` to
   `confirmed` the moment the signature is a fact; the receipt's own
   `receipt.status` is what tracks the chain. Reading the first would have
   told a person their money had arrived while it was still in the air. Pinned
   by unit.
4. **The planted-fault seam ran too late.** `__VELA_FAULT_INIT__` was applied
   by the gated console, which is a dynamic import — so a fault could arrive
   after the first poll. It now applies at the fault module's own load, which
   every faultable module already imports.

**e2e**: `send-lands` (SC-201 — the whole spine in the parallel space against
a stubbed chain and relay: quote → sign → submit → pending record → confirmed
receipt), `reopen-pending` (SC-204 — a record left by a closed tab is picked
up and settled with no screen open), `relay-faults` (SC-205 — a silent receipt
leaves the payment submitted, an unreachable relay is quiet and leaks no relay
text, and the fault console is unreachable without its gate).

**Recorded**: split, sweep and the batch importer stay fixture (US3, Phase 6);
the desktop panel renders the same live overlays but its send actions are not
wired (mobile is the MVP surface); the send alert kinds log rather than open a
sheet (no alert surface is drawn on web); a contract recipient has no
send-screen sentence in the corpus — the first-time tell does, and it is the
one that matters for a poisoned look-alike.

**Gates**: check 1306/0 · lint clean · unit **712** · build ×15 · e2e
**107/107** (chromium + firefox + webkit) · wasm byte-identical · zero corpus
delta.

---

## Phase 5 — the signing sheet (T240–T246)

**What shipped**: the 022 sheet runs on the real machines. A request arrives,
`clear_signing` says what it means, `approval_guard` caps what it grants,
`fee_policy` prices it, `sign_request` gates it — and the drawn 13-block
vocabulary renders all four without deciding anything.

- **`approval_guard`** (`signing/core/guard-*`): three RPC reads, no
  judgements. **`clear_signing`** (`clear-*` + `clear-batch`): the coalescing
  map intact, so N batch legs touching one token cannot print two rows that
  disagree; per-request sessions, because the machine supersedes rather than
  accumulates. Its RESULT codec is deliberately NOT ported — that existed to
  translate into Expo's own TypeScript twin, which Rust replaced; the sheet
  reads the generated view.
- **`sign_request`** (`sign-*` + a resident): the transport registry (a
  response goes to the transport that OWNS the request), the mid-flight
  `op_submitted`, the VERIFIED account switch that stays fail-closed when it
  cannot land, the networks-first boot (until a snapshot arrives every chain
  is unsupported), and the deduped tracker hand-off.
- **`signing/live.ts`**: the four views → `SigningModel`. The confirm gate is
  an explicit AND — the core's gate, the guard's cap, the fee's readiness, and
  no signature already in flight.
- **The sheet is mounted** in the wallet route above every screen, because a
  request can arrive while any of them is showing. Dismissal is rejection (the
  022 contract draws no reject button), and the approve carries the GUARD's
  rewritten params — passing the original would be the never-unlimited mandate
  defeated at the last step.
- **The requester** binds behind the dev gate: the seam 027 replaces with a
  real transport.

**One finding, the third of its kind**: `approval-guard.ts` computed its five
selectors at module load. Same class as Phase 3's fixture derivation and
Phase 4's typehashes — on Expo the core is `initSync`'d at import, here it is
fetched — and the symptom is the same: every page that imports the module
becomes a 500. Now memoised on first detection. Three occurrences is a
pattern, and the rule is now written down: **a ported module may not call a
kernel at import time.**

**e2e (`signing-scenarios`, SC-203)**: an unlimited `approve` opens the sheet
with the spending cap reading "Unlimited", its own chip DISABLED and the
slider shut — the mandate is a gate, not a warning — and the decode warning
names the real calldata length rather than leaving `{{bytes}}` on screen (a
second, smaller finding, fixed). Rejecting with Escape answers the requester
with 4001.

**Recorded**: the sheet's fee row shows the live quote but the fee-token
sheet is not reachable from it yet (the send flow's is); batch legs render as
one request (the per-leg `clear-batch` bookkeeping is ported but no batch
request source exists until 027); `funding` surfaces as the core's state but
no funding sheet is drawn on web.

**Gates**: check 1320/0 · lint clean · unit **725** · build ×15 · e2e
**109/109** (chromium + firefox + webkit) · wasm byte-identical · zero corpus
delta.

---

## Phase 6 — paying many at once (T250–T254)

**What shipped**: the payroll batch. Paste or drop a table, the core parses it,
prices it and rules on it, and one operation carries every recipient.

- **`batch_import`** (`flows/core/batch-*`) ported with its three operations.
  The rate arm asks `resolveRate`, NOT a display helper: a display helper ends
  in `?? 1`, and an unpriceable currency would then reach the core as "the rate
  really is 1" — a 5,000 CNY payroll line paid as 5,000 tokens, ~7x. `null` is
  the honest answer, and the core turns it into a refusal.
- **`services/file-io.ts`**: the two capabilities the core cannot have. The
  picker is an `<input type=file>` that always settles (a dialog that never
  answers would leave the core's effect unanswered forever, which the loop
  cannot tolerate); the save is a Blob download; the workbook reader is the
  only half of Expo's 324-line `recipient-table` that is ported, because the
  core owns every rule about what a column means.
- **SheetJS is lazy and asserted lazy**: `await import('xlsx')` inside the
  reader, and an e2e that reads the built chunks a normal visit loads and
  finds no parser in them.
- **The drawn sheet graduates**: the paste field gains an `oninput`, and the
  send form learns split mode — the recipient cards, the three ghost actions
  and the total line are all the core's `split_mode`, not a second list this
  shell keeps. Applying seeds the send core's split from the rows the importer
  priced; nothing is recomputed on the way across.

**One finding, from the matrix rather than a unit**: the two budget e2e each
re-fetched EVERY script the page had loaded, to search it. Six Playwright
workers doing that against one preview worker starved the other suites — 27
tests failed with network errors that had nothing to do with their subject.
Both now read the same chunks off the build output instead. The assertion is
unchanged and stronger (it reads the artifact, not a response), and the matrix
went from 84/111 to 111/111.

**Recorded**: sweep mode (N tokens → one address) stays fixture — the core
supports it, no web surface drives it yet; the importer opens from the split
form only, which is where 021 drew it.

**Gates**: check 1327/0 · lint clean · unit **731** · build ×15 · e2e
**111/111** (chromium + firefox + webkit) · wasm byte-identical · zero corpus
delta.

---

## Phase 7 — the live sweep, the matrix, the budgets (T260–T264)

### The live sweep (T260 — SC-202): real money, on Gnosis

Founder-authorised on 2026-09-04. The built preview (the production artifact,
not the dev server), the parallel space entered, the active wallet switched to
the multi-key golden Safe `0x88cCA0…6894` — and from there a dust transfer to
fixture Safe #2 `0x031d7D…4772b` through **vela-relay.getvela.app**, the real
relay. One substitution in the whole run: the passkey.

**What the person saw** — `$0.77` total, one asset row, `XDAI · Gnosis
0.76997`, first figure ~7 s cold. Then `Est. Fee 0.01 xDAI` on the confirm
screen, `Submitted to the network` with the operation hash, and `Sent 0.001
XDAI` with the transaction hash ~7 s later.

**What actually happened** —

| | |
| --- | --- |
| userOpHash | `0x402ca4d7eb78fe19df5f863a838baa87077773abbc27a840097a46978cc7e24b` |
| txHash | `0xa4f0d25ad48e8e42dd1e78e28dcba1d62e11fc025f7d1df4d6f1e27c42d1a18e` |
| block / status | 48,070,180 · `0x1` |
| Safe before → after | 0.76997 → **0.75897 xDAI** (Δ **0.011**) |
| of which sent | 0.001 (recipient credited) |
| of which fee | 0.010 — the in-band quote the wallet SIGNED (`feeToken=native amount=10000000000000000 recipient=0xee2cca98…f0dd`) |
| relay quote | `pimlico_getUserOperationGasPrice` → 14 wei · `vela_getInBandGasQuote` → native + two TIP-20 fee coins · `eth_estimateUserOperationGas` → call 112,472 / preVerification 101,600 / verification 100,000 |
| outer transaction | 146,776 gas at 10 wei effective = **1.5 × 10⁻¹² xDAI**; EntryPoint `actualGasCost` 0 (the op is submitted at `maxFeePerGas: 0x0` — the fee is settled in-band, inside the calldata, not by the EntryPoint) |

**SC-202 is met on its own terms**: the amount and the fee shown on screen
agree with the chain to the unit — 0.001 sent, 0.010 charged, 0.011 gone. The
wallet's promise ("what you see is what you sign is what you pay") held end to
end, and a following read showed `0.75897` / `$0.76` on the balance hero.

**And it surfaced the fee question the wallet cannot answer alone.** Gnosis was
running at an 8-wei base fee during the sweep, so the real chain cost was ~10⁻¹²
xDAI while the relay charged 0.01. That is not the wallet mispricing: the
wallet displayed, signed and paid the relay's own quote, unchanged. It is the
relay's floor, and it is the same thread as the recorded BSC in-band overcharge
— now with a second data point at the opposite extreme (a ~7 × 10⁹ ratio on a
near-free chain, where a percentage markup rounds to nothing and only a floor
can produce 0.01). Handed to the relay repo; nothing to change here.

**Two smaller live findings**, neither fatal, both carried:
- Two of the Gnosis pool's public endpoints (`gnosis-pokt.nodies.app`,
  `gnosis.oat.farm`) refuse a browser origin outright — CORS preflight, no
  `Access-Control-Allow-Origin`. The pool covered it without a visible stumble,
  which is the design working; but a browser-only endpoint list would spend
  less time failing. Recorded for a pool-hygiene pass, not fixed here.
- The public-key index answers `400` to a query for a plain recipient address
  (`p256-index-v2.getvela.app/api/query?walletRef=…`). The recipient-identity
  read treats it as "not a Vela wallet" and moves on, so nothing is wrong on
  screen — but the wallet is asking a question the index has no shape for.

### The matrix (T261)

`reopen-pending` and `parallel-entry` now run on firefox and webkit as well as
chromium — the two money suites whose subject IS storage: an IndexedDB record
a closed tab left behind, settled on the next boot with no screen open; and the
localStorage wallet SWAP the parallel space performs and gives back
byte-for-byte. Money that survives a crash is not allowed to be one engine's
promise.

### The budgets (T262)

`e2e/budgets.e2e.ts` holds the two assertions 026 left unpinned, and the three
chunk-reading suites now share one helper (`collectScripts` / `chunkSource` /
`chunksCarrying` in `live-helpers.ts`) instead of three copies of it:

- **The landing page carries neither the fixture keys nor SheetJS.** Welcome is
  the page 15 locales are prerendered for and the one a stranger meets first;
  the existing assertions covered the WALLET's startup path only. Both faces of
  it are checked — the first-run intro carousel and the returning visit.
- **The money routes load ONE core artifact, and the build ships exactly one.**
  Entering the parallel space, booting the wallet with its tracker and opening
  the send flow fetches one `vela_core_bg.<hash>.wasm` and no second engine;
  and `.svelte-kit/output/client` contains exactly one of them, at the path
  that was actually requested.

Standing assertions re-run and green: Welcome fetches no wasm; the
`wrangler deploy --dry-run` bundle carries no `WASM_BASE64`; SheetJS is absent
from the wallet's startup chunks; the fixture private key is absent from every
chunk a normal visit loads. Artifact `vela_core_bg.4603c8421603.wasm` =
**3,630,664 B**, byte-identical to the Phase 1 baseline — `git diff main --
rust/` is empty, and `sync-wasm --check` ties `static/` to `pkg-web` on every
build.

**One finding, from the budget pass**: `xlsx` was never declared in
`app-web/vela-wallet/package.json`. It resolved anyway — the repo root is the
Expo project, and Node walked up into ITS `node_modules` — so every gate here
passed while a clean checkout that installs only this app would have built a
lazy import pointing at nothing. Declared now, at the same pinned tarball.
The plan named both new dependencies; only one of them arrived.

### Gates (T264)

`pnpm check` **1327 files / 0 errors** (carrying `gen-tokens --check`,
`sync-wasm --check` and `gen-core-types --check`) · `pnpm lint` clean ·
`pnpm test:unit` **731** · `pnpm build` ×15 locales · `pnpm test:e2e`
**121/121** across chromium + firefox + webkit, 16 suites · wasm
byte-identical · corpus delta **zero** (`git diff main -- rust/` is empty).

---

## Success-criteria verdicts

| SC | Verdict |
| --- | --- |
| **SC-201** hermetic single send: form → quote → slide → sign → submit → pending record → confirmed receipt → feed row → balance refresh | ✅ `send-lands` drives the whole spine in the parallel space against a stubbed chain and relay, on chromium; the persistence half (`reopen-pending`) runs on all three engines |
| **SC-202** a live send lands; amount and fee agree with the explorer to the unit | ✅ Gnosis, golden Safe → fixture Safe #2, real relay: 0.001 xDAI sent + 0.010 fee = 0.011 gone, exactly what the screen said. `0x402ca4d7…e24b` / `0xa4f0d25a…a18e`, block 48,070,180 |
| **SC-203** every fixture signing scenario renders the core's view; the unlimited approval defaults to exact and needs a deliberate choice | ✅ split across the two gates: the ladder's rungs — decoded intent, risk tone, blind transaction, `eth_sign`, message + SIWE mismatch, and the still-resolving wait — are pinned per rung in `signing/live.test.ts`; `signing-scenarios` drives the two that need a real sheet on a real screen: an unlimited approve leaves the slider SHUT (a gate, not a warning) and Escape answers the requester with 4001 |
| **SC-204** a tab closed after submit shows pending on reopen and settles | ✅ `reopen-pending` ×3 engines: no screen, no tap, the tracker's boot sweep settles it |
| **SC-205** relay faults each show their designed presentation; no raw relay text on screen | ✅ `relay-faults`: a silent receipt leaves the payment "submitted"; an unreachable relay is quiet and leaks no relay wording; the fault console is unreachable without its gate |
| **SC-206** zero business rules added to web code; executors switch-only; gallery pixel-unchanged | ✅ every executor is a switch under unit pin; the fixtures were not touched and the drawn journeys render exactly as 021/022 drew them when no callbacks are injected. Recorded as shell judgement, not rule: presentation ORDER (which overlay a stage shows), and the confirm gate's AND (core ∧ guard ∧ fee ∧ no signature in flight) |
| **SC-207** budgets identical; parallel space and xlsx never on a production path; corpus green; e2e ≥ 025 | ✅ 3,630,664 B byte-identical · zero-wasm Welcome · worker purity · one artifact on the money routes and one in the build · fixture keys and SheetJS absent from Welcome AND from the wallet's startup chunks · corpus delta zero · e2e 99 → **121** |

## Deviations (consolidated)

1. **Runtime dev gate instead of `__DEV__` (D18)** — the web e2e runs the
   production artifact, so the fixture signer and the parallel verbs gate on
   `import.meta.env.DEV || vela.dev.console === '1'`. The badge is the
   compensating control: it renders unconditionally whenever the space is
   active, on every page.
2. **`any` kept in six ported modules** behind file-level lint exemptions
   (`safe-transaction`, `approval-guard`, `selector-registry`, the three
   simulation engines) — they walk dynamic wire shapes; narrowing them is a
   rewrite, not a port.
3. **`clear-signing`'s RESULT codec not ported** — it existed to translate into
   Expo's TypeScript twin, which Rust replaced. The sheet reads the generated
   view directly.
4. **Desktop send actions unwired** — `FlowsDesktop` renders the same live
   overlays, but mobile is the MVP surface; the desktop panel keeps the drawn
   journey.
5. **Sweep mode (N tokens → one address) stays fixture** — the core supports
   it, no web surface drives it yet.
6. **The signing sheet's fee-token sheet is not reachable from the sheet** (the
   send flow's is), and `funding` surfaces as core state with no drawn web
   sheet behind it.
7. **Send alert kinds log rather than open a surface** — no alert surface is
   drawn on web.
8. **A contract recipient has no send-screen sentence** in the corpus; the
   first-time tell is what carries the poisoned-look-alike warning.
9. **The `failed` receipt title (D29)** remains the one known corpus gap; the
   receipt renders the state without inventing a word for it.
10. **The live sweep spent real funds by explicit founder authorisation**
    (2026-09-04) — dust from a Safe whose keys are public by design.

## Handoff

### To 027 — the transports

- **The requester seam is the whole of it.** `sign-resident.ts` holds a
  transport registry and answers each request to the transport that OWNS it;
  `$lib/dev/test-requester.ts` is the only transport 026 ships, behind the dev
  gate. A real transport implements the same interface — post a request, keep
  the promise, receive the answer (4001 on dismissal) — and nothing above it
  changes. The sheet, the four machines and the submit spine are already live.
- **WalletPair** and the remote-inject relay plug in there. `dapp-history.ts`
  and `dapp-submit.ts` are ported and unused: `dapp-submit` is the `'core'`
  submit-guard owner the real transports will call.
- **Batch requests**: `clear-batch.ts`'s per-leg bookkeeping is ported and
  coalescing, but no request source produces a batch yet — the sheet renders
  batch legs as one request until 027 gives it one.
- **Two known live findings to carry**: the browser-hostile Gnosis endpoints
  (CORS) and the public-key index's `400` on a plain-address query.
- **The in-band fee floor** belongs to the relay repo, with two data points now
  (BSC ~$1 on padded limits; Gnosis 0.01 xDAI against a ~10⁻¹² chain cost).

### To the native tier — the machine order to repeat

Web is the first tier to run the money path on the Rust machines, and the order
the phases went in is the finding, not an accident. Repeat it:

1. **Kernels + `safe-transaction` verbatim, with its vectors.** Everything else
   stands on it, and porting it faithfully is what makes the rest boring.
2. **The relay client, the reads, the guard, the simulation family** — all
   pure ports, all cheap once (1) is done.
3. **The parallel space BEFORE any flow.** It is what makes every later phase
   testable without a device, and it costs nothing to build early.
4. **`fee_policy` and `send` together**, with ONE live fee session per surface.
   Four earlier integrations failed by splitting the quote the core pre-checks,
   the quote on screen and the quote that is signed into different objects.
5. **The tracker as an app-resident**, started on every boot — not when a send
   screen opens. Money in flight outlives every screen.
6. **`sign_request` + `clear_signing` + `approval_guard` on the sheet**, with
   the guard's REWRITTEN params carried into the approval. Passing the original
   would defeat the never-unlimited mandate at the last step.
7. **The batch importer last** — it is the only phase that needs a file picker
   and a spreadsheet parser, and both are seams the core never touches.

**The rule the web tier learned three times, at a cost of three 500-ing pages:
a ported module may not call a kernel at import time.** Expo `initSync`s its
core; every other tier fetches or loads it. `safe-transaction`'s typehashes,
`approval-guard`'s selectors and the fixture signer's derivation each had to
become lazy. Check for it first on the next tier rather than three times.
