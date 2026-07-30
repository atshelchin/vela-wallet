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
pub mod eip712;
pub mod error;
pub mod identicon;
mod identicon_features;
pub mod primitives;
pub mod safe;
pub mod types;
pub mod webauthn;

pub use abi::AbiValue;
pub use error::CoreError;
pub use identicon::{
    identicon_data_uri, identicon_params, identicon_svg, identicon_svg_circular, make_hash,
    normalize_seed, Colors, IdenticonHash, IdenticonParams, Section, Sections,
};
pub use types::{ClientDataKind, P256PublicKey, SafeAddressInfo, WebAuthnAssertion};
