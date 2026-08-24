//! CTAP2 PIN/UV auth protocols, from the outside.
//!
//! The known-answer vectors live inside the module (NIST AES-256-CBC, RFC 5869
//! HKDF); these are the behaviours a caller can get wrong: choosing a protocol,
//! sizing a tag, handing over an IV.

use vela_core::ctap::pin_uv::{pin_hash, Protocol, SharedSecret};

const SHARED: [u8; 32] = [0x7fu8; 32];

fn secret(protocol: Protocol) -> SharedSecret {
    match SharedSecret::derive(protocol, &SHARED) {
        Ok(secret) => secret,
        Err(error) => unreachable!("{error:?}"),
    }
}

/// An authenticator advertises what it supports; a wallet takes the best it
/// speaks. `None` rather than a guess, because silently falling back to One on
/// an authenticator that offered neither produces a token it will reject, and
/// the caller needs to say so rather than retry forever.
#[test]
fn the_best_advertised_protocol_wins_and_nothing_is_assumed() {
    assert_eq!(Protocol::best_of(&[1, 2]), Some(Protocol::Two));
    assert_eq!(Protocol::best_of(&[2]), Some(Protocol::Two));
    assert_eq!(Protocol::best_of(&[1]), Some(Protocol::One));
    assert_eq!(Protocol::best_of(&[]), None);
    assert_eq!(Protocol::best_of(&[7]), None);
    assert_eq!(Protocol::One.number(), 1);
    assert_eq!(Protocol::Two.number(), 2);
}

/// Truncation is not an optimisation. An authenticator on protocol One compares
/// sixteen bytes and rejects thirty-two.
#[test]
fn the_auth_tag_is_sized_by_the_protocol() {
    assert_eq!(secret(Protocol::One).authenticate(b"request").len(), 16);
    assert_eq!(secret(Protocol::Two).authenticate(b"request").len(), 32);
}

/// `pinUvAuthParam` covers the request's exact bytes — which is why the CBOR
/// encoder is canonical.
#[test]
fn the_auth_tag_changes_with_the_message() {
    let secret = secret(Protocol::Two);
    assert_ne!(secret.authenticate(b"a"), secret.authenticate(b"b"));
}

#[test]
fn protocol_one_round_trips_a_block_aligned_secret() {
    let secret = secret(Protocol::One);
    let plaintext = pin_hash("1234");
    let ciphertext = match secret.encrypt(&plaintext, &[]) {
        Ok(bytes) => bytes,
        Err(error) => unreachable!("{error:?}"),
    };
    assert_eq!(ciphertext.len(), 16, "protocol One prepends no IV");
    assert_eq!(secret.decrypt(&ciphertext), Ok(plaintext.to_vec()));
}

/// Protocol One's all-zero IV makes encryption deterministic. That is what the
/// specification says, and it is safe only because every message it protects is
/// a fresh random value under a fresh per-session key — which is exactly why
/// protocol Two exists.
#[test]
fn protocol_one_is_deterministic_by_specification() {
    let secret = secret(Protocol::One);
    let plaintext = [0x11u8; 16];
    assert_eq!(
        secret.encrypt(&plaintext, &[]),
        secret.encrypt(&plaintext, &[])
    );
}

#[test]
fn protocol_two_prepends_its_iv_and_round_trips() {
    let secret = secret(Protocol::Two);
    let iv = [0x5au8; 16];
    let plaintext = [0x22u8; 32];
    let ciphertext = match secret.encrypt(&plaintext, &iv) {
        Ok(bytes) => bytes,
        Err(error) => unreachable!("{error:?}"),
    };
    assert_eq!(ciphertext.len(), 16 + plaintext.len());
    assert_eq!(
        &ciphertext[..16],
        &iv,
        "the authenticator reads the IV first"
    );
    assert_eq!(secret.decrypt(&ciphertext), Ok(plaintext.to_vec()));
}

/// Two different IVs must produce two different ciphertexts, or the IV is not
/// reaching the cipher.
#[test]
fn protocol_two_ciphertext_depends_on_the_iv() {
    let secret = secret(Protocol::Two);
    let plaintext = [0x33u8; 16];
    let a = secret.encrypt(&plaintext, &[0x01u8; 16]);
    let b = secret.encrypt(&plaintext, &[0x02u8; 16]);
    assert_ne!(a, b);
}

#[test]
fn protocol_two_refuses_a_wrong_sized_iv() {
    assert!(secret(Protocol::Two)
        .encrypt(&[0u8; 16], &[0u8; 12])
        .is_err());
}

/// CTAP2 encrypts only fixed-size secrets, so there is no padding scheme to
/// choose — an unaligned plaintext is a bug in the caller, not a formatting
/// preference to accommodate.
#[test]
fn an_unaligned_payload_is_refused_rather_than_padded() {
    let secret = secret(Protocol::Two);
    assert!(secret.encrypt(&[0u8; 17], &[0u8; 16]).is_err());
    assert!(secret.encrypt(&[], &[0u8; 16]).is_err());
    assert!(secret.decrypt(&[0u8; 20]).is_err());
    assert!(
        secret.decrypt(&[0u8; 8]).is_err(),
        "shorter than its own IV"
    );
}

/// The shell computes ECDH and hands over the shared point's X coordinate — 32
/// bytes, not the 65-byte uncompressed point. Getting that wrong yields keys
/// that simply never work, so it fails here instead.
#[test]
fn the_shared_secret_must_be_the_x_coordinate_alone() {
    assert!(SharedSecret::derive(Protocol::Two, &[0u8; 65]).is_err());
    assert!(SharedSecret::derive(Protocol::One, &[0u8; 31]).is_err());
    assert!(SharedSecret::derive(Protocol::Two, &[0u8; 32]).is_ok());
}

/// A shared secret in a log is a shared secret.
#[test]
fn debug_output_never_carries_the_keys() {
    let rendered = format!("{:?}", secret(Protocol::Two));
    assert!(rendered.contains("Two"));
    assert!(!rendered.contains("hmac_key"));
    assert!(!rendered.contains("7f"));
}
