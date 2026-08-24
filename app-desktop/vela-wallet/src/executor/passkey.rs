//! The two ceremonies, over a security key.
//!
//! A browser runs these inside `navigator.credentials`; iOS and Android inside
//! a system passkey service. The desktop has none of those, so it performs them
//! itself: open the key, agree a PIN session if the key has a PIN, send the
//! CTAP2 command, and assemble the same `Registration` / `Assertion` the other
//! three clients hand the core.
//!
//! **The output shape is the contract.** Everything downstream — public-key
//! extraction, the versioned attestation, the backup-state flag the second-key
//! gate reads, the Safe address — parses these two structs. A desktop-minted
//! key and a browser-minted key must be indistinguishable by the time they
//! leave this file, or the same authenticator derives two different wallets.
//!
//! ## The one judgement call
//!
//! Classifying a failure. It is deliberately narrow (see the operations
//! contract): a cancellation is `cancelled`, a missing or unusable
//! authenticator is `not_supported`, a key that cannot store a discoverable
//! credential is `not_discoverable`, and everything else is `other` carrying
//! the platform's own words — unprettified, because they go into a bug report.

use std::sync::Arc;

use p256::ecdh::EphemeralSecret;
// The OS CSPRNG, reached through the trait p256's ECDH asks for. Same entropy
// source as [`random`] below — the ephemeral scalar is not allowed to come
// from anywhere weaker than the challenges do.
use p256::elliptic_curve::rand_core::OsRng;
use p256::elliptic_curve::sec1::ToEncodedPoint as _;
use p256::PublicKey;

use vela_core::app::{Assertion, FailureKind, KeyMethod, Registration};
use vela_core::ctap::{
    attestation_object, get_info_request, parse_client_pin, parse_get_assertion, parse_get_info,
    AuthenticatorInfo, ClientPin, CredentialDescriptor, GetAssertion, MakeCredential, Permissions,
    PinUvAuthToken, Protocol, SharedSecret, Status,
};
use vela_core::types::P256PublicKey;
use vela_core::{primitives, webauthn};

use crate::ctap::usb::{SecurityKey, TouchNotifier, UsbError};

/// The relying party every Vela passkey is bound to. A passkey cannot be moved
/// between relying parties, so this string is part of the wallet's identity:
/// change it and every existing wallet becomes unreachable from this app.
pub const RELYING_PARTY: &str = "getvela.app";
const RELYING_PARTY_NAME: &str = "Vela Wallet";

/// The origin the ceremony's clientDataJSON claims. Matches the one the core
/// puts in a software group proof, so a member proof and a group proof read
/// alike; the registry contract never inspects it.
const ORIGIN: &str = "https://getvela.app";

/// What the desktop reports about an authenticator it reached over USB. The
/// browser reports these from the credential; here they are what is true by
/// construction — a removable key on a cable.
const ATTACHMENT_CROSS_PLATFORM: &str = "cross-platform";
const TRANSPORT_USB: &str = "usb";

/// A ceremony that failed, in the vocabulary the core branches on.
#[derive(Debug)]
pub struct PasskeyFailure {
    pub kind: FailureKind,
    /// The platform's own words. `None` for a classified failure, whose copy
    /// comes from the classification.
    pub message: Option<String>,
}

impl PasskeyFailure {
    fn other(message: impl Into<String>) -> Self {
        Self {
            kind: FailureKind::Other,
            message: Some(message.into()),
        }
    }

    fn classified(kind: FailureKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            // `not_supported` on desktop is the one classified failure that
            // still carries words: "there is no passkey service here" is not
            // the same sentence as "plug in your key", and the sheet has to be
            // able to say the second one.
            message: Some(message.into()),
        }
    }
}

/// Asks the person for their security key's PIN, and blocks until they answer.
///
/// `None` means they dismissed the dialog, which is a cancellation and not an
/// error. Blocking is correct here: this runs on a background thread, and the
/// CTAP2 session it belongs to is already holding the device open.
pub type PinRequester = Arc<dyn Fn(PinRequest) -> Option<String> + Send + Sync>;

