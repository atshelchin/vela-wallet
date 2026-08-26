//! The "base10" digit encoding in the hybrid `FIDO:` QR payload (CTAP 2.3
//! §11.5.1). Pure, and the same on every platform — a QR a phone reads must
//! decode to the same CBOR whoever generated it.
//!
//! CBOR bytes are taken in 7-byte chunks. A full chunk is read as a
//! little-endian u64 and printed as decimal, zero-padded to 17 digits; a
//! trailing partial chunk uses a fixed width by its length. Ported from the
//! founder's proven demo (`transport/ble/cable/Base10.kt`), which cites the
//! reference vectors this module's tests pin.

/// The zero-padded decimal width of a trailing partial chunk, indexed by its
/// byte length (1..=6). Index 0 is unused.
const PARTIAL_WIDTH: [usize; 7] = [0, 3, 5, 8, 10, 13, 15];
/// A full 7-byte chunk always prints to 17 digits.
const FULL_WIDTH: usize = 17;

/// Encode bytes to the base10 digit string.
#[must_use]
pub fn encode(data: &[u8]) -> String {
    let mut out = String::new();
    let mut i = 0;
    while i < data.len() {
        let chunk = (data.len() - i).min(7);
        let mut value: u64 = 0;
        for j in 0..chunk {
            value |= u64::from(data[i + j]) << (8 * j);
        }
        let width = if chunk == 7 { FULL_WIDTH } else { PARTIAL_WIDTH[chunk] };
        let digits = value.to_string();
        for _ in 0..width.saturating_sub(digits.len()) {
            out.push('0');
        }
        out.push_str(&digits);
        i += chunk;
    }
    out
}

/// Decode a base10 digit string back to bytes. Returns `None` on a malformed
/// group width or a non-decimal digit.
#[must_use]
pub fn decode(digits: &str) -> Option<Vec<u8>> {
    if !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let bytes = digits.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        let remaining = bytes.len() - i;
        let width = if remaining >= FULL_WIDTH { FULL_WIDTH } else { remaining };
        let chunk_len = match width {
            FULL_WIDTH => 7,
            3 => 1,
            5 => 2,
            8 => 3,
            10 => 4,
            13 => 5,
            15 => 6,
            _ => return None,
        };
        let value: u64 = digits.get(i..i + width)?.parse().ok()?;
        for j in 0..chunk_len {
            out.push(((value >> (8 * j)) & 0xff) as u8);
        }
        i += width;
    }
    Some(out)
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;

    /// The two reference vectors the demo cites (Chromium's caBLE base10).
    #[test]
    fn the_reference_vectors_hold() {
        assert_eq!(encode(&[0x61, 0x62, 0xFF]), "16736865");
        assert_eq!(encode(b"hello world"), "335311851610699281684828783");
    }

    #[test]
    fn decode_is_the_inverse_of_encode() {
        for sample in [
            &b""[..],
            &[0x61, 0x62, 0xFF],
            b"hello world",
            &[0u8; 7],
            &[0xff; 13],
            &[1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        ] {
            assert_eq!(decode(&encode(sample)).as_deref(), Some(sample), "{sample:?}");
        }
    }

    #[test]
    fn a_non_digit_is_rejected() {
        assert_eq!(decode("12x45"), None);
    }
}
