//! The session machine, app-resident.
//!
//! One per process, outliving every screen — which on gpui means a `Global`
//! rather than an entity: the onboarding page hands a finished wallet to it and
//! then goes away, and the wallet page reads the active account from it without
//! knowing onboarding ever existed.
//!
//! `SessionView::allowed_route` is the route guard, and the split it encodes is
//! the point: **the core decides WHAT is allowed, the client decides WHEN to
//! navigate.** `main.rs` renders the route this reports and nothing else — it
//! never concludes "there is an account, so show the wallet", because during
//! the read there is no answer yet and `Loading` is how the core says so.
//!
//! ## Why this pump is synchronous
//!
//! Every session operation is a read or a write of one small local JSON file.
//! The web client does the same work against `localStorage` on its main thread;
//! moving it to a background task here would buy nothing measurable and would
//! introduce the one thing this module must not have — a window in which the
//! route is stale. The onboarding executor is the opposite case (USB, TLS, a
//! person's finger) and runs off-thread accordingly.

use gpui::{App, Global};

use vela_core::app::session::{Session, SessionView};
use vela_core::app::shell::CompletionMode;

use crate::core_host::CoreHost;
use crate::executor;

pub struct SessionState {
    host: CoreHost<Session>,
    view: SessionView,
}

impl Global for SessionState {}

impl SessionState {
    fn new() -> Self {
        let host = CoreHost::<Session>::new();
        let view = host.view();
        Self { host, view }
    }

    /// Drain the effect queue. Every operation answers immediately, so this
    /// runs to quiescence rather than leaving anything outstanding.
    fn pump(
        &mut self,
        mut pending: Vec<crate::core_host::Pending<vela_core::app::session::SessionOperation>>,
    ) {
        while let Some(next) = pending.pop() {
            let result = executor::perform_session(&next.operation);
            pending.extend(self.host.resolve(next.id, result));
        }
        self.view = self.host.view();
    }
}

/// Install the session and read storage. Called once, at startup.
pub fn boot(cx: &mut App) {
    let mut state = SessionState::new();
    let pending = state.host.dispatch(vela_core::app::session::Event::Boot);
    state.pump(pending);
    cx.set_global(state);
}

/// The current view. Cheap to clone; screens read it per frame.
pub fn view(cx: &App) -> SessionView {
    cx.try_global::<SessionState>()
        .map_or_else(|| SessionState::new().view, |state| state.view.clone())
}

/// The onboarding hand-off. Both machines exit through `CompleteOnboarding`,
/// and this is what receives it.
///
/// It is one of only two events the desktop can currently send. `SwitchAccount`
/// and the sign-out pair need an account switcher and a sign-out row, and the
/// desktop wallet page (spec 015) has neither yet — so they are absent rather
/// than present-and-uncallable. The OPERATIONS behind them are implemented in
/// `executor::perform_session`, so adding those controls is a screen change and
/// not a shell change.
pub fn account_established(mode: CompletionMode, cx: &mut App) {
    dispatch(
        vela_core::app::session::Event::AccountEstablished { mode },
        cx,
    );
}

fn dispatch(event: vela_core::app::session::Event, cx: &mut App) {
    if !cx.has_global::<SessionState>() {
        boot(cx);
    }
    let mut state = cx.remove_global::<SessionState>();
    let pending = state.host.dispatch(event);
    state.pump(pending);
    cx.set_global(state);
}
