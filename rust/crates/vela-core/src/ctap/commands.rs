//! CTAP2 commands, as bytes.
//!
//! One request encoder and one response decoder per command the wallet needs.
//! Nothing here talks to a device: a request is a `Vec<u8>` for a shell to put
//! on a wire, and a response is whatever came back off one.
//!
//! ## Canonical encoding is not a style choice
//!
//! CTAP2 requires the canonical CBOR encoding form (CTAP 2.1 §6): map keys
//! sorted by encoded length and then bytewise, definite lengths, no indefinite
//! streams. An authenticator is entitled to reject anything else, and — worse —
//! the `pinUvAuthParam` for a request is an HMAC over the request's own bytes,
//! so two encodings of "the same" map authenticate differently. Every map here
//! is built with integer keys inserted in ascending order, which is canonical
//! for the 1..=9 range CTAP uses, and the property test in `ctap_commands.rs`
//! holds that line.
//!
//! ## The shape the rest of the wallet expects
//!
//! `make_credential` hands back the pieces of an attestation object, and
//! [`attestation_object`] assembles them into exactly the CBOR blob a WebAuthn
//! `create()` would have produced — because that blob is what
//! [`crate::app::public_key_hex_from_attestation`] and
//! [`crate::webauthn::extract_attestation`] already know how to read. A CTAP
//! path that invented its own shape would need every one of those rewritten,
//! and would let the two paths disagree about a key.

use ciborium::Value;

use crate::error::CoreError;

/// The command byte that precedes the CBOR payload in a CTAPHID `CBOR` message.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum Command {
    MakeCredential = 0x01,
    GetAssertion = 0x02,
    GetInfo = 0x04,
    ClientPin = 0x06,
    GetNextAssertion = 0x08,
    Selection = 0x0b,
}

/// The authenticator's verdict, which is the first byte of every response.
///
/// Only the values a wallet acts on differently are named. Everything else
/// keeps its number: inventing a friendlier label for an error nobody has a
/// branch for loses the one detail a bug report needs.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Success,
    /// The person declined at the authenticator, or the ceremony timed out
    /// waiting for them (`CTAP2_ERR_OPERATION_DENIED`, `CTAP2_ERR_USER_ACTION_TIMEOUT`,
    /// `CTAP2_ERR_KEEPALIVE_CANCEL`).
    Cancelled,
    /// Every credential in `excludeList` is already on this authenticator
    /// (`CTAP2_ERR_CREDENTIAL_EXCLUDED`) — the founding-set guard doing its job.
    CredentialExcluded,
    /// No credential on this authenticator matches (`CTAP2_ERR_NO_CREDENTIALS`).
    NoCredentials,
    /// A PIN is set and this request did not carry a token
    /// (`CTAP2_ERR_PIN_REQUIRED`, `CTAP2_ERR_PIN_INVALID`, `…_PIN_AUTH_INVALID`).
    PinRequired,
    /// The authenticator is locked until it is reinserted or reset
    /// (`CTAP2_ERR_PIN_BLOCKED`, `CTAP2_ERR_PIN_AUTH_BLOCKED`).
    PinBlocked,
    /// Anything else, with its number intact.
    Other(u8),
}

impl Status {
    pub fn from_byte(byte: u8) -> Self {
        match byte {
            0x00 => Self::Success,
            0x19 | 0x27 | 0x2f => Self::Cancelled,
            0x33 => Self::PinBlocked,
            0x31 | 0x34 | 0x36 => Self::PinRequired,
            0x2e => Self::NoCredentials,
            0x21 => Self::CredentialExcluded,
            other => Self::Other(other),
        }
    }

    pub fn is_success(self) -> bool {
        matches!(self, Self::Success)
    }
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/// One entry of `excludeList` / `allowList`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CredentialDescriptor {
    pub id: Vec<u8>,
}

/// What `authenticatorMakeCredential` needs.
///
/// `client_data_hash`, not client data: the authenticator signs a hash it never
/// interprets, which is what lets the caller decide what the ceremony is
/// *about* without the device having an opinion.
#[derive(Clone, Debug)]
pub struct MakeCredential {
    pub client_data_hash: Vec<u8>,
    pub rp_id: String,
    pub rp_name: String,
    pub user_id: Vec<u8>,
    pub user_name: String,
    pub user_display_name: String,
    /// Credentials this authenticator must refuse to duplicate. A wallet's
    /// already-founding keys go here so a provider cannot silently replace one.
    pub exclude: Vec<CredentialDescriptor>,
    /// Discoverable credential. Always true for a wallet: a key that cannot be
    /// found at sign-in is a key that cannot open the wallet.
    pub resident_key: bool,
    pub user_verification: bool,
    pub pin_uv_auth: Option<PinUvAuth>,
}

