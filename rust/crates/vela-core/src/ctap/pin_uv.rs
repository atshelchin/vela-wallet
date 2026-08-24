//! CTAP2 PIN/UV auth protocols One and Two (CTAP 2.1 §6.5.6).
//!
//! A security key that stores discoverable credentials requires user
//! verification, and user verification on a roaming key means a PIN. This is
//! the machinery that turns "the person typed 1234" into a `pinUvAuthToken`
//! the authenticator will accept — and then into the `pinUvAuthParam` that
//! authenticates every later request.
//!
//! ## What is here and what is not
//!
//! The ECDH exchange is NOT here. Generating an ephemeral key pair needs
//! randomness, and this crate has none; the shell mints the pair and hands over
//! the shared secret's X coordinate, exactly as it hands over the group-key
//! seed during onboarding. What is here is everything downstream of that: key
//! derivation, encryption, and the HMACs.
//!
//! ## The two protocols
//!
//! | | One | Two |
//! | --- | --- | --- |
//! | key derivation | SHA-256 of the shared X | HKDF-SHA-256, two separate keys |
//! | encryption | AES-256-CBC, all-zero IV | AES-256-CBC, random IV prepended |
//! | authentication | HMAC-SHA-256, first 16 bytes | HMAC-SHA-256, all 32 |
//!
//! Protocol One's zero IV is not a mistake in this implementation — it is what
//! the specification says, and it is safe only because every message it
//! encrypts is a fresh random value under a fresh per-session key. Two exists
//! because that reasoning is fragile, and a wallet should prefer it whenever
//! an authenticator offers it.

use aes::cipher::{BlockModeDecrypt, BlockModeEncrypt, KeyInit, KeyIvInit};
use hmac::{Mac, SimpleHmac};
use sha2::{Digest, Sha256};

use crate::error::CoreError;

type HmacSha256 = SimpleHmac<Sha256>;
type Aes256CbcEnc = cbc::Encryptor<aes::Aes256>;
type Aes256CbcDec = cbc::Decryptor<aes::Aes256>;

/// Which protocol a session speaks. An authenticator advertises what it
/// supports in `getInfo`; a wallet takes the highest it recognises.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Protocol {
    One,
    Two,
}

impl Protocol {
    /// The wire number, which is what `pinUvAuthProtocol` carries.
    pub fn number(self) -> u8 {
        match self {
            Self::One => 1,
            Self::Two => 2,
        }
    }

    /// The best protocol among those an authenticator advertises.
    ///
    /// `None` means the authenticator offered nothing this client speaks — a
    /// fact for the caller to surface, not to paper over by guessing One.
    pub fn best_of(advertised: &[u8]) -> Option<Self> {
        if advertised.contains(&2) {
            Some(Self::Two)
        } else if advertised.contains(&1) {
            Some(Self::One)
        } else {
            None
        }
    }
}

/// The keys one PIN/UV session works with, derived from the ECDH shared point.
///
/// Protocol One uses one key for both jobs; Two derives two, so that a flaw in
/// one use cannot be leveraged into the other. Both are held here so callers
/// never have to remember which protocol they are on.
#[derive(Clone)]
pub struct SharedSecret {
    protocol: Protocol,
    hmac_key: [u8; 32],
    aes_key: [u8; 32],
}

impl core::fmt::Debug for SharedSecret {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        // Never print the keys. A shared secret in a log is a shared secret.
        f.debug_struct("SharedSecret")
            .field("protocol", &self.protocol)
            .finish_non_exhaustive()
    }
}

impl SharedSecret {
    /// Derive a session's keys from the ECDH output.
    ///
    /// `shared_x` is the 32-byte X coordinate of the shared point — NOT the
    /// full uncompressed point. The shell computes it; feeding the wrong
    /// encoding here produces keys that simply do not work, which is the
    /// failure mode to expect if an authenticator rejects every token.
    pub fn derive(protocol: Protocol, shared_x: &[u8]) -> Result<Self, CoreError> {
        if shared_x.len() != 32 {
            return Err(CoreError::InvalidPublicKey(format!(
                "ECDH shared X must be 32 bytes, got {}",
                shared_x.len()
            )));
        }
        match protocol {
            Protocol::One => {
                let digest: [u8; 32] = Sha256::digest(shared_x).into();
                Ok(Self {
                    protocol,
                    hmac_key: digest,
                    aes_key: digest,
                })
            }
            Protocol::Two => {
                // Two 32-byte keys from one HKDF, with the spec's salt and info
                // strings. The salt is 32 zero bytes, not absent.
                let hkdf = hkdf::Hkdf::<Sha256>::new(Some(&[0u8; 32]), shared_x);
                let mut hmac_key = [0u8; 32];
                let mut aes_key = [0u8; 32];
                hkdf.expand(b"CTAP2 HMAC key", &mut hmac_key)
                    .map_err(|_| CoreError::InvalidPublicKey("HKDF expand failed".to_owned()))?;
                hkdf.expand(b"CTAP2 AES key", &mut aes_key)
                    .map_err(|_| CoreError::InvalidPublicKey("HKDF expand failed".to_owned()))?;
                Ok(Self {
                    protocol,
                    hmac_key,
                    aes_key,
                })
            }
        }
    }

