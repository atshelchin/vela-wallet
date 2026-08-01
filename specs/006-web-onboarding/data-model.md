# Data Model: Web App Foundation + Onboarding Welcome Page

**Date**: 2026-08-01 · Sources: [spec.md](./spec.md) · [research.md](./research.md)

This feature has no persistence; its "data" is design tokens, locales, and
localized content flowing through a build-time pipeline.

## Entities

### DesignToken
One named visual decision from `docs/design-tokens.json` (DTCG dialect).

| Field | Type | Notes |
|---|---|---|
| `path` | dot-path string | e.g. `color.bg.base`, `space.xl`, `radius.full` |
| `set` | `core` \| `color-light` \| `color-dark` | mode sets carry only `color.*` |
| `$type` | DTCG type | `color`, `spacing`, `sizing`, `borderRadius`, `fontSizes`, `fontWeights`, `fontFamilies`, `letterSpacing`, `opacity`, `number`, `shadow`, `borderWidth` |
| `$value` | scalar/list | unit rules in [contracts/tokens.md](./contracts/tokens.md) |

**Derived forms**: CSS custom property (`--color-bg-base`) in `tokens.css`;
TS constant in `tokens.ts` for values tests/components need numerically.

**Validation**: generator asserts every referenced token exists and every
mode set defines the same color paths (light/dark symmetry — verified true in
the current export); drift gate asserts committed output ≡ regenerated output.

**WebAddition (subtype)**: token absent from the export but mandated by
`design-system.md` prose or this feature (`size.control.*`,
`breakpoint.desktop`, CJK fallback in `font.ui`). Carried in the generator as
a clearly-marked table, emitted with the same naming; each one is listed in
the delivery report.

### Locale
One of the 15 supported languages, identical to the corpus registry.

| Field | Type | Notes |
|---|---|---|
| `tag` | string | `en, zh, zh-TW, zh-HK, ja, ko, vi, id, tr, es-MX, pt-BR, fr, de, ru, it` |
| `dir` | `ltr` | all 15 are LTR today; `dir` still flows from the engine's `dir()` so RTL later needs no page change |
| `urlPath` | `/{tag}` | prerendered route |
| `hreflang` | string | equals `tag` |

**State/negotiation**: `Accept-Language` → exact match → base-language map
(`zh-CN→zh`, `zh-Hant*→zh-TW`, `zh-MO→zh-HK`? — no: `zh-MO→zh-TW` per RN
`resolveLanguage`; the matcher must copy the RN table verbatim, tested) →
`en`. Deterministic; no cookies, no IP geolocation.

### MessageKey
A dotted key in the corpus resolving to a string per locale.

| Field | Notes |
|---|---|
| `key` | e.g. `onboarding.welcomeWeb.features.noSeedPhrase.title` |
| `namespaceFile` | `onboarding.json` (per-locale) |
| `interpolation` | `{{name}}` syntax only; none of the new keys need it |
| `status` | `existing` (reused) or `new` (this feature adds to all 15 locales) |

**Reused**: `onboarding.welcome.createWallet`, `onboarding.welcome.alreadyHaveWallet`.
**New** (under `onboarding.welcomeWeb.`): `tagline`, `passkeyIndexLink`,
`features.<slug>.title|description` for the six slugs
`noSeedPhrase, oneAddress, openSource, keysInPasswordManager, safeContracts, stablecoinGas`.
Card numbers 01–06 are presentation (derived from order), not content.

**Validation**: every key resolves in all 15 locales through the wasm engine
(no key-echo); `lint:i18n` finds no NEW defects; `gen:i18n` idempotent after
regeneration.

### WelcomeFeatureCard
Presentation entity binding order + message keys.

| Field | Notes |
|---|---|
| `index` | 1–6, rendered as zero-padded `01`–`06` |
| `slug` | stable identifier, doubles as message-key segment |
| `titleKey` / `descriptionKey` | MessageKey references |

Order (from designs): 01 noSeedPhrase, 02 oneAddress, 03 openSource,
04 keysInPasswordManager, 05 safeContracts, 06 stablecoinGas.

### PageMessages (runtime shape)
The serializable object the `[locale]` layout load returns to the page —
resolved strings only, never keys or catalogs.

```
{ locale, dir, welcome: { tagline, createWallet, alreadyHaveWallet,
  passkeyIndexLink, features: [{ number, title, description } × 6] } }
```

Produced at prerender time by `engine.server.ts`; hydration reuses the
serialized data — client never resolves anything.

## Pipeline (who writes what)

```
docs/design-tokens.json ──gen-tokens.mjs──▶ tokens.css + tokens.ts (committed, drift-gated)
i18n/locales/*/onboarding.json (+new keys) ──gen-i18n.mjs──▶ paths.rs / catalogs / resources.ts / public/i18n
i18n/locales/<locale>.json aggregates ──engine.server.ts (prerender)──▶ PageMessages ──▶ static HTML × 15
Accept-Language ──/ (runtime worker)──▶ 307 /{locale}
```
