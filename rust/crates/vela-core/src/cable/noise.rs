//! caBLE v2 Noise handshake — `Noise_KNpsk0_P256_AESGCM_SHA256`, initiator side
//! — and the post-handshake transport cipher. Sans-IO: the transport carries
//! the frames, the framing and the key schedule are the core's.
//!
//! The initiator's static key is pre-shared with the responder via QR key 0
//! (`K`), so the initiator speaks first (81 bytes: ephemeral pub + tag) and the
//! responder replies with 81 bytes. Two details are NOT vanilla Noise and MUST
//! match Chromium's `noise.cc`, or the handshake fails only on a real phone:
//!
//! * the ephemeral public keys are mixed into BOTH the hash and the key
//!   schedule (an extra `MixKey` on each `e`), and
//! * the prologue is the single byte `0x01`.
//!
//! Ported byte-for-byte from the founder's on-device-proven demo
//! (`transport/ble/cable/Noise.kt`), with webauthn-rs's `cable/noise.rs` as the
//! cross-check. AES-GCM handshake nonces are all-zero (one message per key);
//! the transport uses a per-direction big-endian counter.

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use hkdf::Hkdf;
use sha2::{Digest, Sha256};

use super::keys::KeyPair;

/// What can go wrong assembling or opening a Noise message. Every variant is a
/// protocol mismatch or a hostile peer; the connection layer turns it into a
/// [`crate::ctap::ceremony::CableError`].
#[derive(Debug, PartialEq, Eq)]
pub enum NoiseError {
    /// A handshake reply was not the expected 81 bytes.
    BadLength,
    /// `read_message2` was called before `write_message1`.
    OutOfOrder,
    /// A peer point was not on P-256, so its ECDH is undefined.
    BadPoint,
    /// AES-GCM refused — a wrong key, or a tampered/forged tag.
    Cipher,
    /// The HKDF expand failed (only possible for absurd lengths).
    Kdf,
    /// A handshake message that should carry an empty payload did not.
    NonEmptyPayload,
    /// A key was needed before it was derived.
    NoKey,
}

const ZERO12: [u8; 12] = [0u8; 12];

/// The Noise protocol name, zero-padded to 32 bytes (names ≤32 bytes are the
/// initial `h`/`ck`, NOT hashed).
fn protocol_h() -> [u8; 32] {
    let name = b"Noise_KNpsk0_P256_AESGCM_SHA256";
    let mut h = [0u8; 32];
    h[..name.len()].copy_from_slice(name);
    h
}

/// `HKDF-SHA256(salt = ck, ikm, info = "")` — the caBLE Noise KDF. `len` is
/// always 64 or 96 here, so the expand cannot fail for real inputs.
fn hkdf(salt: &[u8], ikm: &[u8], len: usize) -> Result<Vec<u8>, NoiseError> {
    let hk = Hkdf::<Sha256>::new(Some(salt), ikm);
    let mut out = vec![0u8; len];
    hk.expand(&[], &mut out).map_err(|_| NoiseError::Kdf)?;
    Ok(out)
}

fn aes_gcm_seal(
    key: &[u8],
    nonce: &[u8; 12],
    aad: &[u8],
    pt: &[u8],
) -> Result<Vec<u8>, NoiseError> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| NoiseError::Cipher)?;
    let nonce = Nonce::from(*nonce);
    cipher
        .encrypt(&nonce, Payload { msg: pt, aad })
        .map_err(|_| NoiseError::Cipher)
}

fn aes_gcm_open(
    key: &[u8],
    nonce: &[u8; 12],
    aad: &[u8],
    ct: &[u8],
) -> Result<Vec<u8>, NoiseError> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| NoiseError::Cipher)?;
    let nonce = Nonce::from(*nonce);
    cipher
        .decrypt(&nonce, Payload { msg: ct, aad })
        .map_err(|_| NoiseError::Cipher)
}

