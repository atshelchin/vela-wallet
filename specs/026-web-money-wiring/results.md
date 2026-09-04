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
