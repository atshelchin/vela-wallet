//! The opaque `metadata` blob a vela wallet writes into its p256-index group.
//!
//! One vela wallet maps to exactly one immutable registry group (Unit): the
//! Safe wallet's key set is fixed at creation (the address is a function of
//! it), which matches the registry group's create-time immutability. The
//! group's members are the wallet's founding passkeys, in the same canonical
//! order the Safe address derivation uses (`keys[0]` founding, the rest
//! sorted by `x‖y`). See [`crate::safe::compute_safe_address_multi`].
//!
//! The registry's `Member` struct carries no per-key metadata, so every
//! human-facing label lives here in the group's single opaque blob —
//! `key_names[i]` is the label of member `i` in founding order. A
//! single-key wallet degenerates to a one-element `key_names`.
//!
//! Reader-irrelevant local handles (credential ids) are deliberately absent:
//! the on-chain member entries already carry each public key, and a
//! credential id means nothing to anyone but the owning device.

#[cfg(feature = "bindings")]
use ts_rs::TS;

use serde::{Deserialize, Serialize};

use crate::error::CoreError;
use crate::primitives;

/// The current schema version. Bump on any incompatible shape change; the
/// `version` field lets a reader refuse or branch on unknown layouts.
pub const REGISTRY_METADATA_VERSION: u8 = 1;

/// Mirrors the registry contract's `MAX_METADATA_LENGTH` (bytes). The encoded
/// JSON must fit, or the register would revert `MetadataTooLong`.
pub const MAX_REGISTRY_METADATA_BYTES: usize = 2048;

/// The per-wallet metadata written into the wallet's registry group. Encodes
/// what the on-chain entries cannot: the counterfactual wallet address, the
/// Safe deployment version, and each founding key's human label.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct RegistryMetadata {
    /// Always [`REGISTRY_METADATA_VERSION`] when written by this build.
    pub version: u8,
    /// The counterfactual Safe wallet address, EIP-55 checksummed.
    pub address: String,
    /// The Safe deployment identity, e.g. `"safe-1.4.1"`.
    pub wallet_version: String,
    /// Per founding-member labels, in canonical founding order (`[0]` is the
    /// founding key). Length matches the group's member count, 1..=7.
    pub key_names: Vec<String>,
    /// Wallet creation time, ISO-8601 (mirrors `Account.created_at_iso`).
    pub created_at_iso: String,
}

impl RegistryMetadata {
    /// Canonical JSON → `0x`-hex, bounded to the registry's 2048-byte cap.
    /// Returns [`CoreError::RegistryMetadata`] if serialization fails or the
    /// blob would exceed the on-chain cap.
    pub fn encode_hex(&self) -> Result<String, CoreError> {
        let json = serde_json::to_vec(self)
            .map_err(|error| CoreError::RegistryMetadata(format!("serialize: {error}")))?;
        if json.len() > MAX_REGISTRY_METADATA_BYTES {
            return Err(CoreError::RegistryMetadata(format!(
                "encoded metadata is {} bytes, over the {MAX_REGISTRY_METADATA_BYTES}-byte cap",
                json.len()
            )));
        }
        Ok(primitives::to_hex(&json, true))
    }

    /// Parse a `0x`-hex (or bare hex) blob back into the schema.
    pub fn decode_hex(value: &str) -> Result<Self, CoreError> {
        let bytes = primitives::from_hex(value)?;
        serde_json::from_slice(&bytes)
            .map_err(|error| CoreError::RegistryMetadata(format!("deserialize: {error}")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn single_key() -> RegistryMetadata {
        RegistryMetadata {
            version: REGISTRY_METADATA_VERSION,
            address: "0x762EdA60D3B68755c271D608644650278f88329F".to_owned(),
            wallet_version: "safe-1.4.1".to_owned(),
            key_names: vec!["主钱包".to_owned()],
            created_at_iso: "2026-08-21T00:00:00Z".to_owned(),
        }
    }

    #[test]
    fn round_trips_a_single_key_wallet() -> Result<(), CoreError> {
        let meta = single_key();
        let encoded = meta.encode_hex()?;
        assert!(encoded.starts_with("0x"));
        assert_eq!(RegistryMetadata::decode_hex(&encoded)?, meta);
        Ok(())
    }

    #[test]
    fn round_trips_a_multi_key_wallet_preserving_order() -> Result<(), CoreError> {
        let mut meta = single_key();
        meta.key_names = vec![
            "founding".to_owned(),
            "备用手机".to_owned(),
            "ledger".to_owned(),
        ];
        let decoded = RegistryMetadata::decode_hex(&meta.encode_hex()?)?;
        // Founding order is load-bearing (it mirrors the address derivation).
        assert_eq!(decoded.key_names, meta.key_names);
        assert_eq!(decoded.key_names[0], "founding");
        Ok(())
    }

    #[test]
    fn decode_accepts_bare_and_prefixed_hex() -> Result<(), CoreError> {
        let encoded = single_key().encode_hex()?;
        let bare = encoded.strip_prefix("0x").unwrap_or(&encoded);
        assert_eq!(
            RegistryMetadata::decode_hex(bare)?,
            RegistryMetadata::decode_hex(&encoded)?
        );
        Ok(())
    }

    #[test]
    fn rejects_a_blob_over_the_on_chain_cap() {
        let mut meta = single_key();
        // A single oversized label pushes the JSON past 2048 bytes.
        meta.key_names = vec!["x".repeat(MAX_REGISTRY_METADATA_BYTES + 1)];
        let result = meta.encode_hex();
        assert!(result.is_err(), "must reject oversize");
        if let Err(error) = result {
            assert_eq!(error.code(), "RegistryMetadata");
        }
    }

    #[test]
    fn decode_rejects_non_json() {
        let result = RegistryMetadata::decode_hex("0xdeadbeef");
        assert!(result.is_err(), "0xdeadbeef is not JSON");
        if let Err(error) = result {
            assert_eq!(error.code(), "RegistryMetadata");
        }
    }

    /// A pinned wire vector: the on-chain JSON layout is a public contract
    /// other integrators parse, so its shape must not drift silently.
    #[test]
    fn wire_layout_is_pinned() -> Result<(), CoreError> {
        let encoded = single_key().encode_hex()?;
        let json = String::from_utf8(primitives::from_hex(&encoded)?)
            .map_err(|error| CoreError::RegistryMetadata(format!("utf8: {error}")))?;
        assert_eq!(
            json,
            r#"{"version":1,"address":"0x762EdA60D3B68755c271D608644650278f88329F","wallet_version":"safe-1.4.1","key_names":["主钱包"],"created_at_iso":"2026-08-21T00:00:00Z"}"#
        );
        Ok(())
    }
}