/// The initiator half of the caBLE Noise handshake. One-shot: `write_message1`
/// then `read_message2` produce the two transport keys.
pub struct NoiseInitiator {
    ck: [u8; 32],
    h: [u8; 32],
    k: Option<[u8; 32]>,
    static_keys: KeyPair,
    ephemeral: Option<KeyPair>,
}

impl NoiseInitiator {
    /// `static_keys` is the keypair whose COMPRESSED public key went into the
    /// QR (key 0); the responder learned it there, which is what makes this the
    /// `K` (known-static-initiator) pattern.
    #[must_use]
    pub fn new(static_keys: KeyPair) -> Self {
        let h = protocol_h();
        Self {
            ck: h,
            h,
            k: None,
            static_keys,
            ephemeral: None,
        }
    }

    fn mix_hash(&mut self, data: &[u8]) {
        let mut hasher = Sha256::new();
        hasher.update(self.h);
        hasher.update(data);
        self.h = hasher.finalize().into();
    }

    fn mix_key(&mut self, ikm: &[u8]) -> Result<(), NoiseError> {
        let out = hkdf(&self.ck, ikm, 64)?;
        self.ck.copy_from_slice(&out[0..32]);
        let mut k = [0u8; 32];
        k.copy_from_slice(&out[32..64]);
        self.k = Some(k);
        Ok(())
    }

    fn mix_key_and_hash(&mut self, ikm: &[u8]) -> Result<(), NoiseError> {
        let out = hkdf(&self.ck, ikm, 96)?;
        self.ck.copy_from_slice(&out[0..32]);
        self.mix_hash(&out[32..64]);
        let mut k = [0u8; 32];
        k.copy_from_slice(&out[64..96]);
        self.k = Some(k);
        Ok(())
    }

    fn encrypt_and_hash(&mut self, pt: &[u8]) -> Result<Vec<u8>, NoiseError> {
        let k = self.k.ok_or(NoiseError::NoKey)?;
        let ct = aes_gcm_seal(&k, &ZERO12, &self.h, pt)?;
        self.mix_hash(&ct);
        Ok(ct)
    }

    fn decrypt_and_hash(&mut self, ct: &[u8]) -> Result<Vec<u8>, NoiseError> {
        let k = self.k.ok_or(NoiseError::NoKey)?;
        let pt = aes_gcm_open(&k, &ZERO12, &self.h, ct)?;
        self.mix_hash(ct);
        Ok(pt)
    }

    /// Message 1 (initiator → responder): `psk, e`. Returns 81 bytes
    /// (ephemeral uncompressed point ‖ 16-byte tag). `ephemeral` is generated by
    /// the caller from host randomness.
    pub fn write_message1(
        &mut self,
        psk: &[u8],
        ephemeral: KeyPair,
    ) -> Result<Vec<u8>, NoiseError> {
        self.mix_hash(&[0x01]); // KNpsk0 prologue
        let static_pub = self.static_keys.public_uncompressed();
        self.mix_hash(&static_pub); // pre-message "-> s"
        self.mix_key_and_hash(psk)?;
        let e_pub = ephemeral.public_uncompressed();
        self.ephemeral = Some(ephemeral);
        self.mix_hash(&e_pub);
        self.mix_key(&e_pub)?; // caBLE extra MixKey on 'e'
        let tag = self.encrypt_and_hash(&[])?;
        let mut out = e_pub;
        out.extend_from_slice(&tag);
        Ok(out)
    }

