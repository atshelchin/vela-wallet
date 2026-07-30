# Contract: `vela_core::identicon` exported API

**Date**: 2026-07-30 · Types: see [data-model.md](../data-model.md). Every function is
pure, deterministic, thread-safe and free of mutable state. Names are `snake_case` in
Rust and generated as `camelCase` (Kotlin/TS) or Swift conventions by the binding
layers. The **JS column** names the `identicons-esm@1.0.1` export each item
corresponds to, which is how FR-010's "recognisably close" is checked.

## Constants

| Rust | Type | JS |
|---|---|---|
| `COLORS` | `[&'static str; 10]` | `colors` |
| `BACKGROUND_COLORS` | `[&'static str; 10]` | `backgroundColors` |
| `DEFAULT_SHADOW` | `&'static str` | `defaultShadow` |
| `DEFAULT_BACKGROUND_SHAPE` | `&'static str` | `defaultBackgroundShape` |
| `IDENTICON_PLACEHOLDER` | `&'static str` | `identiconPlaceholder` |
| `IDENTICON_PLACEHOLDER_BASE64` | `&'static str` | `identiconPlaceholderBase64` |
| `SEED_MAX_UTF16_LEN` | `usize` = 128 | *(app policy in `Identicon.tsx`)* |
| `SECTION_COUNT` | `usize` = 21 | *(implicit)* |

## Functions