/// What to tell the person when asking for the PIN.
#[derive(Clone, Debug)]
pub struct PinRequest {
    /// The authenticator's product string, so the dialog can name the key on
    /// the desk rather than "your authenticator".
    pub product: String,
    /// Attempts left before the key locks itself. A locked key can only be
    /// recovered by a RESET, which destroys every credential on it — including
    /// this wallet's founding key — so this number is shown, never hidden.
    pub retries: Option<u32>,
    /// A previous attempt in this same session was refused.
    pub retry: bool,
}

/// Everything a ceremony needs from the screen that started it.
#[derive(Clone)]
pub struct Ceremony {
    /// Called with `true` when the key starts waiting for a finger and `false`
    /// when it stops.
    pub touch: TouchNotifier,
    pub pin: PinRequester,
}

/// Is a passkey ceremony possible on this machine at all?
///
/// This asks whether the HID subsystem is REACHABLE, not whether a key is
/// plugged in right now. The distinction is the whole recovery path: answering
/// `false` for an empty USB port would make the core raise "this device cannot
/// create a wallet", which is untrue and has no way back. A missing key is
/// reported later, by the ceremony, as `not_supported` with a message naming
/// it — and plugging one in and pressing 重试 then works.
pub fn supported() -> bool {
    hidapi::HidApi::new().is_ok()
}

/// `RegisterPasskey` — mint a founding key on a security key.
pub fn register(
    name: &str,
    exclude_credential_ids: &[String],
    method: KeyMethod,
    ceremony: &Ceremony,
) -> Result<Registration, PasskeyFailure> {
    if method != KeyMethod::SecurityKey {
        // The key screen renders the other two as unavailable-and-explained, so
        // this is a defence against a future caller rather than a path a person
        // can reach.
        return Err(PasskeyFailure::classified(
            FailureKind::NotSupported,
            "This computer has no passkey service; only a USB security key can be used here.",
        ));
    }

    let mut key = open()?;
    let info = get_info(&mut key)?;
    if !info.resident_key {
        // A non-discoverable credential signs fine when pinned by id and then
        // never appears at sign-in. Fail HERE, before anything is stored or
        // funded — the same gate the web client applies to `credProps.rk`.
        return Err(PasskeyFailure::classified(
            FailureKind::NotDiscoverable,
            format!(
                "{} cannot store a discoverable passkey, so a wallet created on it could never sign in.",
                key.product()
            ),
        ));
    }

    let client_data = client_data_json(ClientDataType::Create, &random(32));
    let client_data_hash = primitives::sha256(client_data.as_bytes());
    let token = pin_session(&mut key, &info, ceremony)?;

    let request = MakeCredential {
        client_data_hash: client_data_hash.clone(),
        rp_id: RELYING_PARTY.to_owned(),
        rp_name: RELYING_PARTY_NAME.to_owned(),
        user_id: user_handle(name),
        user_name: name.to_owned(),
        user_display_name: name.to_owned(),
        exclude: exclude_credential_ids
            .iter()
            .filter_map(|id| primitives::from_hex(id).ok())
            .map(|id| CredentialDescriptor { id })
            .collect(),
        resident_key: true,
        // With a `pinUvAuthParam` present the token IS the user verification;
        // CTAP 2.1 §6.1.2 has the authenticator reject a request that asks for
        // both. Without one, the `uv` option is the only way to ask.
        user_verification: token.is_none(),
        pin_uv_auth: token.as_ref().map(|token| token.param(&client_data_hash)),
    };

    let body = send(&mut key, &request.encode().map_err(encode_failed)?, ceremony)?;
    let response = vela_core::ctap::parse_make_credential(&body)
        .map_err(|error| PasskeyFailure::other(format!("malformed makeCredential reply: {error}")))?;
    let credential_id = webauthn::attested_credential_id(&response.auth_data)
        .map_err(|error| PasskeyFailure::other(format!("malformed credential: {error}")))?;
    let attestation = attestation_object(&response)
        .map_err(|error| PasskeyFailure::other(format!("malformed attestation: {error}")))?;

    Ok(Registration {
        credential_id: primitives::to_hex(&credential_id, false),
        attestation_object_hex: primitives::to_hex(&attestation, false),
        client_data_json_hex: primitives::to_hex(client_data.as_bytes(), false),
        authenticator_attachment: ATTACHMENT_CROSS_PLATFORM.to_owned(),
        transports: TRANSPORT_USB.to_owned(),
    })
}