    /// Message 2 (responder → initiator): `e, ee, se`. Returns
    /// `(write_key, read_key)` for [`CableTransport`]. Expects 81 bytes.
    pub fn read_message2(&mut self, resp: &[u8]) -> Result<(Vec<u8>, Vec<u8>), NoiseError> {
        if resp.len() != 81 {
            return Err(NoiseError::BadLength);
        }
        let peer_epub = &resp[0..65];
        let ct = &resp[65..81];
        self.mix_hash(peer_epub);
        self.mix_key(peer_epub)?; // caBLE extra MixKey on peer 'e'
        let ee = {
            let e = self.ephemeral.as_ref().ok_or(NoiseError::OutOfOrder)?;
            e.ecdh_x(peer_epub).ok_or(NoiseError::BadPoint)?
        };
        self.mix_key(&ee)?; // ee
        let se = self
            .static_keys
            .ecdh_x(peer_epub)
            .ok_or(NoiseError::BadPoint)?;
        self.mix_key(&se)?; // se
        let payload = self.decrypt_and_hash(ct)?;
        if !payload.is_empty() {
            return Err(NoiseError::NonEmptyPayload);
        }
        let split = hkdf(&self.ck, &[], 64)?;
        Ok((split[0..32].to_vec(), split[32..64].to_vec()))
    }
}

/// The post-handshake transport cipher. Per-direction counter nonce =
/// 8 zero bytes ‖ BE32(counter); AAD empty; plaintext padded up to a multiple
/// of 32 with the last byte = `paddingLen - 1`.
pub struct CableTransport {
    write_key: [u8; 32],
    read_key: [u8; 32],
    write_ctr: u32,
    read_ctr: u32,
}

impl CableTransport {
    /// From the two 32-byte keys `read_message2` produced.
    #[must_use]
    pub fn new(write_key: Vec<u8>, read_key: Vec<u8>) -> Option<Self> {
        if write_key.len() != 32 || read_key.len() != 32 {
            return None;
        }
        let mut wk = [0u8; 32];
        let mut rk = [0u8; 32];
        wk.copy_from_slice(&write_key);
        rk.copy_from_slice(&read_key);
        Some(Self {
            write_key: wk,
            read_key: rk,
            write_ctr: 0,
            read_ctr: 0,
        })
    }

    fn nonce(counter: u32) -> [u8; 12] {
        let mut n = [0u8; 12];
        n[8..12].copy_from_slice(&counter.to_be_bytes());
        n
    }

    /// Seal one plaintext frame. The counter advances even if the caller drops
    /// the result, matching the responder's read counter.
    pub fn seal(&mut self, plaintext: &[u8]) -> Result<Vec<u8>, NoiseError> {
        let padded = pad32(plaintext);
        let nonce = Self::nonce(self.write_ctr);
        self.write_ctr = self.write_ctr.wrapping_add(1);
        aes_gcm_seal(&self.write_key, &nonce, &[], &padded)
    }

    /// Open one ciphertext frame.
    pub fn open(&mut self, ciphertext: &[u8]) -> Result<Vec<u8>, NoiseError> {
        let nonce = Self::nonce(self.read_ctr);
        self.read_ctr = self.read_ctr.wrapping_add(1);
        let padded = aes_gcm_open(&self.read_key, &nonce, &[], ciphertext)?;
        Ok(unpad32(&padded))
    }
}

/// Pad to the next multiple of 32; the last byte records how many bytes were
/// added minus one (so a message already a multiple of 32 gains a full block).
fn pad32(pt: &[u8]) -> Vec<u8> {
    let extra = 32 - (pt.len() % 32); // 1..=32
    let mut out = Vec::with_capacity(pt.len() + extra);
    out.extend_from_slice(pt);
    out.resize(pt.len() + extra, 0);
    if let Some(last) = out.last_mut() {
        #[allow(clippy::cast_possible_truncation)]
        {
            *last = (extra - 1) as u8;
        }
    }
    out
}

/// Strip the pad32 tail. A malformed pad (claiming more than is there) yields an
/// empty message rather than a panic.
fn unpad32(padded: &[u8]) -> Vec<u8> {
    let Some(&pad) = padded.last() else {
        return Vec::new();
    };
    let drop = pad as usize + 1;
    match padded.len().checked_sub(drop) {
        Some(end) => padded[..end].to_vec(),
        None => Vec::new(),
    }
}

