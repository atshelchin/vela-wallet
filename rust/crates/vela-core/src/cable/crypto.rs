//! The caBLE / hybrid key derivations and the BLE advert decrypt, initiator
//! side (CTAP 2.3 §11.5). Pure — the transport carries the bytes; deciding what
//! they mean is the core's, so one derivation serves every platform.
//!
//! Every caBLE HKDF is `HKDF-SHA256(IKM=secret, salt=salt, info=LE32(purpose))`.
//! Ported from the founder's proven demo (`transport/ble/cable/CableCrypto.kt`).

use aes::cipher::{BlockCipherDecrypt, KeyInit};
use aes::Aes256;
use hkdf::Hkdf;
use hmac::{Mac, SimpleHmac};
use sha2::Sha256;

// `new_from_slice` lives on `KeyInit`, `update`/`finalize` on `Mac`.

type HmacSha256 = SimpleHmac<Sha256>;

/// The HKDF `info` purposes (a little-endian u32 each).
pub mod purpose {
    /// The 64-byte AES+HMAC key that decrypts a BLE advert.
    pub const EID_KEY: u32 = 1;
    /// The 128-bit WebSocket rendezvous tunnel id.
    pub const TUNNEL_ID: u32 = 2;
    /// The Noise pre-shared key.
    pub const PSK: u32 = 3;
}

/// `HKDF-SHA256` with the caBLE `info = LE32(purpose)`.
#[must_use]
pub fn derive(secret: &[u8], salt: &[u8], purpose: u32, length: usize) -> Vec<u8> {
    let salt = if salt.is_empty() { None } else { Some(salt) };
    let hkdf = Hkdf::<Sha256>::new(salt, secret);
    let info = purpose.to_le_bytes();
    let mut out = vec![0u8; length];
    // HKDF-expand fails only when `length` exceeds 255·32 bytes; every caBLE
    // derivation asks for 64 or fewer, so this branch is unreachable for real
    // inputs. Handling it (rather than panicking) keeps the crate's no-panic
    // rule intact and the helpers below infallible for their callers.
    if hkdf.expand(&info, &mut out).is_err() {
        out.fill(0);
    }
    out
}

/// The 64-byte advert key = AES-256 key (32) ‖ HMAC-SHA256 key (32).
#[must_use]
pub fn eid_key(qr_secret: &[u8]) -> Vec<u8> {
    derive(qr_secret, &[], purpose::EID_KEY, 64)
}

/// The Noise pre-shared key, salted by the decrypted 16-byte advert plaintext.
#[must_use]
pub fn psk(qr_secret: &[u8], advert_plaintext16: &[u8]) -> Vec<u8> {
    derive(qr_secret, advert_plaintext16, purpose::PSK, 32)
}

/// The 128-bit tunnel id for the WebSocket rendezvous (independent of the
/// advert nonce).
#[must_use]
pub fn tunnel_id(qr_secret: &[u8]) -> Vec<u8> {
    derive(qr_secret, &[], purpose::TUNNEL_ID, 16)
}

/// Trial-decrypt a 20-byte BLE advert candidate. Returns the 16-byte EID
/// plaintext when the HMAC tag matches and the reserved flags byte is `0x00`,
/// else `None`.
///
/// The advert is `AES-ECB(EID)[16] ‖ HMAC-SHA256(EID)[0..4]`. A scanner sees
/// many adverts; this is how it recognises the one meant for this QR.
#[must_use]
pub fn try_decrypt_advert(candidate: &[u8], eid_key: &[u8]) -> Option<[u8; 16]> {
    if candidate.len() != 20 || eid_key.len() != 64 {
        return None;
    }
    let aes_key = &eid_key[0..32];
    let mac_key = &eid_key[32..64];

    let mut mac = <HmacSha256 as KeyInit>::new_from_slice(mac_key).ok()?;
    mac.update(&candidate[0..16]);
    let tag = mac.finalize().into_bytes();
    if tag[0..4] != candidate[16..20] {
        return None;
    }

    let cipher = Aes256::new_from_slice(aes_key).ok()?;
    let mut block = [0u8; 16];
    block.copy_from_slice(&candidate[0..16]);
    cipher.decrypt_block((&mut block).into());
    if block[0] != 0 {
        return None;
    }
    Some(block)
}

/// The L2CAP PSM from a CTAP 2.3 BLE advert suffix, or `None` when the advert
/// offers no local Bluetooth data channel.
///
/// The service data past the first 20 bytes (the encrypted EID) is a CBOR map
/// whose key `1` is the PSM the responder is listening on for an L2CAP
/// connection-oriented channel. A responder that offers only the WebSocket
/// tunnel sends no suffix, so this is `None` — the caller then falls back to the
/// tunnel. Ported from the founder's proven demo (`HybridBleClient` `parsePsm`).
#[must_use]
pub fn parse_advert_psm(suffix: &[u8]) -> Option<u16> {
    if suffix.is_empty() {
        return None;
    }
    let value: ciborium::Value = ciborium::de::from_reader(suffix).ok()?;
    let ciborium::Value::Map(entries) = value else {
        return None;
    };
    for (key, val) in entries {
        if matches!(key, ciborium::Value::Integer(i) if i == 1.into()) {
            if let ciborium::Value::Integer(psm) = val {
                return u16::try_from(i128::from(psm)).ok();
            }
        }
    }
    None
}

