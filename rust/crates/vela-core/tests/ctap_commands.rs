//! CTAP2 request encoding and response decoding.
//!
//! The tests that matter here are of two kinds: what an authenticator will
//! REFUSE (a non-canonical encoding, a missing exclusion list), and what the
//! rest of the wallet will MISREAD (an attestation object whose shape the
//! existing parsers do not recognise).

use ciborium::Value;
use serde_json::Value as Json;

use vela_core::ctap::commands::{
    attestation_object, get_info_request, parse_get_assertion, parse_get_info,
    parse_make_credential, split_response, Command, CredentialDescriptor, GetAssertion,
    MakeCredential, PinUvAuth, Status,
};
use vela_core::webauthn;

const VECTORS: &str = include_str!("vectors/webauthn.json");

/// The real CTAP2 attestation object the crux suites register with.
fn real_attestation_object() -> Vec<u8> {
    let root: Json = match serde_json::from_str(VECTORS) {
        Ok(root) => root,
        Err(error) => unreachable!("webauthn vectors parse: {error}"),
    };
    let hex = root["cases"]
        .as_array()
        .and_then(|cases| {
            cases
                .iter()
                .find(|case| case["name"] == "extractPublicKey/real-key")
        })
        .and_then(|case| case["input"]["attestation_object"].as_str())
        .unwrap_or_else(|| unreachable!("attestation vector missing"));
    match vela_core::primitives::from_hex(hex.trim_start_matches("0x")) {
        Ok(bytes) => bytes,
        Err(error) => unreachable!("attestation vector is not hex: {error}"),
    }
}

fn decode(bytes: &[u8]) -> Value {
    match ciborium::de::from_reader(bytes) {
        Ok(value) => value,
        Err(error) => unreachable!("our own encoding does not parse: {error}"),
    }
}

