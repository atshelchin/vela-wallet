//! The CTAP2 ceremonies themselves — registration and assertion — generic
//! over who carries the bytes and who answers the prompts.
//!
//! [`super`] is bytes in, bytes out: framing, commands, PIN protocols. This
//! module is the layer above — the *order* of those commands, and the
//! decisions between them: check `getInfo` before asking for a touch, prefer
//! the fingerprint the person paid for over the PIN, retry a refused PIN with
//! the count in front of them, walk `getNextAssertion` when one key holds two
//! wallets. It grew up inside the desktop client (spec 019 phase 5) and moved
//! here so Android's GMS-free USB path and the caBLE transports drive the
//! *same* ceremony instead of re-writing it in Kotlin and Swift — one
//! implementation, or four chances for four wallets to disagree about what a
//! signature covers.
//!
//! Two seams keep it pure, in the same sense as the rest of the core:
//!
//! * [`Cable`] — one CBOR exchange with an authenticator. A USB HID cable on
//!   the desktop, `android.hardware.usb` on a phone, a caBLE tunnel later.
//!   Opening and choosing a device is the transport's business; a ceremony
//!   receives a cable that is already talking to exactly one authenticator.
//! * [`Host`] — the person and the platform: the PIN dialog, the
//!   which-wallet picker, randomness, and a diagnostics line. No clock, no
//!   randomness and no I/O originate here.

use p256::elliptic_curve::sec1::ToSec1Point;
use p256::PublicKey;

use crate::ctap::commands::{
    attestation_object, get_info_request, get_next_assertion_request, parse_client_pin,
    parse_get_assertion, parse_get_info, parse_make_credential, AuthenticatorInfo, ClientPin,
    CredentialDescriptor, GetAssertion, GetAssertionResponse, MakeCredential, Permissions, Status,
};
use crate::ctap::pin_uv::{PinUvAuthToken, Protocol, SharedSecret};
use crate::primitives;
use crate::types::{ClientDataKind, P256PublicKey};
use crate::webauthn;

// ---------------------------------------------------------------------------
// The seams
// ---------------------------------------------------------------------------

/// A cable's "the key is blinking, touch it" callback: fired once per exchange
/// with the physical act asked for and the device's product string. Both
/// cables ([`super::hid_cable`], [`super::apdu_cable`]) take one; a shell wires
/// it to a screen, a test to a counter.
pub type TouchAnnouncer = Box<dyn FnMut(TouchKind, &str)>;

/// Which physical act a blinking authenticator is waiting for. CTAPHID's
/// keepalive cannot say — it is known from which request is in flight, which
/// is why the ceremony passes it to the transport per exchange.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TouchKind {
    /// User presence: a touch on the key's button.
    Presence,
    /// Built-in user verification: a finger on the key's sensor.
    Fingerprint,
    /// SEVERAL authenticators are blinking and touching one picks it. Carries
    /// no product string — naming one of them would be naming the wrong one.
    Select,
}

/// What can go wrong on the wire. Everything here is a device, a driver or a
/// person walking away; [`failure_for`] turns each into the sentence and the
/// classification the flow owes.
#[derive(Debug)]
pub enum CableError {
    /// No authenticator is reachable at all — the one failure that must be
    /// said in words a person can act on by plugging a key in.
    NoKeyPresent,
    /// Something IS there and would not open: a permissions problem wearing a
    /// hardware problem's clothes (missing udev rules, a denied USB grant).
    AccessDenied { product: String, detail: String },
    /// The authenticator stopped answering.
    TimedOut,
    /// The authenticator answered with a CTAP error status.
    Ctap(Status),
    /// Anything else the transport wants to say, in its own words.
    Other(String),
}

/// One open conversation with one authenticator.
pub trait Cable {
    /// Send one CTAP2 request (command byte + CBOR) and return the response
    /// body, absorbing keepalives. `touch` is `Some` only for the requests
    /// that make a person do something — announcing a touch for `getInfo`
    /// would train people to ignore the prompt.
    fn exchange(&mut self, request: &[u8], touch: Option<TouchKind>)
        -> Result<Vec<u8>, CableError>;
    /// Tell the authenticator to abandon whatever it is waiting for. Best
    /// effort by construction.
    fn cancel(&mut self);
    /// The device's own product string, so a sentence can name the thing on
    /// the desk.
    fn product(&self) -> &str;
    /// A stable identifier — a HID path, a USB address. An identity for the
    /// PIN cache, never shown.
    fn path(&self) -> &str;
}

