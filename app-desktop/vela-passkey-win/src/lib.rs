//! The Windows WebAuthn API — the one place the wallet asks an operating
//! system to run a passkey ceremony on its behalf.
//!
//! ## Why this exists at all
//!
//! Everywhere else, the desktop client talks to security keys itself, because
//! no desktop offers it a passkey service. Windows is the exception, and not by
//! preference: **since Windows 10 build 1903 a non-elevated process cannot open
//! a FIDO HID device.** The OS reserves them for `webauthn.dll`. That is why
//! `libfido2` uses this same API on Windows rather than its own HID backend,
//! and why `fido-key-manager` ships an elevation manifest — asking someone to
//! run their wallet as Administrator is not an answer.
//!
//! So on Windows the platform's CTAP client is the only route. Everything the
//! `ctap/` module does on macOS and Linux — choosing a device, the touch
//! prompt, the PIN prompt, enumerating credentials, the picker — Windows does
//! itself, in its own dialog. That is a smaller surface, not a bigger one.
//!
//! It also arrives with something the CTAP2 path cannot have: **Windows Hello**.
//! A person with a fingerprint reader and no security key can use this wallet,
//! which on macOS and Linux they currently cannot.
//!
//! ## What is NOT delegated
//!
//! The clientDataJSON. Windows takes it as a byte buffer and hashes it; it does
//! not build it. So the same `client_data_json()` this wallet uses for CTAP2
//! builds it here too, and the join with the core's parsers — the property that
//! a key minted on any platform derives the same address — survives untouched.
//!
//! ## Pointer discipline
//!
//! Every `WEBAUTHN_*` request struct holds bare pointers into buffers this
//! crate owns. They are held in `Pin<Box<..>>` and kept alive across the call
//! by name, never by luck: a temporary that drops at the end of its statement
//! leaves the API reading freed memory. The shape is borrowed from
//! `webauthn-authenticator-rs`, which learned it the same way everyone does.
//!
//! ## Verification status
//!
//! **Type-checked for Windows, never run on it.** Nobody on this project has a
//! Windows machine yet. Every struct field and signature below is checked by
//! `cargo check --target x86_64-pc-windows-gnu`; none of the behaviour is
//! confirmed. Treat the first run on real hardware as the real review.

#![cfg_attr(not(windows), allow(dead_code))]

/// A completed registration, as bytes.
#[derive(Debug, Clone)]
pub struct Registered {
    pub credential_id: Vec<u8>,
    pub attestation_object: Vec<u8>,
    /// Echoed back rather than rebuilt: what was SIGNED is what must be stored.
    pub client_data_json: String,
    /// `usb`, `nfc`, `ble`, `internal`, `hybrid` — whichever Windows says it
    /// used. Empty when it declines to say.
    pub transport: String,
    /// `platform` when Windows Hello answered, `cross-platform` for a security
    /// key, empty when unknown.
    pub attachment: String,
}

/// A completed assertion, as bytes.
#[derive(Debug, Clone)]
pub struct Asserted {
    pub credential_id: Vec<u8>,
    pub authenticator_data: Vec<u8>,
    /// DER, as the authenticator produced it. Normalisation belongs to the
    /// core, which already does it for every other path.
    pub signature: Vec<u8>,
    /// The user handle, when one came back. Absent is a different fact from
    /// empty, and the core's name resolution branches on it.
    pub user_id: Option<Vec<u8>>,
    pub client_data_json: String,
}

/// What went wrong, in the vocabulary the shell already classifies by.
///
/// Windows answers with an `HRESULT`, and `WebAuthNGetErrorName` turns that
/// into the WebAuthn DOM exception name a browser would have raised —
/// `NotAllowedError`, `InvalidStateError`, `NotSupportedError`. That is a
/// better mapping than guessing at numbers, and it is the same vocabulary the
/// web client's `classify()` already reads.
#[derive(Debug, Clone)]
pub enum WinError {
    /// The API is not present — a Windows older than 10 build 1903.
    Unavailable,
    /// The person declined, or the dialog timed out waiting for them.
    Cancelled,
    /// The chosen authenticator already holds an excluded credential.
    AlreadyRegistered,
    /// No authenticator this request can use.
    NotSupported,
    /// Anything else, with Windows' own words.
    Other(String),
}

impl core::fmt::Display for WinError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Unavailable => write!(
                f,
                "this version of Windows has no WebAuthn API (Windows 10 build 1903 or later is required)"
            ),
            Self::Cancelled => write!(f, "the request was declined"),
            Self::AlreadyRegistered => write!(
                f,
                "that authenticator already holds one of this wallet's keys"
            ),
            Self::NotSupported => write!(f, "no usable authenticator"),
            Self::Other(message) => write!(f, "{message}"),
        }
    }
}

/// How long Windows waits for the person before giving up.
///
/// Matches the CTAP2 path's own exchange budget, so the two platforms feel the
/// same and neither is the one that "gives up too fast".
pub const TIMEOUT_MS: u32 = 120_000;

#[cfg(windows)]
mod api;

#[cfg(windows)]
pub use api::{assert, register, supported};

#[cfg(windows)]
mod wire;

#[cfg(windows)]
pub use wire::{assertion_from, registration_from};

/// Off Windows this crate compiles to nothing callable, so the desktop app can
/// depend on it unconditionally and let `cfg` decide at the call site.
#[cfg(not(windows))]
pub fn supported() -> bool {
    false
}
