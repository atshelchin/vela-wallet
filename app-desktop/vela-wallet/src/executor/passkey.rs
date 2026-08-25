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
use p256::PublicKey;
use p256::elliptic_curve::rand_core::OsRng;
use p256::elliptic_curve::sec1::ToEncodedPoint as _;

use vela_core::app::{Assertion, FailureKind, KeyMethod, Registration};
use vela_core::ctap::{
    AuthenticatorInfo, ClientPin, CredentialDescriptor, GetAssertion, GetAssertionResponse,
    MakeCredential, Permissions, PinUvAuthToken, Protocol, SharedSecret, Status,
    attestation_object, get_info_request, get_next_assertion_request, parse_client_pin,
    parse_get_assertion, parse_get_info,
};
use vela_core::types::P256PublicKey;
use vela_core::{primitives, webauthn};

use crate::ctap::usb::{SecurityKey, TouchKind, TouchNotifier, UsbError};

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
    /// Which key is asking. NOT shown — it is the HID path, and its only job is
    /// to keep one key's PIN from being offered to another. Two keys of the
    /// same model report the same product string, so the product cannot do it.
    pub device: String,
    /// Attempts left before the key locks itself. A locked key can only be
    /// recovered by a RESET, which destroys every credential on it — including
    /// this wallet's founding key — so this number is shown, never hidden.
    pub retries: Option<u32>,
    /// A previous attempt in this same session was refused.
    pub retry: bool,
}

/// One wallet a security key holds for this relying party.
#[derive(Clone, Debug)]
pub struct CredentialChoice {
    /// The wallet's name, read out of the user handle the credential was minted
    /// with (`name‖NUL‖uuid`). Empty when the authenticator volunteered no
    /// handle, which a very old credential may not.
    pub name: String,
    /// Hex. Only shown when two rows share a name — otherwise it is noise the
    /// person has no use for.
    pub credential_id: String,
    /// The key these all live on, for the row's second line.
    pub product: String,
}

/// Asks which of several wallets on one key to sign in as, and blocks.
///
/// `None` is a dismissal, which is a cancellation. Only called when the key
/// reports more than one: a single credential is not a choice.
pub type CredentialPicker = Arc<dyn Fn(Vec<CredentialChoice>) -> Option<usize> + Send + Sync>;

/// Everything a ceremony needs from the screen that started it.
#[derive(Clone)]
pub struct Ceremony {
    /// Called with what the key is waiting for when it starts waiting, and
    /// with `None` when it stops.
    pub touch: TouchNotifier,
    pub pin: PinRequester,
    pub pick: CredentialPicker,
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
    // `method` is IGNORED here, deliberately, and the core says so: the first
    // key is minted before the key screen exists, so it carries
    // `KeyMethod::default()` — the PLATFORM authenticator — and
    // `create_wallet.rs` documents that "a shell with none of its own (desktop)
    // overrides it at the ceremony".
    //
    // Refusing a non-`SecurityKey` method instead of overriding it is what made
    // the very first press of 继续 answer "device not supported" on a machine
    // with a security key plugged into it. The choice still travels to the core
    // and still labels the key row; what it must not do is decide whether a
    // ceremony is possible, because on this platform exactly one is.
    let _ = method;

    let mut key = open(ceremony)?;
    let info = get_info(&mut key)?;
    verifiable(&key, &info)?;
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

    let body = send(
        &mut key,
        &request.encode().map_err(encode_failed)?,
        ceremony,
    )?;
    let response = vela_core::ctap::parse_make_credential(&body).map_err(|error| {
        PasskeyFailure::other(format!("malformed makeCredential reply: {error}"))
    })?;
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
    let mut key = match credential_id {
        Some(id) => open_for(id, ceremony)?,
        None => open(ceremony)?,
    };
    let info = get_info(&mut key)?;
    verifiable(&key, &info)?;

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

    let body = send(
        &mut key,
        &request.encode().map_err(encode_failed)?,
        ceremony,
    )?;
    let first = parse_get_assertion(&body)
        .map_err(|error| PasskeyFailure::other(format!("malformed getAssertion reply: {error}")))?;

    // "Who are you?" can have more than one answer. A key holding two of a
    // person's wallets reports `numberOfCredentials` and hands back the FIRST;
    // the rest come from `getNextAssertion`, over the same client-data hash and
    // with no second touch. Taking the first without asking is how the other
    // wallet becomes unreachable from this computer.
    let response = match first.number_of_credentials {
        Some(total) if total > 1 && credential_id.is_none() => {
            choose(&mut key, first, total, ceremony)?
        }
        _ => first,
    };