/// What the PIN dialog needs to say.
#[derive(Clone, Debug)]
pub struct PinRequest {
    pub product: String,
    /// The transport's device identity, so a PIN cache never hands one key's
    /// PIN to another.
    pub device: String,
    /// Attempts left, when the authenticator would say.
    pub retries: Option<u32>,
    /// This is a RE-ask after a refused attempt.
    pub retry: bool,
}

/// One row of the which-wallet picker.
#[derive(Clone, Debug)]
pub struct CredentialChoice {
    pub name: String,
    pub credential_id: String,
    pub product: String,
}

/// The person and the platform, as the ceremony sees them.
pub trait Host {
    /// Ask for the authenticator's PIN. `None` is a dismissal.
    fn pin(&self, request: PinRequest) -> Option<String>;
    /// One authenticator answered for several wallets — which one? `None` is
    /// a dismissal.
    fn pick(&self, choices: Vec<CredentialChoice>) -> Option<usize>;
    /// Platform CSPRNG. Every value this produces is a challenge, an IV or an
    /// ephemeral key — there is no safe degraded mode.
    fn random(&self, len: usize) -> Vec<u8>;
    /// One diagnostics line (the `getInfo` summary). VelaLog on Android,
    /// stderr on the desktop.
    fn note(&self, line: &str);
}

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

/// The flow vocabulary, decided once here so every shell classifies a device
/// failure the same way. Mirrors the core machines' `FailureKind`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FailureKind {
    Cancelled,
    NotSupported,
    NotDiscoverable,
    Other,
}

/// A ceremony that produced no credential, already classified, with the
/// sentence the technical-details disclosure shows.
#[derive(Debug)]
pub struct CeremonyError {
    pub kind: FailureKind,
    pub message: Option<String>,
}

impl CeremonyError {
    pub fn cancelled() -> Self {
        Self {
            kind: FailureKind::Cancelled,
            message: None,
        }
    }
    pub fn classified(kind: FailureKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: Some(message.into()),
        }
    }
    pub fn other(message: impl Into<String>) -> Self {
        Self::classified(FailureKind::Other, message)
    }
}

/// The only place a cable error becomes a [`FailureKind`].
pub fn failure_for(error: CableError) -> CeremonyError {
    match error {
        CableError::NoKeyPresent => CeremonyError::classified(
            FailureKind::NotSupported,
            "No security key is plugged in. Insert one and try again.",
        ),
        CableError::Ctap(Status::Cancelled) => CeremonyError::cancelled(),
        CableError::Ctap(Status::CredentialExcluded) => CeremonyError::other(
            "This security key already holds one of this wallet's keys. Use a different one.",
        ),
        CableError::Ctap(Status::NoCredentials) => {
            CeremonyError::other("This security key holds no Vela passkey.")
        }
        CableError::Ctap(Status::PinRequired) => CeremonyError::other(
            "The PIN was not accepted. Try again, and watch the remaining attempts before you spend the last one.",
        ),
        CableError::Ctap(Status::PinNotSet) => CeremonyError::other(NO_PIN_MESSAGE),
        CableError::Ctap(Status::PinBlocked) => CeremonyError::other(
            "This security key is locked. Unplug it and plug it back in; if it asks for a reset, be aware that a reset erases every passkey on it.",
        ),
        // Deliberately `other` rather than `not_supported`: the key IS
        // supported and IS present, so the sheet must not say "plug one in".
        // The message carries the OS's own words into the technical details.
        CableError::AccessDenied { product, detail } => CeremonyError::other(format!(
            "{product} is plugged in but could not be opened: {detail}"
        )),
        CableError::TimedOut => {
            CeremonyError::other("The security key stopped responding. Unplug it and try again.")
        }
        CableError::Ctap(status) => {
            CeremonyError::other(format!("the security key refused: {status:?}"))
        }
        CableError::Other(detail) => CeremonyError::other(detail),
    }
}