/// What `authenticatorGetAssertion` needs.
#[derive(Clone, Debug)]
pub struct GetAssertion {
    pub rp_id: String,
    pub client_data_hash: Vec<u8>,
    /// Empty means "any discoverable credential for this RP" — the
    /// "who are you?" ceremony sign-in starts with.
    pub allow: Vec<CredentialDescriptor>,
    pub user_presence: bool,
    pub user_verification: bool,
    pub pin_uv_auth: Option<PinUvAuth>,
}

/// A `pinUvAuthToken` HMAC and the protocol that produced it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PinUvAuth {
    pub protocol: u8,
    pub param: Vec<u8>,
}

/// ES256, and only ES256.
///
/// The wallet's on-chain verifier is the RIP-7212 P-256 precompile and
/// two-signature recovery is ECDSA math, so an RSA credential can never become
/// a working wallet. Offering it would mint an orphan key in someone's
/// authenticator and fail later, somewhere less legible.
const ALG_ES256: i64 = -7;

fn map(entries: Vec<(i64, Value)>) -> Value {
    // Ascending integer keys ARE canonical order for the 1..=9 range CTAP uses
    // (equal encoded length, then bytewise). Callers below insert in order; the
    // sort makes that a property of this function rather than of every caller.
    let mut entries = entries;
    entries.sort_by_key(|(key, _)| *key);
    Value::Map(
        entries
            .into_iter()
            .map(|(key, value)| (Value::Integer(key.into()), value))
            .collect(),
    )
}

fn credential_list(items: &[CredentialDescriptor]) -> Value {
    Value::Array(
        items
            .iter()
            .map(|item| {
                Value::Map(vec![
                    (
                        Value::Text("type".to_string()),
                        Value::Text("public-key".to_string()),
                    ),
                    (Value::Text("id".to_string()), Value::Bytes(item.id.clone())),
                ])
            })
            .collect(),
    )
}

fn encode_value(command: Command, value: Option<Value>) -> Result<Vec<u8>, CoreError> {
    let mut out = Vec::new();
    out.push(command as u8);
    if let Some(value) = value {
        ciborium::ser::into_writer(&value, &mut out)
            .map_err(|error| CoreError::InvalidCbor(error.to_string()))?;
    }
    Ok(out)
}

impl MakeCredential {
    /// The request's bytes: the command byte, then canonical CBOR.
    pub fn encode(&self) -> Result<Vec<u8>, CoreError> {
        let mut entries = vec![
            (0x01, Value::Bytes(self.client_data_hash.clone())),
            (
                0x02,
                Value::Map(vec![
                    (
                        Value::Text("id".to_string()),
                        Value::Text(self.rp_id.clone()),
                    ),
                    (
                        Value::Text("name".to_string()),
                        Value::Text(self.rp_name.clone()),
                    ),
                ]),
            ),
            (
                0x03,
                Value::Map(vec![
                    (
                        Value::Text("id".to_string()),
                        Value::Bytes(self.user_id.clone()),
                    ),
                    (
                        Value::Text("name".to_string()),
                        Value::Text(self.user_name.clone()),
                    ),
                    (
                        Value::Text("displayName".to_string()),
                        Value::Text(self.user_display_name.clone()),
                    ),
                ]),
            ),
            (
                0x04,
                Value::Array(vec![Value::Map(vec![
                    (
                        Value::Text("alg".to_string()),
                        Value::Integer(ALG_ES256.into()),
                    ),
                    (
                        Value::Text("type".to_string()),
                        Value::Text("public-key".to_string()),
                    ),
                ])]),
            ),
        ];

        if !self.exclude.is_empty() {
            entries.push((0x05, credential_list(&self.exclude)));
        }

        let mut options = Vec::new();
        if self.resident_key {
            options.push((Value::Text("rk".to_string()), Value::Bool(true)));
        }
        if self.user_verification {
            options.push((Value::Text("uv".to_string()), Value::Bool(true)));
        }
        if !options.is_empty() {
            entries.push((0x07, Value::Map(options)));
        }

        if let Some(auth) = &self.pin_uv_auth {
            entries.push((0x08, Value::Bytes(auth.param.clone())));
            entries.push((0x09, Value::Integer(i64::from(auth.protocol).into())));
        }

        encode_value(Command::MakeCredential, Some(map(entries)))
    }
}

