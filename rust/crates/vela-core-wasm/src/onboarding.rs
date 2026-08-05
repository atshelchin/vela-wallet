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
//! Both classes are the same code over different apps; see
//! `specs/011-crux-onboarding-state/contracts/onboarding-core.md`.

use std::collections::HashMap;

use crux_core::{App, Core, Request};
use serde::de::DeserializeOwned;
use serde::Serialize;
use wasm_bindgen::prelude::*;

use vela_core::app::create_wallet::CreateWallet;
use vela_core::app::login::Login;
use vela_core::app::shell::{Effect, ShellOperation, ShellResult};

#[derive(Serialize)]
struct DispatchResult {
    view: serde_json::Value,
    effects: Vec<ShellEffect>,
    /// Always empty today: the machines guarantee one in-flight operation per
    /// flow and drop stale answers by attempt, so the shell is never asked to
    /// abort. Kept in the payload because the shared effect loop reads it.
    cancelled_effect_ids: Vec<u64>,
}

#[derive(Serialize)]
struct ShellEffect {
    id: u64,
    operation: ShellOperation,
}

/// The generic half. `#[wasm_bindgen]` cannot export generics, so the two
/// exported classes below are thin wrappers over this.
struct Bridge<A>
where
    A: App<Effect = Effect> + Default,
    A::Model: Default,
{
    core: Core<A>,
    pending: HashMap<u64, Request<ShellOperation>>,
    next_effect_id: u64,
}

impl<A> Bridge<A>
where
    A: App<Effect = Effect> + Default,
    A::Model: Default,
    A::Event: DeserializeOwned,
    A::ViewModel: Serialize,
{
    fn new() -> Self {
        Self {
            core: Core::new(),
            pending: HashMap::new(),
            next_effect_id: 0,
        }
    }

    fn dispatch(&mut self, event_json: &str) -> Result<String, JsValue> {
        let event: A::Event = serde_json::from_str(event_json)
            .map_err(|error| JsValue::from_str(&format!("invalid event from shell: {error}")))?;
        let effects = self.core.process_event(event);
        self.serialize(effects)
    }

    fn resolve_effect(&mut self, effect_id: u64, result_json: &str) -> Result<String, JsValue> {
        let result: ShellResult = serde_json::from_str(result_json)
            .map_err(|error| JsValue::from_str(&format!("invalid result from shell: {error}")))?;

        // An unknown id means the answer outlived the question — the shell
        // resolved an operation that was already abandoned. Expected, not a
        // fault: report the current view and change nothing.
        let Some(mut request) = self.pending.remove(&effect_id) else {
            return self.serialize(Vec::new());
        };

        match self.core.resolve(&mut request, result) {
            Ok(effects) => self.serialize(effects),
            // Same story one layer down: the command that owned this request was
            // aborted before the answer arrived.
            Err(_) => self.serialize(Vec::new()),
        }
    }

    fn view(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.core.view())
            .map_err(|error| JsValue::from_str(&format!("could not serialize view: {error}")))
    }

    fn serialize(&mut self, effects: Vec<Effect>) -> Result<String, JsValue> {
        let mut shell_effects = Vec::new();
        for effect in effects {
            match effect {
                Effect::Render(_) => {}
                Effect::Shell(request) => {
                    self.next_effect_id += 1;
                    let id = self.next_effect_id;
                    let operation = request.operation.clone();
                    self.pending.insert(id, request);
                    shell_effects.push(ShellEffect { id, operation });
                }
            }
        }

        let view = serde_json::to_value(self.core.view())
            .map_err(|error| JsValue::from_str(&format!("could not serialize view: {error}")))?;
        serde_json::to_string(&DispatchResult {
            view,
            effects: shell_effects,
            cancelled_effect_ids: Vec::new(),
        })
        .map_err(|error| JsValue::from_str(&format!("could not serialize result: {error}")))
    }
}

/// Creating a wallet: register → prove signing → derive → sync → save.
#[wasm_bindgen]
pub struct CreateWalletCore(Bridge<CreateWallet>);

#[wasm_bindgen]
impl CreateWalletCore {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self(Bridge::new())
    }

    pub fn dispatch(&mut self, event_json: &str) -> Result<String, JsValue> {
        self.0.dispatch(event_json)
    }

    pub fn resolve_effect(&mut self, effect_id: u64, result_json: &str) -> Result<String, JsValue> {
        self.0.resolve_effect(effect_id, result_json)
    }

    pub fn view(&self) -> Result<String, JsValue> {
        self.0.view()
    }
}

impl Default for CreateWalletCore {
    fn default() -> Self {
        Self::new()
    }
}

/// Signing in with an existing passkey, including on-device recovery.
#[wasm_bindgen]
pub struct LoginCore(Bridge<Login>);

#[wasm_bindgen]
impl LoginCore {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self(Bridge::new())
    }

    pub fn dispatch(&mut self, event_json: &str) -> Result<String, JsValue> {
        self.0.dispatch(event_json)
    }

    pub fn resolve_effect(&mut self, effect_id: u64, result_json: &str) -> Result<String, JsValue> {
        self.0.resolve_effect(effect_id, result_json)
    }

    pub fn view(&self) -> Result<String, JsValue> {
        self.0.view()
    }
}

impl Default for LoginCore {
    fn default() -> Self {
        Self::new()
    }
}
