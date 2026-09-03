# Data Model — 024 Web Live Shell

The machines' wire types are generated (ts-rs) and are the authority; this
file records what the *web shell* stores and builds, and how it maps.

## Stored records (IndexedDB `vela` / store `kv`, via the async KV — research D2)

Formats are the Expo compatibility contract, byte-for-byte (the executors'
shape-translation stays valid verbatim):

| Key | Value format (stored) | Written at the request of |
| --- | --- | --- |
| `vela.contacts` | `StoredContact[]` — camelCase: `{ address, name?, resolvedName?, resolvedSource?, kind, favorite?, note?, txCount, lastUsed, firstSeen, source }` | contacts `WriteContacts` |
| `vela.contacts.dismissed` | `Record<address, epochMs>` (map, not list) | contacts `WriteDismissed` |
| `vela.contactGroups` | `{ id, name, color?, members: string[] }[]` | contacts `WriteGroups` |
| `vela.customNetworks` | as Expo `storage.ts` | network_admin `WriteCustomNetworks` |
| `vela.networkConfig` | as Expo | network_admin `WriteNetworkConfigs` |
| `vela.rpcProviders` | as Expo | network_admin `WriteRpcProviders` |
| `vela.displayCurrency` | currency code string | display_currency `WriteStoredCode` |

**Exception (research D3a)**: `vela.serviceEndpoints` is written through the
same localStorage helper onboarding reads — one logical record, one store.

**Untouched**: `vela.accounts`, `vela.activeAccountIndex`,
`vela.pendingUploads` (localStorage, session/onboarding executors' property).

## Executor ↔ operation map (full contract in [contracts/shell-operations.md](./contracts/shell-operations.md))

- contacts: `ReadStore`→KV reads ×3 (+coercion), `Write*`→KV writes (best
  effort), `LoadSendHistory`→`{txs: []}`, `ResolveIdentity`/`ClassifyRecipient`
  → fail-closed (D1).
- network_admin: `ReadStore`→KV reads (+D3a), `Write*`→KV writes,
  `StartSearchDebounce`→`setTimeout`, all fetch/probe/rpc ops → fail-closed
  (D1), `InvalidatePools`/`ClearBundlerCache`→acknowledged no-op.
- display_currency: `ReadStoredCode`/`WriteStoredCode`→KV,
  `ReadDeviceCurrency`→`None`, `ResolveRate`→`{rate: null}` (D1).

## Display builders (research D7)

- `buildSettingsFromCore(netView, currencyView, messages, identicon) →
  SettingsHomeModel/SettingsDesktopModel` — same shapes `settings/fixtures.ts`
  emits; RPC-health tiles keep fixture values, marked `// live in 025`.
- `buildContactsFromCore(contactsView, messages, identicon) →
  ContactsHomeModel/ContactsDesktopModel` — core list order is authoritative;
  the builder only groups the ordered list into `LetterSectionModel[]`
  (presentation grouping).

## Contacts callback surface (research D6)

Optional props on `ContactsHome`/`ContactsDesktop`, absent = pure picture
(gallery unchanged): `onselect(tab)` (tab bar, as WalletHome), `onadd()`,
`onsave(draft)`, `ondelete(address)`, `ongroupcreate(name)`,
`ongroupassign(address, groupId)`, `onopen(address)`, `onback()`,
`ongroupopen(groupId)`. Handlers injected by the route; each is a one-line
dispatch to the contacts store. Exact set may shrink to what the drawn states
actually expose — recorded in tasks.

## Store lifetimes (research D8)

| Store | File | Lifetime |
| --- | --- | --- |
| currency | `src/lib/settings/core/currency.svelte.ts` | app-resident singleton |
| network_admin | `src/lib/settings/core/network-admin.svelte.ts` | app-resident singleton (Expo resident precedent; 025 scan recovery shares the ledger) |
| contacts | `src/lib/contacts/core/contacts.ts` (factory) | contacts route |
