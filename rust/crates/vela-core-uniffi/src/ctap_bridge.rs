//! The app-owned CTAP2 ceremony, exported to Kotlin (and Swift).
//!
//! The whole protocol — CTAPHID framing, the PIN/UV dance, `getNextAssertion`
//! enumeration, what a status byte means — lives in `vela_core::ctap` and runs
//! HERE, in Rust. The shell provides only two things across the FFI, and both
//! are pure platform work the core has no business doing:
//!
//! * [`UsbHidPort`] — move 64 bytes each way over `android.hardware.usb`, and
//!   own the read clock. A Kotlin object implements it.
//! * [`CtapCeremonyHost`] — the PIN dialog, the which-wallet picker, the
//!   platform CSPRNG, and one diagnostics line. A Kotlin object implements it.
//!
//! So an OEM whose system passkey sheet cannot reach a security key — a
//! GrapheneOS or CalyxOS phone, or any China-market device without full GMS —
//! creates and signs into a wallet with a hardware key anyway: no Google
//! service, no domain association, no OEM sheet. The ceremony that runs is
//! byte-for-byte the one the desktop runs, because it is the same code.

use std::sync::Arc;

use vela_core::ctap::apdu_cable::{ApduCable, ApduError, ApduPort};
use vela_core::ctap::ceremony::{self, CredentialChoice, Host, PinRequest, TouchKind};
use vela_core::ctap::hid::HID_REPORT_SIZE;
use vela_core::ctap::hid_cable::{HidCable, HidPort, PortError};

/// The relying party every Vela passkey is bound to — the same string the web
/// and desktop clients use. A passkey cannot move between relying parties, so
/// this is part of the wallet's identity: it lives in the bridge, not in the
/// shell, so Kotlin cannot get it wrong.
const RELYING_PARTY: &str = "getvela.app";
const RELYING_PARTY_NAME: &str = "Vela Wallet";
const ORIGIN: &str = "https://getvela.app";

// ---------------------------------------------------------------------------
// The two seams, as Kotlin sees them
// ---------------------------------------------------------------------------

/// One 64-byte-report USB conversation with one security key. Kotlin owns the
/// endpoints and the read timeout; the framing above it is the core's.
#[uniffi::export(with_foreign)]
pub trait UsbHidPort: Send + Sync {
    /// Write one 64-byte report (no report-id byte — Android's bulk transfer
    /// takes the raw HID packet). `Some(detail)` is a write failure.
    fn write_report(&self, report: Vec<u8>) -> Option<String>;
    /// Read one report, blocking up to the port's own read slice.
    fn read_report(&self) -> HidReadOutcome;
    fn product(&self) -> String;
    fn path(&self) -> String;
}

/// What one [`UsbHidPort::read_report`] produced. Not a `Result`, because
/// "nothing arrived in this slice" is the common case in the poll loop and must
/// not cost a thrown exception on every idle read.
#[derive(uniffi::Enum)]
pub enum HidReadOutcome {
    /// A full 64-byte report.
    Report { bytes: Vec<u8> },
    /// The read slice elapsed with nothing to read. The cable loops.
    WouldBlock,
    /// The overall exchange budget is spent — the key stopped answering.
    TimedOut,
    /// The transport failed in its own words.
    Failed { detail: String },
}

/// The person and the platform, as the ceremony sees them.
#[uniffi::export(with_foreign)]
pub trait CtapCeremonyHost: Send + Sync {
    /// Ask for the key's PIN. `None` is a dismissal (a cancellation).
    fn pin(&self, request: CtapPinRequest) -> Option<String>;
    /// One key answered for several wallets — which? `None` is a dismissal.
    fn pick(&self, choices: Vec<CtapCredentialChoice>) -> Option<u32>;
    /// Platform CSPRNG. Every value is a challenge, an IV or an ephemeral key.
    fn random(&self, len: u32) -> Vec<u8>;
    /// One diagnostics line (the `getInfo` summary) — VelaLog on Android.
    fn note(&self, line: String);
    /// The key is blinking and waiting for a finger or a button. `kind` is one
    /// of "presence" / "fingerprint" / "select".
    fn touch(&self, kind: String, product: String);
}