/// `SignProof` / `SignMemberProof` / `AuthenticatePasskey` — one assertion.
///
/// `credential_id` is `None` for the "who are you?" ceremony a sign-in starts
/// with: an empty `allowList` is what asks the authenticator for any
/// discoverable credential it holds for this relying party.
pub fn assert(
    challenge: &[u8],
    credential_id: Option<&str>,
    ceremony: &Ceremony,
) -> Result<Assertion, PasskeyFailure> {
    let mut key = open()?;
    let info = get_info(&mut key)?;

    let client_data = client_data_json(ClientDataType::Get, challenge);
    let client_data_hash = primitives::sha256(client_data.as_bytes());
    let token = pin_session(&mut key, &info, ceremony)?;

    let allow = credential_id
        .and_then(|id| primitives::from_hex(id).ok())
        .map(|id| vec![CredentialDescriptor { id }])
        .unwrap_or_default();

    let request = GetAssertion {
        rp_id: RELYING_PARTY.to_owned(),
        client_data_hash: client_data_hash.clone(),
        allow,
        user_presence: true,
        user_verification: token.is_none(),
        pin_uv_auth: token.as_ref().map(|token| token.param(&client_data_hash)),
    };

    let body = send(&mut key, &request.encode().map_err(encode_failed)?, ceremony)?;
    let response = parse_get_assertion(&body)
        .map_err(|error| PasskeyFailure::other(format!("malformed getAssertion reply: {error}")))?;

    // The authenticator omits the credential descriptor when the request
    // pinned exactly one. Falling back to what was asked for is not a guess —
    // it is the credential the device was told to use.
    let resolved = match (&response.credential_id, credential_id) {
        (Some(bytes), _) => primitives::to_hex(bytes, false),
        (None, Some(requested)) => requested.trim_start_matches("0x").to_owned(),
        (None, None) => {
            return Err(PasskeyFailure::other(
                "the security key signed without saying which credential it used",
            ))
        }
    };

    Ok(Assertion {
        credential_id: resolved,
        signature_der_hex: primitives::to_hex(&response.signature_der, false),
        authenticator_data_hex: primitives::to_hex(&response.auth_data, false),
        client_data_json_hex: primitives::to_hex(client_data.as_bytes(), false),
        // Absent, not empty: no user handle is a different fact from an empty
        // one, and the core's name resolution branches on it.
        user_id_hex: response
            .user_id
            .as_ref()
            .filter(|bytes| !bytes.is_empty())
            .map(|bytes| primitives::to_hex(bytes, false)),
        authenticator_attachment: ATTACHMENT_CROSS_PLATFORM.to_owned(),
    })
}

// ---------------------------------------------------------------------------
// The PIN session
// ---------------------------------------------------------------------------

/// Agree a `pinUvAuthToken` with the key, if it has a PIN.
///
/// `Ok(None)` means the authenticator has no PIN set. That is not the same as
/// "no verification needed": a key with no PIN and no biometric answers a
/// discoverable-credential request with `PUAT_REQUIRED`, which [`send`] turns
/// into a sentence telling the person to set a PIN on the key first.
fn pin_session(
    key: &mut SecurityKey,
    info: &AuthenticatorInfo,
    ceremony: &Ceremony,
) -> Result<Option<PinUvAuthToken>, PasskeyFailure> {
    if !info.client_pin_set {
        return Ok(None);
    }
    // An authenticator with a PIN but no advertised protocol list is a CTAP 2.0
    // device, and 2.0 had exactly one protocol.
    let protocol = Protocol::best_of(&info.pin_protocols).unwrap_or(Protocol::One);

    let mut retry = false;
    loop {
        let retries = pin_retries(key, protocol);
        let Some(pin) = (ceremony.pin)(PinRequest {
            product: key.product().to_owned(),
            retries,
            retry,
        }) else {
            return Err(PasskeyFailure {
                kind: FailureKind::Cancelled,
                message: None,
            });
        };

        // A fresh key agreement per attempt, deliberately. A shared secret is
        // per-session and an authenticator is entitled to drop it after a
        // refused PIN; reusing one would make the second attempt fail for a
        // reason that has nothing to do with what was typed.
        let (secret, platform_key) = key_agreement(key, protocol)?;
        let pin_hash_enc = secret
            .encrypt_pin_hash(&pin, &random(16))
            .map_err(|error| PasskeyFailure::other(format!("PIN encryption failed: {error}")))?;
        drop(pin);

        let permissions = info
            .pin_uv_auth_token
            .then(|| Permissions::MAKE_CREDENTIAL | Permissions::GET_ASSERTION);
        let request = ClientPin::pin_token(
            protocol,
            platform_key,
            pin_hash_enc,
            permissions,
            permissions.map(|_| RELYING_PARTY.to_owned()),
        );

        match key.cbor(&request.encode().map_err(encode_failed)?, None) {
            Ok(body) => {
                let response = parse_client_pin(&body).map_err(|error| {
                    PasskeyFailure::other(format!("malformed clientPIN reply: {error}"))
                })?;
                let encrypted = response.pin_uv_auth_token.ok_or_else(|| {
                    PasskeyFailure::other("the security key returned no pinUvAuthToken")
                })?;
                return secret.decrypt_token(&encrypted).map(Some).map_err(|error| {
                    PasskeyFailure::other(format!("the PIN token could not be unwrapped: {error}"))
                });
            }
            // A refused PIN is not a failed ceremony — it is one wrong attempt,
            // and the person gets to try again with the count in front of them.
            Err(UsbError::Ctap(Status::PinRequired)) => {
                retry = true;
                continue;
            }
            Err(UsbError::Ctap(Status::PinBlocked)) => {
                return Err(PasskeyFailure::other(format!(
                    "{} is locked. Unplug it and plug it back in, or — if it asks for a reset — be aware a reset erases every passkey on it.",
                    key.product()
                )))
            }
            Err(error) => return Err(usb_failure(error)),
        }
    }
}

