//! wasm-bindgen bridge over the onboarding state machines.
//!
//! Deliberately thin: JSON in, JSON out, no business logic. The shape is the
//! one `crux-demo` uses — `dispatch` / `resolve_effect` / `view`, with a
//! monotonic effect id the web effect loop uses to correlate answers.
//!
//! ```text
//! dispatch(event_json) ─► { view, effects: [{ id, operation }], cancelled_effect_ids }
//! resolve_effect(id, result_json) ─► same shape
//! ```
//!
//! Since spec 016 the bridge itself lives in [`crate::bridge`], shared with
//! the wallet-state machines; these two classes keep their 011 names and wire
//! behavior exactly. See
//! `specs/011-crux-onboarding-state/contracts/onboarding-core.md`.

use crate::bridge::bridge_class;

bridge_class!(
    /// Creating a wallet: register → prove signing → derive → sync → save.
    CreateWalletCore,
    vela_core::app::create_wallet::CreateWallet
);

bridge_class!(
    /// Signing in with an existing passkey, including on-device recovery.
    LoginCore,
    vela_core::app::login::Login
);
