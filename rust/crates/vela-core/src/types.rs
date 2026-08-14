//! Shared FFI record types (data-model.md). Plain data only — bytes cross the
//! boundary as byte arrays, big numbers as 0x-hex strings.

use serde::{Deserialize, Serialize};

/// P-256 public key coordinates, 32 bytes each.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct P256PublicKey {
    pub x: Vec<u8>,
    pub y: Vec<u8>,
}

/// Counterfactual Safe address plus the assembly ingredients on-chain
/// deployment must reproduce byte-for-byte.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SafeAddressInfo {
    /// EIP-55 checksummed counterfactual Safe address.
    pub address: String,
    /// 32 bytes: keccak256(x32 ‖ y32) — on the multi-owner path,
    /// concatenated over all keys in CANONICAL order (keys[0] pinned, later
    /// keys sorted by x‖y), not caller order.
    pub salt_nonce: Vec<u8>,
    /// Full Safe.setup calldata (MultiSend enableModules + signer configure).
    pub setup_data: Vec<u8>,
    /// 32 bytes: keccak256(PROXY_CREATION_CODE ‖ abi.encode(SAFE_SINGLETON)).
    pub init_code_hash: Vec<u8>,
}

/// The raw material of every wallet signature. `client_data_json` must remain
/// byte-exact as signed — never re-serialize it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WebAuthnAssertion {
    pub authenticator_data: Vec<u8>,
    pub client_data_json: Vec<u8>,
    pub signature_der: Vec<u8>,
}

/// Selects the byte-level acceptance rules in `validate_client_data`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ClientDataKind {
    Create,
    Get,
}
