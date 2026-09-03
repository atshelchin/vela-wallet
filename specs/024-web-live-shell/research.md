# Research — 024 Web Live Shell

Decisions D1–D8. Each records what was chosen, why, and what was rejected.
Code references were verified against the tree on 2026-09-03 (branch point:
`main` @ e78afdfa).

## D1 — The zero-network boundary: answer, fail closed, never skip

**Decision**: This feature ships no RPC/fetch layer. Every network-flavoured
operation the three machines can request is *answered* with the failure/empty
variant the core already models, in the same turn, without a network attempt:

| Machine | Operation | 024 web answer |
| --- | --- | --- |
| contacts | `ResolveIdentity` | `IdentityResolved { identity: None }` (contacts.rs: "no identity anywhere, or the lookup failed"; only `Some` is ever cached) |
| contacts | `ClassifyRecipient` | `RecipientClassified { code: None }` (`None` = unknown, NOT a verdict, never cached) |
| contacts | `LoadSendHistory` | `HistoryLoaded { txs: [] }` — truthful: the web has no local tx store yet, so there is no history to derive from |
| display_currency | `ResolveRate` | `Rate { rate: None }` (`None` ≠ 1 by core rule; formatting degrades to the USD figure, conversion refuses) |
| display_currency | `ReadDeviceCurrency` | `None` — already the specified web behaviour (display_currency.rs: "None on web") |
| network_admin | `ProbeRpc` / `ProbeReachable` / `FetchChainInfo` / `FetchSearchIndex` / `RpcGetCode` / `RpcCallP256` / `FetchServiceHealth` / `FetchFiatRates` | the operation's failure/timeout variant — the core's ported-verbatim rules already define what a failed probe means (`add-network.ts:47` had no `rpcFailed` branch: saving a custom network is not gated on probe success; health renders unknown/unreachable) |
| network_admin | `InvalidatePools` / `ClearBundlerCache` | acknowledged no-op (nothing to invalidate on web yet) — answered, never skipped, per the session executor's `clear_extension_cache` precedent |

**Rationale**: The cores were designed for exactly this: every one of these
"failure" shapes is a modeled, tested state, not an error path. Answering
fail-closed keeps FR-004 intact (no business `if` deciding to skip), keeps
the executors byte-simple, and gives spec 025 a single, mechanical upgrade:
replace the fail-closed arm with the real service call.

**Rejected**: (a) shipping a minimal fetch just for probes — drags spec 025's
infrastructure (pool policy, admission, timeouts) in early and unreviewed;
(b) leaving network ops unanswered — a skipped op leaves the core waiting
forever (the documented cardinal sin of the executor contract).

## D2 — Storage: an AsyncStorage-shaped async KV over IndexedDB

**Decision**: `app-web/vela-wallet/src/lib/services/storage.ts` exposes
`getItem/setItem/removeItem(key): Promise<…>` — the AsyncStorage string-KV
shape — implemented on IndexedDB (database `vela`, one object store `kv`,
~80-line hand-rolled promise wrapper, zero dependencies). All machine data of
this feature lives there under the **same keys and value formats the Expo
client wrote**: `vela.contacts` / `vela.contacts.dismissed` /
`vela.contactGroups` (camelCase stored shapes + address→ms tombstone map —
the compatibility contract the Expo contacts-executor documents),
`vela.customNetworks`, `vela.networkConfig`, `vela.serviceEndpoints`,
`vela.rpcProviders`, `vela.displayCurrency`.

**Rationale**: The Expo executors were written against an async string KV;
matching the shape makes the port a zero-diff seam (only the import changes).
IndexedDB because contacts/networks are unbounded structured data and
localStorage's ~5 MB sync ceiling plus main-thread JSON cost rule it out —
and because spec 025/026 (tx records, balance cache) need the same store.
Preserving the exact stored formats keeps the executors' documented
shape-translation logic valid verbatim.

**Rejected**: localStorage for everything (ceiling, sync jank); an IDB
library (idb ≈ dependency for 80 lines); per-machine object stores (schema
ceremony with no query need — everything is read-whole/write-whole).

## D3 — What stays in localStorage

**Decision**: the four onboarding keys (`vela.accounts`,
`vela.activeAccountIndex`, `vela.pendingUploads`, `vela.serviceEndpoints` as
read by onboarding) are **not touched and not migrated** — the session
executor keeps its current synchronous reads. No new localStorage keys are
added by this feature.

**Rationale**: spec FR-009 pins onboarding behaviour; the session machine's
executor is on the reviewed 019 path and there is no benefit to churning it.
Note the overlap: `vela.serviceEndpoints` is read by onboarding (localStorage)
and written by `network_admin` (IDB in this design) — see D2a below.

