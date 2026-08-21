//! The one-time group key's WebAuthn-shaped closing proof.
//!
//! A wallet's registry group (Unit) is closed by a software P-256 "group
//! key" that signs the group's content hash once and is then discarded. This
//! crate forbids randomness, so the shell supplies a 32-byte seed
//! (`crypto.getRandomValues`) and this derives the key and builds the exact
//! WebAuthn-shaped proof the registry contract verifies — the same layout the
//! p256-index server's own test vectors use (`challengeIndex = 23`,
//! `typeIndex = 1` for the canonical `{"type":"webauthn.get","challenge":...`
//! prefix). Member proofs come from real passkeys and are assembled from
//! their assertions elsewhere.

use p256::ecdsa::{signature::hazmat::PrehashSigner, Signature, SigningKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[cfg(feature = "bindings")]
use ts_rs::TS;

use crate::error::CoreError;
use crate::primitives;
use crate::webauthn::webauthn_signing_hash;

/// Byte offset of `"challenge":"` in the canonical clientDataJSON built here.
pub const GROUP_PROOF_CHALLENGE_INDEX: u32 = 23;
/// Byte offset of `"type":"webauthn.get"` in the canonical clientDataJSON.
pub const GROUP_PROOF_TYPE_INDEX: u32 = 1;
/// The origin embedded in the group proof's clientDataJSON. The registry
/// contract never inspects the origin, but a well-formed value keeps the JSON
/// indistinguishable in shape from a real assertion.
const GROUP_PROOF_ORIGIN: &str = "https://getvela.app";

/// A WebAuthn-shaped possession proof. Serialises to the exact JSON the
/// registry HTTP API and contract expect; `(r, s)` sign
/// `sha256(authenticatorData ‖ sha256(clientDataJSON))`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct RegistryProof {
    pub authenticator_data: String,
    #[serde(rename = "clientDataJSON")]
    pub client_data_json: String,
    pub challenge_index: u32,
    pub type_index: u32,
    pub r: String,
    pub s: String,
}

/// The one-time group key and its closing proof.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct GroupProof {
    /// Uncompressed P-256 point, `04‖x‖y` hex (no `0x`).
    pub group_public_key_hex: String,
    pub proof: RegistryProof,
}