    pub fn protocol(&self) -> Protocol {
        self.protocol
    }

    /// The `pinUvAuthParam` for a message.
    ///
    /// Protocol One truncates to 16 bytes; Two sends all 32. Truncation is not
    /// an optimisation — an authenticator on One compares 16 bytes and will
    /// reject 32.
    pub fn authenticate(&self, message: &[u8]) -> Vec<u8> {
        let mut mac = <HmacSha256 as KeyInit>::new_from_slice(&self.hmac_key)
            .unwrap_or_else(|_| unreachable!("HMAC accepts a key of any length"));
        mac.update(message);
        let tag = mac.finalize().into_bytes();
        match self.protocol {
            Protocol::One => tag[..16].to_vec(),
            Protocol::Two => tag.to_vec(),
        }
    }

    /// Encrypt a payload whose length is already a multiple of the block size.
    ///
    /// CTAP2 encrypts only fixed-size secrets — a 16-byte PIN hash, a 64-byte
    /// padded PIN — so there is no padding scheme to choose and a caller that
    /// hands over something unaligned has a bug, not a formatting preference.
    ///
    /// `iv` is ignored on protocol One, which mandates an all-zero IV; on Two
    /// it must be 16 fresh random bytes from the shell and is prepended to the
    /// ciphertext, as the authenticator expects to find it.
    pub fn encrypt(&self, plaintext: &[u8], iv: &[u8]) -> Result<Vec<u8>, CoreError> {
        if plaintext.len() % 16 != 0 || plaintext.is_empty() {
            return Err(CoreError::InvalidSignature(format!(
                "CTAP2 plaintext must be a non-empty multiple of 16 bytes, got {}",
                plaintext.len()
            )));
        }
        match self.protocol {
            Protocol::One => Ok(cbc_encrypt(&self.aes_key, &[0u8; 16], plaintext)),
            Protocol::Two => {
                let iv: [u8; 16] = iv.try_into().map_err(|_| {
                    CoreError::InvalidSignature(format!(
                        "protocol Two needs a 16-byte IV, got {}",
                        iv.len()
                    ))
                })?;
                let mut out = iv.to_vec();
                out.extend_from_slice(&cbc_encrypt(&self.aes_key, &iv, plaintext));
                Ok(out)
            }
        }
    }

    /// Decrypt what the authenticator sent back — a `pinUvAuthToken`.
    pub fn decrypt(&self, ciphertext: &[u8]) -> Result<Vec<u8>, CoreError> {
        let (iv, body) = match self.protocol {
            Protocol::One => ([0u8; 16], ciphertext),
            Protocol::Two => {
                if ciphertext.len() < 16 {
                    return Err(CoreError::InvalidSignature(
                        "protocol Two ciphertext is shorter than its IV".to_owned(),
                    ));
                }
                let (iv, body) = ciphertext.split_at(16);
                let iv: [u8; 16] = iv
                    .try_into()
                    .unwrap_or_else(|_| unreachable!("split_at(16) yields 16 bytes"));
                (iv, body)
            }
        };
        if body.is_empty() || body.len() % 16 != 0 {
            return Err(CoreError::InvalidSignature(format!(
                "CTAP2 ciphertext must be a non-empty multiple of 16 bytes, got {}",
                body.len()
            )));
        }
        Ok(cbc_decrypt(&self.aes_key, &iv, body))
    }
}

/// The left half of SHA-256(PIN), which is what CTAP2 sends rather than the PIN.
///
/// The authenticator never receives the PIN itself, and this client never
/// stores it: a caller passes the bytes in, gets 16 bytes out, and lets the
/// original go.
pub fn pin_hash(pin: &str) -> [u8; 16] {
    let digest = Sha256::digest(pin.as_bytes());
    let mut out = [0u8; 16];
    out.copy_from_slice(&digest[..16]);
    out
}

/// CBC over whole blocks, with no padding scheme: CTAP2 only ever encrypts
/// values that are already block-aligned, and the callers above refuse
/// anything else before reaching here.
fn cbc_encrypt(key: &[u8; 32], iv: &[u8; 16], plaintext: &[u8]) -> Vec<u8> {
    let mut cipher = Aes256CbcEnc::new(key.into(), iv.into());
    let mut out = plaintext.to_vec();
    let blocks: &mut [aes::Block] = bytemuck_blocks(&mut out);
    cipher.encrypt_blocks(blocks);
    out
}

fn cbc_decrypt(key: &[u8; 32], iv: &[u8; 16], ciphertext: &[u8]) -> Vec<u8> {
    let mut cipher = Aes256CbcDec::new(key.into(), iv.into());
    let mut out = ciphertext.to_vec();
    let blocks: &mut [aes::Block] = bytemuck_blocks(&mut out);
    cipher.decrypt_blocks(blocks);
    out
}

