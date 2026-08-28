//! Decode the 16-bit tunnel-server identifier from a BLE advert into a
//! WebSocket domain, per CTAP 2.3 §11.5.1.1.1 `decodeTunnelServerDomain`.
//!
//! Values < 256 index the assigned domains; larger values are hashed into a
//! `cable.<base32>.<tld>` domain. Used by the 2.2 WebSocket tunnel fallback —
//! e.g. when connecting to an iPhone/Chrome authenticator that does not offer
//! the CTAP 2.3 BLE data channel. Ported from the founder's proven demo
//! (`transport/ble/cable/TunnelDomain.kt`).

use sha2::{Digest, Sha256};

/// The assigned tunnel-server domains, in order (index == encoded value).
const ASSIGNED: [&str; 2] = ["cable.ua5v.com", "cable.auth.com"];

const BASE32: &[u8; 32] = b"abcdefghijklmnopqrstuvwxyz234567";
const TLDS: [&str; 4] = [".com", ".org", ".net", ".info"];

/// The WebSocket domain for a tunnel-server id, or `None` for an unknown
/// assigned value below 256.
#[must_use]
pub fn decode(encoded: u16) -> Option<String> {
    if encoded < 256 {
        return ASSIGNED.get(encoded as usize).map(|s| (*s).to_owned());
    }

    let mut input = b"caBLEv2 tunnel server domain".to_vec();
    input.push((encoded & 0xff) as u8);
    input.push(((encoded >> 8) & 0xff) as u8);
    input.push(0);
    let digest = Sha256::digest(&input);

    // Little-endian u64 of the first 8 bytes.
    let mut value: u64 = 0;
    for i in 0..8 {
        value |= u64::from(digest[i]) << (8 * i);
    }
    let tld_index = (value & 3) as usize;
    value >>= 2;

    let mut domain = String::from("cable.");
    while value != 0 {
        domain.push(BASE32[(value & 31) as usize] as char);
        value >>= 5;
    }
    domain.push_str(TLDS[tld_index & 3]);
    Some(domain)
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;

    #[test]
    fn assigned_values_map_to_the_known_domains() {
        assert_eq!(decode(0).as_deref(), Some("cable.ua5v.com"));
        assert_eq!(decode(1).as_deref(), Some("cable.auth.com"));
        assert_eq!(decode(2), None);
    }

    /// A hashed domain is deterministic, starts `cable.`, and ends in one of
    /// the four TLDs. The exact value comes from the SHA-256, so this pins the
    /// shape rather than a magic string.
    #[test]
    fn a_large_value_hashes_to_a_stable_cable_domain() {
        let a = decode(256).unwrap();
        let b = decode(256).unwrap();
        assert_eq!(a, b, "the derivation is deterministic");
        assert!(a.starts_with("cable."), "{a}");
        assert!(TLDS.iter().any(|tld| a.ends_with(tld)), "{a}");
    }
}