/// An independent KNpsk0 RESPONDER — the mirror of [`NoiseInitiator`] — so the
/// handshake is validated end-to-end against a SECOND implementation of the same
/// schedule, not against itself. Shared by this module's tests and
/// [`super::conn`]'s (a loopback caBLE peer). It knows the initiator's static
/// public key (uncompressed), exactly as a phone does from the scanned QR.
#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
pub(crate) mod testonly {
    use super::{aes_gcm_open, aes_gcm_seal, hkdf, protocol_h, CableTransport, ZERO12};
    use crate::cable::keys::KeyPair;
    use sha2::{Digest, Sha256};

    pub(crate) struct Responder {
        ck: [u8; 32],
        h: [u8; 32],
        k: Option<[u8; 32]>,
        initiator_static_pub: Vec<u8>,
        ephemeral: KeyPair,
    }

    impl Responder {
        pub(crate) fn new(initiator_static_pub: Vec<u8>, ephemeral: KeyPair) -> Self {
            let h = protocol_h();
            Self {
                ck: h,
                h,
                k: None,
                initiator_static_pub,
                ephemeral,
            }
        }
        fn mix_hash(&mut self, data: &[u8]) {
            let mut hasher = Sha256::new();
            hasher.update(self.h);
            hasher.update(data);
            self.h = hasher.finalize().into();
        }
        fn mix_key(&mut self, ikm: &[u8]) {
            let out = hkdf(&self.ck, ikm, 64).unwrap();
            self.ck.copy_from_slice(&out[0..32]);
            let mut k = [0u8; 32];
            k.copy_from_slice(&out[32..64]);
            self.k = Some(k);
        }
        fn mix_key_and_hash(&mut self, ikm: &[u8]) {
            let out = hkdf(&self.ck, ikm, 96).unwrap();
            self.ck.copy_from_slice(&out[0..32]);
            self.mix_hash(&out[32..64]);
            let mut k = [0u8; 32];
            k.copy_from_slice(&out[64..96]);
            self.k = Some(k);
        }

        /// Consume message 1 and produce message 2, plus this side's transport.
        pub(crate) fn respond(&mut self, msg1: &[u8], psk: &[u8]) -> (Vec<u8>, CableTransport) {
            // Read message 1: psk, e.
            self.mix_hash(&[0x01]);
            let static_pub = self.initiator_static_pub.clone();
            self.mix_hash(&static_pub);
            self.mix_key_and_hash(psk);
            assert_eq!(msg1.len(), 81);
            let peer_epub = &msg1[0..65];
            let ct = &msg1[65..81];
            self.mix_hash(peer_epub);
            self.mix_key(peer_epub);
            // decrypt_and_hash (empty payload)
            let k = self.k.unwrap();
            let pt = aes_gcm_open(&k, &ZERO12, &self.h, ct).unwrap();
            assert!(pt.is_empty());
            self.mix_hash(ct);

            // Write message 2: e, ee, se.
            let e_pub = self.ephemeral.public_uncompressed();
            self.mix_hash(&e_pub);
            self.mix_key(&e_pub);
            let ee = self.ephemeral.ecdh_x(peer_epub).unwrap();
            self.mix_key(&ee);
            let se = self.ephemeral.ecdh_x(&self.initiator_static_pub).unwrap();
            self.mix_key(&se);
            let k = self.k.unwrap();
            let tag = aes_gcm_seal(&k, &ZERO12, &self.h, &[]).unwrap();
            self.mix_hash(&tag);
            let mut msg2 = e_pub;
            msg2.extend_from_slice(&tag);

            // Split — the responder's write/read keys are the initiator's
            // read/write keys, swapped.
            let split = hkdf(&self.ck, &[], 64).unwrap();
            let transport =
                CableTransport::new(split[32..64].to_vec(), split[0..32].to_vec()).unwrap();
            (msg2, transport)
        }
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::testonly::Responder;
    use super::*;