impl GetAssertion {
    pub fn encode(&self) -> Result<Vec<u8>, CoreError> {
        let mut entries = vec![
            (0x01, Value::Text(self.rp_id.clone())),
            (0x02, Value::Bytes(self.client_data_hash.clone())),
        ];

        if !self.allow.is_empty() {
            entries.push((0x03, credential_list(&self.allow)));
        }

        let mut options = Vec::new();
        if self.user_presence {
            options.push((Value::Text("up".to_string()), Value::Bool(true)));
        }
        if self.user_verification {
            options.push((Value::Text("uv".to_string()), Value::Bool(true)));
        }
        if !options.is_empty() {
            entries.push((0x05, Value::Map(options)));
        }

        if let Some(auth) = &self.pin_uv_auth {
            entries.push((0x06, Value::Bytes(auth.param.clone())));
            entries.push((0x07, Value::Integer(i64::from(auth.protocol).into())));
        }

        encode_value(Command::GetAssertion, Some(map(entries)))
    }
}

/// `authenticatorGetInfo` takes no arguments — the command byte is the request.
pub fn get_info_request() -> Result<Vec<u8>, CoreError> {
    encode_value(Command::GetInfo, None)
}

/// `authenticatorSelection`: "is this the key the person touched?", used to tell
/// two plugged-in authenticators apart. No arguments.
pub fn selection_request() -> Result<Vec<u8>, CoreError> {
    encode_value(Command::Selection, None)
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

/// A response's verdict and its CBOR body, separated.
pub fn split_response(payload: &[u8]) -> Result<(Status, &[u8]), CoreError> {
    let (status, body) = payload
        .split_first()
        .ok_or_else(|| CoreError::InvalidCbor("empty CTAP response".to_string()))?;
    Ok((Status::from_byte(*status), body))
}

fn parse_map(body: &[u8]) -> Result<Vec<(Value, Value)>, CoreError> {
    if body.is_empty() {
        return Ok(Vec::new());
    }
    let value: Value = ciborium::de::from_reader(body)
        .map_err(|error| CoreError::InvalidCbor(error.to_string()))?;
    match value {
        Value::Map(entries) => Ok(entries),
        _ => Err(CoreError::InvalidCbor(
            "CTAP response is not a map".to_string(),
        )),
    }
}

fn take(entries: &[(Value, Value)], key: i64) -> Option<&Value> {
    entries.iter().find_map(|(k, v)| match k {
        Value::Integer(i) if i128::from(*i) == i128::from(key) => Some(v),
        _ => None,
    })
}

fn bytes_at(entries: &[(Value, Value)], key: i64, what: &str) -> Result<Vec<u8>, CoreError> {
    match take(entries, key) {
        Some(Value::Bytes(bytes)) => Ok(bytes.clone()),
        _ => Err(CoreError::InvalidCbor(format!(
            "CTAP response is missing {what}"
        ))),
    }
}

/// What `authenticatorMakeCredential` answered.
///
/// `PartialEq` but not `Eq`: `att_stmt` is an untouched `ciborium::Value`,
/// which can hold a float. Parsing it into something narrower to win a trait
/// would mean deciding what an attestation statement is allowed to contain,
/// and that is the authenticator's business, not ours.
#[derive(Clone, Debug, PartialEq)]
pub struct MakeCredentialResponse {
    pub fmt: String,
    pub auth_data: Vec<u8>,
    /// The attestation statement, still CBOR. Kept whole rather than parsed:
    /// its shape depends on `fmt`, and the wallet only ever re-encodes it.
    pub att_stmt: Value,
}

pub fn parse_make_credential(body: &[u8]) -> Result<MakeCredentialResponse, CoreError> {
    let entries = parse_map(body)?;
    let fmt = match take(&entries, 0x01) {
        Some(Value::Text(text)) => text.clone(),
        _ => {
            return Err(CoreError::InvalidCbor(
                "makeCredential response is missing fmt".to_string(),
            ))
        }
    };
    let auth_data = bytes_at(&entries, 0x02, "authData")?;
    let att_stmt = take(&entries, 0x03)
        .cloned()
        .unwrap_or_else(|| Value::Map(Vec::new()));
    Ok(MakeCredentialResponse {
        fmt,
        auth_data,
        att_stmt,
    })
}

/// The CBOR blob a WebAuthn `create()` would have returned.
///
/// This is the join: everything downstream — public-key extraction, the
/// versioned attestation, the backup-state flag the second-key gate reads —
/// already parses this shape, so a CTAP-minted key and a browser-minted key
/// become indistinguishable the moment they leave this function.
pub fn attestation_object(response: &MakeCredentialResponse) -> Result<Vec<u8>, CoreError> {
    // Key order is the WebAuthn convention, and it is what the existing
    // parsers walk: they match on names, not positions, but a blob that reads
    // the same in both paths is one less thing that can differ.
    let value = Value::Map(vec![
        (
            Value::Text("fmt".to_string()),
            Value::Text(response.fmt.clone()),
        ),
        (
            Value::Text("attStmt".to_string()),
            response.att_stmt.clone(),
        ),
        (
            Value::Text("authData".to_string()),
            Value::Bytes(response.auth_data.clone()),
        ),
    ]);
    let mut out = Vec::new();
    ciborium::ser::into_writer(&value, &mut out)
        .map_err(|error| CoreError::InvalidCbor(error.to_string()))?;
    Ok(out)
}

/// What `authenticatorGetAssertion` answered.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GetAssertionResponse {
    /// The credential the authenticator chose. Absent when the request pinned
    /// exactly one, which is why it is optional here and not in the caller.
    pub credential_id: Option<Vec<u8>>,
    pub auth_data: Vec<u8>,
    /// DER, exactly as the authenticator produced it. Normalisation (including
    /// low-S) belongs to `webauthn.rs`, which already does it for the browser
    /// path — doing it twice, differently, is how two paths disagree.
    pub signature_der: Vec<u8>,
    /// The user handle, when the authenticator volunteered one. This is where a
    /// wallet's name survives a device wipe.
    pub user_id: Option<Vec<u8>>,
}

