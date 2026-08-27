//! The desktop's half of CTAP2: the cable.
//!
//! Everything about the PROTOCOL — framing, canonical CBOR, PIN/UV auth, what
//! a status byte means — lives in [`vela_core::ctap`], where the four other
//! clients can reach it. What lives here is the part that cannot be shared
//! because it is made of platform: enumerating HID devices, opening one, and
//! moving 64-byte reports.

pub mod cable;
pub mod usb;