/// The one instruction a key with no PIN needs.
fn no_pin(product: &str) -> CeremonyError {
    CeremonyError::other(format!(
        "{product} has no PIN set. Set one with the manufacturer's tool and try again — a wallet key has to be able to verify that it is you."
    ))
}

/// The same sentence where the product name is not to hand.
const NO_PIN_MESSAGE: &str = "This security key has no PIN set. Set one with the manufacturer's tool and try again — a wallet key has to be able to verify that it is you.";

fn encode_failed(error: crate::error::CoreError) -> CeremonyError {
    CeremonyError::other(format!("could not build the CTAP2 request: {error}"))
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/// A completed registration, in the core's hex vocabulary. Attachment and
/// transports are the TRANSPORT's facts — the shell that opened the cable
/// adds them.
#[derive(Clone, Debug)]
pub struct Registration {
    pub credential_id_hex: String,
    pub attestation_object_hex: String,
    pub client_data_json_hex: String,
}

/// A completed assertion.
#[derive(Clone, Debug)]
pub struct Assertion {
    pub credential_id_hex: String,
    pub signature_der_hex: String,
    pub authenticator_data_hex: String,
    pub client_data_json_hex: String,
    /// Absent, not empty: no user handle is a different fact from an empty
    /// one, and the core's name resolution branches on it.
    pub user_id_hex: Option<String>,
}

// ---------------------------------------------------------------------------
// The client
// ---------------------------------------------------------------------------

/// One ceremony's worth of context: a cable that is already talking to one
/// authenticator, a host that can answer for the person, and the relying
/// party this wallet lives under.
pub struct Client<'a, C: Cable, H: Host> {
    pub cable: &'a mut C,
    pub host: &'a H,
    pub rp_id: &'a str,
    pub rp_name: &'a str,
    /// The origin written into clientDataJSON — the app's identity, the same
    /// value on every platform so one authenticator derives one address.
    pub origin: &'a str,
}

/// The most credentials this client will walk with `getNextAssertion`. A
/// person with more than a handful of Vela wallets on one authenticator is
/// not the case to optimise for — this stops a bad `numberOfCredentials` from
/// looping.
const MAX_ENUMERATED_CREDENTIALS: u32 = 16;

