# Tasks: Web Read Wiring

**Input**: specs/025-web-read-wiring/ (plan, research D9–D14, data-model,
contracts, quickstart). Stacked on `024-web-live-shell`.

**Format**: `[ID] [P?] [Story] Description` — US1 home truth · US2 activity/
receive · US3 pool. Markers: `[ ]`/`[X]`/`[~]`. Phases = plan's six commits
(story→phase map: US3→2, US1→3(+5), US2→4; 024 precedent declared).
Paths repo-root-relative; `pnpm` runs in app-web/vela-wallet.

---

## Phase 1: Setup (one commit)

- [X] T101 Baselines into results.md: wasm bytes/fingerprint (must close
      unchanged), corpus pins, port-provenance list (the D9–D14 files with
      line counts @ base commit), green-tree confirmation on the stacked base
- [X] T102 [P] Record the four 024 fail-closed arms this spec supersedes
      (contract cross-reference table in results.md)

## Phase 2: The pool (one commit) — blocks 3–5

- [X] T110 [US3] Port src/services/rpc-pool-endpoints.ts (+ its support graph, discovered at port time: chains.ts content table [audit-whitelisted like fixtures], networks.ts trimmed model w/ custom-cache+subscribe, records.ts KV readers, rpc-providers.ts verbatim, endpoints.ts getters, chain-registry fetchChainInfo) →
      app-web/…/src/lib/services/rpc-pool-endpoints.ts (endpoint assembly,
      NEVER_BANNED, BANNED_STORAGE_KEY, RPCResponse type)
- [X] T111 [US3] Port src/services/endpoint-admission.ts (verbatim) (user-URL hygiene
      gate, pre-fetch)
- [X] T112 [US3] Port wallet-state-core/rpc-pool-{types,executor,session}.ts
      → app-web/…/src/lib/wallet/core/ (AsyncStorage→KV; call registry;
      transport via $lib/services/net)
- [X] T113 [US3] Port src/services/rpc-pool.ts (the FACADE; + trimmed metrics.ts counter seam + fault-injection.ts read-path arms; ensureReady awaits loadCore before construction) →
      $lib/services/rpc-pool.ts — module-resident single session (D9);
      exports poolRpcCall/getRateLimitedChains/refreshPool/invalidateAllPools/
      getChainRpcUrl/getLogsRangeCap per the Expo web surface
- [X] T114 [US3] Flip 024's no-op arms live (invalidate_pools→facade; clear_bundler_cache stays an answered no-op until 026's bundler client; write_custom_networks regains its snapshot refresh): network_admin
      invalidate_pools→facade, clear_bundler_cache→bundler-cache seam stub
      that 026 fills (still answers; provenance note)
- [X] T115 [US3] — MOOT on inspection: 024 already made every settings health surface live through network_admin's own probes; the remaining fixture 'tiles' are the SR rescue overlays, which belong to the WALLET screen and land with Phase 3's home wiring (recorded) (the `// live in 025`
      markers in settings/live.ts + route arms feed pool verdicts)
- [X] T116 [P] [US3] Unit: rpc-pool executor (8 tests: ban bytes, outcome classes, vanished-caller, X-Rpc-Url, failure twin) (ban codec byte-compat,
      conclude registry, transport outcomes incl. timeout→network) + facade
      single-session pin
- [X] T117 [US3] e2e e2e/pool-resilience.e2e.ts on the NEW stub-chain.ts harness (deny-off-origin default + JSON-RPC stubs + KV reader + gated window.vela console w/ poolCall — dynamic import so no glue enters the first-paint chunk); SC-102 green first run on the NEW
      e2e/stub-chain.ts harness (D11): failing primary → routed read; ban
      persists across reload (SC-102)
- [X] T118 [US3] Full gate (check 1181/0; lint clean; unit 435; build; e2e 69+1 — one webkit artifact-assertion flake, clean on re-run); results.md phase entry

## Phase 3: Home live (one commit) 🎯 MVP with 1–2

- [X] T120 [US1] Port src/services/{wallet-api,balance-cache}.ts (+ the graph they pull: abi, chain-tokens, price-service, native-price [core kernels re-exported from client.ts], tokens-model [trimmed models/types], tokens, token-metadata, erc20-meta, platform [web haptics no-op + visibility], transfer-types) (RN seams
      out; token/price payloads; cache keys byte-compat)
- [X] T121 [US1] Port wallet-state-core/balance-{types,executor,session,
      resident}.ts (+ `balance.svelte.ts`: the Svelte bridge over the ported resident — $state view, loadCore-gated boot, one-liner dispatches) → $lib/wallet/core/ (fetch gates, retry timer, privacy
      write; rate-limited-chains read via facade)