/// Ask how many PIN attempts are left. Best effort: a key that will not answer
/// this still deserves a PIN dialog, just without the count.
fn pin_retries(key: &mut SecurityKey, protocol: Protocol) -> Option<u32> {
    let request = ClientPin::pin_retries(protocol).encode().ok()?;
    let body = key.cbor(&request, None).ok()?;
    parse_client_pin(&body).ok()?.pin_retries
}

/// The ECDH half the core cannot do, because it needs randomness.
///
/// The ephemeral secret lives exactly as long as this function's caller needs
/// the derived keys; nothing about it is stored, logged or reused.
fn key_agreement(
    key: &mut SecurityKey,
    protocol: Protocol,
) -> Result<(SharedSecret, P256PublicKey), PasskeyFailure> {
    let request = ClientPin::key_agreement(protocol)
        .encode()
        .map_err(encode_failed)?;
    let body = key.cbor(&request, None).map_err(usb_failure)?;
    let authenticator_key = parse_client_pin(&body)
        .map_err(|error| PasskeyFailure::other(format!("malformed keyAgreement: {error}")))?
        .key_agreement
        .ok_or_else(|| PasskeyFailure::other("the security key returned no keyAgreement key"))?;

    let mut sec1 = vec![0x04u8];
    sec1.extend_from_slice(&authenticator_key.x);
    sec1.extend_from_slice(&authenticator_key.y);
    // The point was already checked to be on P-256 by the core's COSE decoder;
    // this parse is the same fact in p256's own types.
    let peer = PublicKey::from_sec1_bytes(&sec1)
        .map_err(|error| PasskeyFailure::other(format!("keyAgreement key rejected: {error}")))?;

    let ephemeral = EphemeralSecret::random(&mut OsRng);
    let shared = ephemeral.diffie_hellman(&peer);
    let secret = SharedSecret::derive(protocol, shared.raw_secret_bytes().as_slice())
        .map_err(|error| PasskeyFailure::other(format!("PIN key derivation failed: {error}")))?;

    let point = ephemeral.public_key().to_encoded_point(false);
    let platform_key = P256PublicKey {
        x: point.x().map(|x| x.to_vec()).unwrap_or_default(),
        y: point.y().map(|y| y.to_vec()).unwrap_or_default(),
    };
    Ok((secret, platform_key))
}

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

fn open() -> Result<SecurityKey, PasskeyFailure> {
    SecurityKey::open_first(match random(8).try_into() {
        Ok(nonce) => nonce,
        Err(_) => unreachable!("random(8) returns 8 bytes"),
    })
    .map_err(usb_failure)
}

