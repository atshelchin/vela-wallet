//! WebAuthn/passkey byte parsing and P-256 recovery — the signature path.
//!
//! Replaces src/services/{attestation-parser,webauthn-verify,p256-recovery}.ts
//! (~600 lines of bespoke CBOR/DER/EC math) with ciborium+coset, the ecdsa
//! crate's strict DER parser, and p256's curve-generic trial recovery.
//! Everything here handles PUBLIC data only (signatures, attestation objects,
//! client data) — no private material, no RNG.

use crate::error::CoreError;
use crate::primitives;
use crate::types::{ClientDataKind, P256PublicKey, WebAuthnAssertion};
use coset::{iana, CborSerializable as _, Label};
use p256::ecdsa::signature::hazmat::PrehashVerifier as _;
use p256::ecdsa::{Signature, VerifyingKey};

const GET_PREFIX: &[u8] = b"{\"type\":\"webauthn.get\",\"challenge\":\"";
const CREATE_PREFIX: &[u8] = b"{\"type\":\"webauthn.create\",\"challenge\":\"";

/// Extract the P-256 public key from a CBOR attestation object.
///
/// Layout: map{"authData" → rpIdHash(32) ‖ flags(1) ‖ counter(4) ‖ aaguid(16) ‖
/// credIdLen(2 BE) ‖ credId ‖ COSE_Key ‖ [extensions]}. The COSE key is read
/// with an exact-one-item byte-counting decode so trailing extension data
/// (ED flag) never trips `ExtraneousData`. Stricter than the TS original:
/// kty/crv are checked and the point must actually lie on P-256
/// (enumerated divergence — a fabricated off-curve "key" is rejected).
pub fn extract_attestation_public_key(
    attestation_object: &[u8],
) -> Result<P256PublicKey, CoreError> {
    let value: ciborium::Value = ciborium::de::from_reader(attestation_object)
        .map_err(|e| CoreError::InvalidCbor(format!("attestation object: {e}")))?;
    let map = value
        .into_map()
        .map_err(|_| CoreError::InvalidCbor("attestation object is not a CBOR map".to_owned()))?;
    let auth_data = map
        .into_iter()
        .find_map(|(k, v)| match (k, v) {
            (ciborium::Value::Text(key), ciborium::Value::Bytes(bytes)) if key == "authData" => {
                Some(bytes)
            }
            _ => None,
        })
        .ok_or_else(|| CoreError::InvalidCbor("no authData byte string in map".to_owned()))?;

    if auth_data.len() <= 37 {
        return Err(CoreError::InvalidCbor(format!(
            "authData too short: {} bytes",
            auth_data.len()
        )));
    }
    let flags = auth_data[32];
    if flags & 0x40 == 0 {
        return Err(CoreError::InvalidCbor(
            "AT flag not set — no attested credential data".to_owned(),
        ));
    }
    if auth_data.len() <= 55 {
        return Err(CoreError::InvalidCbor(
            "authData truncated before credential id".to_owned(),
        ));
    }
    let cred_id_len = usize::from(auth_data[53]) << 8 | usize::from(auth_data[54]);
    let cose_offset = 55 + cred_id_len;
    if auth_data.len() <= cose_offset {
        return Err(CoreError::InvalidCbor(
            "authData truncated before COSE key".to_owned(),
        ));
    }

    let cose_slice = &auth_data[cose_offset..];
    let key_len = cbor_item_len(cose_slice)?;
    let key = coset::CoseKey::from_slice(&cose_slice[..key_len])
        .map_err(|e| CoreError::InvalidCoseKey(format!("COSE parse: {e}")))?;

    if key.kty != coset::KeyType::Assigned(iana::KeyType::EC2) {
        return Err(CoreError::InvalidCoseKey(format!(
            "kty is {:?}, expected EC2",
            key.kty
        )));
    }
    let mut x: Option<Vec<u8>> = None;
    let mut y: Option<Vec<u8>> = None;
    let mut crv_ok = false;
    for (label, value) in &key.params {
        match label {
            Label::Int(-1) => {
                crv_ok = matches!(
                    value,
                    ciborium::Value::Integer(i)
                        if i128::from(*i) == i128::from(iana::EllipticCurve::P_256 as i64)
                );
            }
            Label::Int(-2) => x = value.as_bytes().cloned(),
            Label::Int(-3) => y = value.as_bytes().cloned(),
            _ => {}
        }
    }
    if !crv_ok {
        return Err(CoreError::InvalidCoseKey("crv is not P-256".to_owned()));
    }
    let (Some(x), Some(y)) = (x, y) else {
        return Err(CoreError::InvalidCoseKey(
            "missing x/y coordinates".to_owned(),
        ));
    };
    if x.len() != 32 || y.len() != 32 {
        return Err(CoreError::InvalidCoseKey(format!(
            "coordinate lengths {}/{}, expected 32/32",
            x.len(),
            y.len()
        )));
    }
    // On-curve check: a fabricated (x, y) that is not a P-256 point must never
    // become a wallet identity.
    let mut sec1 = vec![0x04u8];
    sec1.extend_from_slice(&x);
    sec1.extend_from_slice(&y);
    VerifyingKey::from_sec1_bytes(&sec1)
        .map_err(|_| CoreError::InvalidPublicKey("point is not on P-256".to_owned()))?;
    Ok(P256PublicKey { x, y })
}