impl<C: Cable, H: Host> Client<'_, C, H> {
    /// Mint a discoverable ES256 credential on the authenticator.
    pub fn register(
        &mut self,
        name: &str,
        exclude_credential_ids: &[String],
    ) -> Result<Registration, CeremonyError> {
        let info = self.get_info()?;
        self.verifiable(&info)?;
        if !info.resident_key {
            // A non-discoverable credential signs fine when pinned by id and
            // then never appears at sign-in. Fail HERE, before anything is
            // stored or funded — the same gate the web client applies to
            // `credProps.rk`.
            return Err(CeremonyError::classified(
                FailureKind::NotDiscoverable,
                format!(
                    "{} cannot store a discoverable passkey, so a wallet created on it could never sign in.",
                    self.cable.product()
                ),
            ));
        }

        let client_data = self.client_data_json(ClientDataKind::Create, &self.host.random(32));
        let client_data_hash = primitives::sha256(client_data.as_bytes());
        let token = self.pin_session(&info)?;

        let request = MakeCredential {
            client_data_hash: client_data_hash.clone(),
            rp_id: self.rp_id.to_owned(),
            rp_name: self.rp_name.to_owned(),
            user_id: self.user_handle(name),
            user_name: name.to_owned(),
            user_display_name: name.to_owned(),
            exclude: exclude_credential_ids
                .iter()
                .filter_map(|id| primitives::from_hex(id).ok())
                .map(|id| CredentialDescriptor { id })
                .collect(),
            resident_key: true,
            // With a `pinUvAuthParam` present the token IS the user
            // verification; CTAP 2.1 §6.1.2 has the authenticator reject a
            // request that asks for both. Without one, the `uv` option is the
            // only way to ask.
            user_verification: token.is_none(),
            pin_uv_auth: token.as_ref().map(|token| token.param(&client_data_hash)),
        };

        let body = self.send(&request.encode().map_err(encode_failed)?)?;
        let response = parse_make_credential(&body).map_err(|error| {
            CeremonyError::other(format!("malformed makeCredential reply: {error}"))
        })?;
        let credential_id = webauthn::attested_credential_id(&response.auth_data)
            .map_err(|error| CeremonyError::other(format!("malformed credential: {error}")))?;
        let attestation = attestation_object(&response)
            .map_err(|error| CeremonyError::other(format!("malformed attestation: {error}")))?;

        Ok(Registration {
            credential_id_hex: primitives::to_hex(&credential_id, false),
            attestation_object_hex: primitives::to_hex(&attestation, false),
            client_data_json_hex: primitives::to_hex(client_data.as_bytes(), false),
        })
    }

    /// Sign a challenge. `credential_id_hex` is `None` for the "who are you?"
    /// ceremony a sign-in starts with: an empty allow list is what asks for
    /// any discoverable credential.
    pub fn assert(
        &mut self,
        challenge: &[u8],
        credential_id_hex: Option<&str>,
    ) -> Result<Assertion, CeremonyError> {
        let info = self.get_info()?;
        self.verifiable(&info)?;

        let client_data = self.client_data_json(ClientDataKind::Get, challenge);
        let client_data_hash = primitives::sha256(client_data.as_bytes());
        let token = self.pin_session(&info)?;

        let allow = credential_id_hex
            .and_then(|id| primitives::from_hex(id).ok())
            .map(|id| vec![CredentialDescriptor { id }])
            .unwrap_or_default();

        let request = GetAssertion {
            rp_id: self.rp_id.to_owned(),
            client_data_hash: client_data_hash.clone(),
            allow,
            user_presence: true,
            user_verification: token.is_none(),
            pin_uv_auth: token.as_ref().map(|token| token.param(&client_data_hash)),
        };

        let body = self.send(&request.encode().map_err(encode_failed)?)?;
        let first = parse_get_assertion(&body).map_err(|error| {
            CeremonyError::other(format!("malformed getAssertion reply: {error}"))
        })?;

        // "Who are you?" can have more than one answer. A key holding two of
        // a person's wallets reports `numberOfCredentials` and hands back the
        // FIRST; the rest come from `getNextAssertion`, over the same
        // client-data hash and with no second touch. Taking the first without
        // asking is how the other wallet becomes unreachable.
        let response = match first.number_of_credentials {
            Some(total) if total > 1 && credential_id_hex.is_none() => self.choose(first, total)?,
            _ => first,
        };

        // The authenticator omits the credential descriptor when the request
        // pinned exactly one. Falling back to what was asked for is not a
        // guess — it is the credential the device was told to use.
        let resolved = match (&response.credential_id, credential_id_hex) {
            (Some(bytes), _) => primitives::to_hex(bytes, false),
            (None, Some(requested)) => requested.trim_start_matches("0x").to_owned(),
            (None, None) => {
                return Err(CeremonyError::other(
                    "the security key signed without saying which credential it used",
                ));
            }
        };

        Ok(Assertion {
            credential_id_hex: resolved,
            signature_der_hex: primitives::to_hex(&response.signature_der, false),
            authenticator_data_hex: primitives::to_hex(&response.auth_data, false),
            client_data_json_hex: primitives::to_hex(client_data.as_bytes(), false),
            user_id_hex: response
                .user_id
                .as_ref()
                .filter(|bytes| !bytes.is_empty())
                .map(|bytes| primitives::to_hex(bytes, false)),
        })
    }

    // -- the pieces ---------------------------------------------------------

    fn get_info(&mut self) -> Result<AuthenticatorInfo, CeremonyError> {
        let request = get_info_request().map_err(encode_failed)?;
        let body = self.cable.exchange(&request, None).map_err(failure_for)?;
        let info = parse_get_info(&body)
            .map_err(|error| CeremonyError::other(format!("malformed getInfo reply: {error}")))?;
        // Noted because it is the difference between three situations a
        // person cannot tell apart from the outside: a key with no sensor, a
        // key with a sensor and no enrolled finger, and a key that has both
        // and was asked for a PIN anyway. `uv` is present-and-true only when
        // built-in verification is CONFIGURED — an unenrolled sensor reports
        // false.
        self.host.note(&format!(
            "{}: versions={:?} rk={} clientPin={} uv={} pinUvAuthToken={} protocols={:?}",
            self.cable.product(),
            info.versions,
            info.resident_key,
            info.client_pin_set,
            info.user_verification,
            info.pin_uv_auth_token,
            info.pin_protocols,
        ));
        Ok(info)
    }

    /// Can this authenticator verify a user at all?
    ///
    /// A Vela key must be user-verified: the core's `validate_client_data`
    /// refuses an assertion whose UV flag is clear, so a key with neither a
    /// PIN nor a biometric can never produce one this wallet accepts. Checked
    /// from `getInfo` rather than by sending the request and letting the
    /// authenticator refuse — that refusal costs the person a touch to be
    /// told something knowable before they were asked to touch anything.
    fn verifiable(&self, info: &AuthenticatorInfo) -> Result<(), CeremonyError> {
        if info.client_pin_set || info.user_verification {
            return Ok(());
        }
        Err(no_pin(self.cable.product()))
    }

    /// Collect every assertion the key is offering and let the person pick.
    ///
    /// The assertions are ALREADY SIGNED — `getNextAssertion` walks a list the
    /// authenticator built when it collected user presence, so this costs no
    /// further touch. The unchosen ones are dropped unused, which is exactly
    /// as private as never having asked (they never leave this process).
    fn choose(
        &mut self,
        first: GetAssertionResponse,
        total: u32,
    ) -> Result<GetAssertionResponse, CeremonyError> {
        let mut all = vec![first];
        // `total` comes from the device. Capped so a malformed count cannot
        // spin this loop against a key that will answer anything.
        let remaining = total.saturating_sub(1).min(MAX_ENUMERATED_CREDENTIALS);
        for _ in 0..remaining {
            let request = get_next_assertion_request().map_err(encode_failed)?;
            // No touch: the key is not asking for anything here.
            let Ok(body) = self.cable.exchange(&request, None) else {
                // A key that stops enumerating leaves what it already gave.
                // Better a picker with three of four wallets than a failed
                // sign-in.
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

        let product = self.cable.product().to_owned();
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

        let Some(index) = self.host.pick(choices) else {
            return Err(CeremonyError::cancelled());
        };
        all.into_iter()
            .nth(index)
            .ok_or_else(|| CeremonyError::other("that wallet is no longer in the list"))
    }

    /// Agree a `pinUvAuthToken` with the authenticator, if it needs one.
    ///
    /// `Ok(None)` means no token is needed or available: the request's own
    /// `uv` option is then the only way to ask. BUILT-IN UV FIRST — `uv:
    /// true` in getInfo means the key can verify the person itself and is
    /// enrolled to do it. That is what they bought the sensor for; reaching
    /// for the PIN while the sensor sits there is the client choosing the
    /// worse of two paths on the person's behalf.
    fn pin_session(
        &mut self,
        info: &AuthenticatorInfo,
    ) -> Result<Option<PinUvAuthToken>, CeremonyError> {
        // An authenticator with a PIN but no advertised protocol list is a
        // CTAP 2.0 device, and 2.0 had exactly one protocol.
        let protocol = Protocol::best_of(&info.pin_protocols).unwrap_or(Protocol::One);

        if info.user_verification {
            if !info.pin_uv_auth_token {
                // CTAP 2.0 with built-in UV: there is no token to fetch.
                return Ok(None);
            }
            match self.uv_token(protocol) {
                Ok(token) => return Ok(Some(token)),
                // The finger did not match, or the sensor is locked out. Both
                // mean "offer the PIN", and only if there is one to offer.
                Err(CableError::Ctap(Status::UvFailed)) if info.client_pin_set => {}
                Err(CableError::Ctap(Status::UvFailed)) => {
                    return Err(CeremonyError::other(format!(
                        "{} could not verify your fingerprint, and it has no PIN set as a fallback.",
                        self.cable.product()
                    )));
                }
                Err(error) => return Err(failure_for(error)),
            }
        }

        if !info.client_pin_set {
            return Ok(None);
        }
        let mut retry = false;
        loop {
            let retries = self.pin_retries(protocol);
            let Some(pin) = self.host.pin(PinRequest {
                product: self.cable.product().to_owned(),
                device: self.cable.path().to_owned(),
                retries,
                retry,
            }) else {
                return Err(CeremonyError::cancelled());
            };

            // A fresh key agreement per attempt, deliberately. A shared
            // secret is per-session and an authenticator is entitled to drop
            // it after a refused PIN; reusing one would make the second
            // attempt fail for a reason that has nothing to do with what was
            // typed.
            let (secret, platform_key) = self.key_agreement(protocol)?;
            let pin_hash_enc = secret
                .encrypt_pin_hash(&pin, &self.host.random(16))
                .map_err(|error| CeremonyError::other(format!("PIN encryption failed: {error}")))?;
            drop(pin);

            let permissions = info
                .pin_uv_auth_token
                .then(|| Permissions::MAKE_CREDENTIAL | Permissions::GET_ASSERTION);
            let request = ClientPin::pin_token(
                protocol,
                platform_key,
                pin_hash_enc,
                permissions,
                permissions.map(|_| self.rp_id.to_owned()),
            );

            match self
                .cable
                .exchange(&request.encode().map_err(encode_failed)?, None)
            {
                Ok(body) => {
                    let response = parse_client_pin(&body).map_err(|error| {
                        CeremonyError::other(format!("malformed clientPIN reply: {error}"))
                    })?;
                    let encrypted = response.pin_uv_auth_token.ok_or_else(|| {
                        CeremonyError::other("the security key returned no pinUvAuthToken")
                    })?;
                    return secret.decrypt_token(&encrypted).map(Some).map_err(|error| {
                        CeremonyError::other(format!("the PIN token could not be unwrapped: {error}"))
                    });
                }
                // A refused PIN is not a failed ceremony — it is one wrong
                // attempt, and the person gets to try again with the count in
                // front of them.
                Err(CableError::Ctap(Status::PinRequired)) => {
                    retry = true;
                    continue;
                }
                // Asking again cannot help: the key has no PIN to give.
                Err(CableError::Ctap(Status::PinNotSet)) => {
                    return Err(no_pin(self.cable.product()))
                }
                Err(CableError::Ctap(Status::PinBlocked)) => {
                    return Err(CeremonyError::other(format!(
                        "{} is locked. Unplug it and plug it back in, or — if it asks for a reset — be aware a reset erases every passkey on it.",
                        self.cable.product()
                    )));
                }
                Err(error) => return Err(failure_for(error)),
            }
        }
    }

    /// Ask the authenticator to verify the person with its own sensor.
    ///
    /// The touch kind travels with this one: the key blinks and waits for a
    /// finger exactly as it does for a user-presence touch, and it is the
    /// only clientPIN request that makes the person do anything.
    fn uv_token(&mut self, protocol: Protocol) -> Result<PinUvAuthToken, CableError> {
        let (secret, platform_key) = self
            .key_agreement(protocol)
            .map_err(|_| CableError::Ctap(Status::UvFailed))?;
        let request = ClientPin::uv_token(
            protocol,
            platform_key,
            Permissions::MAKE_CREDENTIAL | Permissions::GET_ASSERTION,
            Some(self.rp_id.to_owned()),
        )
        .encode()
        .map_err(|error| CableError::Other(error.to_string()))?;

        let body = self
            .cable
            .exchange(&request, Some(TouchKind::Fingerprint))?;
        let encrypted = parse_client_pin(&body)
            .map_err(|error| CableError::Other(error.to_string()))?
            .pin_uv_auth_token
            .ok_or(CableError::Ctap(Status::UvFailed))?;
        secret
            .decrypt_token(&encrypted)
            .map_err(|error| CableError::Other(error.to_string()))
    }

    /// Ask how many PIN attempts are left. Best effort: a key that will not
    /// answer this still deserves a PIN dialog, just without the count.
    fn pin_retries(&mut self, protocol: Protocol) -> Option<u32> {
        let request = ClientPin::pin_retries(protocol).encode().ok()?;
        let body = self.cable.exchange(&request, None).ok()?;
        parse_client_pin(&body).ok()?.pin_retries
    }

    /// The ECDH half the framing layer cannot do, because it needs
    /// randomness — which comes from the host, like all of it.
    ///
    /// The ephemeral secret lives exactly as long as the caller needs the
    /// derived keys; nothing about it is stored, logged or reused.
    fn key_agreement(
        &mut self,
        protocol: Protocol,
    ) -> Result<(SharedSecret, P256PublicKey), CeremonyError> {
        let request = ClientPin::key_agreement(protocol)
            .encode()
            .map_err(encode_failed)?;
        let body = self.cable.exchange(&request, None).map_err(failure_for)?;
        let authenticator_key = parse_client_pin(&body)
            .map_err(|error| CeremonyError::other(format!("malformed keyAgreement: {error}")))?
            .key_agreement
            .ok_or_else(|| CeremonyError::other("the security key returned no keyAgreement key"))?;

        let mut sec1 = vec![0x04u8];
        sec1.extend_from_slice(&authenticator_key.x);
        sec1.extend_from_slice(&authenticator_key.y);
        // The point was already checked to be on P-256 by the core's COSE
        // decoder; this parse is the same fact in p256's own types.
        let peer = PublicKey::from_sec1_bytes(&sec1)
            .map_err(|error| CeremonyError::other(format!("keyAgreement key rejected: {error}")))?;

        // An ephemeral scalar from host randomness. 32 random bytes fail to
        // be a valid non-zero scalar with probability ~2⁻³², so the loop is a
        // formality — but a formality beats an `unwrap`.
        let ephemeral = loop {
            if let Ok(secret) = p256::SecretKey::from_slice(&self.host.random(32)) {
                break secret;
            }
        };
        let shared =
            p256::ecdh::diffie_hellman(ephemeral.to_nonzero_scalar(), peer.as_affine());
        let secret = SharedSecret::derive(protocol, shared.raw_secret_bytes().as_slice())
            .map_err(|error| CeremonyError::other(format!("PIN key derivation failed: {error}")))?;

        let point = ephemeral.public_key().to_sec1_point(false);
        let platform_key = P256PublicKey {
            x: point.x().map(|x| x.to_vec()).unwrap_or_default(),
            y: point.y().map(|y| y.to_vec()).unwrap_or_default(),
        };
        Ok((secret, platform_key))
    }

    /// The request that makes the key blink for a BUTTON PRESS, with the
    /// in-flight exchange cancelled on failure so the key stops blinking.
    fn send(&mut self, request: &[u8]) -> Result<Vec<u8>, CeremonyError> {
        match self.cable.exchange(request, Some(TouchKind::Presence)) {
            Ok(body) => Ok(body),
            Err(error) => {
                self.cable.cancel();
                Err(failure_for(error))
            }
        }
    }

    fn client_data_json(&self, kind: ClientDataKind, challenge: &[u8]) -> String {
        client_data_json(kind, challenge, self.origin)
    }

    fn user_handle(&self, name: &str) -> Vec<u8> {
        let mut uuid = [0u8; 16];
        uuid.copy_from_slice(&self.host.random(16));
        user_handle(name, uuid)
    }
}

/// The clientDataJSON this client signs over — free-standing because the
/// Windows path builds the same envelope without a [`Cable`] (webauthn.dll
/// takes it as bytes and hashes it; it does not construct it).
///
/// The field ORDER is load-bearing twice over:
/// `webauthn::validate_client_data` matches a literal prefix, and
/// `registry_proof::build_member_proof` finds the `"type"` and `"challenge"`
/// offsets it reports to the registry contract. This is the same layout the
/// core's software group proof builds, so a member proof and a group proof
/// are the same shape.
pub fn client_data_json(kind: ClientDataKind, challenge: &[u8], origin: &str) -> String {
    let type_name = match kind {
        ClientDataKind::Create => "webauthn.create",
        ClientDataKind::Get => "webauthn.get",
    };
    format!(
        "{{\"type\":\"{}\",\"challenge\":\"{}\",\"origin\":\"{}\",\"crossOrigin\":false}}",
        type_name,
        primitives::to_base64url(challenge),
        origin
    )
}

/// `name ‖ NUL ‖ uuid`, the same 64-byte-capped user handle the web client
/// builds; `uuid` is 16 bytes of shell randomness, stamped v4 here. The core
/// validated the name against the same budget before the ceremony started
/// (`name_fits_user_handle`).
pub fn user_handle(name: &str, mut uuid: [u8; 16]) -> Vec<u8> {
    uuid[6] = (uuid[6] & 0x0f) | 0x40;
    uuid[8] = (uuid[8] & 0x3f) | 0x80;
    let hex = primitives::to_hex(&uuid, false);
    let formatted = format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32]
    );
    let mut handle = name.as_bytes().to_vec();
    handle.push(0);
    handle.extend_from_slice(formatted.as_bytes());
    handle
}