/// What the PIN dialog needs to say.
#[derive(uniffi::Record)]
pub struct CtapPinRequest {
    pub product: String,
    /// The device identity, so a PIN cache never hands one key's PIN to
    /// another. Not for display.
    pub device: String,
    /// Attempts left, when the key would say (`-1` when it would not — uniffi
    /// has no bare optional in a callback arg's ergonomics, so absence is the
    /// sentinel the Kotlin side already reads as "unknown").
    pub retries: i32,
    /// A previous attempt in this session was refused.
    pub retry: bool,
}

/// One wallet a key holds, for the picker.
#[derive(uniffi::Record)]
pub struct CtapCredentialChoice {
    pub name: String,
    pub credential_id: String,
    pub product: String,
}

// ---------------------------------------------------------------------------
// Results and failure
// ---------------------------------------------------------------------------

/// A completed registration, in the core's hex vocabulary. The attachment and
/// transports are what the USB path is by construction — a removable key.
#[derive(uniffi::Record)]
pub struct CtapRegistration {
    pub credential_id_hex: String,
    pub attestation_object_hex: String,
    pub client_data_json_hex: String,
    pub authenticator_attachment: String,
    pub transports: String,
}

/// A completed assertion.
#[derive(uniffi::Record)]
pub struct CtapAssertion {
    pub credential_id_hex: String,
    pub signature_der_hex: String,
    pub authenticator_data_hex: String,
    pub client_data_json_hex: String,
    /// Absent (empty) is a different fact from a present-but-empty handle; the
    /// core's name resolution branches on it. Empty here means absent.
    pub user_id_hex: String,
    pub authenticator_attachment: String,
}

/// A ceremony that produced no credential, already classified. `kind` is the
/// same four-way vocabulary the crux machines branch on
/// (`cancelled` / `not_supported` / `not_discoverable` / `other`), so the
/// Android executor forwards it as the shell result the core expects.
#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum CtapError {
    #[error("cancelled")]
    Cancelled,
    #[error("{detail}")]
    NotSupported { detail: String },
    #[error("{detail}")]
    NotDiscoverable { detail: String },
    #[error("{detail}")]
    Other { detail: String },
}

impl From<ceremony::CeremonyError> for CtapError {
    fn from(error: ceremony::CeremonyError) -> Self {
        let detail = error.message.unwrap_or_default();
        match error.kind {
            ceremony::FailureKind::Cancelled => CtapError::Cancelled,
            ceremony::FailureKind::NotSupported => CtapError::NotSupported { detail },
            ceremony::FailureKind::NotDiscoverable => CtapError::NotDiscoverable { detail },
            ceremony::FailureKind::Other => CtapError::Other { detail },
        }
    }
}

// ---------------------------------------------------------------------------
// Adapters: the FFI callbacks, wearing the core's traits
// ---------------------------------------------------------------------------

/// The Kotlin port, as the core's [`HidPort`]. The `&mut self` the core asks
/// for delegates to the callback's `&self`; the Kotlin object owns whatever
/// mutability it needs. `product`/`path` are captured at open, because the
/// core wants a borrow and the callback returns owned strings.
struct PortAdapter {
    inner: Arc<dyn UsbHidPort>,
    product: String,
    path: String,
}

impl HidPort for PortAdapter {
    fn write_report(&mut self, report: &[u8; HID_REPORT_SIZE]) -> Result<(), PortError> {
        match self.inner.write_report(report.to_vec()) {
            None => Ok(()),
            Some(detail) => Err(PortError::Io(detail)),
        }
    }

