//! Emit the TypeScript mirrors of the wallet-state Core ↔ Shell wire types
//! (spec 016-crux-wallet-state).
//!
//! Same discipline as the onboarding generator: the boundary is JSON, so this
//! is what keeps both sides honest about every variant. Output is committed
//! and drift-gated.
//!
//! Run through `node rust/scripts/gen-core-types.mjs` (which adds the
//! `--check` gate), not directly.

use std::{env, error::Error, fs, path::PathBuf};

use ts_rs::{Config, TS};
use vela_core::app::approval_guard::{
    Event as GuardEvent, GuardOperation, GuardShellResult, GuardView,
};
use vela_core::app::batch_import::{
    BatchOperation, BatchShellResult, BatchView, Event as BatchImportEvent,
};
use vela_core::app::clear_signing::{
    ClearOperation, ClearShellResult, ClearSigningView, Event as ClearSigningEvent,
};
use vela_core::app::contacts::{
    ContactOperation, ContactShellResult, ContactsView, Event as ContactEvent,
};
use vela_core::app::display_currency::{
    CurrencyOperation, CurrencyShellResult, CurrencyView, Event as CurrencyEvent,
};
use vela_core::app::fee_policy::{Event as FeeEvent, FeeOperation, FeeShellResult, FeeView};
use vela_core::app::payment_request::{
    Event as PaymentRequestEvent, PaymentRequestOperation, PaymentRequestShellResult,
    PaymentRequestView,
};
use vela_core::app::receive_watch::{
    Event as ReceiveWatchEvent, ReceiveWatchOperation, ReceiveWatchShellResult, ReceiveWatchView,
};
use vela_core::app::tx_tracker::{
    Event as TrackEvent, TrackOperation, TrackShellResult, TrackView,
};

fn main() -> Result<(), Box<dyn Error>> {
    let out_dir = match env::args().nth(1) {
        Some(path) => PathBuf::from(path),
        None => PathBuf::from(env::var("CARGO_MANIFEST_DIR")?)
            .join("../../../src/services/wallet-state-core/generated"),
    };
    fs::create_dir_all(&out_dir)?;

    // `export_all` walks nested types, so these twelve roots cover the whole
    // surface: events in, operations out, results back, view models rendered.
    let config = Config::new().with_out_dir(&out_dir);
    CurrencyEvent::export_all(&config)?;
    CurrencyOperation::export_all(&config)?;
    CurrencyShellResult::export_all(&config)?;
    CurrencyView::export_all(&config)?;
    ReceiveWatchEvent::export_all(&config)?;
    ReceiveWatchOperation::export_all(&config)?;
    ReceiveWatchShellResult::export_all(&config)?;
    ReceiveWatchView::export_all(&config)?;
    PaymentRequestEvent::export_all(&config)?;
    PaymentRequestOperation::export_all(&config)?;
    PaymentRequestShellResult::export_all(&config)?;
    PaymentRequestView::export_all(&config)?;
    FeeEvent::export_all(&config)?;
    FeeOperation::export_all(&config)?;
    FeeShellResult::export_all(&config)?;
    FeeView::export_all(&config)?;
    GuardEvent::export_all(&config)?;
    GuardOperation::export_all(&config)?;
    GuardShellResult::export_all(&config)?;
    GuardView::export_all(&config)?;
    ClearSigningEvent::export_all(&config)?;
    ClearOperation::export_all(&config)?;
    ClearShellResult::export_all(&config)?;
    ClearSigningView::export_all(&config)?;
    TrackEvent::export_all(&config)?;
    TrackOperation::export_all(&config)?;
    TrackShellResult::export_all(&config)?;
    TrackView::export_all(&config)?;
    ContactEvent::export_all(&config)?;
    ContactOperation::export_all(&config)?;
    ContactShellResult::export_all(&config)?;
    ContactsView::export_all(&config)?;
    BatchImportEvent::export_all(&config)?;
    BatchOperation::export_all(&config)?;
    BatchShellResult::export_all(&config)?;
    BatchView::export_all(&config)?;

    println!("wallet-state bindings written to {}", out_dir.display());
    Ok(())
}
