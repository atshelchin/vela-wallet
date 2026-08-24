//! The two things a ceremony has to say to a screen, and the one thing a screen
//! has to say back.
//!
//! A CTAP2 ceremony runs on a background thread: it opens a device, waits for a
//! finger, does TLS. Two moments inside it belong on screen — "the key is
//! blinking" and "this key wants its PIN" — and neither is something the core
//! knows about, because the core has no idea a cable exists. So they travel on
//! this channel instead of through `ShellOperation`.
//!
//! ## Why the PIN is not a core prompt
//!
//! `PromptKind` is the vocabulary of decisions the MACHINE branches on. A PIN
//! is not one: whether a particular authenticator has one, and how many
//! attempts it has left, are facts about a piece of hardware on one desk. A
//! shell that pushed them into the core would be asking four other clients —
//! three of which never see an authenticator directly — to carry a concept they
//! cannot have.
//!
//! ## Why the ceremony thread blocks
//!
//! Because it is holding the device open. The authenticator's PIN session is
//! per-connection: releasing it to go and ask a question would mean re-opening,
//! re-agreeing a shared secret, and spending one of a small number of PIN
//! attempts on a retry that was never refused. Blocking on a condvar until the
//! person answers is what keeps one attempt one attempt.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};

use crate::executor::passkey::{Ceremony, PinRequest};

#[derive(Default)]
struct PinState {
    /// Set by the ceremony thread; taken by the screen.
    asking: Option<PinRequest>,
    /// Set by the screen; taken by the ceremony thread. The outer `Option` is
    /// "has an answer arrived", the inner is "was it a PIN or a dismissal".
    answer: Option<Option<String>>,
    /// The PIN already given during this flow.
    ///
    /// Reused without asking again — a wallet with three founding keys on one
    /// authenticator would otherwise ask three times for the same digits. It is
    /// dropped the moment an attempt is REFUSED, so a mistyped PIN is never
    /// silently retried, and again when the flow closes.
    cached: Option<String>,
    /// The flow went away. A ceremony still blocked here must stop waiting
    /// rather than hold a thread until the process exits.
    closed: bool,
}

/// Shared between the screen and whatever ceremony is currently running.
#[derive(Default)]
pub struct CeremonyChannel {
    touch: AtomicBool,
    pin: Mutex<PinState>,
    answered: Condvar,
}

impl CeremonyChannel {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    /// The executor-facing handle.
    pub fn ceremony(self: &Arc<Self>) -> Ceremony {
        let touch_channel = Arc::clone(self);
        let pin_channel = Arc::clone(self);
        Ceremony {
            touch: Arc::new(move |waiting| {
                touch_channel.touch.store(waiting, Ordering::Relaxed);
            }),
            pin: Arc::new(move |request| pin_channel.request_pin(request)),
        }
    }

    /// Is a key waiting for a finger right now?
    pub fn touch_waiting(&self) -> bool {
        self.touch.load(Ordering::Relaxed)
    }

    /// Called on the ceremony thread. Blocks until the screen answers.
    fn request_pin(&self, request: PinRequest) -> Option<String> {
        let Ok(mut state) = self.pin.lock() else {
            return None;
        };
        if state.closed {
            return None;
        }
        // A refused attempt invalidates whatever is cached: it was wrong, and
        // replaying it would spend the next attempt on the same mistake.
        if request.retry {
            state.cached = None;
        } else if let Some(cached) = &state.cached {
            return Some(cached.clone());
        }

        state.asking = Some(request);
        state.answer = None;
        loop {
            if state.closed {
                return None;
            }
            if let Some(answer) = state.answer.take() {
                state.asking = None;
                state.cached = answer.clone();
                return answer;
            }
            let Ok(next) = self.answered.wait(state) else {
                return None;
            };
            state = next;
        }
    }

    /// Called on the UI thread each tick: is a PIN being asked for?
    pub fn pending_pin(&self) -> Option<PinRequest> {
        self.pin.lock().ok()?.asking.clone()
    }

    /// Called on the UI thread. `None` is a dismissal, which the ceremony reads
    /// as a cancellation.
    pub fn answer_pin(&self, value: Option<String>) {
        if let Ok(mut state) = self.pin.lock() {
            state.answer = Some(value);
        }
        self.answered.notify_all();
    }

    /// The flow is leaving. Releases anything still blocked, and forgets the
    /// PIN — a cached secret outliving the screen that collected it is a
    /// secret nobody agreed to leave lying around.
    pub fn close(&self) {
        if let Ok(mut state) = self.pin.lock() {
            state.closed = true;
            state.cached = None;
            state.asking = None;
            state.answer = Some(None);
        }
        self.touch.store(false, Ordering::Relaxed);
        self.answered.notify_all();
    }
}