    // The authenticator omits the credential descriptor when the request
    // pinned exactly one. Falling back to what was asked for is not a guess —
    // it is the credential the device was told to use.
    let resolved = match (&response.credential_id, credential_id) {
        (Some(bytes), _) => primitives::to_hex(bytes, false),
        (None, Some(requested)) => requested.trim_start_matches("0x").to_owned(),
        (None, None) => {
            return Err(PasskeyFailure::other(
                "the security key signed without saying which credential it used",
            ));
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

/// Collect every assertion the key is offering and let the person pick one.
///
/// The assertions are ALREADY SIGNED — `getNextAssertion` walks a list the
/// authenticator built when it collected user presence, so this costs no
/// further touch and no further wait. What comes back is the one the person
/// chose; the others are dropped unused, which is exactly as private as never
/// having asked (they never leave this process).
fn choose(
    key: &mut SecurityKey,
    first: GetAssertionResponse,
    total: u32,
    ceremony: &Ceremony,
) -> Result<GetAssertionResponse, PasskeyFailure> {
    let mut all = vec![first];
    // `total` comes from the device. Capped so a malformed count cannot spin
    // this loop against a key that will answer anything.
    let remaining = total.saturating_sub(1).min(MAX_ENUMERATED_CREDENTIALS);
    for _ in 0..remaining {
        let request = get_next_assertion_request().map_err(encode_failed)?;
        // No touch notifier: the key is not asking for anything here.
        let Ok(body) = key.cbor(&request, None) else {
            // A key that stops enumerating leaves what it already gave. Better
            // a picker with three of four wallets than a failed sign-in.
            break;
        };
        match parse_get_assertion(&body) {
            Ok(next) => all.push(next),
            Err(_) => break,
        }
    }

    if all.len() == 1 {
        return Ok(all.remove(0));
    }

    let product = key.product().to_owned();
    let choices = all
        .iter()
        .map(|assertion| CredentialChoice {
            name: assertion
                .user_id
                .as_deref()
                .map(wallet_name_from_handle)
                .unwrap_or_default(),
            credential_id: assertion
                .credential_id
                .as_deref()
                .map(|bytes| primitives::to_hex(bytes, false))
                .unwrap_or_default(),
            product: product.clone(),
        })
        .collect();

    let Some(index) = (ceremony.pick)(choices) else {
        return Err(PasskeyFailure {
            kind: FailureKind::Cancelled,
            message: None,
        });
    };
    all.into_iter()
        .nth(index)
        .ok_or_else(|| PasskeyFailure::other("that wallet is no longer in the list"))
}

/// The name inside a `name‖NUL‖uuid` user handle.
///
/// Everything before the NUL and nothing else: the uuid exists to make two
/// wallets with the same name different, not to be read. A handle that is not
/// UTF-8, or has no NUL, yields nothing rather than garbage — a row with no
/// name still has its credential id.
fn wallet_name_from_handle(handle: &[u8]) -> String {
    let name = handle.split(|byte| *byte == 0).next().unwrap_or_default();
    String::from_utf8(name.to_vec()).unwrap_or_default()
}

/// The most credentials this client will walk. A person with more than a
/// handful of Vela wallets on one authenticator is not the case to optimise
/// for — this is here to stop a bad `numberOfCredentials` from looping.
const MAX_ENUMERATED_CREDENTIALS: u32 = 16;

/// Can this authenticator verify a user at all?
///
/// A Vela key must be user-verified: the core's `validate_client_data` refuses
/// an assertion whose UV flag is clear, so a key with neither a PIN nor a
/// biometric can never produce one this wallet accepts.
///
/// Checked HERE, from `getInfo`, rather than by sending the request and letting
/// the authenticator refuse it. Sending it is not wrong — the refusal comes
/// back as `UNSUPPORTED_OPTION` or `PIN_NOT_SET`, which the status mapping
/// already understands — but it costs the person a touch to be told something
/// that was knowable before they were asked to touch anything. A key straight
/// out of its box is exactly the case that hits this.
fn verifiable(key: &SecurityKey, info: &AuthenticatorInfo) -> Result<(), PasskeyFailure> {
    if info.client_pin_set || info.user_verification {
        return Ok(());
    }
    Err(no_pin(key.product()))
}

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
    // An authenticator with a PIN but no advertised protocol list is a CTAP 2.0
    // device, and 2.0 had exactly one protocol.
    let protocol = Protocol::best_of(&info.pin_protocols).unwrap_or(Protocol::One);

    // BUILT-IN UV FIRST. `uv: true` in getInfo means the key can verify the
    // person itself and is enrolled to do it — a fingerprint on the key. That
    // is what they bought the sensor for, and a PIN is the FALLBACK, so
    // reaching for the PIN while the sensor is sitting there is the client
    // choosing the worse of two paths on the person's behalf.
    if info.user_verification {
        if !info.pin_uv_auth_token {
            // CTAP 2.0 with built-in UV: there is no token to fetch. The
            // request's own `uv` option makes the authenticator verify inline,
            // which `register`/`assert` set whenever no token came back.
            return Ok(None);
        }
        match uv_token(key, protocol, ceremony) {
            Ok(token) => return Ok(Some(token)),
            // The finger did not match, or the sensor is locked out. Both mean
            // "offer the PIN", and only if there is one to offer.
            Err(UsbError::Ctap(Status::UvFailed)) if info.client_pin_set => {}
            Err(UsbError::Ctap(Status::UvFailed)) => {
                return Err(PasskeyFailure::other(format!(
                    "{} could not verify your fingerprint, and it has no PIN set as a fallback.",
                    key.product()
                )));
            }
            Err(error) => return Err(usb_failure(error)),
        }
    }

    if !info.client_pin_set {
        return Ok(None);
    }
    let mut retry = false;
    loop {
        let retries = pin_retries(key, protocol);
        let Some(pin) = (ceremony.pin)(PinRequest {
            product: key.product().to_owned(),
            device: key.path().to_owned(),
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
            // Asking again cannot help: the key has no PIN to give.
            Err(UsbError::Ctap(Status::PinNotSet)) => return Err(no_pin(key.product())),
            Err(UsbError::Ctap(Status::PinBlocked)) => {
                return Err(PasskeyFailure::other(format!(
                    "{} is locked. Unplug it and plug it back in, or — if it asks for a reset — be aware a reset erases every passkey on it.",
                    key.product()
                )));
            }
            Err(error) => return Err(usb_failure(error)),
        }
    }
}

/// Ask the authenticator to verify the person with its own sensor.
///
/// The touch notifier travels with this one: the key blinks and waits for a
/// finger exactly as it does for a user-presence touch, and it is the only
/// clientPIN request that makes the person do anything.
fn uv_token(
    key: &mut SecurityKey,
    protocol: Protocol,
    ceremony: &Ceremony,
) -> Result<PinUvAuthToken, UsbError> {
    let (secret, platform_key) =
        key_agreement(key, protocol).map_err(|_| UsbError::Ctap(Status::UvFailed))?;
    let request = ClientPin::uv_token(
        protocol,
        platform_key,
        Permissions::MAKE_CREDENTIAL | Permissions::GET_ASSERTION,
        Some(RELYING_PARTY.to_owned()),
    )
    .encode()
    .map_err(|error| UsbError::Encode(error.to_string()))?;

    let body = key.cbor(&request, Some((&ceremony.touch, TouchKind::Fingerprint)))?;
    let encrypted = parse_client_pin(&body)
        .map_err(|error| UsbError::Encode(error.to_string()))?
        .pin_uv_auth_token
        .ok_or(UsbError::Ctap(Status::UvFailed))?;
    secret
        .decrypt_token(&encrypted)
        .map_err(|error| UsbError::Encode(error.to_string()))
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

fn nonces() -> impl Fn() -> [u8; 8] {
    || match random(8).try_into() {
        Ok(nonce) => nonce,
        Err(_) => unreachable!("random(8) returns 8 bytes"),
    }
}

/// The key to run a ceremony on when ANY key will do — a registration, or the
/// "who are you?" sign-in. With several plugged in, the one touched wins.
fn open(ceremony: &Ceremony) -> Result<SecurityKey, PasskeyFailure> {
    SecurityKey::open_touched(&nonces(), Some(&ceremony.touch)).map_err(usb_failure)
}

/// The key that already holds this credential.
///
/// Used whenever the credential id is known — every proof, every membership
/// confirmation, every re-signature. Those are the ceremonies where making all
/// three plugged-in keys blink is asking a person to answer a question the
/// client can answer itself, silently, in a few milliseconds.
///
/// The probe hash is fresh random bytes, never the ceremony's real client-data
/// hash: a probe is discarded, and an assertion signed over the real hash by a
/// key that then loses the race would be a signature nobody asked for.
fn open_for(credential_id: &str, ceremony: &Ceremony) -> Result<SecurityKey, PasskeyFailure> {
    let Ok(id) = primitives::from_hex(credential_id) else {
        return open(ceremony);
    };
    SecurityKey::open_holding(
        &id,
        RELYING_PARTY,
        &random(32),
        &nonces(),
        Some(&ceremony.touch),
    )
    .map_err(usb_failure)
}

fn get_info(key: &mut SecurityKey) -> Result<AuthenticatorInfo, PasskeyFailure> {
    let request = get_info_request().map_err(encode_failed)?;
    let body = key.cbor(&request, None).map_err(usb_failure)?;
    let info = parse_get_info(&body)
        .map_err(|error| PasskeyFailure::other(format!("malformed getInfo reply: {error}")))?;
    // Logged because it is the difference between three situations a person
    // cannot tell apart from the outside: a key with no sensor, a key with a
    // sensor and no enrolled finger, and a key that has both and was asked for
    // a PIN anyway. `uv` is present-and-true only when built-in verification is
    // CONFIGURED — an unenrolled sensor reports false.
    eprintln!(
        "[vela-wallet] {}: versions={:?} rk={} clientPin={} uv={} pinUvAuthToken={} protocols={:?}",
        key.product(),
        info.versions,
        info.resident_key,
        info.client_pin_set,
        info.user_verification,
        info.pin_uv_auth_token,
        info.pin_protocols,
    );
    Ok(info)
}

/// The request that makes the key blink for a BUTTON PRESS.
///
/// `getInfo`, `getKeyAgreement` and the PIN token request all answer instantly
/// and pass no notifier; announcing a touch for them would train people to
/// ignore the prompt. The built-in-UV token request does blink, and asks for a
/// finger rather than a press — it passes `Fingerprint` (see `uv_token`).
fn send(
    key: &mut SecurityKey,
    request: &[u8],
    ceremony: &Ceremony,
) -> Result<Vec<u8>, PasskeyFailure> {
    match key.cbor(request, Some((&ceremony.touch, TouchKind::Presence))) {
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
            "The PIN was not accepted. Try again, and watch the remaining attempts before you spend the last one.",
        ),
        UsbError::Ctap(Status::PinNotSet) => PasskeyFailure::other(no_pin_message()),
        UsbError::Ctap(Status::PinBlocked) => PasskeyFailure::other(
            "This security key is locked. Unplug it and plug it back in; if it asks for a reset, be aware that a reset erases every passkey on it.",
        ),
        // Deliberately `other` rather than `not_supported`: the key IS
        // supported and IS present, so the sheet must not say "plug one in".
        // The message carries the OS's own words into the technical details.
        UsbError::AccessDenied { product, detail } => PasskeyFailure::other(format!(
            "{product} is plugged in but could not be opened: {detail}"
        )),
        UsbError::TimedOut => {
            PasskeyFailure::other("The security key stopped responding. Unplug it and try again.")
        }
        other => PasskeyFailure::other(other.to_string()),
    }
}

/// The one instruction a key with no PIN needs.
fn no_pin(product: &str) -> PasskeyFailure {
    PasskeyFailure::other(format!(
        "{product} has no PIN set. Set one with the manufacturer's tool and try again — a wallet key has to be able to verify that it is you."
    ))
}

/// The same sentence where the product name is not to hand.
fn no_pin_message() -> &'static str {
    "This security key has no PIN set. Set one with the manufacturer's tool and try again — a wallet key has to be able to verify that it is you."
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

#[cfg(test)]
mod tests {
    use super::*;
    use vela_core::registry_proof::build_member_proof;
    use vela_core::types::ClientDataKind;

    /// The clientDataJSON this client signs must be readable by the SAME
    /// parsers the browser path feeds.
    ///
    /// This is the drift that would hurt most and show up latest: a desktop
    /// ceremony that produces a subtly different envelope still signs fine, and
    /// then the core refuses the assertion — or worse, the registry accepts a
    /// proof whose offsets point at the wrong bytes.
    #[test]
    fn the_client_data_is_what_the_core_already_knows_how_to_read() {
        // An assertion's authenticatorData, with UV set — which is what
        // `validate_client_data` checks for on the `get` path.
        let mut authenticator_data = vec![0u8; 32];
        authenticator_data.push(0x05);
        authenticator_data.extend_from_slice(&[0, 0, 0, 0]);

        for (kind, core_kind) in [
            (ClientDataType::Create, ClientDataKind::Create),
            (ClientDataType::Get, ClientDataKind::Get),
        ] {
            let json = client_data_json(kind, &[0x11; 32]);
            if let Err(error) =
                webauthn::validate_client_data(core_kind, json.as_bytes(), &authenticator_data)
            {
                unreachable!("the core rejected our own clientDataJSON: {error:?}");
            }
        }
    }

    /// A member proof is assembled by FINDING two substrings in whatever the
    /// authenticator produced, and reporting their byte offsets to the registry
    /// contract. Our envelope has to contain both, in the shape the finder
    /// expects.
    #[test]
    fn a_member_proof_can_be_built_from_our_envelope() {
        let json = client_data_json(ClientDataType::Get, &[0x22; 32]);
        let mut authenticator_data = vec![0u8; 32];
        authenticator_data.push(0x05);
        authenticator_data.extend_from_slice(&[0, 0, 0, 0]);
        // A syntactically valid DER signature is all `build_member_proof` needs
        // to reach the offsets; its VALUE is the authenticator's business.
        let signature = signature_der();

        let proof = match build_member_proof(
            &primitives::to_hex(&authenticator_data, false),
            &primitives::to_hex(json.as_bytes(), false),
            &primitives::to_hex(&signature, false),
        ) {
            Ok(proof) => proof,
            Err(error) => unreachable!("{error:?}"),
        };
        assert_eq!(
            &proof.client_data_json[proof.type_index as usize
                ..proof.type_index as usize + r#""type":"webauthn.get""#.len()],
            r#""type":"webauthn.get""#
        );
        assert_eq!(
            &proof.client_data_json[proof.challenge_index as usize
                ..proof.challenge_index as usize + r#""challenge":""#.len()],
            r#""challenge":""#
        );
    }

    /// A low-S DER signature over a fixed digest, produced here rather than
    /// hard-coded so the vector cannot drift out of the curve.
    fn signature_der() -> Vec<u8> {
        use p256::ecdsa::signature::hazmat::PrehashSigner as _;
        use p256::ecdsa::{Signature, SigningKey};
        let key = match SigningKey::from_slice(&[0x42u8; 32]) {
            Ok(key) => key,
            Err(error) => unreachable!("{error}"),
        };
        let signature: Signature = match key.sign_prehash(&[0x33u8; 32]) {
            Ok(signature) => signature,
            Err(error) => unreachable!("{error}"),
        };
        signature
            .normalize_s()
            .unwrap_or(signature)
            .to_der()
            .to_bytes()
            .to_vec()
    }

    /// WebAuthn caps `user.id` at 64 bytes, and the core validates the NAME
    /// against the remaining 27 before any ceremony starts. The envelope this
    /// function adds is what makes those two numbers agree; if it grows, a name
    /// the core accepted produces a handle the authenticator refuses.
    #[test]
    fn the_user_handle_fits_the_webauthn_budget() {
        let longest = "x".repeat(64 - 37);
        let handle = user_handle(&longest);
        assert_eq!(handle.len(), 64);
        assert_eq!(handle[longest.len()], 0, "the separator is a NUL");
    }

    /// Two handles for the same name must differ: the uuid tail is what stops
    /// a second key inheriting the first one's user handle.
    #[test]
    fn two_handles_for_one_name_differ() {
        assert_ne!(
            user_handle("Everyday wallet"),
            user_handle("Everyday wallet")
        );
    }

    /// "No key plugged in" is `not_supported` WITH WORDS.
    ///
    /// The kind matters because the core branches on it; the message matters
    /// because on a desktop this is the one failure that is not "something went
    /// wrong" — it is an instruction, and the sheet has to be able to give it.
    #[test]
    fn a_missing_key_is_a_sentence_rather_than_a_shrug() {
        let failure = usb_failure(UsbError::NoKeyPresent);
        assert_eq!(failure.kind, FailureKind::NotSupported);
        let message = failure.message.unwrap_or_default();
        assert!(
            message.to_lowercase().contains("security key"),
            "the message must name what is missing: {message}"
        );
    }

    /// A person who declines at the authenticator has not hit an error.
    /// Cancellation carries no message — its copy comes from the
    /// classification, and forwarding "the security key refused" would tell
    /// somebody their own choice went wrong.
    #[test]
    fn declining_at_the_key_is_a_cancellation_with_no_words() {
        let failure = usb_failure(UsbError::Ctap(Status::Cancelled));
        assert_eq!(failure.kind, FailureKind::Cancelled);
        assert_eq!(failure.message, None);
    }

    /// The exclusion list doing its job is not a fault, and it is not
    /// `not_supported` either: a different key would work.
    #[test]
    fn an_excluded_credential_says_to_use_another_key() {
        let failure = usb_failure(UsbError::Ctap(Status::CredentialExcluded));
        assert_eq!(failure.kind, FailureKind::Other);
        assert!(
            failure
                .message
                .unwrap_or_default()
                .to_lowercase()
                .contains("different")
        );
    }

    /// The picker's row label comes out of the user handle the credential was
    /// minted with, and only the part before the NUL.
    ///
    /// The uuid tail exists to make two same-named wallets different, not to be
    /// read; putting it on screen would turn "Everyday wallet" into
    /// "Everyday wallet\0f81d4fa-…". A handle that is not UTF-8 or has no NUL
    /// yields nothing rather than mojibake — the row still has its credential
    /// id to tell it apart.
    #[test]
    fn a_wallet_name_is_the_handle_up_to_the_nul() {
        assert_eq!(
            wallet_name_from_handle(&user_handle("Everyday wallet")),
            "Everyday wallet"
        );
        assert_eq!(wallet_name_from_handle(b"no-nul-here"), "no-nul-here");
        assert_eq!(wallet_name_from_handle(&[]), "");
        assert_eq!(wallet_name_from_handle(&[0xff, 0xfe, 0x00, b'x']), "");
    }

    /// A key with no PIN and no biometric cannot make a wallet key, and the
    /// sentence says what to do about it.
    ///
    /// This is the brand-new-key case: out of the box a security key has no
    /// PIN, and the wallet's requirement that every credential be user-verified
    /// is not something a person can guess at from `CTAP2_ERR_UNSUPPORTED_OPTION`.
    #[test]
    fn a_key_with_no_pin_gets_an_instruction() {
        for failure in [
            no_pin("YubiKey 5C"),
            usb_failure(UsbError::Ctap(Status::PinNotSet)),
        ] {
            assert_eq!(failure.kind, FailureKind::Other);
            let message = failure.message.unwrap_or_default();
            assert!(message.contains("no PIN set"), "{message}");
            assert!(
                message.contains("try again"),
                "the sentence has to end in something to do: {message}"
            );
        }
    }

    /// A refused PIN and a locked key are different sentences, and telling a
    /// person their key is locked when they merely mistyped is the failure
    /// mode worth a test: a reset is the only way out of the locked state, and
    /// a reset destroys the wallet's founding credential.
    #[test]
    fn a_wrong_pin_and_a_locked_key_do_not_share_a_sentence() {
        let wrong = usb_failure(UsbError::Ctap(Status::PinRequired))
            .message
            .unwrap_or_default();
        let locked = usb_failure(UsbError::Ctap(Status::PinBlocked))
            .message
            .unwrap_or_default();
        assert!(wrong.contains("not accepted"), "{wrong}");
        assert!(!wrong.contains("locked"), "{wrong}");
        assert!(locked.contains("locked"), "{locked}");
        assert!(
            locked.contains("erases"),
            "a reset destroys every passkey on the key, and that has to be said: {locked}"
        );
    }

    /// Support means the HID subsystem is REACHABLE, not that a key is plugged
    /// in — and the difference is the whole recovery path. Answering `false`
    /// for an empty USB port would make the core raise "this device cannot
    /// create a wallet", which is untrue and has no way back; a missing key has
    /// to arrive later, as a failure the person can fix by plugging one in.
    ///
    /// So this asserts support on a machine that (almost certainly) has no
    /// security key attached, which is exactly the case that must not report
    /// unsupported.
    #[test]
    fn support_does_not_depend_on_a_key_being_plugged_in() {
        assert!(
            supported(),
            "HID enumeration is unavailable on this host, so this test cannot say anything"
        );
    }

    /// A canonical uuid v4, which is what the other clients' `randomUUID()`
    /// produces — the handle is stored and compared as bytes.
    #[test]
    fn the_uuid_is_shaped_like_a_uuid_v4() {
        let uuid = uuid_v4();
        assert_eq!(uuid.len(), 36);
        assert_eq!(uuid.chars().filter(|ch| *ch == '-').count(), 4, "{uuid}");
        assert_eq!(uuid.as_bytes()[14], b'4', "version nibble: {uuid}");
        assert!(
            matches!(uuid.as_bytes()[19], b'8' | b'9' | b'a' | b'b'),
            "variant nibble: {uuid}"
        );
    }
}
