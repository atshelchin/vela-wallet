//! A CTAP2 client, with no I/O in it.
//!
//! Everything here is bytes in, bytes out. The transport — a USB HID cable, a
//! smart-card reader, a Bluetooth channel — belongs to a platform shell; what
//! belongs here is the part that is identical on every one of them: how a
//! request is framed, how a command is encoded, what a response means.
//!
//! ## Why this is in the core and not in the desktop app
//!
//! The desktop client is the first consumer because it has no system passkey
//! service at all, so talking to a security key directly is the only way it can
//! create a wallet. But it will not be the last: a wallet whose only key path
//! runs through an operating system's passkey service is a wallet that a lapsed
//! domain association can padlock, and the escape hatch from that is a passkey
//! path the app owns end to end on every platform.
//!
//! Written once in Rust, that path is one implementation. Written in the
//! shells, it is Kotlin plus Swift plus Rust plus TypeScript — four chances for
//! four wallets to disagree about what a signature covers.
//!
//! ## What lives where
//!
//! | Here | In the shell |
//! | --- | --- |
//! | CTAPHID framing, CBOR commands, COSE keys, PIN/UV protocols | opening the device, reading and writing reports |
//! | what a status byte means | when to retry |
//! | the challenge a signature covers | the ceremony's UI |
//!
//! No clock, no randomness, no allocation of a transport. A caller that needs
//! randomness passes it in, the same way the onboarding machines take theirs
//! from a shell result.

pub mod commands;
pub mod hid;
pub mod pin_uv;

pub use commands::{
    attestation_object, get_info_request, get_next_assertion_request, parse_client_pin,
    parse_get_assertion, parse_get_info, parse_make_credential, selection_request, split_response,
    AuthenticatorInfo, ClientPin, ClientPinResponse, ClientPinSubcommand, Command,
    CredentialDescriptor, GetAssertion, GetAssertionResponse, MakeCredential,
    MakeCredentialResponse, Permissions, PinUvAuth, Status,
};
pub use hid::{CtapHidCommand, Frames, HidError, HID_REPORT_SIZE};
pub use pin_uv::{pin_hash, PinUvAuthToken, Protocol, SharedSecret};