| Rust | Signature | JS | Notes |
|---|---|---|---|
| `make_hash` | `(seed: &str) -> IdenticonHash` (infallible) | `makeHash` | Zero allocation. Byte-identical for **every** input, including degenerate ones |
| `identicon_params` | `(seed: &str) -> Result<IdenticonParams, CoreError>` | `getIdenticonsParams` | **Strict** (default): errors on both degenerate regimes |
| `identicon_params_js_compat` | `(seed: &str) -> Result<IdenticonParams, CoreError>` | `getIdenticonsParams` | Errors only where JS throws (Regime B); reproduces `main = "undefined"` in Regime A. Exists to make FR-002 provable over the whole domain |
| `section_svg` | `(section: Section, index: i64) -> Result<&'static str, CoreError>` | `sectionToSvg` | `index` is `i64` because JS accepts any number and applies `abs(n % 21) + 1` |
| `sections_svg` | `(face: i64, top: i64, sides: i64, bottom: i64) -> Result<Sections, CoreError>` | `sectionsToSvg` | — |
| `colors_from_indices` | `(main: u8, background: u8, accent: u8) -> Colors` (infallible) | `colorsToRgb` | Indices must be `0..=9`; out-of-range is unreachable from `make_hash` and saturates rather than panicking |
| `default_circle_shape` | `(color: &str) -> String` | `defaultCircleShape` | One allocation |
| `assemble_svg` | `(params: &IdenticonParams) -> String` | `assembleSvg` | Stock hexagonal output with `clipPath id="a"`. Exactly one allocation, exact capacity |
| `assemble_svg_circular` | `(params: &IdenticonParams) -> String` | *(none — Vela's variant)* | Byte-identical to `Identicon.tsx`'s current output. No SVG ids, so instances are safe to share one DOM |
| `format_identicon` | `(svg: &str, format: IdenticonFormat) -> String` | `formatIdenticon` | `Svg` returns as-is; `DataUri` returns `data:image/svg+xml;base64,…` |
| `identicon_svg` | `(seed: &str) -> Result<String, CoreError>` | `assembleSvg(getIdenticonsParams(s))` | Convenience: params + stock assembly. **Not** `createIdenticon` — see the note below |
| `identicon_svg_circular` | `(seed: &str) -> Result<String, CoreError>` | *(Vela's variant)* | **What the wallet renders.** Convenience: params + circular assembly |
| `identicon_data_uri` | `(seed: &str) -> Result<String, CoreError>` | `formatIdenticon(assembleSvg(…), 'image/svg+xml')` | Stock assembly, base64 data URI |
| `create_identicon` | `(raw_seed: &str, options: CreateOptions) -> Result<String, CoreError>` | `createIdenticon` | Full JS contract including the validate-and-normalise path and both placeholder short-circuits |

**Why `identicon_svg` is not defined as `createIdenticon(s, {shouldValidateAddress:false, format:'svg'})`**, despite that being the obvious reading: `createIdenticon` tests `if (!input) return identiconPlaceholder` *after* validation is skipped, so an **empty seed returns the raw placeholder** even with validation off — and returns it un-encoded even when a data URI was requested, because the short-circuit happens before `formatIdenticon`. The two agree for every non-empty seed. That quirk belongs to `create_identicon`, which reproduces it exactly and has its own corpus cases; `identicon_svg` is the pure params-and-assemble path, so an empty seed yields a real 4,502-byte identicon.
| `normalize_seed` | `(seed: &str) -> Cow<'_, str>` (infallible) | *(app policy)* | Full Unicode lowercase + 128-UTF-16-unit cap, in that order. **All platforms must use this** (research D9) |
| `nimiq_is_valid_address` | `(input: &str) -> bool` (infallible) | `ValidationUtils.isValidAddress` | Alphabet + 36-char length + mod-97 IBAN checksum |
| `nimiq_format_address` | `(input: &str) -> Option<String>` | `validateInput` | Uppercase, strip `+`/space, regroup in 4s; `None` when invalid |

## Types crossing FFI

```rust
pub enum IdenticonFormat { Svg, DataUri }        // JS: 'svg' | 'image/svg+xml'

pub struct CreateOptions {
    pub validate_address: bool,                  // JS: shouldValidateAddress (JS default true)
    pub format: IdenticonFormat,                 // JS default 'image/svg+xml'
}
impl Default for CreateOptions { /* validate_address: false, format: Svg */ }
```

**Deliberate divergence from the JS default**: `CreateOptions::default()` sets
`validate_address: false`, where JS defaults it to `true`. Vela addresses are EVM
addresses and would fail Nimiq validation, so the JS default would return the
placeholder for every account. Callers wanting JS's default must say so explicitly.
Recorded in the corpus.

## Binding surfaces

The four consumers reach the same computation by three different routes:

| Platform | Route | Exposure work |
|---|---|---|
| `app-desktop` (GPUI, Rust) | **direct crate dependency** — `use vela_core::identicon` | none; no marshalling, `&'static str` used in place |
| `app-ios` (Swift) | uniffi 0.32 shell | `#[uniffi::export]` wrappers, `&'static str` → `String` |
| `app-android` (Kotlin) | uniffi 0.32 shell | same wrappers |
| `app-web` (TS) + current Expo web path | wasm-bindgen shell | `#[wasm_bindgen]` wrappers + tsify DTOs |

**Binding surface (all three shells expose the same subset):**

| Export | Signature over FFI |
|---|---|
| `identicon_svg_circular` | `(seed: String) -> String` / throws `CoreError` |
| `identicon_svg` | `(seed: String) -> String` / throws |
| `identicon_data_uri` | `(seed: String) -> String` / throws |
| `identicon_params` | `(seed: String) -> IdenticonParamsDto` / throws |
| `make_hash` | `(seed: String) -> String` (infallible) |
| `normalize_seed` | `(seed: String) -> String` (infallible) |

```rust
// DTO — both shells; sections carry the SVG fragment, matching the JS shape
struct IdenticonParamsDto {
    main: String, background: String, accent: String,
    top: String, sides: String, face: String, bottom: String,
}
```

`identicon_params_js_compat`, `section_svg`, `create_identicon` and the Nimiq helpers
are **not** exposed over FFI: the first is a test-only parity device, and the rest have
no caller on any Vela platform. They stay `pub` in the crate so `app-desktop` and the
conformance suite can reach them, which costs nothing.

## Deliberately not ported

None of these is computation; all belong to a rendering or scheduling layer, and each
would be dead weight in a shared core (spec Assumptions, "API parity is by shape"):

| JS export | Why omitted |
|---|---|
| `identiconToObjectURL` / `revokeIdenticonObjectURL` | browser `Blob`/`URL` APIs |
| `identicons-esm/web-component`, `/shiny-web-component` | custom elements — DOM |
| `identicons-esm/worker`, `/worker-client` | Web Worker transport |
| `identicons-esm/batch` (`createIdenticons`, `createIdenticonsStream`, `yieldToMain`) | main-thread yielding; a caller-side scheduling concern. Rust callers loop |
| `identicons-esm/cache` (`createIdenticonCached`, `createIdenticonCache`) | caching stays with the caller by design (FR-008, research D10) |
| `identicons-esm/shiny` (bronze/silver/gold materials) | a decorative variant the wallet does not use; the palettes and gradients are presentation, not identity — adding it later is additive and would not change any existing avatar |

## Error behaviour

| Input | `identicon_params` | `identicon_params_js_compat` | JS library |
|---|---|---|---|
| `""` (empty) | `Ok` — hash `0000000000000` | `Ok`, same | works |
| 42-char address | `Ok` | `Ok`, same | works |
| ≥ ~1,046 chars (Regime A) | `Err(InvalidIdenticonSeed)` | `Ok` with `main = "undefined"` | emits `fill="undefined"` |
| 7-char decimal form (Regime B) | `Err(InvalidIdenticonSeed)` | `Err(InvalidIdenticonSeed)` | **throws** |
| any input | never panics | never panics | may throw |
