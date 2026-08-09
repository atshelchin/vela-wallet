//! wasm classes for the wallet-state machines (spec 016-crux-wallet-state).
//!
//! Each is the shared [`crate::bridge::Bridge`] over one machine — JSON in,
//! JSON out, no business logic here. See
//! `specs/016-crux-wallet-state/contracts/wallet-state-core.md`.

use crate::bridge::bridge_class;

bridge_class!(
    /// The display currency: atomic code+rate pair, first-launch region seed,
    /// user-choice-wins.
    DisplayCurrencyCore,
    vela_core::app::display_currency::DisplayCurrency
);

bridge_class!(
    /// Deposit detection on the Receive screen: phased polling, baseline
    /// diff, false-positive guards.
    ReceiveWatchCore,
    vela_core::app::receive_watch::ReceiveWatch
);

bridge_class!(
    /// Payment requests: the acknowledge gate, the EIP-681/pay-link builder,
    /// and the strict `/pay` validator.
    PaymentRequestCore,
    vela_core::app::payment_request::PaymentRequest
);
