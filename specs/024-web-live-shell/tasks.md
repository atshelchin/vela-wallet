# Tasks: Web Live Shell — Settings & Contacts on the Core

**Input**: Design documents from `/specs/024-web-live-shell/`

**Prerequisites**: plan.md, research.md (D1–D8), data-model.md,
contracts/shell-operations.md, contracts/i18n-keys.md, quickstart.md

**Format**: `[ID] [P?] [Story] Description` — `[P]` = parallelizable,
`[Story]` ∈ US1 (settings live), US2 (contacts live), US3 (paved road).
Markers: `- [ ]` todo · `- [X]` done · `- [~]` partial/blocked with reason.

**Template deviation (019 precedent)**: phases are the plan's six
commit-phases, not one-phase-per-story, because US3 (the paved road) is by
definition the shared prefix of US1/US2, and US1 completes across two phases
(network_admin in Phase 3, display_currency deliberately deferred to Phase 5
as the SC-008 probe). Story→phase map: US3 → Phases 1–2 + the T909 probe;
US1 → Phases 3 + 5; US2 → Phase 4. Every phase is one commit and ends with
its gate green (paths below are repo-root-relative; `pnpm` commands run in
`app-web/vela-wallet/`).

---

## Phase 1: Setup — baselines & green tree (one commit)

- [X] T001 Record baselines into specs/024-web-live-shell/results.md: byte
      size + fingerprint of app-web/vela-wallet/static/vela_core_bg.*.wasm and
      rust/pkg-web/build-info.json digest; corpus pin values from
      scripts/gen-i18n.mjs; `wc -l` of the five files to be moved/ported
      (provenance list per research D2/D5 with source commit hash)
- [X] T002 [P] Green-tree check (done: found+repaired a 30-red e2e baseline on main, commit 0ff6b183; suite now 58/58) on the unmodified branch: `pnpm check && pnpm
      lint && pnpm test:unit -- --run && pnpm build && pnpm test:e2e` — record
      the result table in results.md (any pre-existing red is recorded, not
      fixed here)
- [X] T003 [P] Verify codegen freshness (green: 25/11/311 types current) at repo root: `node
      rust/scripts/gen-core-types.mjs --check` for all targets; record
      outcome (known repo gap: not in CI — this feature adds the wallet-state
      check to the app gate in T012)

**Gate**: results.md has baselines; tree state recorded.

---

## Phase 2: Foundational — the paved road (one commit; behaviour-neutral: ALL gates including e2e must stay green with zero behaviour change)

- [X] T004 [US3] Add `app-web/vela-wallet/src/lib/core/generated` as second
      outDir of the `wallet-state` target in rust/scripts/gen-core-types.mjs
      TARGETS; run `npm run gen:core-types -- wallet-state`; commit the
      generated mirror (311 files + index.ts barrel)
- [X] T005 [US3] git mv app-web/vela-wallet/src/lib/onboarding/core/effect-loop.ts
      and json-shell.ts → app-web/vela-wallet/src/lib/core/ (contents
      unchanged); repoint all importers (onboarding sessions.ts, session/core)
