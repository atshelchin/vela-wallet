//! Emit the TypeScript mirrors of the session machine's wire types.
//!
//! `app/session.rs` is the app-resident machine both onboarding flows hand the
//! wallet to (`CompleteOnboarding` → `AccountEstablished`), so a shell that
//! implements onboarding needs its vocabulary and nothing else. The Expo client
//! already receives these types inside the 311-file wallet-state bundle;
//! emitting them separately lets a shell that has only wired onboarding take
//! four types instead of three hundred.
//!
//! Both outputs are generated from the same Rust, so they cannot drift — which
//! is the whole reason this is a generator entry rather than a hand-copy.
//!
//! Run through `node rust/scripts/gen-core-types.mjs` (which adds the `--check`
//! drift gate), not directly.

use std::{env, error::Error, fs, path::PathBuf};

use ts_rs::{Config, TS};
use vela_core::app::session::{
    Event as SessionEvent, SessionOperation, SessionShellResult, SessionView,
};

fn main() -> Result<(), Box<dyn Error>> {
    let out_dir = match env::args().nth(1) {
        Some(path) => PathBuf::from(path),
        None => PathBuf::from(env::var("CARGO_MANIFEST_DIR")?)
            .join("../../../app-web/vela-wallet/src/lib/session/generated"),
    };
    fs::create_dir_all(&out_dir)?;

    // `export_all` walks nested types, so these four roots cover the surface:
    // events in, operations out, results back, view model rendered.
    let config = Config::new().with_out_dir(&out_dir);
    SessionEvent::export_all(&config)?;
    SessionOperation::export_all(&config)?;
    SessionShellResult::export_all(&config)?;
    SessionView::export_all(&config)?;

    println!("session bindings written to {}", out_dir.display());
    Ok(())
}
