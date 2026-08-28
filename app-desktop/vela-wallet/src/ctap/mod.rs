//! The desktop's half of CTAP2: the cable.
//!
//! Everything about the PROTOCOL — framing, canonical CBOR, PIN/UV auth, what
//! a status byte means — lives in [`vela_core::ctap`], where the four other
//! clients can reach it. What lives here is the part that cannot be shared
//! because it is made of platform: enumerating HID devices, opening one, and
//! moving 64-byte reports.

pub mod cable;

/// The smart-card wire to the same removable key. Not Linux — see the `pcsc`
/// entry in `Cargo.toml` for why that one platform pays a system dependency the
/// other two do not.
#[cfg(not(target_os = "linux"))]
pub mod ccid;

/// Compiled everywhere, reachable on two of three.
///
/// Windows will not let a non-elevated process open a FIDO HID device, so
/// nothing on this desktop ever calls the enumerate-and-open half of this
/// module there — `executor::passkey` hands that ceremony to `webauthn.dll`.
/// It still COMPILES on Windows (hidapi's Win32 backend builds fine), and it
/// still exports the touch types the shared `Ceremony` is made of, so the
/// module stays whole and the dead half is declared dead rather than cfg'd
/// into a second shape of this file.
#[cfg_attr(windows, allow(dead_code))]
pub mod usb;