/// Reinterpret a block-aligned byte buffer as the cipher's block slice.
///
/// `chunks_exact_mut` cannot produce `&mut [Block]` directly, and the callers
/// have already established the length is a non-zero multiple of 16 — so this
/// is a view, not a check.
fn bytemuck_blocks(bytes: &mut [u8]) -> &mut [aes::Block] {
    let count = bytes.len() / 16;
    let (blocks, rest) = aes::Block::slice_as_chunks_mut(bytes);
    debug_assert!(rest.is_empty(), "callers guarantee block alignment");
    debug_assert_eq!(blocks.len(), count);
    blocks
}

#[cfg(test)]
mod known_answers {
    //! Published vectors, not round trips.
    //!
    //! A round trip proves this module is self-consistent; it does not prove it
    //! is doing AES-256-CBC or HKDF-SHA-256. Wiring the wrong HMAC into HKDF,
    //! or CBC-ing in the wrong direction, round-trips perfectly and produces a
    //! token no authenticator will ever accept. These are the tests that catch
    //! that, and they are here rather than in `tests/` because they reach the
    //! private primitives directly.

    use super::*;

    fn hex(text: &str) -> Vec<u8> {
        (0..text.len() / 2)
            .map(|i| match u8::from_str_radix(&text[i * 2..i * 2 + 2], 16) {
                Ok(byte) => byte,
                Err(error) => unreachable!("test vector is not hex: {error}"),
            })
            .collect()
    }

    /// NIST SP 800-38A §F.2.5 — CBC-AES256.Encrypt.
    #[test]
    fn aes_256_cbc_matches_nist_sp_800_38a() {
        let key: [u8; 32] = match hex(
            "603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4",
        )
        .try_into()
        {
            Ok(key) => key,
            Err(_) => unreachable!("vector key is 32 bytes"),
        };
        let iv: [u8; 16] = match hex("000102030405060708090a0b0c0d0e0f").try_into() {
            Ok(iv) => iv,
            Err(_) => unreachable!("vector IV is 16 bytes"),
        };
        let plaintext = hex("6bc1bee22e409f96e93d7e117393172a\
             ae2d8a571e03ac9c9eb76fac45af8e51\
             30c81c46a35ce411e5fbc1191a0a52ef\
             f69f2445df4f9b17ad2b417be66c3710");
        let expected = hex("f58c4c04d6e5f1ba779eabfb5f7bfbd6\
             9cfc4e967edb808d679f777bc6702c7d\
             39f23369a9d9bacfa530e26304231461\
             b2eb05e2c39be9fcda6c19078c6a9d1b");

        assert_eq!(cbc_encrypt(&key, &iv, &plaintext), expected);
        assert_eq!(cbc_decrypt(&key, &iv, &expected), plaintext);
    }

    /// RFC 5869 Test Case 1 — HKDF-SHA-256.
    ///
    /// Proves the extract-and-expand wiring, which is what a wrong HMAC choice
    /// would silently corrupt.
    #[test]
    fn hkdf_sha256_matches_rfc_5869() {
        let ikm = hex("0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b");
        let salt = hex("000102030405060708090a0b0c");
        let info = hex("f0f1f2f3f4f5f6f7f8f9");
        let expected = hex("3cb25f25faacd57a90434f64d0362f2a\
             2d2d0a90cf1a5a4c5db02d56ecc4c5bf\
             34007208d5b887185865");

        let hkdf = hkdf::Hkdf::<Sha256>::new(Some(&salt), &ikm);
        let mut okm = vec![0u8; expected.len()];
        if hkdf.expand(&info, &mut okm).is_err() {
            unreachable!("42 bytes is within HKDF-SHA-256's output limit");
        }
        assert_eq!(okm, expected);
    }

    /// The PIN never leaves as a PIN: CTAP2 sends the left half of its SHA-256.
    #[test]
    fn pin_hash_is_the_left_half_of_sha256() {
        // SHA-256("1234") = 03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4
        assert_eq!(
            pin_hash("1234").to_vec(),
            hex("03ac674216f3e15c761ee1a5e255f067")
        );
    }

    /// Protocol One derives ONE key by hashing the shared point; Two derives
    /// two different ones. A Two whose keys matched would mean the HKDF info
    /// strings were ignored.
    #[test]
    fn protocol_two_derives_two_distinct_keys() {
        let shared = [0x42u8; 32];
        let one = match SharedSecret::derive(Protocol::One, &shared) {
            Ok(secret) => secret,
            Err(error) => unreachable!("{error:?}"),
        };
        assert_eq!(one.hmac_key, one.aes_key, "protocol One uses one key twice");

        let two = match SharedSecret::derive(Protocol::Two, &shared) {
            Ok(secret) => secret,
            Err(error) => unreachable!("{error:?}"),
        };
        assert_ne!(
            two.hmac_key, two.aes_key,
            "protocol Two must separate the HMAC key from the AES key"
        );
        assert_ne!(
            two.aes_key, one.aes_key,
            "the two protocols must not derive the same key from the same point"
        );
    }
}