pub fn parse_get_assertion(body: &[u8]) -> Result<GetAssertionResponse, CoreError> {
    let entries = parse_map(body)?;
    let credential_id = match take(&entries, 0x01) {
        Some(Value::Map(fields)) => fields.iter().find_map(|(k, v)| match (k, v) {
            (Value::Text(name), Value::Bytes(bytes)) if name == "id" => Some(bytes.clone()),
            _ => None,
        }),
        _ => None,
    };
    let user_id = match take(&entries, 0x04) {
        Some(Value::Map(fields)) => fields.iter().find_map(|(k, v)| match (k, v) {
            (Value::Text(name), Value::Bytes(bytes)) if name == "id" => Some(bytes.clone()),
            _ => None,
        }),
        _ => None,
    };
    Ok(GetAssertionResponse {
        credential_id,
        auth_data: bytes_at(&entries, 0x02, "authData")?,
        signature_der: bytes_at(&entries, 0x03, "signature")?,
        user_id,
    })
}

/// The parts of `authenticatorGetInfo` a wallet acts on.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct AuthenticatorInfo {
    pub versions: Vec<String>,
    /// 16 bytes identifying the authenticator MODEL, not the key.
    pub aaguid: Vec<u8>,
    /// The authenticator can store discoverable credentials.
    pub resident_key: bool,
    /// A PIN or biometric is already configured.
    pub client_pin_set: bool,
    /// The authenticator can verify the user itself (biometrics).
    pub user_verification: bool,
    pub pin_protocols: Vec<u8>,
}

pub fn parse_get_info(body: &[u8]) -> Result<AuthenticatorInfo, CoreError> {
    let entries = parse_map(body)?;
    let mut info = AuthenticatorInfo::default();

    if let Some(Value::Array(items)) = take(&entries, 0x01) {
        info.versions = items
            .iter()
            .filter_map(|item| match item {
                Value::Text(text) => Some(text.clone()),
                _ => None,
            })
            .collect();
    }
    if let Some(Value::Bytes(bytes)) = take(&entries, 0x03) {
        info.aaguid = bytes.clone();
    }
    if let Some(Value::Map(options)) = take(&entries, 0x04) {
        for (key, value) in options {
            let (Value::Text(name), Value::Bool(flag)) = (key, value) else {
                continue;
            };
            match name.as_str() {
                "rk" => info.resident_key = *flag,
                // `clientPin` absent means "no PIN support"; present-and-false
                // means "supported, not set". The wallet only cares whether it
                // must ask for one.
                "clientPin" => info.client_pin_set = *flag,
                "uv" => info.user_verification = *flag,
                _ => {}
            }
        }
    }
    if let Some(Value::Array(items)) = take(&entries, 0x06) {
        info.pin_protocols = items
            .iter()
            .filter_map(|item| match item {
                Value::Integer(i) => u8::try_from(i128::from(*i)).ok(),
                _ => None,
            })
            .collect();
    }

    Ok(info)
}
