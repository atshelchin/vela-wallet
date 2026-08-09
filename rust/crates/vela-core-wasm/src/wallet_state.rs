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

bridge_class!(
    /// Fee quoting + reserve math (spec 017 wave A): tier pricing, in-band
    /// quotes, sign-what-was-displayed guards.
    FeePolicyCore,
    vela_core::app::fee_policy::FeePolicy
);

bridge_class!(
    /// Never-unlimited approval guard and allowance editor.
    ApprovalGuardCore,
    vela_core::app::approval_guard::ApprovalGuard
);

bridge_class!(
    /// Clear-signing resolution pipeline and message risk verdicts.
    ClearSigningCore,
    vela_core::app::clear_signing::ClearSigning
);

bridge_class!(
    /// Post-submit transaction lifecycle / reconciliation.
    TxTrackerCore,
    vela_core::app::tx_tracker::TxTracker
);

bridge_class!(
    /// The address book: manual + history-derived merge, tombstones, groups.
    ContactsCore,
    vela_core::app::contacts::Contacts
);

bridge_class!(
    /// Payroll batch import: table interpretation, fiat conversion, caps.
    BatchImportCore,
    vela_core::app::batch_import::BatchImport
);
