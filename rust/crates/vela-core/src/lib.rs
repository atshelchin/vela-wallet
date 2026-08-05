//! Vela Wallet shared computation core.
//!
//! Pure, deterministic, correctness-critical computation only: parsing, encoding,
//! hashing, big-integer math, data assembly/validation. No I/O, no network, no UI,
//! no randomness. Every fallible function returns `Result<_, CoreError>` — never a
//! default value on bad input.
//!
//! Feature spec: `specs/001-rust-core-bindings/` (contracts/core-api.md is the
//! authoritative surface; conformance vectors in `tests/vectors/` are extracted
//! from the production TypeScript implementations and pin byte-identical behavior).

#![forbid(unsafe_code)]
#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

pub mod abi;
/// Portable onboarding state machines. Feature-gated (`--features crux`) so the
/// uniffi bindings — and therefore the iOS/Android binaries — never link the
/// state-machine framework. See `specs/011-crux-onboarding-state/`.
#[cfg(feature = "crux")]
pub mod app;
pub mod eip712;
pub mod error;
pub mod i18n;
mod i18n_catalogs;
pub mod identicon;
mod identicon_features;
pub mod l10n;
pub mod primitives;
pub mod safe;
pub mod types;
pub mod webauthn;

pub use abi::AbiValue;
pub use error::CoreError;
pub use i18n::{
    canonical_tag, plural_category, plural_suffix, plural_suffixes, resolve_language, Catalog,
    Category, Count, Dir, I18n, LanguageState, Lookup, Options, OwnedOptions, OwnedVar, PluralMode,
    Scratch, Var,
};
pub use identicon::{
    identicon_data_uri, identicon_params, identicon_svg, identicon_svg_circular, make_hash,
    normalize_seed, Colors, IdenticonHash, IdenticonParams, Section, Sections,
};
pub use types::{ClientDataKind, P256PublicKey, SafeAddressInfo, WebAuthnAssertion};