    fn read_report(&mut self) -> Result<[u8; HID_REPORT_SIZE], PortError> {
        match self.inner.read_report() {
            HidReadOutcome::Report { bytes } => {
                let array: [u8; HID_REPORT_SIZE] = bytes
                    .try_into()
                    .map_err(|_| PortError::Io("USB report was not 64 bytes".to_owned()))?;
                Ok(array)
            }
            HidReadOutcome::WouldBlock => Err(PortError::WouldBlock),
            HidReadOutcome::TimedOut => Err(PortError::TimedOut),
            HidReadOutcome::Failed { detail } => Err(PortError::Io(detail)),
        }
    }

    fn product(&self) -> &str {
        // The core wants a borrow; the callback returns an owned string. The
        // product is read once per get_info line and per failure sentence, so
        // caching it at open avoids a callback per borrow.
        &self.product
    }

    fn path(&self) -> &str {
        &self.path
    }
}

/// The Kotlin host, as the core's [`Host`].
struct HostAdapter {
    inner: Arc<dyn CtapCeremonyHost>,
}

impl Host for HostAdapter {
    fn pin(&self, request: PinRequest) -> Option<String> {
        self.inner.pin(CtapPinRequest {
            product: request.product,
            device: request.device,
            retries: request.retries.map(|r| r as i32).unwrap_or(-1),
            retry: request.retry,
        })
    }

    fn pick(&self, choices: Vec<CredentialChoice>) -> Option<usize> {
        let mapped = choices
            .into_iter()
            .map(|choice| CtapCredentialChoice {
                name: choice.name,
                credential_id: choice.credential_id,
                product: choice.product,
            })
            .collect();
        self.inner.pick(mapped).map(|index| index as usize)
    }

    fn random(&self, len: usize) -> Vec<u8> {
        self.inner.random(len as u32)
    }

    fn note(&self, line: &str) {
        self.inner.note(line.to_owned());
    }
}

// ---------------------------------------------------------------------------
// The exported ceremonies
// ---------------------------------------------------------------------------

/// Open the cable: INIT with a nonce the host supplies, wired to announce the
/// touch moment through the host. Shared by register and assert.
fn open_cable(
    port: Arc<dyn UsbHidPort>,
    host: Arc<dyn CtapCeremonyHost>,
) -> Result<HidCable<PortAdapter>, CtapError> {
    let adapter = PortAdapter {
        product: port.product(),
        path: port.path(),
        inner: port,
    };
    let nonce: [u8; 8] = host
        .random(8)
        .try_into()
        .map_err(|_| CtapError::Other {
            detail: "the host CSPRNG did not return 8 bytes".to_owned(),
        })?;
    let mut cable =
        HidCable::open(adapter, nonce).map_err(|error| CtapError::from(ceremony::failure_for(error)))?;
    let touch_host = Arc::clone(&host);
    cable.on_touch(Box::new(move |kind, product| {
        let name = match kind {
            TouchKind::Presence => "presence",
            TouchKind::Fingerprint => "fingerprint",
            TouchKind::Select => "select",
        };
        touch_host.touch(name.to_owned(), product.to_owned());
    }));
    Ok(cable)
}

/// `RegisterPasskey` over USB: mint a founding key on the plugged-in security
/// key. The touch, the PIN, the discoverability gate — all the core's; this
/// only carries the bytes and the prompts.
#[uniffi::export]
pub fn ctap_register(
    port: Arc<dyn UsbHidPort>,
    host: Arc<dyn CtapCeremonyHost>,
    name: String,
    exclude_credential_ids: Vec<String>,
) -> Result<CtapRegistration, CtapError> {
    let mut cable = open_cable(port, Arc::clone(&host))?;
    let host_adapter = HostAdapter { inner: host };
    let registration = ceremony::Client {
        cable: &mut cable,
        host: &host_adapter,
        rp_id: RELYING_PARTY,
        rp_name: RELYING_PARTY_NAME,
        origin: ORIGIN,
    }
    .register(&name, &exclude_credential_ids)?;

    Ok(CtapRegistration {
        credential_id_hex: registration.credential_id_hex,
        attestation_object_hex: registration.attestation_object_hex,
        client_data_json_hex: registration.client_data_json_hex,
        authenticator_attachment: "cross-platform".to_owned(),
        transports: "usb".to_owned(),
    })
}

