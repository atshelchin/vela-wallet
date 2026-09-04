# Data Model — 027 Web Extension Provider

Nothing here is a new source of truth. Every entity below is either the core's
(generated types, mirrored into `src/lib/core/generated/`) or a wire shape the
extension carries between processes.

## Owned by the core (do not re-model)

| Entity | Machine | What it decides |
| --- | --- | --- |
| **Grant** | `dapp_permissions` (1,341 lines) | which accounts and which chain an origin holds, how it was obtained, when it may be reused, and what revocation does |
| **Connection** | `dapp_session` (1,959) | the live session with a granted origin: its identity for display, its current account and chain, and what a change to either means for it |
| **Cached answer** | `ext_cache` (692) | the account and chain an already-granted origin may be told immediately, without a fresh decision |
| **Signing request** | `sign_request` (026) | unchanged — the request, its gate, its transport ownership and its answer |

## Carried by the extension (wire shapes, not decisions)

- **InjectedRequest** — `{ id, method, params, origin, tabId }`. The id is
  single-use; the origin is the browser's fact about the sender, never the
  page's claim. Bounded in size before it reaches a screen.
- **InjectedResponse** — `{ id, result }` or `{ id, error: { code, message } }`,
  delivered only to the tab and origin that asked. `4001` is the standard
  refusal, and dismissal produces it.
- **DAppIdentity** — the origin (fact) plus the page's self-reported name and
  icon (claims). The consent surface leads with the origin. An icon is loaded
  only from the requesting origin itself.
- **ProviderState** — what the injected object reports to the page: current
  accounts, chain, and connection status, driven by the core's view.

## Storage (extension origin only — D32)

The same keys and shapes the hosted site uses (`vela.accounts`,
`vela.activeAccountIndex`, `vela.contacts`, `vela.transactionHistory`,
`vela.serviceEndpoints`, …), in the extension's own IndexedDB/localStorage.
They are NOT shared with `https://getvela.app`, and are not synchronised in this
feature. The account is recovered from the passkey by `login`, not from storage.