/// Number of bytes the FIRST CBOR item in `data` occupies (byte-counting
/// decode; canary-tested — coset's `from_slice` rejects trailing bytes, so we
/// must slice the exact item when ED-flag extensions follow the COSE key).
fn cbor_item_len(data: &[u8]) -> Result<usize, CoreError> {
    struct Counting<'a> {
        data: &'a [u8],
        pos: usize,
    }
    #[derive(Debug)]
    struct Eof;
    impl ciborium_io::Read for Counting<'_> {
        type Error = Eof;
        fn read_exact(&mut self, buf: &mut [u8]) -> Result<(), Eof> {
            let end = self.pos.checked_add(buf.len()).ok_or(Eof)?;
            let slice = self.data.get(self.pos..end).ok_or(Eof)?;
            buf.copy_from_slice(slice);
            self.pos = end;
            Ok(())
        }
    }
    let mut reader = Counting { data, pos: 0 };
    let _: ciborium::Value = ciborium::de::from_reader(&mut reader)
        .map_err(|e| CoreError::InvalidCbor(format!("COSE key region: {e:?}")))?;
    Ok(reader.pos)
}

/// Strict DER `ECDSA-Sig-Value` → fixed 64-byte `r ‖ s`, low-s normalized
/// (RIP-7212-ready). Rejects non-minimal DER and trailing bytes — the TS
/// original ignored the outer length and trailing garbage (enumerated divergence).
pub fn der_signature_to_raw_low_s(der: &[u8]) -> Result<Vec<u8>, CoreError> {
    let sig = Signature::from_der(der)
        .map_err(|e| CoreError::InvalidSignature(format!("DER parse: {e}")))?;
    Ok(sig.normalize_s().to_bytes().to_vec())
}

/// Byte-level client-data acceptance rules mirroring the Safe on-chain
/// verifier (and the TS verify/create duplicates this unifies):
/// exact JSON prefix, `}` terminator, and — for `Get` — authenticatorData
/// length ≥ 33 with the UV flag (0x04) set. `Create` ignores
/// `authenticator_data` (pass empty), matching the legacy create-side check.
pub fn validate_client_data(
    kind: ClientDataKind,
    client_data_json: &[u8],
    authenticator_data: &[u8],
) -> Result<(), CoreError> {
    let prefix: &[u8] = match kind {
        ClientDataKind::Get => GET_PREFIX,
        ClientDataKind::Create => CREATE_PREFIX,
    };
    if !client_data_json.starts_with(prefix) {
        return Err(CoreError::InvalidClientData(
            "clientDataJSON field order incompatible (prefix mismatch)".to_owned(),
        ));
    }
    if client_data_json.last() != Some(&b'}') {
        return Err(CoreError::InvalidClientData(
            "clientDataJSON does not end with }".to_owned(),
        ));
    }
    if kind == ClientDataKind::Get {
        if authenticator_data.len() < 33 {
            return Err(CoreError::InvalidClientData(
                "authenticatorData too short".to_owned(),
            ));
        }
        let flags = authenticator_data[32];
        if flags & 0x04 != 0x04 {
            return Err(CoreError::InvalidClientData(format!(
                "User Verification flag not set (flags=0x{flags:x})"
            )));
        }
    }
    Ok(())
}