/// `SignProof` / `SignMemberProof` / `AuthenticatePasskey` over USB: one
/// assertion. `credential_id_hex` empty is the "who are you?" sign-in ceremony.
#[uniffi::export]
pub fn ctap_assert(
    port: Arc<dyn UsbHidPort>,
    host: Arc<dyn CtapCeremonyHost>,
    challenge: Vec<u8>,
    credential_id_hex: String,
) -> Result<CtapAssertion, CtapError> {
    let mut cable = open_cable(port, Arc::clone(&host))?;
    let host_adapter = HostAdapter { inner: host };
    let pinned = if credential_id_hex.is_empty() {
        None
    } else {
        Some(credential_id_hex.as_str())
    };
    let assertion = ceremony::Client {
        cable: &mut cable,
        host: &host_adapter,
        rp_id: RELYING_PARTY,
        rp_name: RELYING_PARTY_NAME,
        origin: ORIGIN,
    }
    .assert(&challenge, pinned)?;

    Ok(CtapAssertion {
        credential_id_hex: assertion.credential_id_hex,
        signature_der_hex: assertion.signature_der_hex,
        authenticator_data_hex: assertion.authenticator_data_hex,
        client_data_json_hex: assertion.client_data_json_hex,
        user_id_hex: assertion.user_id_hex.unwrap_or_default(),
        authenticator_attachment: "cross-platform".to_owned(),
    })
}

// ---------------------------------------------------------------------------
// CCID / NFC — the APDU transport (iOS TKSmartCard, iOS/Android IsoDep)
// ---------------------------------------------------------------------------
//
// The same ceremony over the other FIDO binding: CTAP2 in ISO 7816 APDUs. The
// core's `ApduCable` owns the applet SELECT, the keepalive poll and the GET
// RESPONSE chaining; the shell owns only one call — transmit a command APDU,
// get its response bytes and status word back. iOS reaches a USB-C security key
// this way (CryptoTokenKit has no HID host, but it has a smart-card interface),
// and the same port serves NFC on both platforms.

/// One APDU exchange with one card. Kotlin/Swift owns the reader; the framing
/// above it is the core's.
#[uniffi::export(with_foreign)]
pub trait CcidPort: Send + Sync {
    /// Transmit one command APDU; return the full response INCLUDING the two
    /// trailing status-word bytes. No 61xx chaining or keepalive handling here.
    fn transmit(&self, apdu: Vec<u8>) -> ApduOutcome;
    /// Sleep the transport's keepalive poll interval (~100 ms). Called only
    /// between `0x9100` keepalives.
    fn poll_delay(&self);
    fn product(&self) -> String;
    fn path(&self) -> String;
}

/// What one [`CcidPort::transmit`] produced.
#[derive(uniffi::Enum)]
pub enum ApduOutcome {
    /// The response APDU, data followed by the two status-word bytes.
    Response { bytes: Vec<u8> },
    /// No reader or card is present.
    NoCard,
    /// The transport failed in its own words.
    Failed { detail: String },
}

/// The Kotlin/Swift card, as the core's [`ApduPort`].
struct CcidPortAdapter {
    inner: Arc<dyn CcidPort>,
    product: String,
    path: String,
}

impl ApduPort for CcidPortAdapter {
    fn transmit(&mut self, apdu: &[u8]) -> Result<Vec<u8>, ApduError> {
        match self.inner.transmit(apdu.to_vec()) {
            ApduOutcome::Response { bytes } => Ok(bytes),
            ApduOutcome::NoCard => Err(ApduError::NoCard),
            ApduOutcome::Failed { detail } => Err(ApduError::Io(detail)),
        }
    }