/// The parsed 16-byte EID plaintext from a BLE proximity advert.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AdvertEid {
    pub flags: u8,
    pub nonce: [u8; 10],
    pub routing_id: [u8; 3],
    /// The tunnel-server domain id (LE16) — feed to [`super::tunnel_domain`].
    pub tunnel_domain_id: u16,
}

impl AdvertEid {
    /// Parse the 16-byte plaintext. `None` on a wrong length.
    #[must_use]
    pub fn parse(eid16: &[u8]) -> Option<Self> {
        if eid16.len() != 16 {
            return None;
        }
        let mut nonce = [0u8; 10];
        nonce.copy_from_slice(&eid16[1..11]);
        let mut routing_id = [0u8; 3];
        routing_id.copy_from_slice(&eid16[11..14]);
        Some(Self {
            flags: eid16[0],
            nonce,
            routing_id,
            tunnel_domain_id: u16::from(eid16[14]) | (u16::from(eid16[15]) << 8),
        })
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;
    use ciborium::Value;

    /// The derivations are deterministic and the right length, and the three
    /// purposes never collide (different `info` ⇒ different output).
    #[test]
    fn the_three_derivations_are_distinct_and_sized() {
        let secret = [0x42u8; 16];
        let eid = eid_key(&secret);
        let tunnel = tunnel_id(&secret);
        let pre = psk(&secret, &[0u8; 16]);
        assert_eq!(eid.len(), 64);
        assert_eq!(tunnel.len(), 16);
        assert_eq!(pre.len(), 32);
        assert_eq!(eid_key(&secret), eid, "deterministic");
        assert_ne!(&eid[0..16], &tunnel[..], "purposes must not collide");
    }

    /// A round trip: seal an advert with the EID key the way an authenticator
    /// would (AES-ECB of a flags=0 plaintext, then the HMAC tag), and confirm
    /// the trial decrypt recovers it — and rejects a flipped tag.
    #[test]
    fn an_advert_this_key_sealed_decrypts_and_a_forgery_does_not() {
        use aes::cipher::BlockCipherEncrypt;
        let secret = [7u8; 16];
        let key = eid_key(&secret);

        let mut plaintext = [0u8; 16];
        plaintext[1..11].copy_from_slice(&[9u8; 10]); // nonce; flags stays 0
        let mut block = plaintext;
        Aes256::new_from_slice(&key[0..32])
            .unwrap()
            .encrypt_block((&mut block).into());
        let mut mac = <HmacSha256 as KeyInit>::new_from_slice(&key[32..64]).unwrap();
        mac.update(&block);
        let tag = mac.finalize().into_bytes();

        let mut advert = [0u8; 20];
        advert[0..16].copy_from_slice(&block);
        advert[16..20].copy_from_slice(&tag[0..4]);

        assert_eq!(try_decrypt_advert(&advert, &key), Some(plaintext));

        let mut forged = advert;
        forged[19] ^= 0x01;
        assert_eq!(try_decrypt_advert(&forged, &key), None);
    }

    #[test]
    fn a_psm_suffix_parses_and_an_empty_one_is_none() {
        // A CBOR map {1: 0x0080} — PSM 128.
        let mut suffix = Vec::new();
        ciborium::ser::into_writer(
            &Value::Map(vec![(Value::Integer(1.into()), Value::Integer(128.into()))]),
            &mut suffix,
        )
        .unwrap();
        assert_eq!(parse_advert_psm(&suffix), Some(128));
        assert_eq!(parse_advert_psm(&[]), None, "no suffix ⇒ WebSocket-only");
        // A map without key 1 has no PSM.
        let mut other = Vec::new();
        ciborium::ser::into_writer(
            &Value::Map(vec![(Value::Integer(2.into()), Value::Integer(1.into()))]),
            &mut other,
        )
        .unwrap();
        assert_eq!(parse_advert_psm(&other), None);
    }

    #[test]
    fn advert_eid_parses_its_fields() {
        let mut eid = [0u8; 16];
        eid[0] = 0; // flags
        eid[1..11].copy_from_slice(&[1u8; 10]);
        eid[11..14].copy_from_slice(&[2u8; 3]);
        eid[14] = 0x00;
        eid[15] = 0x01; // domain id = 256, LE
        let parsed = AdvertEid::parse(&eid).unwrap();
        assert_eq!(parsed.tunnel_domain_id, 256);
        assert_eq!(parsed.routing_id, [2u8; 3]);
    }
}