**D3a — the serviceEndpoints overlap**: `network_admin`'s
`write_service_endpoints` targets the same logical record onboarding reads.
To avoid two stores disagreeing, the network-admin executor writes this ONE
key through the same localStorage helper onboarding reads (a documented,
deliberate exception in the executor — still one op ↔ one storage call, no
business logic). Everything else goes to IDB.

## D4 — Codegen: one shared generated dir for app-web

**Decision**: add `app-web/vela-wallet/src/lib/core/generated/` as a second
outDir on the **existing** `wallet-state` target in
`rust/scripts/gen-core-types.mjs` (the generator generates once and mirrors to
N dirs by design). Committed, like every other mirror. The app's `check`
script gains `node ../../rust/scripts/gen-core-types.mjs wallet-state --check`
— is not currently run by any CI job, which is a known repo-wide gap; adding
it to the app's local gate at least fences this feature's surface.

**Rationale**: one shared dir (not per-domain dirs) mirrors the Expo layout
the executors import from, keeping ports mechanical; the generator's
mirror-from-one-generation design means the two apps cannot drift from each
other.

**Rejected**: per-domain generated dirs (`settings/generated`,
`contacts/generated`) — 311 files would be partitioned by hand and the
cross-domain types (shared `Account` etc.) would need a home anyway.

## D5 — Plumbing home: move to `$lib/core/`, delete the old paths

**Decision**: `effect-loop.ts` and `json-shell.ts` move (git mv, contents
unchanged) from `src/lib/onboarding/core/` to `src/lib/core/`;
`SessionOptions<View>` hoists into `src/lib/core/types.ts`; a new
`src/lib/core/client.ts` owns the idempotent wasm load (`loadCore()`,
promise-cached, retry-on-failure — the current `wasm-client.ts` logic) and
re-exports all 24 `bridge_class!` Core classes. `onboarding/core/wasm-client.ts`
becomes a thin re-export of `loadCore` under its old name so the onboarding
executors' diff stays near-zero; `session/core/*` repoints to `$lib/core`.

**Rationale**: `session/core/session.svelte.ts` already reaches across into
`onboarding/core/` for the loop and shell — the cross-domain import is
pre-existing debt this feature would otherwise triple. Moving now, while two
importers exist, is the cheapest it will ever be.

**Rejected**: re-export stubs at the old paths for the loop/shell (leaves the
misleading layout in place; the whole point of the paved road is that the
next 20 machines import from an honest address).

## D6 — Contacts interaction surface: callback props, route-owned handlers

**Decision**: `ContactsHome.svelte` / `ContactsDesktop.svelte` gain optional
callback props (`onadd`, `onsave`, `onDelete`, `ongroup…`, `onselect`, mirroring
`WalletHome`'s existing `onselect/onflow` convention — exact names fixed in
data-model.md). All handlers are injected by the new route, which is the only
place that talks to the contacts store. Absent callbacks = the components
remain pure pictures, so every gallery state renders unchanged.

**Rationale**: this is the established house pattern (`WalletHome`), keeps
the components audit-pure (strings and models in, elements out), and keeps
the gallery canon untouched (FR-006).

## D7 — Live builders are siblings of fixture builders

**Decision**: `src/lib/settings/live.ts` (`buildSettingsFromCore(view(s),
messages, identicon)`) and `src/lib/contacts/live.ts`
(`buildContactsFromCore(...)`) produce the **same display models** the drawn
components already consume, next to — never replacing — `fixtures.ts`.
Letter-sectioning of the contacts list: the core's `ContactsView` list
ordering is authoritative; the builder groups the already-sorted list into
`LetterSectionModel[]` (presentation grouping of a core-ordered list — the
same class of work as date-grouping, explicitly a render concern).

**Rationale**: the model files state the contract ("components consume ONLY
these display-ready shapes; a later real-data feature replaces the fixture
layer that builds them and nothing else") — this is that feature, doing
exactly and only that. Precedent: `wallet/identity.ts` overlays.

## D8 — Store lifetimes

**Decision**:
- `display_currency`: **app-resident singleton** (`currency.svelte.ts`,
  session-pattern) — every money-showing surface in 025/026 will read the
  same committed pair; the Expo resident (`display-currency-resident.ts`)
  documents why two writers racing on the stored code was a real bug.
- `network_admin`: **app-resident singleton** — corrected from an earlier
  route-scoped draft after reading the Expo resident's rationale
  (`network-admin-resident.ts`): the machine is the app-lifetime mirror of
  four storage keys, and a second entry point (025's EIP-681 scan recovery)
  must share the same ledger or the core-owned duplicate-chain gate reads the
  wrong one. Same `EMPTY_VIEW` initial-projection constant, ported.
- `contacts`: **route-scoped factory** with `dispose()` (contacts route only;
  when 026's send flow needs recipient suggestions it gets its own session —
  the core is cheap, the store is not global state).

**Rationale**: matches the documented singleton-vs-transient decision rule in
`session.svelte.ts` (app-resident only if multiple screens share the same
committed truth).