fn get_info(key: &mut SecurityKey) -> Result<AuthenticatorInfo, PasskeyFailure> {
    let request = get_info_request().map_err(encode_failed)?;
    let body = key.cbor(&request, None).map_err(usb_failure)?;
    parse_get_info(&body)
        .map_err(|error| PasskeyFailure::other(format!("malformed getInfo reply: {error}")))
}

/// The request that makes the key blink. Only this one passes the touch
/// notifier: `getInfo`, `getKeyAgreement` and the token request all answer
/// immediately, and announcing a touch for them would train people to ignore
/// the prompt.
fn send(
    key: &mut SecurityKey,
    request: &[u8],
    ceremony: &Ceremony,
) -> Result<Vec<u8>, PasskeyFailure> {
    match key.cbor(request, Some(&ceremony.touch)) {
        Ok(body) => Ok(body),
        Err(error) => {
            key.cancel();
            Err(usb_failure(error))
        }
    }
}

/// The only place a device error becomes a `FailureKind`.
fn usb_failure(error: UsbError) -> PasskeyFailure {
    match error {
        UsbError::NoKeyPresent => PasskeyFailure::classified(
            FailureKind::NotSupported,
            "No security key is plugged in. Insert one and try again.",
        ),
        UsbError::Ctap(Status::Cancelled) => PasskeyFailure {
            kind: FailureKind::Cancelled,
            message: None,
        },
        UsbError::Ctap(Status::CredentialExcluded) => PasskeyFailure::other(
            "This security key already holds one of this wallet's keys. Use a different one.",
        ),
        UsbError::Ctap(Status::NoCredentials) => {
            PasskeyFailure::other("This security key holds no Vela passkey.")
        }
        UsbError::Ctap(Status::PinRequired) => PasskeyFailure::other(
            "This security key needs a PIN before it can store a passkey. Set one with the vendor's tool, then try again.",
        ),
        UsbError::TimedOut => {
            PasskeyFailure::other("The security key stopped responding. Unplug it and try again.")
        }
        other => PasskeyFailure::other(other.to_string()),
    }
}

fn encode_failed(error: vela_core::error::CoreError) -> PasskeyFailure {
    PasskeyFailure::other(format!("could not build the CTAP2 request: {error}"))
}

#[derive(Clone, Copy)]
enum ClientDataType {
    Create,
    Get,
}

/// The clientDataJSON this client signs over.
///
/// The field ORDER is load-bearing twice over: `webauthn::validate_client_data`
/// matches a literal prefix, and `registry_proof::build_member_proof` finds the
/// `"type"` and `"challenge"` offsets it reports to the registry contract. This
/// is the same layout the core's software group proof builds, so a member proof
/// and a group proof are the same shape.
fn client_data_json(kind: ClientDataType, challenge: &[u8]) -> String {
    let type_name = match kind {
        ClientDataType::Create => "webauthn.create",
        ClientDataType::Get => "webauthn.get",
    };
    format!(
        "{{\"type\":\"{}\",\"challenge\":\"{}\",\"origin\":\"{}\",\"crossOrigin\":false}}",
        type_name,
        primitives::to_base64url(challenge),
        ORIGIN
    )
}

/// `name ‖ NUL ‖ uuid`, the same 64-byte-capped user handle the web client
/// builds. The core validated the name against the same budget before the
/// ceremony started (`name_fits_user_handle`).
fn user_handle(name: &str) -> Vec<u8> {
    let mut handle = name.as_bytes().to_vec();
    handle.push(0);
    handle.extend_from_slice(uuid_v4().as_bytes());
    handle
}

/// A random uuid, formatted. Written here rather than pulled in as a crate: it
/// is 8 lines, and the wallet's only use for one is this handle.
fn uuid_v4() -> String {
    let mut bytes = [0u8; 16];
    if getrandom::fill(&mut bytes).is_err() {
        unreachable!("the platform CSPRNG is unavailable");
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let hex = primitives::to_hex(&bytes, false);
    format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32]
    )
}

/// All randomness in the flow lives in the shell. This is that shell.
pub fn random(len: usize) -> Vec<u8> {
    let mut bytes = vec![0u8; len];
    if getrandom::fill(&mut bytes).is_err() {
        // There is no safe degraded mode for a wallet whose CSPRNG is gone:
        // every value this function produces is either a challenge or a key.
        unreachable!("the platform CSPRNG is unavailable");
    }
    bytes
}
