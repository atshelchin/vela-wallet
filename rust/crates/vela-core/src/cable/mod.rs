//! The hybrid / caBLE v2 initiator — the "scan a QR with your phone" method
//! (CTAP 2.3 §11.5), sans-IO.
//!
//! This is the part that is identical on every platform: the QR payload, the
//! base10 digit encoding, the key derivations, the BLE advert decrypt, and the
//! tunnel-server domain decode. What is NOT here — because it is the shell's —
//! is the radio and the socket: scanning for BLE adverts, and opening the
//! WebSocket tunnel to the rendezvous server. Written once in Rust so five
//! platforms cannot disagree about what a caBLE handshake covers, the same
//! reason the CTAP2 ceremony lives in [`super::ctap`].
//!
//! Ported from the founder's on-device-proven demos
//! (`apppasskeysdemo` and `apppasskeysdemo-ios`), with webauthn-rs's
//! `cable/mod.rs` as the cross-check. The Noise handshake and the connection
//! state machine build on these foundations.

pub mod base10;
pub mod crypto;
pub mod tunnel_domain;