fn make_credential() -> MakeCredential {
    MakeCredential {
        client_data_hash: vec![0xaa; 32],
        rp_id: "getvela.app".to_owned(),
        rp_name: "Vela Wallet".to_owned(),
        user_id: b"Everyday wallet\0uuid".to_vec(),
        user_name: "Everyday wallet".to_owned(),
        user_display_name: "Everyday wallet".to_owned(),
        exclude: Vec::new(),
        resident_key: true,
        user_verification: true,
        pin_uv_auth: None,
    }
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

#[test]
fn a_request_is_its_command_byte_then_cbor() {
    let bytes = match make_credential().encode() {
        Ok(bytes) => bytes,
        Err(error) => unreachable!("{error:?}"),
    };
    assert_eq!(bytes[0], Command::MakeCredential as u8);
    assert!(matches!(decode(&bytes[1..]), Value::Map(_)));
}

/// CTAP2 requires the canonical encoding form, and an authenticator may refuse
/// anything else. It matters twice over: `pinUvAuthParam` is an HMAC over these
/// exact bytes, so two encodings of "the same" map authenticate differently.
#[test]
fn request_map_keys_are_in_canonical_order() {
    let mut request = make_credential();
    request.exclude = vec![CredentialDescriptor { id: vec![1, 2, 3] }];
    request.pin_uv_auth = Some(PinUvAuth {
        protocol: 2,
        param: vec![0x99; 32],
    });
    let bytes = match request.encode() {
        Ok(bytes) => bytes,
        Err(error) => unreachable!("{error:?}"),
    };
    let Value::Map(entries) = decode(&bytes[1..]) else {
        unreachable!("request is not a map");
    };
    let keys: Vec<i128> = entries
        .iter()
        .filter_map(|(key, _)| match key {
            Value::Integer(i) => Some(i128::from(*i)),
            _ => None,
        })
        .collect();
    let mut sorted = keys.clone();
    sorted.sort_unstable();
    assert_eq!(keys, sorted, "CTAP2 canonical CBOR sorts map keys");
    assert_eq!(keys, vec![1, 2, 3, 4, 5, 7, 8, 9]);
}

/// ES256 only, and nothing else offered.
///
/// The on-chain verifier is the RIP-7212 P-256 precompile and two-signature
/// recovery is ECDSA math, so an RSA credential can never become a working
/// wallet. Offering RS256 would mint an orphan key in someone's authenticator
/// and fail later, somewhere far less legible than here.
#[test]
fn only_es256_is_offered() {
    let bytes = match make_credential().encode() {
        Ok(bytes) => bytes,
        Err(error) => unreachable!("{error:?}"),
    };
    let Value::Map(entries) = decode(&bytes[1..]) else {
        unreachable!()
    };
    let params = entries
        .iter()
        .find_map(|(key, value)| match key {
            Value::Integer(i) if i128::from(*i) == 4 => Some(value),
            _ => None,
        })
        .unwrap_or_else(|| unreachable!("pubKeyCredParams missing"));
    let Value::Array(items) = params else {
        unreachable!("pubKeyCredParams is not an array")
    };
    assert_eq!(items.len(), 1, "exactly one algorithm is offered");
    let Value::Map(fields) = &items[0] else {
        unreachable!()
    };
    let alg = fields
        .iter()
        .find_map(|(key, value)| match (key, value) {
            (Value::Text(name), Value::Integer(i)) if name == "alg" => Some(i128::from(*i)),
            _ => None,
        })
        .unwrap_or_else(|| unreachable!("alg missing"));
    assert_eq!(alg, -7, "ES256");
}

/// The founding-set guard on the wire: without it a provider may silently
/// REPLACE a key the wallet's address depends on, and the address becomes one
/// nothing can deploy.
#[test]
fn exclude_list_carries_every_founding_credential() {
    let mut request = make_credential();
    request.exclude = vec![
        CredentialDescriptor { id: vec![0xaa; 16] },
        CredentialDescriptor { id: vec![0xbb; 16] },
    ];
    let bytes = match request.encode() {
        Ok(bytes) => bytes,
        Err(error) => unreachable!("{error:?}"),
    };
    let Value::Map(entries) = decode(&bytes[1..]) else {
        unreachable!()
    };
    let Some(Value::Array(items)) = entries.iter().find_map(|(key, value)| match key {
        Value::Integer(i) if i128::from(*i) == 5 => Some(value),
        _ => None,
    }) else {
        unreachable!("excludeList missing");
    };
    assert_eq!(items.len(), 2);
}

/// An empty exclusion list must be ABSENT, not empty: CTAP2 treats a present
/// zero-length list as a protocol error on some authenticators.
#[test]
fn an_empty_exclude_list_is_omitted_entirely() {
    let bytes = match make_credential().encode() {
        Ok(bytes) => bytes,
        Err(error) => unreachable!("{error:?}"),
    };
    let Value::Map(entries) = decode(&bytes[1..]) else {
        unreachable!()
    };
    assert!(
        !entries
            .iter()
            .any(|(key, _)| matches!(key, Value::Integer(i) if i128::from(*i) == 5)),
        "an empty excludeList must not be sent at all"
    );
}

/// A wallet key that is not discoverable cannot be found at sign-in, so the
/// wallet cannot be opened. `rk` is not optional here.
#[test]
fn a_wallet_key_is_always_requested_as_discoverable() {
    let bytes = match make_credential().encode() {
        Ok(bytes) => bytes,
        Err(error) => unreachable!("{error:?}"),
    };
    let Value::Map(entries) = decode(&bytes[1..]) else {
        unreachable!()
    };
    let Some(Value::Map(options)) = entries.iter().find_map(|(key, value)| match key {
        Value::Integer(i) if i128::from(*i) == 7 => Some(value),
        _ => None,
    }) else {
        unreachable!("options missing");
    };
    assert!(options.iter().any(|(key, value)| matches!(
        (key, value),
        (Value::Text(name), Value::Bool(true)) if name == "rk"
    )));
}

/// The "who are you?" ceremony: no allowList at all, so the authenticator
/// offers whatever discoverable credential it holds for this RP.
#[test]
fn a_discoverable_sign_in_sends_no_allow_list() {
    let request = GetAssertion {
        rp_id: "getvela.app".to_owned(),
        client_data_hash: vec![0xcc; 32],
        allow: Vec::new(),
        user_presence: true,
        user_verification: true,
        pin_uv_auth: None,
    };
    let bytes = match request.encode() {
        Ok(bytes) => bytes,
        Err(error) => unreachable!("{error:?}"),
    };
    assert_eq!(bytes[0], Command::GetAssertion as u8);
    let Value::Map(entries) = decode(&bytes[1..]) else {
        unreachable!()
    };
    assert!(
        !entries
            .iter()
            .any(|(key, _)| matches!(key, Value::Integer(i) if i128::from(*i) == 3)),
        "an empty allowList must not be sent at all"
    );
}

#[test]
fn get_info_is_a_bare_command_byte() {
    assert_eq!(get_info_request(), Ok(vec![Command::GetInfo as u8]));
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

#[test]
fn a_response_splits_into_a_status_and_a_body() {
    let (status, body) = match split_response(&[0x00, 0xa0]) {
        Ok(pair) => pair,
        Err(error) => unreachable!("{error:?}"),
    };
    assert_eq!(status, Status::Success);
    assert_eq!(body, &[0xa0]);

    assert!(
        split_response(&[]).is_err(),
        "an empty response is not a status"
    );
}

/// Only the codes a wallet branches on differently get a name. Everything else
/// keeps its number, because inventing a friendlier label for an error nobody
/// handles loses the one detail a bug report needs.
#[test]
fn status_codes_map_to_the_decisions_they_drive() {
    assert_eq!(Status::from_byte(0x00), Status::Success);
    assert_eq!(Status::from_byte(0x27), Status::Cancelled);
    assert_eq!(Status::from_byte(0x2f), Status::Cancelled);
    assert_eq!(Status::from_byte(0x21), Status::CredentialExcluded);
    assert_eq!(Status::from_byte(0x2e), Status::NoCredentials);
    assert_eq!(Status::from_byte(0x31), Status::PinRequired);
    assert_eq!(Status::from_byte(0x33), Status::PinBlocked);
    assert_eq!(Status::from_byte(0x7f), Status::Other(0x7f));
    assert!(Status::Success.is_success());
    assert!(!Status::Cancelled.is_success());
}

/// THE integration point.
///
/// A real attestation object is taken apart into the three fields a CTAP2
/// `makeCredential` answers with, then reassembled by our own encoder — and the
/// parsers the browser path already uses must get the same public key and the
/// same versioned attestation out of the result.
///
/// If this drifts, a desktop-minted key and a browser-minted key derive
/// different addresses from the same authenticator, and the wallet is two
/// wallets.
#[test]
fn a_reassembled_attestation_object_is_indistinguishable_from_a_browser_one() {
    let original = real_attestation_object();

    // Take it apart the way a CTAP2 response would arrive: status byte, then a
    // map of {1: fmt, 2: authData, 3: attStmt}.
    let Value::Map(fields) = decode(&original) else {
        unreachable!("the vector is not a map")
    };
    let mut fmt = None;
    let mut auth_data = None;
    let mut att_stmt = None;
    for (key, value) in &fields {
        match (key, value) {
            (Value::Text(name), Value::Text(text)) if name == "fmt" => fmt = Some(text.clone()),
            (Value::Text(name), Value::Bytes(bytes)) if name == "authData" => {
                auth_data = Some(bytes.clone())
            }
            (Value::Text(name), other) if name == "attStmt" => att_stmt = Some(other.clone()),
            _ => {}
        }
    }
    let response_map = Value::Map(vec![
        (
            Value::Integer(1.into()),
            Value::Text(fmt.clone().unwrap_or_default()),
        ),
        (
            Value::Integer(2.into()),
            Value::Bytes(auth_data.clone().unwrap_or_default()),
        ),
        (
            Value::Integer(3.into()),
            att_stmt.clone().unwrap_or(Value::Map(Vec::new())),
        ),
    ]);
    let mut body = Vec::new();
    if let Err(error) = ciborium::ser::into_writer(&response_map, &mut body) {
        unreachable!("{error}");
    }

    let parsed = match parse_make_credential(&body) {
        Ok(parsed) => parsed,
        Err(error) => unreachable!("{error:?}"),
    };
    assert_eq!(Some(parsed.fmt.clone()), fmt);
    assert_eq!(Some(parsed.auth_data.clone()), auth_data);

    let rebuilt = match attestation_object(&parsed) {
        Ok(bytes) => bytes,
        Err(error) => unreachable!("{error:?}"),
    };

    let from_original = match webauthn::extract_attestation_public_key(&original) {
        Ok(key) => key,
        Err(error) => unreachable!("the vector must parse: {error:?}"),
    };
    let from_rebuilt = match webauthn::extract_attestation_public_key(&rebuilt) {
        Ok(key) => key,
        Err(error) => unreachable!("the rebuilt object must parse: {error:?}"),
    };
    assert_eq!(
        (from_original.x, from_original.y),
        (from_rebuilt.x, from_rebuilt.y),
        "a CTAP-minted key must derive the same address as a browser-minted one"
    );

    let hex_of = |bytes: &[u8]| -> String { bytes.iter().map(|b| format!("{b:02x}")).collect() };
    assert_eq!(
        webauthn::extract_attestation(&hex_of(&original)),
        webauthn::extract_attestation(&hex_of(&rebuilt)),
        "the versioned attestation — and with it the backup-state flag the \
         second-key gate reads — must survive the round trip"
    );
}

#[test]
fn an_assertion_response_yields_its_signature_and_handle() {
    let body_map = Value::Map(vec![
        (
            Value::Integer(1.into()),
            Value::Map(vec![
                (
                    Value::Text("type".to_owned()),
                    Value::Text("public-key".to_owned()),
                ),
                (Value::Text("id".to_owned()), Value::Bytes(vec![0xde; 16])),
            ]),
        ),
        (Value::Integer(2.into()), Value::Bytes(vec![0x01; 37])),
        (Value::Integer(3.into()), Value::Bytes(vec![0x30, 0x44])),
        (
            Value::Integer(4.into()),
            Value::Map(vec![(
                Value::Text("id".to_owned()),
                Value::Bytes(b"Everyday wallet\0uuid".to_vec()),
            )]),
        ),
    ]);
    let mut body = Vec::new();
    if let Err(error) = ciborium::ser::into_writer(&body_map, &mut body) {
        unreachable!("{error}");
    }

    let parsed = match parse_get_assertion(&body) {
        Ok(parsed) => parsed,
        Err(error) => unreachable!("{error:?}"),
    };
    assert_eq!(parsed.credential_id, Some(vec![0xde; 16]));
    assert_eq!(parsed.auth_data.len(), 37);
    assert_eq!(parsed.signature_der, vec![0x30, 0x44]);
    assert_eq!(parsed.user_id, Some(b"Everyday wallet\0uuid".to_vec()));
}

/// A response missing `authData` is not a partially-useful response — there is
/// nothing to verify — so it fails rather than yielding an empty vector.
#[test]
fn an_assertion_without_auth_data_is_an_error() {
    let mut body = Vec::new();
    if let Err(error) = ciborium::ser::into_writer(&Value::Map(vec![]), &mut body) {
        unreachable!("{error}");
    }
    assert!(parse_get_assertion(&body).is_err());
}

#[test]
fn get_info_reports_what_the_wallet_branches_on() {
    let body_map = Value::Map(vec![
        (
            Value::Integer(1.into()),
            Value::Array(vec![
                Value::Text("U2F_V2".to_owned()),
                Value::Text("FIDO_2_0".to_owned()),
            ]),
        ),
        (Value::Integer(3.into()), Value::Bytes(vec![0x2f; 16])),
        (
            Value::Integer(4.into()),
            Value::Map(vec![
                (Value::Text("rk".to_owned()), Value::Bool(true)),
                (Value::Text("clientPin".to_owned()), Value::Bool(true)),
                (Value::Text("uv".to_owned()), Value::Bool(false)),
            ]),
        ),
        (
            Value::Integer(6.into()),
            Value::Array(vec![Value::Integer(2.into()), Value::Integer(1.into())]),
        ),
    ]);
    let mut body = Vec::new();
    if let Err(error) = ciborium::ser::into_writer(&body_map, &mut body) {
        unreachable!("{error}");
    }

    let info = match parse_get_info(&body) {
        Ok(info) => info,
        Err(error) => unreachable!("{error:?}"),
    };
    assert_eq!(info.versions, vec!["U2F_V2", "FIDO_2_0"]);
    assert_eq!(info.aaguid.len(), 16);
    assert!(
        info.resident_key,
        "a wallet cannot use an authenticator without rk"
    );
    assert!(
        info.client_pin_set,
        "a PIN is set — the ceremony needs a token"
    );
    assert!(!info.user_verification);
    assert_eq!(info.pin_protocols, vec![2, 1]);
}
