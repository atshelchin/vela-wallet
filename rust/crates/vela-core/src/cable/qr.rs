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
/// * `offer_ble` — advertise the CTAP 2.3 BLE data channel alongside the
///   WebSocket tunnel. Key 6 (the channel list) is emitted ONLY when this is
///   set: caBLE v2 treated key 6 as a bool, and a pre-2.3 responder
///   hard-rejects a QR that carries the list, so it must be absent otherwise.
/// * `epoch_seconds` — the current time (the core has no clock; the shell
///   passes it).
/// * `hint` — the flow the phone should offer: [`HINT_GET`] to sign in with an
///   existing passkey, [`HINT_MAKE`] to create one. It is not merely cosmetic —
///   the phone shows "sign in" for `ga` and looks for an existing credential, so
///   a make-credential flow behind a `ga` QR is offered as a sign-in the phone
///   then fails for want of a passkey.
#[must_use]
pub fn build_payload(
    identity_pub_compressed: &[u8],
    qr_secret: &[u8],
    offer_ble: bool,
    epoch_seconds: i64,
    hint: &str,
) -> String {
    let mut entries = vec![
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
    if offer_ble {
        // [0]=WebSocket (fallback), [1]=BLE (local, no tunnel).
        entries.push((
            Value::Integer(6.into()),
            Value::Array(vec![Value::Integer(0.into()), Value::Integer(1.into())]),
        ));
    }

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
        let payload = build_payload(&pub_key, &secret, true, 1_700_000_000, HINT_GET);

        assert!(payload.starts_with("FIDO:/"));
        let entries = decode_map(&payload);

        assert!(matches!(get(&entries, 0), Some(Value::Bytes(b)) if b == &pub_key));
        assert!(matches!(get(&entries, 1), Some(Value::Bytes(b)) if b == &secret));
        assert!(matches!(get(&entries, 3), Some(Value::Integer(i)) if *i == 1_700_000_000i64.into()));
        assert!(matches!(get(&entries, 5), Some(Value::Text(s)) if s == "ga"));
    }

    /// Key 6 (the channel list) is present iff BLE is offered — the
    /// legacy-collision rule.
    #[test]
    fn the_ble_channel_list_is_present_only_when_ble_is_offered() {
        let with_ble = decode_map(&build_payload(&[2u8; 33], &[0u8; 16], true, 0, HINT_GET));
        assert!(matches!(get(&with_ble, 6), Some(Value::Array(_))));

        let without_ble = decode_map(&build_payload(&[2u8; 33], &[0u8; 16], false, 0, HINT_MAKE));
        assert!(get(&without_ble, 6).is_none(), "no channel list without BLE");
    }
}