/// Derive the one-time group key from `seed_hex` (32 bytes) and build its
/// content-hash closing proof for `rp_id` over `challenge_hex` (32 bytes).
/// Deterministic in the seed; the seed's randomness is the shell's job.
pub fn build_group_proof(
    seed_hex: &str,
    rp_id: &str,
    challenge_hex: &str,
) -> Result<GroupProof, CoreError> {
    let seed = primitives::from_hex(seed_hex)?;
    if seed.len() != 32 {
        return Err(CoreError::RegistryProof(format!(
            "seed must be 32 bytes, got {}",
            seed.len()
        )));
    }
    let signing = SigningKey::from_slice(&seed)
        .map_err(|error| CoreError::RegistryProof(format!("seed is not a valid scalar: {error}")))?;
    let verifying = signing.verifying_key();
    let group_public_key_hex =
        primitives::to_hex(verifying.to_sec1_point(false).as_bytes(), false);

    let challenge = primitives::from_hex(challenge_hex)?;
    if challenge.len() != 32 {
        return Err(CoreError::RegistryProof(format!(
            "challenge must be 32 bytes, got {}",
            challenge.len()
        )));
    }

    // authenticatorData = sha256(rpId) ‖ flags(UP|UV = 0x05) ‖ counter(0).
    let mut authenticator_data = Sha256::digest(rp_id.as_bytes()).to_vec();
    authenticator_data.push(0x05);
    authenticator_data.extend_from_slice(&[0, 0, 0, 0]);

    // Canonical clientDataJSON: the challenge value lands at byte 23 and the
    // type value at byte 1, matching GROUP_PROOF_{CHALLENGE,TYPE}_INDEX.
    let client_data_json = format!(
        "{{\"type\":\"webauthn.get\",\"challenge\":\"{}\",\"origin\":\"{}\"}}",
        primitives::to_base64url(&challenge),
        GROUP_PROOF_ORIGIN
    );

    let digest = webauthn_signing_hash(&authenticator_data, client_data_json.as_bytes());
    let signature: Signature = signing
        .sign_prehash(&digest)
        .map_err(|error| CoreError::RegistryProof(format!("group key signing failed: {error}")))?;
    let raw = signature.to_bytes();

    Ok(GroupProof {
        group_public_key_hex,
        proof: RegistryProof {
            authenticator_data: primitives::to_hex(&authenticator_data, false),
            client_data_json,
            challenge_index: GROUP_PROOF_CHALLENGE_INDEX,
            type_index: GROUP_PROOF_TYPE_INDEX,
            r: primitives::to_hex(&raw[..32], true),
            s: primitives::to_hex(&raw[32..], true),
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use p256::ecdsa::{signature::hazmat::PrehashVerifier, VerifyingKey};

    const SEED: &str = "1122334455667788990011223344556677889900112233445566778899001122";
    const RP_ID: &str = "getvela.app";
    const CHALLENGE: &str = "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899";

    #[test]
    fn is_deterministic_in_the_seed() -> Result<(), CoreError> {
        let a = build_group_proof(SEED, RP_ID, CHALLENGE)?;
        let b = build_group_proof(SEED, RP_ID, CHALLENGE)?;
        assert_eq!(a, b);
        // A different seed is a different group key.
        let other = build_group_proof(
            "0000000000000000000000000000000000000000000000000000000000000001",
            RP_ID,
            CHALLENGE,
        )?;
        assert_ne!(a.group_public_key_hex, other.group_public_key_hex);
        Ok(())
    }

    #[test]
    fn public_key_is_uncompressed_and_the_offsets_are_pinned() -> Result<(), CoreError> {
        let built = build_group_proof(SEED, RP_ID, CHALLENGE)?;
        assert!(built.group_public_key_hex.starts_with("04"));
        assert_eq!(built.group_public_key_hex.len(), 130);
        assert_eq!(built.proof.challenge_index, 23);
        assert_eq!(built.proof.type_index, 1);
        // The pinned offsets must actually point at the substrings the
        // contract checks.
        let cdj = built.proof.client_data_json.as_bytes();
        assert!(cdj[1..].starts_with(br#""type":"webauthn.get""#));
        assert!(cdj[23..].starts_with(br#""challenge":""#));
        Ok(())
    }

    #[test]
    fn proof_verifies_against_the_group_public_key() -> Result<(), CoreError> {
        let built = build_group_proof(SEED, RP_ID, CHALLENGE)?;

        let public_key = primitives::from_hex(&built.group_public_key_hex)?;
        let verifying = VerifyingKey::from_sec1_bytes(&public_key)
            .map_err(|error| CoreError::RegistryProof(format!("bad pubkey: {error}")))?;

        let authenticator_data = primitives::from_hex(&built.proof.authenticator_data)?;
        let digest = webauthn_signing_hash(
            &authenticator_data,
            built.proof.client_data_json.as_bytes(),
        );

        let mut raw = primitives::from_hex(&built.proof.r)?;
        raw.extend_from_slice(&primitives::from_hex(&built.proof.s)?);
        let signature = Signature::from_slice(&raw)
            .map_err(|error| CoreError::RegistryProof(format!("bad sig: {error}")))?;

        verifying
            .verify_prehash(&digest, &signature)
            .map_err(|error| CoreError::RegistryProof(format!("verify failed: {error}")))?;
        Ok(())
    }

    #[test]
    fn rejects_a_short_seed() {
        let result = build_group_proof("1122", RP_ID, CHALLENGE);
        assert!(result.is_err(), "short seed must be rejected");
        if let Err(error) = result {
            assert_eq!(error.code(), "RegistryProof");
        }
    }

    #[test]
    fn rejects_a_short_challenge() {
        let result = build_group_proof(SEED, RP_ID, "aabb");
        assert!(result.is_err(), "short challenge must be rejected");
        if let Err(error) = result {
            assert_eq!(error.code(), "RegistryProof");
        }
    }
}