- [X] T006 [US3] Hoist (adjusted: onboarding's SessionOptions carries screen deps and stays put; the generic onView/onError shape was ported from Expo wallet-state-core/types.ts into $lib/core/types.ts instead) `SessionOptions<View>` into
      app-web/vela-wallet/src/lib/core/types.ts; repoint
      src/lib/onboarding/core/sessions.ts
- [X] T007 [US3] Create app-web/vela-wallet/src/lib/core/client.ts: move the
      idempotent promise-cached loader out of onboarding/core/wasm-client.ts
      as `loadCore()`, re-export all 24 bridge classes from rust/pkg-web
      (list in rust/crates/vela-core-wasm/src/wallet_state.rs + onboarding.rs);
      reduce onboarding/core/wasm-client.ts to a thin re-export of
      `loadOnboardingCore = loadCore` + its existing class re-exports
- [X] T008 [US3] Create app-web/vela-wallet/src/lib/services/storage.ts: async
      KV `getItem/setItem/removeItem(key: string)` over IndexedDB (db `vela`,
      store `kv`, hand-rolled promise wrapper, no deps); absence/quota/denied
      answers as rejection for the executor's failure twin to classify
      (research D2); JSDoc records the Expo-compat key/value contract
- [X] T009 [P] [US3] Unit tests
      app-web/vela-wallet/src/lib/services/storage.svelte.test.ts (browser project — node has no IndexedDB; 7 tests): roundtrip, absent
      key → null, removeItem, oversized value ok, concurrent writes last-wins
- [X] T010 [P] [US3] Add (also added src/lib/settings + src/lib/session, the unlisted 019/023 gap — surfaced 1 hex + 4 px-in-comment violations in the settings layer, all fixed: ChainMark #fff → var(--color-onAccent), comments de-px'd) `src/lib/core` and `src/lib/services` (and,
      pre-emptively, `src/lib/settings`, `src/lib/session`) to the
      literal-audit source list in
      app-web/vela-wallet/src/lib/tokens/tokens.test.ts:65-77
- [X] T011 [P] [US3] Unit test app-web/vela-wallet/src/lib/core/client.test.ts:
      loadCore() is promise-cached and retries after a failed load (port the
      existing wasm-client behaviour assertions if any; else write them)
- [X] T012 [US3] Wire (wallet-state AND session targets) `node ../../rust/scripts/gen-core-types.mjs wallet-state
      --check` into app-web/vela-wallet/package.json `check` script
- [X] T013 [US3] Full gate (check 1139 files 0 errors; lint clean after .prettierignore gains core/generated; unit 389; build ok; e2e 58/58; wasm byte-identical 3,630,664): `pnpm check && pnpm lint && pnpm test:unit -- --run
      && pnpm build && pnpm test:e2e` — e2e green proves behaviour neutrality;
      `git diff --stat` recorded in results.md

**Gate**: all five app gates green; welcome-ssr zero-wasm + worker-purity
assertions untouched and green; wasm byte size unchanged vs T001.

---

## Phase 3: Settings live — network_admin (one commit) 🎯 MVP

- [X] T014 [US1] Port src/services/wallet-state-core/network-admin-types.ts →
      app-web/vela-wallet/src/lib/settings/core/network-admin-types.ts
      (imports repointed to $lib/core/generated; provenance header)
- [X] T015 [US1] Port network-admin-executor.ts (D1 REVISED during implementation: probes ported live, not fail-closed — core's add_confirmed hard-gates on verified compat, so a probe-less screen could never add a network; only pool/bundler-cache invalidations stay no-op. +3 trimmed service ports: net.ts, endpoints.ts, chain-registry.ts) →
      app-web/vela-wallet/src/lib/settings/core/network-admin-executor.ts per
      contracts/shell-operations.md: KV ops via $lib/services/storage,
      `write_service_endpoints`/read via the onboarding localStorage helper
      (research D3a), `start_search_debounce` via setTimeout, ALL
      network-flavoured ops answered immediately with the failure-twin shapes
      (research D1); exhaustive switch + `never`; `networkAdminFailure()` twin
- [X] T016 [US1] Create app-web/vela-wallet/src/lib/settings/core/network-admin.svelte.ts:
      app-resident singleton over createJsonWasmShell + NetworkAdminCore
      (research D8 corrected: Expo network-admin-resident.ts precedent —
      EMPTY_VIEW initial projection, idempotent ensure/boot, one-liner
      dispatch methods)
- [X] T017 [US1] Create app-web/vela-wallet/src/lib/settings/live.ts (overlay builders: rows/detail/wizard/providers/endpoints ×{mobile,desktop}; net-events.ts union threads ONE callback through SettingsHome/SettingsDesktop + 5 panels; UrlField gains onblur):
      `buildSettingsFromCore(netView, messages, identicon)` emitting the same
      SettingsHomeModel/SettingsDesktopModel as fixtures.ts; RPC-health tiles
      keep fixture values with `// live in 025` markers
- [X] T018 [P] [US1] Unit tests settings/core/network-admin-executor.test.ts (10 tests):
      one-op↔one-call against a mocked KV, fail-closed answers match the
      contract table verbatim, failure twin exhaustive
- [X] T019 [P] [US1] Unit tests settings/live.test.ts (9 tests incl. invariant-③ pin: unverified ≠ incompatible): builder output vs a
      recorded NetworkAdminView JSON fixture; sibling of fixtures.test.ts
- [X] T020 [US1] Wire app-web/vela-wallet/src/routes/[locale]/settings/+page.svelte (boot + fixture→identity→live overlay chain + onNetEvent translation table; currency row stub awaits Phase 5):
      boot the session on mount, `$derived` view → buildSettingsFromCore,
      dispatch handlers for currency row (stub until Phase 5), network
      add/edit/remove; prerender waiting state preserved (EMPTY_ACCOUNT
      overlay untouched); dispose on unmount
- [X] T021 [US1] Check corpus coverage — ZERO corpus delta: 9 new manifest fields (searching/checkingCompatibility/unableToVerify/retry + health.httpsRequired/invalid…) all resolve EXISTING settingsModals keys; 15-locale prerender green is the proof for any interaction-only strings; if a
      key is missing follow contracts/i18n-keys.md (5 steps) and record the
      delta; expected zero
- [X] T022 [US1] Full gate (check 1149 files 0 err; lint clean; unit 406; build ok; e2e 58/58; wasm byte-identical) + manual quickstart scenarios 2–3; results.md
      phase entry

**Gate**: gates green; custom-network lifecycle survives reload (manual);
galleries pixel-unchanged (fixtures untouched).

---

## Phase 4: Contacts live — route + interaction surface (one commit)

- [X] T023 [US2] Create route app-web/vela-wallet/src/routes/[locale]/contacts/
      {+page.server.ts,+page.svelte}: EntryGenerator ×15 locales, prerender
      true, resolveContactsMessages load, allowed_route guard → Welcome
      (pattern: wallet/+page.svelte:125-127)
- [X] T024 [US2] Un-swallow the contacts tab (wallet + settings both goto the new route; stale comments refreshed): route `'contacts'` selections in
      src/routes/[locale]/wallet/+page.svelte:134-136 and
      settings/+page.svelte:85-87 to `goto` the new route (both layouts)
- [X] T025 [US2] Port src/services/wallet-state-core/contacts-types.ts →
      app-web/vela-wallet/src/lib/contacts/core/contacts-types.ts
- [X] T026 [US2] Port contacts-executor.ts (camelCase + tombstone-map byte-compat; history honest-empty; identity/classify fail-closed; no clearContactsCache — the core is this app's only reader) →
      app-web/vela-wallet/src/lib/contacts/core/contacts-executor.ts: the three
      KV keys byte-compatible (camelCase stored shapes + tombstone map —
      keep the shape-translation and defensive-coercion blocks verbatim),
      `load_send_history` → `{txs: []}`, `resolve_identity`/`classify_recipient`
      fail-closed (contract table); `contactsFailure()` twin
- [X] T027 [US2] Create app-web/vela-wallet/src/lib/contacts/core/contacts.ts:
      route-scoped factory with dispose()
- [X] T028 [US2] Add the callback surface (ContactsUiEvent union via ui-events.ts; SearchHeader gains onquery, AlphaSectionList delete carries its contact, ActionMenuSheet confirm reports its selection, GroupModel gains optional core id; PLUS two new form sheets the 018 boards never drew — ContactEditSheet/GroupEditSheet from existing primitives, flagged as a Penpot catalog gap) to
      app-web/vela-wallet/src/lib/contacts/ContactsHome.svelte and
      ContactsDesktop.svelte: optional props per data-model.md (onselect,
      onadd, onsave, ondelete, ongroupcreate, ongroupassign, onopen, onback,
      ongroupopen — trimmed to what the drawn states expose); absent = pure
      picture; gallery renders unchanged
- [X] T029 [US2] Create app-web/vela-wallet/src/lib/contacts/live.ts (sectioning + search documented as render concerns; core order survives inside each letter):
      `buildContactsFromCore(view, messages, identicon)` — core list order
      authoritative, builder does letter-sectioning only (research D7)
- [X] T030 [P] [US2] Unit tests contacts/core/contacts-executor.test.ts (9 tests):
      stored-shape roundtrip (camelCase in/out byte-compatible), coercion of
      malformed rows → empty, fail-closed answers per contract
- [X] T031 [P] [US2] Unit tests contacts/live.test.ts (8 tests): sectioning of a
      core-ordered list, groups filter projection, empty state
- [X] T032 [US2] Wire the route page (route-scoped session w/ dispose; delete = confirm sheet through the drawn ActionMenuSheet; form address gate mirrors the core's is_address shape — deviation recorded: apply_save itself merges unchecked, the form is where garbage stops, as in the Expo client): session boot, view → build → components,
      handlers dispatching core events (add/save/delete/group), identicon via
      identiconSvgForClient; waiting state before core rules
- [X] T033 [US2] Corpus check — ZERO delta again: 9 new manifest fields (editTitle/nameLabel/…/invalidAddress/groupName*) all resolve 018-era contacts keys per contracts/i18n-keys.md; record delta
      (expected near-zero)
- [X] T034 [US2] Full gate (check 1162 files 0 err; lint clean; unit 19 files/423; build ×15; e2e 58/58) + manual quickstart scenarios 4–5; results.md entry

**Gate**: gates green; contacts CRUD + groups survive restart (manual);
`/{locale}/contacts` guarded; galleries unchanged.

---

## Phase 5: display_currency — the SC-008 probe (one commit)

- [X] T035 [US1] Port the currency arm (read_device_currency → null is the core's own web rule; resolve_rate → null until 025, null ≠ 1) of
      src/services/wallet-state-core/executors.ts (currencyOperationFailure +
      executor cases) → app-web/vela-wallet/src/lib/settings/core/currency-executor.ts:
      read/write `vela.displayCurrency` via KV, `read_device_currency` → null,
      `resolve_rate` → `{rate: null}` (contract table)
- [X] T036 [US1] Create app-web/vela-wallet/src/lib/settings/core/currency.svelte.ts (INITIAL = pristine USD/1/uncommitted; events are refresh/user_chose per the generated wire):
      app-resident singleton (session.svelte.ts pattern: `$state` view,
      idempotent boot, one-liner dispatch methods; initial pair USD/1 mirrors
      the machine's pristine view — see Expo display-currency-resident.ts)
- [X] T037 [US1] Wire the Settings currency row live (withLiveCurrency overlay: row value = committed code, sheet marks selection; SettingsHome gains oncurrencyselect; desktop dropdown recorded as debt with the other desktop interactivity): selection dispatches
      `set_code`, committed view drives the row + persists; rate:null renders
      the degraded (USD-figure) presentation the core rules define
- [X] T038 [P] [US1] Unit tests settings/core/currency-executor.test.ts (4 tests) +
      currency store boot idempotence
- [X] T909 [US3] **SC-008 probe (acceptance)** — PASSED: the phase diff is 6 files (3 new settings/core files, live.ts, SettingsHome, the route); nothing under src/lib/core/, src/lib/services/ or rust/scripts/. Diffstat in results.md: `git diff --stat HEAD~1` of
      this phase's commit touches NOTHING under
      app-web/vela-wallet/src/lib/core/ or src/lib/services/ or
      rust/scripts/ — paste the diffstat into results.md as the paved-road
      proof; if it fails, the plumbing gap is fixed in Phase 2 terms first and
      the probe re-run
- [X] T039 [US1] Full gate (check 1167/0; lint clean; unit 20 files/427; build ×15; e2e 58/58) + manual quickstart scenario 1; results.md entry

**Gate**: gates green; currency choice survives restart; SC-008 diffstat
recorded clean.

---

## Phase 6: Polish — e2e matrix, budgets, closeout (one commit)

- [ ] T040 [P] e2e app-web/vela-wallet/e2e/settings-persistence.e2e.ts:
      currency change + custom-network add/edit/remove each survive
      `page.reload()` and a fresh context sharing storageState; runs on
      chromium+firefox+webkit; duplicate-chain-id refusal asserted via
      on-screen corpus copy
- [ ] T041 [P] e2e app-web/vela-wallet/e2e/contacts-persistence.e2e.ts:
      add/edit/group/delete persist across reload; deletion durable
      (tombstone); invalid address refused; guard redirect for fresh profile;
      three engines
- [ ] T042 e2e budget re-assertions: extend/verify welcome-ssr.e2e.ts still
      asserts zero-wasm Welcome + worker purity; add an assertion that
      /{locale}/settings and /contacts fetch the SAME fingerprinted wasm as
      /wallet (no second artifact)
- [ ] T043 Verify galleries: `pnpm test:unit -- --run` fixtures suites +
      spot-eyeball /{locale}/gallery/[state] settings & contacts states in
      dark+light (record in results.md)
- [ ] T044 Close out specs/024-web-live-shell/results.md: gate table per
      phase, wasm byte delta (must be 0), corpus delta, SC-001…SC-008
      verdicts, deviations.md if any deviations accrued
- [ ] T045 Final full-repo sanity: `node rust/scripts/gen-core-types.mjs
      --check` (all targets) + `pnpm check && pnpm lint && pnpm test:unit --
      --run && pnpm build && pnpm test:e2e`

**Gate**: SC-001–SC-008 all verdicted in results.md; every earlier phase's
commit still green on the branch tip.

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → {Phase 3, Phase 4} → Phase 5 → Phase 6.
- Phase 4 does not depend on Phase 3 (different machines, different dirs) but
  lands after it to keep one-commit-one-problem review order; if parallelised
  across sessions, rebase order is 3 then 4.
- Phase 5 depends on Phase 3 only for the currency-row stub (T020/T037).
- US1 completes at Phase 5; US2 at Phase 4; US3 at T909.

## Parallel Opportunities

- Within Phase 2: T009/T010/T011 after T004–T008.
- Within Phase 3: T018/T019 while T020 is wired.
- Within Phase 4: T030/T031 while T032 is wired.
- Phase 6: T040/T041 in parallel.

## Implementation Strategy

MVP = Phases 1–3 (one fixture screen live proves the pipeline; quickstart
scenarios 2–3 demonstrable). Each phase is one commit with its gate; stop at
any phase boundary and the branch is shippable-green.