/// The name inside a `name‖NUL‖uuid` user handle.
///
/// Everything before the NUL and nothing else: the uuid exists to make two
/// wallets with the same name different, not to be read. A handle that is not
/// UTF-8, or has no NUL, yields nothing rather than garbage — a row with no
/// name still has its credential id.
pub fn wallet_name_from_handle(handle: &[u8]) -> String {
    let name = handle.split(|byte| *byte == 0).next().unwrap_or_default();
    String::from_utf8(name.to_vec()).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// WebAuthn caps `user.id` at 64 bytes, and the core validates the NAME
    /// against the remaining 27 before any ceremony starts. The envelope this
    /// builder adds is what makes those two numbers agree; if it grows, a name
    /// the core accepted produces a handle the authenticator refuses.
    #[test]
    fn the_user_handle_fits_the_webauthn_budget() {
        let longest = "x".repeat(64 - 37);
        let handle = user_handle(&longest, [0x11; 16]);
        assert_eq!(handle.len(), 64);
        assert_eq!(handle[longest.len()], 0, "the separator is a NUL");
    }

    /// The uuid tail is stamped v4 whatever bytes arrive — the other clients'
    /// `randomUUID()` produces the same shape, and the handle is stored and
    /// compared as bytes.
    #[test]
    fn the_uuid_tail_is_shaped_like_a_uuid_v4() {
        let handle = user_handle("Ann", [0xff; 16]);
        let uuid = std::str::from_utf8(&handle["Ann".len() + 1..]).unwrap_or_default();
        assert_eq!(uuid.len(), 36);
        assert_eq!(uuid.chars().filter(|ch| *ch == '-').count(), 4, "{uuid}");
        assert_eq!(uuid.as_bytes()[14], b'4', "version nibble: {uuid}");
        assert!(
            matches!(uuid.as_bytes()[19], b'8' | b'9' | b'a' | b'b'),
            "variant nibble: {uuid}"
        );
    }

    /// The picker's row label comes out of the user handle the credential was
    /// minted with, and only the part before the NUL. The uuid tail exists to
    /// make two same-named wallets different, not to be read; a handle that is
    /// not UTF-8 or has no NUL yields nothing rather than mojibake.
    #[test]
    fn a_wallet_name_is_the_handle_up_to_the_nul() {
        assert_eq!(
            wallet_name_from_handle(&user_handle("Everyday wallet", [7; 16])),
            "Everyday wallet"
        );
        assert_eq!(wallet_name_from_handle(b"no-nul-here"), "no-nul-here");
        assert_eq!(wallet_name_from_handle(&[]), "");
        assert_eq!(wallet_name_from_handle(&[0xff, 0xfe, 0x00, b'x']), "");
    }

    /// A key with no PIN and no biometric cannot make a wallet key, and both
    /// spellings of that sentence — with and without the product name — say
    /// what to do about it.
    #[test]
    fn a_key_with_no_pin_gets_an_instruction() {
        for failure in [
            no_pin("YubiKey 5C"),
            failure_for(CableError::Ctap(Status::PinNotSet)),
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
}
