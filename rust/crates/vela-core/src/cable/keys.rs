//! P-256 keypair and ECDH helpers for the caBLE Noise handshake, byte-oriented
//! so [`super::noise`] never touches `p256`'s types directly.
//!
//! caBLE's Noise (`..._P256_AESGCM_SHA256`) works in UNCOMPRESSED X9.62 points
//! (`0x04 ‖ X ‖ Y`, 65 bytes) on the wire and in the transcript hash, and its
//! DH is the 32-byte big-endian X coordinate of the shared point — exactly what
//! `p256::ecdh` yields. The compressed form (33 bytes) is only for the QR.
//!
//! The randomness is the shell's, as everywhere in [`super::super::ctap`]: a
//! keypair is built from a 32-byte seed the `Host` produced, with the same
//! retry-on-invalid-scalar idiom the PIN/UV key agreement uses.

use p256::elliptic_curve::sec1::ToSec1Point;
use p256::{PublicKey, SecretKey};

/// A P-256 keypair whose secret drives one side of an ECDH. Built from host
/// randomness; holds no randomness of its own.
pub struct KeyPair {
    secret: SecretKey,
    public: PublicKey,
}

impl KeyPair {
    /// Build from a 32-byte seed. `None` when the bytes are not a valid,
    /// non-zero P-256 scalar — a ~2⁻³² event the caller retries with fresh
    /// randomness, exactly as the PIN/UV key agreement does.
    #[must_use]
    pub fn from_seed(seed: &[u8]) -> Option<Self> {
        let secret = SecretKey::from_slice(seed).ok()?;
        let public = secret.public_key();
        Some(Self { secret, public })
    }

    /// The 65-byte uncompressed point (`0x04 ‖ X ‖ Y`) — the Noise wire form.
    #[must_use]
    pub fn public_uncompressed(&self) -> Vec<u8> {
        self.public.to_sec1_point(false).as_bytes().to_vec()
    }

    /// The 33-byte compressed point — what goes in the QR (key 0).
    #[must_use]
    pub fn public_compressed(&self) -> Vec<u8> {
        self.public.to_sec1_point(true).as_bytes().to_vec()
    }

    /// ECDH against a peer's uncompressed point: the 32-byte big-endian X of the
    /// shared point, which is what Noise's `DH()` mixes. `None` when the peer
    /// bytes are not a point on P-256.
    #[must_use]
    pub fn ecdh_x(&self, peer_uncompressed: &[u8]) -> Option<[u8; 32]> {
        let peer = PublicKey::from_sec1_bytes(peer_uncompressed).ok()?;
        let shared = p256::ecdh::diffie_hellman(self.secret.to_nonzero_scalar(), peer.as_affine());
        let bytes = shared.raw_secret_bytes();
        let mut out = [0u8; 32];
        if bytes.len() != 32 {
            return None;
        }
        out.copy_from_slice(bytes.as_slice());
        Some(out)
    }
}

/// Validate a peer's uncompressed point and return its canonical bytes, or
/// `None` if it is not on P-256. A malformed advert or a hostile tunnel peer is
/// rejected here rather than deeper in the handshake.
#[must_use]
pub fn parse_uncompressed(bytes: &[u8]) -> Option<Vec<u8>> {
    let pk = PublicKey::from_sec1_bytes(bytes).ok()?;
    Some(pk.to_sec1_point(false).as_bytes().to_vec())
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;

    #[test]
    fn a_seed_yields_a_stable_keypair_and_two_point_forms() {
        let seed = [0x11u8; 32];
        let kp = KeyPair::from_seed(&seed).unwrap();
        let un = kp.public_uncompressed();
        let co = kp.public_compressed();
        assert_eq!(un.len(), 65);
        assert_eq!(un[0], 0x04);
        assert_eq!(co.len(), 33);
        assert!(co[0] == 0x02 || co[0] == 0x03);
        // Deterministic in the seed.
        assert_eq!(KeyPair::from_seed(&seed).unwrap().public_uncompressed(), un);
        // The compressed X matches the uncompressed X.
        assert_eq!(&co[1..33], &un[1..33]);
    }

    #[test]
    fn ecdh_is_symmetric_and_rejects_a_non_point() {
        let a = KeyPair::from_seed(&[1u8; 32]).unwrap();
        let b = KeyPair::from_seed(&[2u8; 32]).unwrap();
        let ab = a.ecdh_x(&b.public_uncompressed()).unwrap();
        let ba = b.ecdh_x(&a.public_uncompressed()).unwrap();
        assert_eq!(ab, ba, "ECDH must agree from both sides");
        assert!(a.ecdh_x(&[0x04u8; 65]).is_none(), "not on the curve");
        assert!(a.ecdh_x(&[]).is_none(), "empty is not a point");
    }

    #[test]
    fn parse_uncompressed_round_trips_a_valid_point_and_rejects_junk() {
        let kp = KeyPair::from_seed(&[7u8; 32]).unwrap();
        let un = kp.public_uncompressed();
        assert_eq!(parse_uncompressed(&un), Some(un.clone()));
        assert!(parse_uncompressed(&[0u8; 10]).is_none());
    }
}
