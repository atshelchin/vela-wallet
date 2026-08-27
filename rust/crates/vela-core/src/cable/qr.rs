//! The hybrid `FIDO:/` QR payload the initiator shows (CTAP 2.3 §11.5.1).
//! Pure: the bytes are the core's, the bitmap that carries them is the shell's.
//!
//! The payload is a CBOR map, base10-encoded, behind a `FIDO:/` scheme. Ported
//! from the founder's proven demo (`transport/ble/cable/CableQr.kt`).

use ciborium::Value;

use super::base10;

/// Flow hint (QR key 5): sign in with an existing passkey.
pub const HINT_GET: &str = "ga";
/// Flow hint (QR key 5): create a passkey on the phone.
pub const HINT_MAKE: &str = "mc";

/// The QR the phone scans — `FIDO:/<base10(cbor)>`.
///
/// * `identity_pub_compressed` — the initiator's 33-byte compressed P-256 key.
/// * `qr_secret` — 16 random bytes; every caBLE key derives from it.
/// * `epoch_seconds` — the current time (the core has no clock; the shell
///   passes it).
/// * `hint` — the flow the phone should offer: [`HINT_GET`] to sign in with an
///   existing passkey, [`HINT_MAKE`] to create one. It is not merely cosmetic —
///   the phone shows "sign in" for `ga` and looks for an existing credential, so
///   a make-credential flow behind a `ga` QR is offered as a sign-in the phone
///   then fails for want of a passkey.
///
/// ## Why the payload is exactly Chrome's shape — keys 0..=5 and NOTHING else
///
/// This used to emit key 6 as the CTAP 2.3 channel list (`[0, 1]`) to offer the
/// BLE data channel. Device-found (2026-08-28): Google Password Manager's
/// parser is caBLE v2.1-era — it knows key 6 only as a BOOL
/// (`supports_non_discoverable_make_credential`, see webauthn-rs and Chromium)
/// and hard-rejects the whole QR when the type does not match. The symptom was
/// exactly asymmetric: iPhones (tolerant parser) connected, GMS phones never
/// did, while Chrome's own QR (no array) worked everywhere.
///
/// And the list was carrying no information anyone needed: channel selection is
/// driven by the AUTHENTICATOR's advert (a PSM in the suffix = BLE-only
/// offered), and our own authenticators proceed with the BLE channel whether or
/// not the QR mentioned it. So the QR stays maximally compatible and the advert
/// stays the single source of truth for the channel.
#[must_use]
pub fn build_payload(
    identity_pub_compressed: &[u8],
    qr_secret: &[u8],
    epoch_seconds: i64,
    hint: &str,
) -> String {
    let entries = vec![
        (Value::Integer(0.into()), Value::Bytes(identity_pub_compressed.to_vec())),
        (Value::Integer(1.into()), Value::Bytes(qr_secret.to_vec())),
        // The number of assigned tunnel-server domains this initiator knows.
        (Value::Integer(2.into()), Value::Integer(2.into())),
        (Value::Integer(3.into()), Value::Integer(epoch_seconds.into())),
        // Not state-assisted / not linkable.
        (Value::Integer(4.into()), Value::Bool(false)),
        // Flow hint: getAssertion (`ga`) or makeCredential (`mc`).
        (Value::Integer(5.into()), Value::Text(hint.to_owned())),
    ];

    let map = Value::Map(entries);
    let mut cbor = Vec::new();
    // ciborium only fails to write on an I/O error, and a Vec never yields one.
    if ciborium::ser::into_writer(&map, &mut cbor).is_err() {
        return String::new();
    }
    format!("FIDO:/{}", base10::encode(&cbor))
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;

    fn decode_map(payload: &str) -> Vec<(Value, Value)> {
        let digits = payload.strip_prefix("FIDO:/").expect("scheme");
        let cbor = base10::decode(digits).expect("base10");
        let value: Value = ciborium::de::from_reader(cbor.as_slice()).expect("cbor");
        match value {
            Value::Map(entries) => entries,
            other => panic!("not a map: {other:?}"),
        }
    }

    fn get(entries: &[(Value, Value)], key: i64) -> Option<&Value> {
        entries
            .iter()
            .find(|(k, _)| matches!(k, Value::Integer(i) if *i == key.into()))
            .map(|(_, v)| v)
    }

    #[test]
    fn the_payload_round_trips_through_base10_and_cbor() {
        let pub_key = [0x02u8; 33];
        let secret = [0x11u8; 16];
        let payload = build_payload(&pub_key, &secret, 1_700_000_000, HINT_GET);

        assert!(payload.starts_with("FIDO:/"));
        let entries = decode_map(&payload);

        assert!(matches!(get(&entries, 0), Some(Value::Bytes(b)) if b == &pub_key));
        assert!(matches!(get(&entries, 1), Some(Value::Bytes(b)) if b == &secret));
        assert!(matches!(get(&entries, 3), Some(Value::Integer(i)) if *i == 1_700_000_000i64.into()));
        assert!(matches!(get(&entries, 5), Some(Value::Text(s)) if s == "ga"));
    }

    /// Key 6 must NEVER appear: Google Password Manager's caBLE v2.1-era parser
    /// knows it only as a bool and hard-rejects a QR whose key 6 is anything
    /// else (device-found 2026-08-28 — GMS phones could not connect while
    /// iPhones could). The BLE channel is offered by the authenticator's
    /// ADVERT (the PSM suffix), never by the QR.
    #[test]
    fn the_payload_is_exactly_chromes_shape_with_no_key_6() {
        for hint in [HINT_GET, HINT_MAKE] {
            let entries = decode_map(&build_payload(&[2u8; 33], &[0u8; 16], 0, hint));
            assert!(get(&entries, 6).is_none(), "key 6 poisons GMS parsers");
            assert_eq!(entries.len(), 6, "keys 0..=5, nothing else");
        }
    }
}