- [X] T122 [US1] Port token-trust + manage-tokens wiring (modules ported and typechecked; their UI surfaces — incoming scan feeds Phase 4, add-token sheet has no live entry yet — recorded) (+
      src/services/token-metadata.ts) — custom tokens, meta multicall,
      cache invalidation
- [X] T123 [US1] Create $lib/wallet/live.ts (as overlays `withLiveWallet`/`withLiveWalletDesktop` over the identity-filled base — the settings precedent; moneyParts/trimBalance presentation only; PLUS `$lib/flows/live.ts` so the pushed Assets screen shows the same holdings, empty copy borrowed from fixture T4) (D10):
      balance+feed+trust views + messages + identity + ui state → the drawn
      Home/Desktop models; NO arithmetic in the builder
- [X] T124 [US1] Wire /[locale]/wallet (balance+currency boot; account_changed on identity; visibilitychange → app_focused/backgrounded; tap-to-hide — BalanceDisplay's visible figure becomes the toggle target when a handler is present, gallery unchanged; chain filter pill is not interactive in the drawn web home → deferred): residents boot, live model replaces
      the identity-only overlay, chain filter + tap-to-hide dispatch to the
      core, EMPTY states stay prerender-safe
- [X] T125 [P] [US1] Units (balance executor 6, wallet/live 13, flows/live 3): balance executor (cache roundtrip, stale/live),
      trust/manage arms, buildWalletFromCore vs recorded view fixtures
- [X] T126 [US1] e2e e2e/home-truth.e2e.ts (stub-chain grew: aggregate3 result encoder, network-override seeding, chain-registry stub; one stub answer shape serves both decU256 and decChainlinkUsd; SC-101 + privacy persistence green on chromium — surfaced two real gaps: page-load fetches race a later config seed [tests seed-then-reload, as a real settings edit would], and the fixture Assets screen would have shown staged tokens [now live]) (stubbed): balances+total render,
      fixture identities absent, privacy persists (SC-101 hermetic half)
- [X] T127 [US1] Full gate (check 1211/0 incl. codegen drift; lint clean; unit 24 files/456; build ×15; e2e 88/88 across chromium+firefox+webkit); results.md entry

## Phase 4: Activity + receive (one commit)

- [ ] T130 [US2] Port src/services/activity.ts + incoming-transfers.ts +
      the tx-store KV seam (D14: real schema, empty until 026)
- [ ] T131 [US2] Port feed-{types,executor,session,resident}.ts; haptic→ack
- [ ] T132 [US2] Feed into buildWalletFromCore (day groups, folding — the
      core's; labels the corpus's)
- [ ] T133 [US2] Port receive-watch wiring (per-screen factory, visibility
      gate D12) into the flows receive screens (+ callbacks, 024 contacts
      pattern) — arrival celebration renders
- [ ] T134 [US2] payment_request validation seam (Expo validate-pay port)
      prefilling receive context; refusal words from corpus
- [ ] T135 [P] [US2] Units: feed executor/store seam incl. delete-tombstone,
      watch gate (hidden tab → inactive answer), pay validation arms
- [ ] T136 [US2] e2e e2e/deposit-noticed.e2e.ts (stubbed deltas + fake
      timers) (SC-103)
- [ ] T137 [US2] Full gate; results.md entry

## Phase 5: 024 backfills (one commit)

- [ ] T140 [US1] Port recipient-identity.ts (identity waterfall) → contacts
      resolve_identity/classify_recipient live (classify via facade
      eth_getCode); contact detail + risk render what arrives
- [ ] T141 [US1] Port fiat-rate-quote.ts + the rate arm of currency.ts →
      display_currency resolve_rate live; currency row converts (or degrades
      by the null rule)
- [ ] T142 [P] [US1] Arm-level units for both (incl. null-on-failure pins)
- [ ] T143 [US1] SC-104 sweep recorded; full gate

## Phase 6: Matrix + closeout (one commit)

- [ ] T150 [P] Extend the persistence 3-engine matrix to the new read e2e
      where storage is asserted (ban map, privacy flag, custom tokens)
- [ ] T151 Budget re-assertions: zero-wasm Welcome, worker purity, ONE
      artifact across /wallet /settings /contacts, byte-count unchanged
- [ ] T152 Manual funded-address sweep (quickstart) — results.md record
- [ ] T153 Close results.md: SC-101…106 verdicts, deviations, 026 handoff
      list (tx-store writer, bundler-cache seam, parallel-space extension
      points in stub-chain.ts)
- [ ] T154 Final sanity: all gates + gen-core-types --check

## Dependencies

1 → 2 → {3, then 4} → 5 → 6. Phase 4 needs 3's residents file layout; 5
touches only executor arms + two service ports.

## MVP strategy

Phases 1–3 make the home truthful; each later phase is independently
shippable-green.
