# Contract — i18n keys (024)

Expectation: **near-zero corpus delta.** Contacts copy shipped with spec 018,
settings copy with spec 023, both ×15 locales; the live wiring renders the
same states the galleries already render.

Rules if a gap is found (an interaction-only string the fixtures never
needed):
1. Add the key to all 15 locale namespace files under
   `rust/crates/vela-core/i18n/locales/`.
2. Update the path-count pin in `scripts/gen-i18n.mjs`.
3. `npm run gen:i18n` at repo root.
4. `npm run lint:i18n && npm run verify:i18n` green.
5. `npm run build:wasm` + `pnpm sync:wasm` (catalog fingerprints ride the
   artifact pipeline).

Keys are resolved at build time through the existing per-domain manifests
(`src/lib/settings/messages.ts`, `src/lib/contacts/messages.ts`); no runtime
translation, no JS-side library, no hard-coded strings (FR-007). Any key
added is listed in results.md with its namespace and the new pin values.