/// `sha256(authenticatorData ‖ sha256(clientDataJSON))` — the exact message a
/// WebAuthn authenticator signs.
pub fn webauthn_signing_hash(authenticator_data: &[u8], client_data_json: &[u8]) -> Vec<u8> {
    let client_hash = primitives::sha256(client_data_json);
    let mut message = Vec::with_capacity(authenticator_data.len() + 32);
    message.extend_from_slice(authenticator_data);
    message.extend_from_slice(&client_hash);
    primitives::sha256(&message)
}

/// Recover the unique P-256 public key shared by two assertions from the same
/// credential (`Ok(None)` when the inputs don't pin down exactly one key:
/// different credentials, or the same signature twice — one signature alone is
/// deliberately never enough). Trial recovery over ids 0–3 per assertion,
/// candidate-set intersection, and every candidate re-verified against its
/// signature before being trusted.
pub fn recover_public_key_from_assertions(
    a: &WebAuthnAssertion,
    b: &WebAuthnAssertion,
) -> Result<Option<P256PublicKey>, CoreError> {
    let raw_a = der_signature_to_raw_low_s(&a.signature_der)?;
    let raw_b = der_signature_to_raw_low_s(&b.signature_der)?;
    if raw_a == raw_b {
        return Ok(None); // same signature twice — candidate set is ambiguous
    }
    let candidates_a = candidates(
        &raw_a,
        &webauthn_signing_hash(&a.authenticator_data, &a.client_data_json),
    )?;
    let candidates_b = candidates(
        &raw_b,
        &webauthn_signing_hash(&b.authenticator_data, &b.client_data_json),
    )?;
    let shared: Vec<&VerifyingKey> = candidates_a
        .iter()
        .filter(|k| candidates_b.contains(k))
        .collect();
    if shared.len() != 1 {
        return Ok(None);
    }
    let point = shared[0].to_sec1_point(false);
    let bytes = point.as_bytes();
    if bytes.len() != 65 {
        return Err(CoreError::Internal(format!(
            "unexpected SEC1 point length {}",
            bytes.len()
        )));
    }
    Ok(Some(P256PublicKey {
        x: bytes[1..33].to_vec(),
        y: bytes[33..65].to_vec(),
    }))
}

/// The candidate P-256 public keys a SINGLE assertion could have been signed
/// by — up to two on P-256, each re-verified against the signature. Exactly
/// one is the credential's real key; the caller disambiguates (a second
/// assertion, or — cheaper — whichever candidate the registry already knows,
/// since the false candidate has no holder and can never be registered).
/// Returned as `04‖x‖y` hex, no `0x`.
pub fn recover_candidates(assertion: &WebAuthnAssertion) -> Result<Vec<String>, CoreError> {
    let raw = der_signature_to_raw_low_s(&assertion.signature_der)?;
    let keys = candidates(
        &raw,
        &webauthn_signing_hash(&assertion.authenticator_data, &assertion.client_data_json),
    )?;
    let mut out = Vec::with_capacity(keys.len());
    for key in keys {
        let bytes = key.to_sec1_point(false);
        let bytes = bytes.as_bytes();
        if bytes.len() != 65 {
            return Err(CoreError::Internal(format!(
                "unexpected SEC1 point length {}",
                bytes.len()
            )));
        }
        out.push(primitives::to_hex(bytes, false));
    }
    Ok(out)
}

/// All verifying keys that could have produced `raw_sig` over `prehash`.
fn candidates(raw_sig: &[u8], prehash: &[u8]) -> Result<Vec<VerifyingKey>, CoreError> {
    let sig = Signature::from_slice(raw_sig)
        .map_err(|e| CoreError::InvalidSignature(format!("r‖s parse: {e}")))?;
    let mut out: Vec<VerifyingKey> = Vec::new();
    for id_byte in 0u8..=3 {
        let Some(recid) = p256::ecdsa::RecoveryId::from_byte(id_byte) else {
            continue;
        };
        let Ok(key) = VerifyingKey::recover_from_prehash(prehash, &sig, recid) else {
            continue;
        };
        // Defense in depth (mirrors the TS verify step): the candidate must
        // actually verify the signature it was recovered from.
        if key.verify_prehash(prehash, &sig).is_ok() && !out.contains(&key) {
            out.push(key);
        }
    }
    Ok(out)
}
