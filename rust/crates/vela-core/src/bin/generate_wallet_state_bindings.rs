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
use vela_core::app::display_currency::{
    CurrencyOperation, CurrencyShellResult, CurrencyView, Event as CurrencyEvent,
};
use vela_core::app::payment_request::{
    Event as PaymentRequestEvent, PaymentRequestOperation, PaymentRequestShellResult,
    PaymentRequestView,
};
use vela_core::app::receive_watch::{
    Event as ReceiveWatchEvent, ReceiveWatchOperation, ReceiveWatchShellResult, ReceiveWatchView,
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

    println!("wallet-state bindings written to {}", out_dir.display());
    Ok(())
}