    #[test]
    fn a_full_handshake_agrees_with_an_independent_responder() {
        let psk = [0x33u8; 32];
        let init_static = KeyPair::from_seed(&[1u8; 32]).unwrap();
        let init_static_pub = init_static.public_uncompressed();
        let init_ephemeral = KeyPair::from_seed(&[2u8; 32]).unwrap();
        let resp_ephemeral = KeyPair::from_seed(&[3u8; 32]).unwrap();

        let mut initiator = NoiseInitiator::new(init_static);
        let msg1 = initiator.write_message1(&psk, init_ephemeral).unwrap();
        assert_eq!(msg1.len(), 81);

        let mut responder = Responder::new(init_static_pub, resp_ephemeral);
        let (msg2, mut resp_transport) = responder.respond(&msg1, &psk);
        assert_eq!(msg2.len(), 81);

        let (wk, rk) = initiator.read_message2(&msg2).unwrap();
        let mut init_transport = CableTransport::new(wk, rk).unwrap();

        // Both derived the same transcript ⇒ the ciphers interoperate in both
        // directions across several frames (counters advance in lockstep).
        for i in 0..4u8 {
            let out = vec![i; (i as usize) * 40 + 1];
            let sealed = init_transport.seal(&out).unwrap();
            assert_eq!(resp_transport.open(&sealed).unwrap(), out);

            let back = vec![i ^ 0xff; (i as usize) * 7 + 32];
            let sealed = resp_transport.seal(&back).unwrap();
            assert_eq!(init_transport.open(&sealed).unwrap(), back);
        }
    }

    #[test]
    fn a_tampered_reply_fails_the_initiator_authentication() {
        // The whole point of the AEAD tag on message 2 is that a tunnel peer
        // cannot alter the transcript. Flip one bit of the reply and the
        // initiator must refuse to derive keys rather than trust it.
        let psk = [0x33u8; 32];
        let init_static = KeyPair::from_seed(&[1u8; 32]).unwrap();
        let init_static_pub = init_static.public_uncompressed();
        let mut initiator = NoiseInitiator::new(init_static);
        let msg1 = initiator
            .write_message1(&psk, KeyPair::from_seed(&[2u8; 32]).unwrap())
            .unwrap();

        let mut responder =
            Responder::new(init_static_pub, KeyPair::from_seed(&[3u8; 32]).unwrap());
        let (mut msg2, _) = responder.respond(&msg1, &psk);
        let last = msg2.len() - 1;
        msg2[last] ^= 0x01; // corrupt the tag
        assert_eq!(initiator.read_message2(&msg2), Err(NoiseError::Cipher));
    }

    #[test]
    fn a_short_reply_is_rejected() {
        let mut initiator = NoiseInitiator::new(KeyPair::from_seed(&[1u8; 32]).unwrap());
        let _ = initiator
            .write_message1(&[0u8; 32], KeyPair::from_seed(&[2u8; 32]).unwrap())
            .unwrap();
        assert_eq!(
            initiator.read_message2(&[0u8; 80]),
            Err(NoiseError::BadLength)
        );
    }

    #[test]
    fn transport_padding_round_trips_at_the_block_boundaries() {
        // A fresh transport with equal keys can open what it seals only when the
        // counters line up; here we test pad/unpad by giving read==write key and
        // resetting the read counter per case.
        for len in [0usize, 1, 31, 32, 33, 64, 200] {
            let key = vec![0x5au8; 32];
            let mut a = CableTransport::new(key.clone(), key.clone()).unwrap();
            let mut b = CableTransport::new(key.clone(), key).unwrap();
            let msg = vec![0xa5u8; len];
            let sealed = a.seal(&msg).unwrap();
            // `b` reads with counter 0, matching `a`'s first seal.
            assert_eq!(b.open(&sealed).unwrap(), msg, "len {len}");
        }
    }
}
