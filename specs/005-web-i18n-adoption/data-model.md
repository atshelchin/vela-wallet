# Data Model — 005 Web adoption

This feature adds no persisted data and no schema. What it adds is **runtime state with a
single owner**, which is where the Phase 1 critique found the most latent bugs: three design
areas invented three names for the same variable and wrote it on different subsets of the
paths that change it.

---

## Engine (wasm `I18n`) — owned by `index.web.ts`, never exposed

| Field | Held by | Notes |
|---|---|---|
| the instance | closure in `index.web.ts` | never handed to react-i18next, never placed on `I18nContext` (D2) |
| `en` catalog | Rust, plus retained JS bytes | Rust copies on construction; the JS bytes are retained for poison recovery (R4) |
| active catalog | Rust — **exactly one non-`en` slot** | `load_catalog` is `self.active.replace` (`mod.rs:280`); a second load evicts the first with no error |

Residency is always `[active, 'en']`, or `['en']` when active *is* `en`. There is no state in
which more than two catalogs are resident, so "cache the last N locales in the engine" is not
available — the JS cache exists precisely because the engine cannot hold them.

---

## `engineLanguage` — the one JS mirror

The tag last **successfully** handed to `engine.changeLanguage`. Single name, single owner
(`catalog-store.ts`), written on **all four** paths:

1. boot, after the initial catalog lands
2. a successful language switch
3. failure rollback — the switch did not happen, so the mirror keeps the previous value
4. poison recovery — after the engine is rebuilt

It is deliberately **not** derived from `engine.language()`: that costs a wasm string
allocation per read, and the whole point is to know what JS *believes* so a divergence from
what the engine actually holds is detectable.

`i18n.language` (i18next's own) is a **separate** value and may legitimately differ during a
switch. The interesting failure — the one FR-023's defect produces — is exactly
`i18n.language` moving while `engineLanguage` cannot.

---

## Catalog cache — `catalog-store.ts`

| Property | Value | Why |
|---|---|---|
| stores | raw `Uint8Array` | `loadCatalog` takes bytes and re-parses in Rust; a parsed copy would need re-stringifying at ~214 µs per re-entry |
| capacity | 2 non-`en` entries (LRU) | the minimum satisfying `ja → ru → ja` with one fetch each; bounds memory at ~157 KB vs ~888 KB unbounded |
| `en` | never cached here, never evicted | it is bundled and retained separately; `releaseCatalog('en')` returns `false` by design |
| key | locale tag | one of the 15 canonical tags (FR-007) |

---

## Generation token

A monotonic integer incremented per switch request. A fetch that resolves after a newer
switch began MUST be discarded.

Without it: the user switches `ja` → `ru`, the `ja` response lands late, `loadCatalog('ja')`
evicts `ru`, and `catalog_for` (`mod.rs:322-333`) answers in **English** — not in Japanese,
which would at least be visibly wrong. The engine reports nothing. This guard is the only
defence.

---

## Divergence record

Defined in [contracts/web-i18n-seam.md §4](./contracts/web-i18n-seam.md). Summarised:

`{ key, options, language, rust, oracle, reason, at }`, where `options` uses the same tagged
encoding as `scripts/dump-vectors/i18n.dump.mjs`, `rust` is `null` when the engine threw, and
`reason ∈ {mismatch, threw, poisoned}`.

`at` is milliseconds since harness start, **not** a wall clock — the records are compared and
committed, so a timestamp would make every run differ.

Records are in-memory only. Nothing is persisted: the harness is a development instrument, and
a divergence's durable form is a committed regression case, not a stored log.

---

## Harness mode

`'off' | 'first-seen' | 'every'`, default `__DEV__ ? 'first-seen' : 'off'`.

The `first-seen` cache holds input fingerprints that have **already agreed**. That invariant is
what makes returning Rust on a cache hit byte-identical by construction, and it is why a
divergent input is never cached — it keeps being compared and keeps rendering the oracle.

---

## What is NOT state

- **The key list.** Derived by flattening the generated `en` export from `resources.ts` (R8).
  No new generated file, no second source of truth for what keys exist.
- **The oracle.** A captured function, not data.
- **Residency.** Read from the engine on demand for diagnostics; never mirrored, or it becomes
  a fourth thing to keep in sync.