    fn poll_delay(&mut self) {
        self.inner.poll_delay();
    }

    fn product(&self) -> &str {
        &self.product
    }

    fn path(&self) -> &str {
        &self.path
    }
}

/// Open the APDU cable (SELECT the FIDO applet), wired to announce the touch
/// moment through the host. Shared by the two CCID ceremonies.
fn open_apdu_cable(
    port: Arc<dyn CcidPort>,
    host: Arc<dyn CtapCeremonyHost>,
) -> Result<ApduCable<CcidPortAdapter>, CtapError> {
    let adapter = CcidPortAdapter {
        product: port.product(),
        path: port.path(),
        inner: port,
    };
    let mut cable = ApduCable::open(adapter)
        .map_err(|error| CtapError::from(ceremony::failure_for(error)))?;
    let touch_host = Arc::clone(&host);
    cable.on_touch(Box::new(move |kind, product| {
        let name = match kind {
            TouchKind::Presence => "presence",
            TouchKind::Fingerprint => "fingerprint",
            TouchKind::Select => "select",
        };
        touch_host.touch(name.to_owned(), product.to_owned());
    }));
    Ok(cable)
}

/// `RegisterPasskey` over CCID/NFC: mint a founding key on the presented card.
#[uniffi::export]
pub fn ctap_register_ccid(
    port: Arc<dyn CcidPort>,
    host: Arc<dyn CtapCeremonyHost>,
    name: String,
    exclude_credential_ids: Vec<String>,
) -> Result<CtapRegistration, CtapError> {
    let mut cable = open_apdu_cable(port, Arc::clone(&host))?;
    let host_adapter = HostAdapter { inner: host };
    let registration = ceremony::Client {
        cable: &mut cable,
        host: &host_adapter,
        rp_id: RELYING_PARTY,
        rp_name: RELYING_PARTY_NAME,
        origin: ORIGIN,
    }
    .register(&name, &exclude_credential_ids)?;

    Ok(CtapRegistration {
        credential_id_hex: registration.credential_id_hex,
        attestation_object_hex: registration.attestation_object_hex,
        client_data_json_hex: registration.client_data_json_hex,
        // The card path reports NFC alongside USB — a CCID key is the same key
        // that answers over NFC, and both are removable transports.
        authenticator_attachment: "cross-platform".to_owned(),
        transports: "usb,nfc".to_owned(),
    })
}

/// One assertion over CCID/NFC. `credential_id_hex` empty is sign-in.
#[uniffi::export]
pub fn ctap_assert_ccid(
    port: Arc<dyn CcidPort>,
    host: Arc<dyn CtapCeremonyHost>,
    challenge: Vec<u8>,
    credential_id_hex: String,
) -> Result<CtapAssertion, CtapError> {
    let mut cable = open_apdu_cable(port, Arc::clone(&host))?;
    let host_adapter = HostAdapter { inner: host };
    let pinned = if credential_id_hex.is_empty() {
        None
    } else {
        Some(credential_id_hex.as_str())
    };
    let assertion = ceremony::Client {
        cable: &mut cable,
        host: &host_adapter,
        rp_id: RELYING_PARTY,
        rp_name: RELYING_PARTY_NAME,
        origin: ORIGIN,
    }
    .assert(&challenge, pinned)?;

    Ok(CtapAssertion {
        credential_id_hex: assertion.credential_id_hex,
        signature_der_hex: assertion.signature_der_hex,
        authenticator_data_hex: assertion.authenticator_data_hex,
        client_data_json_hex: assertion.client_data_json_hex,
        user_id_hex: assertion.user_id_hex.unwrap_or_default(),
        authenticator_attachment: "cross-platform".to_owned(),
    })
}
