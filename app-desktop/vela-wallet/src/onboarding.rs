//! Welcome, and the two ways in.
//!
//! One column at every width: brand, headline, and two buttons. Spec 014's
//! two-column layout — feature-card grid on the left, action panel on the
//! right, flow swapped in place — is gone. The v2 design makes the flow a full
//! page of its own, so there is no second pane for anything to swap into.
//!
//! **Creating a wallet is a stepped journey and takes over the page.** Signing
//! in has no steps — one ceremony, and you are either in or you are not — so it
//! runs here, and speaks only through the button's busy state and the failure
//! sheet.
//!
//! ## What this page owns
//!
//! Both onboarding machines, the ceremony channel that carries "touch your key"
//! and "type your PIN" up from a background thread, the failure sheet, and the
//! endpoint surface. It is the whole shell for onboarding; `main.rs` decides
//! only whether onboarding is the route at all.

use std::rc::Rc;
use std::sync::Arc;

use gpui::{
    App, Context, Div, FocusHandle, FontWeight, InteractiveElement as _, IntoElement, KeyDownEvent,
    MouseButton, ParentElement, Render, SharedString, Stateful, StatefulInteractiveElement as _,
    Styled, Task, Window, WindowControlArea, div, px,
};

use vela_core::app::create_wallet::{CreateView, CreateWallet};
use vela_core::app::login::{Login, LoginView};
use vela_core::app::shell::{ShellOperation, ShellResult};

use crate::ceremony::CeremonyChannel;
use crate::core_host::{CoreHost, Pending};
use crate::executor::{self, Performed, passkey::PinRequest, registry, storage};
use crate::loc::Loc;
use crate::onboarding_flow::{FLOW_COLUMN_W, FlowEvent, FlowHost, FlowSink, render_create_flow};
use crate::outcome::{ActionId, Prompt, SHEET_PAD, SHEET_RADIUS, SHEET_W, outcome_sheet};
use crate::session;
use crate::theme::{
    self, FLOW_GAP_LG, FLOW_GAP_MD, GAP_BRAND_TAGLINE, GAP_BUTTONS, GAP_LOGO_WORDMARK, LOGO_SIZE,
    Theme, ThemeMode,
};
use crate::ui::{
    ButtonVariant, LaunchAnimation, NameFieldStrings, text_field, vela_button, vela_button_opts,
    vela_mark,
};
use crate::window_frame::{FRAME_SHADOW, frame_tiling, round_to_frame, window_frame};

/// Height of the drag strip under client-side decorations.
const DRAG_STRIP_H: f32 = 96.;

/// How often the screen looks at the ceremony channel while work is in flight.
///
/// A poll rather than a wake-up because the two facts it carries originate on a
/// thread that is blocked inside a USB read — it has no gpui handle to notify
/// with, and giving it one would mean holding an app context across an await
/// inside a synchronous CTAP2 exchange. 120 ms is well under the threshold at
/// which a "touch your key" line reads as late, and the loop stops the moment
/// both machines go idle.
const CEREMONY_TICK_MS: u64 = 120;

/// Which machine a prompt belongs to. A prompt is an effect the CORE is waiting
/// on, so answering it has to reach the right one.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Machine {
    Create,
    Login,
}

/// The endpoint surface's editable state.
struct EndpointSurface {
    url: String,
    focus: FocusHandle,
    /// Opened by the health probe rather than by a press. Dismissing it must
    /// not re-open it on the next frame, so the automatic open happens once.
    automatic: bool,
}

/// The PIN dialog's state. `request` is what the authenticator told us about
/// itself; `value` is what the person has typed so far.
struct PinDialog {
    request: PinRequest,
    value: String,
    focus: FocusHandle,
}

pub struct OnboardingPage {
    mode: ThemeMode,
    loc: Loc,
    focus_handle: FocusHandle,
    drag_pending: bool,
    launch: Option<LaunchAnimation>,

    /// The create journey has taken over the page.
    creating: bool,
    create: CoreHost<CreateWallet>,
    create_view: CreateView,
    name_focus: FocusHandle,
    picker_open: bool,
    copied: bool,

    login: CoreHost<Login>,
    login_view: LoginView,

    channel: Arc<CeremonyChannel>,
    /// The one modal. `Some` ⇒ a machine is waiting for an answer.
    prompt: Option<(Machine, Prompt)>,
    pin: Option<PinDialog>,
    endpoint: Option<EndpointSurface>,
    /// The ceremony-channel poll, while it is running.
    watcher: Option<Task<()>>,
}

impl OnboardingPage {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let loc = Loc::from_env();
        eprintln!(
            "[vela-wallet] onboarding: locale resolved to `{}`",
            loc.language()
        );

        // Restyle when the OS appearance flips, unless VELA_THEME pins it.
        let page = cx.weak_entity();
        window
            .observe_window_appearance(move |window, cx| {
                if ThemeMode::is_pinned() {
                    return;
                }
                let mode = ThemeMode::detect(window);
                if let Some(page) = page.upgrade() {
                    page.update(cx, |this, cx| {
                        this.mode = mode;
                        cx.notify();
                    });
                }
            })
            .detach();

        let mode = ThemeMode::detect(window);
        let focus_handle = cx.focus_handle();
        focus_handle.focus(window, cx);

        // A saved endpoint override is the person's, and it applies before the
        // first probe — otherwise the health check tests the default and the
        // sign-in tests theirs.
        if let Some(url) = storage::load_registry_endpoint() {
            registry::set_registry_url(&url);
        }

        let create = CoreHost::<CreateWallet>::new();
        let login = CoreHost::<Login>::new();
        let create_view = create.view();
        let login_view = login.view();

        let mut page = Self {
            launch: if theme::launch_disabled() {
                None
            } else {
                Some(LaunchAnimation::new(mode, cx))
            },
            mode,
            loc,
            focus_handle,
            drag_pending: false,
            creating: false,
            create,
            create_view,
            name_focus: cx.focus_handle(),
            picker_open: false,
            copied: false,
            login,
            login_view,
            channel: CeremonyChannel::new(),
            prompt: None,
            pin: None,
            endpoint: None,
            watcher: None,
        };

        // The reachability probe starts with the page. On the web this waits
        // for a press because the core is a 3.4 MB download; here it is already
        // in the binary, so the person learns the index is unreachable BEFORE
        // they press a button rather than after.
        let pending = page.login.dispatch(vela_core::app::login::Event::Start);
        page.pump_login(pending, cx);
        page
    }

    // -- the two entrances --------------------------------------------------

    fn start_create(&mut self, cx: &mut Context<Self>) {
        self.creating = true;
        self.picker_open = false;
        self.copied = false;
        let pending = self
            .create
            .dispatch(vela_core::app::create_wallet::Event::Start);
        self.pump_create(pending, cx);
        cx.notify();
    }

    fn sign_in(&mut self, cx: &mut Context<Self>) {
        if self.login_view.busy {
            return;
        }
        let pending = self.login.dispatch(vela_core::app::login::Event::SignIn);
        self.pump_login(pending, cx);
        cx.notify();
    }

    /// Leaving the create journey. The core is discarded WITH its drafts, which
    /// is why this is only reachable from a screen that has none in flight —
    /// `render_create_flow` withholds the back affordance during progress.
    fn leave_create(&mut self, cx: &mut Context<Self>) {
        self.channel.close();
        self.channel = CeremonyChannel::new();
        self.create = CoreHost::<CreateWallet>::new();
        self.create_view = self.create.view();
        self.creating = false;
        self.picker_open = false;
        self.prompt = None;
        self.pin = None;
        cx.notify();
    }

    // -- the effect pumps ---------------------------------------------------

    fn pump_create(&mut self, pending: Vec<Pending<ShellOperation>>, cx: &mut Context<Self>) {
        for effect in pending {
            self.perform(Machine::Create, effect, cx);
        }
        self.create_view = self.create.view();
        self.ensure_watcher(cx);
        cx.notify();
    }

    fn pump_login(&mut self, pending: Vec<Pending<ShellOperation>>, cx: &mut Context<Self>) {
        for effect in pending {
            self.perform(Machine::Login, effect, cx);
        }
        self.login_view = self.login.view();
        self.ensure_watcher(cx);
        cx.notify();
    }

    /// Start one operation.
    ///
    /// Two of the eighteen never leave this thread: a prompt is the screen, and
    /// a completion is a hand-off to the session. Everything else is blocking
    /// work — a USB device, TLS, a person's finger — and goes to the background
    /// executor with the answer routed back by effect id.
    fn perform(
        &mut self,
        machine: Machine,
        effect: Pending<ShellOperation>,
        cx: &mut Context<Self>,
    ) {
        match &effect.operation {
            ShellOperation::Prompt { kind, confirmable } => {
                self.prompt = Some((machine, Prompt::new(kind.clone(), *confirmable, effect.id)));
                // Deliberately NOT resolved here: the core is waiting for an
                // answer a person has not given yet.
                return;
            }
            ShellOperation::CompleteOnboarding { mode } => {
                session::account_established(mode.clone(), cx);
                self.resolve(machine, effect.id, ShellResult::OnboardingCompleted, cx);
                return;
            }
            _ => {}
        }

        let ceremony = self.channel.ceremony();
        let operation = effect.operation.clone();
        let id = effect.id;
        cx.spawn(async move |page, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    match executor::perform(&operation, &ceremony) {
                        Performed::Now(result) => *result,
                        // Unreachable: the two screen-owned operations returned
                        // above. Answered rather than dropped, because a core
                        // left waiting on an effect nobody will resolve is a
                        // flow that hangs with no error.
                        Performed::Screen => ShellResult::PromptAnswered { accepted: false },
                    }
                })
                .await;
            page.update(cx, |page, cx| page.resolve(machine, id, result, cx))
                .ok();
        })
        .detach();
    }

    fn resolve(&mut self, machine: Machine, id: u64, result: ShellResult, cx: &mut Context<Self>) {
        match machine {
            Machine::Create => {
                let pending = self.create.resolve(id, result);
                self.pump_create(pending, cx);
            }
            Machine::Login => {
                let pending = self.login.resolve(id, result);
                self.pump_login(pending, cx);
            }
        }
    }

    /// Poll the ceremony channel while anything is in flight.
    fn ensure_watcher(&mut self, cx: &mut Context<Self>) {
        if self.watcher.is_some() || (self.create.is_idle() && self.login.is_idle()) {
            return;
        }
        self.watcher = Some(cx.spawn(async move |page, cx| {
            loop {
                cx.background_executor()
                    .timer(std::time::Duration::from_millis(CEREMONY_TICK_MS))
                    .await;
                let keep_going = page.update(cx, |page, cx| page.tick(cx)).unwrap_or(false);
                if !keep_going {
                    break;
                }
            }
        }));
    }

    /// One poll. Returns whether to keep polling.
    fn tick(&mut self, cx: &mut Context<Self>) -> bool {
        if let Some(request) = self.channel.pending_pin() {
            if self
                .pin
                .as_ref()
                .is_none_or(|open| open.request.retry != request.retry)
            {
                self.pin = Some(PinDialog {
                    request,
                    value: String::new(),
                    focus: cx.focus_handle(),
                });
            }
        } else if self.pin.is_some() {
            // The ceremony took the answer; the dialog's job is done.
            self.pin = None;
        }

        let busy = !self.create.is_idle() || !self.login.is_idle();
        cx.notify();
        if !busy {
            self.watcher = None;
        }
        busy
    }

    // -- what the screens ask for -------------------------------------------

    fn on_flow_event(&mut self, event: FlowEvent, window: &mut Window, cx: &mut Context<Self>) {
        use vela_core::app::create_wallet::Event as CreateEvent;

        let core_event = match event {
            FlowEvent::NameChanged(name) => CreateEvent::NameChanged { name },
            FlowEvent::AckToggled(index) => CreateEvent::AckToggled { index },
            FlowEvent::Submit => CreateEvent::Submit,
            FlowEvent::StartOver => CreateEvent::StartOver,
            FlowEvent::AddKey(method) => {
                self.picker_open = false;
                CreateEvent::AddKey {
                    // Empty ⇒ the core labels it "Key N". The desktop has no
                    // per-key rename control yet, and inventing a name here
                    // would put a shell's guess where the core has a rule.
                    name: String::new(),
                    method,
                }
            }
            FlowEvent::ConfirmKey(index) => CreateEvent::ConfirmKey { index },
            FlowEvent::RemoveKey(index) => CreateEvent::RemoveKey { index },
            FlowEvent::FinishKeys => CreateEvent::FinishKeys,
            FlowEvent::RetryUpload => CreateEvent::RetryUpload,
            FlowEvent::EnterWallet => CreateEvent::EnterWallet,
            FlowEvent::Back => {
                // The CORE owns whether there is a step to go back to; leaving
                // the flow entirely is this page's, because the core has no
                // idea what contains it.
                if self.create_view.can_go_back {
                    CreateEvent::GoBack
                } else {
                    self.leave_create(cx);
                    return;
                }
            }
            FlowEvent::TogglePicker => {
                self.picker_open = !self.picker_open;
                cx.notify();
                return;
            }
            FlowEvent::CopyAddress => {
                if let Some(address) = &self.create_view.address {
                    cx.write_to_clipboard(gpui::ClipboardItem::new_string(address.clone()));
                    self.copied = true;
                    cx.notify();
                }
                return;
            }
            FlowEvent::MethodUnavailable(_) => {
                // The picker already says why in the row itself; pressing it is
                // not an error to report, just nothing to do.
                return;
            }
        };

        // The name field keeps focus across a keystroke-driven re-render.
        if matches!(core_event, CreateEvent::NameChanged { .. }) {
            self.name_focus.focus(window, cx);
        }
        let pending = self.create.dispatch(core_event);
        self.pump_create(pending, cx);
    }

    fn on_sheet_action(&mut self, id: ActionId, cx: &mut Context<Self>) {
        let Some((machine, prompt)) = self.prompt.as_mut() else {
            return;
        };
        match id {
            ActionId::ToggleDetails => {
                prompt.details_expanded = !prompt.details_expanded;
                cx.notify();
            }
            ActionId::ReportError => {
                if let Some(details) = prompt.details.clone() {
                    cx.write_to_clipboard(gpui::ClipboardItem::new_string(details));
                }
            }
            ActionId::EditIndexEndpoint => {
                self.open_endpoint(false, cx);
            }
            ActionId::Accept | ActionId::Decline => {
                let accepted = id == ActionId::Accept;
                let machine = *machine;
                let effect_id = prompt.effect_id;
                self.prompt = None;
                self.resolve(
                    machine,
                    effect_id,
                    ShellResult::PromptAnswered { accepted },
                    cx,
                );
            }
        }
    }

    fn open_endpoint(&mut self, automatic: bool, cx: &mut Context<Self>) {
        if self.endpoint.is_some() {
            return;
        }
        self.endpoint = Some(EndpointSurface {
            url: registry::registry_url(),
            focus: cx.focus_handle(),
            automatic,
        });
        cx.notify();
    }

    fn save_endpoint(&mut self, cx: &mut Context<Self>) {
        let Some(surface) = self.endpoint.take() else {
            return;
        };
        registry::set_registry_url(&surface.url);
        // Persisted through the same file every other setting lives in. A write
        // failure is not fatal — the endpoint is already applied in memory —
        // but it is worth saying, because the next launch will not have it.
        if let Err(error) = storage::save_registry_endpoint(&registry::registry_url()) {
            eprintln!("[vela-wallet] endpoint could not be saved: {error}");
        }
        // Re-probe: `Event::Start` resets the health state, which is exactly
        // what pointing somewhere new should do.
        let pending = self.login.dispatch(vela_core::app::login::Event::Start);
        self.pump_login(pending, cx);
    }

    fn answer_pin(&mut self, value: Option<String>, cx: &mut Context<Self>) {
        self.channel.answer_pin(value);
        self.pin = None;
        cx.notify();
    }

    fn t(&self, leaf: &str) -> SharedString {
        self.loc.t(&format!("onboarding.welcome.{leaf}"))
    }

    // -- welcome ------------------------------------------------------------

    fn welcome(&self, theme: &Theme, cx: &mut Context<Self>) -> Div {
        let mut column = div()
            .w(px(FLOW_COLUMN_W))
            .flex()
            .flex_col()
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(GAP_LOGO_WORDMARK))
                    .child(vela_mark(theme, px(LOGO_SIZE)))
                    .child(
                        div()
                            .text_size(theme::text_brand())
                            .font_weight(FontWeight::BOLD)
                            .text_color(theme.fg_base)
                            // A proper name, rendered verbatim.
                            .child("Vela Wallet"),
                    ),
            )
            .child(
                div()
                    .mt(px(GAP_BRAND_TAGLINE))
                    .flex()
                    .flex_col()
                    .gap(px(FLOW_GAP_MD))
                    .child(
                        div()
                            .text_size(theme::text_tagline())
                            .font_weight(FontWeight::BOLD)
                            .text_color(theme.fg_base)
                            .child(self.t("heroTitle")),
                    )
                    .child(
                        div()
                            .text_size(theme::text_card_title())
                            .line_height(theme::line_height_body())
                            .text_color(theme.fg_muted)
                            .child(self.t("heroSubtitle")),
                    ),
            )
            .child(
                div()
                    .mt(px(GAP_BUTTONS * 2.))
                    .flex()
                    .flex_col()
                    .gap(px(FLOW_GAP_MD))
                    .child(vela_button(
                        "create-wallet",
                        ButtonVariant::Primary,
                        self.t("createWallet"),
                        theme,
                        cx.listener(|this, _, _, cx| this.start_create(cx)),
                    ))
                    .child(vela_button_opts(
                        "already-have-wallet",
                        ButtonVariant::Secondary,
                        self.t("alreadyHaveWallet"),
                        !self.login_view.busy,
                        theme,
                        cx.listener(|this, _, _, cx| this.sign_in(cx)),
                    )),
            );

        // The registry is unreachable. Sign-in stays attemptable — the CORE
        // decides that, not this screen — so this only says so, and offers the
        // surface that can fix it.
        if self.login_view.endpoint_unreachable {
            column = column.child(
                div()
                    .id("endpoint-warning")
                    .mt(px(FLOW_GAP_LG))
                    .cursor_pointer()
                    .text_size(theme::text_flow_caption())
                    .line_height(theme::line_height_body())
                    .text_color(theme.warning_base)
                    .on_click(cx.listener(|this, _, _, cx| this.open_endpoint(false, cx)))
                    .child(self.loc.t("onboarding.settings.warningText")),
            );
        }

        div()
            .size_full()
            .flex()
            .items_center()
            .justify_center()
            .child(column)
    }

    // -- overlays -----------------------------------------------------------

    fn pin_dialog(
        &self,
        theme: &Theme,
        window: &Window,
        cx: &mut Context<Self>,
    ) -> Option<Stateful<Div>> {
        let dialog = self.pin.as_ref()?;
        let retries = dialog
            .request
            .retries
            .map_or_else(String::new, |left| format!(" · {left}"));
        let strings = NameFieldStrings {
            label: SharedString::from(format!("{}{retries}", dialog.request.product)),
            placeholder: SharedString::from("••••"),
            helper: self.loc.t("onboarding.create.methodSecurityKeyBody"),
            too_long_hint: self.loc.t("onboarding.login.alertSignInFailedTitle"),
        };
        let value = dialog.value.clone();

        let card = div()
            .w(px(SHEET_W))
            .flex()
            .flex_col()
            .gap(px(FLOW_GAP_LG))
            .p(px(SHEET_PAD))
            .rounded(px(SHEET_RADIUS))
            .bg(theme.bg_raised)
            .border_1()
            .border_color(theme.border_card)
            .child(
                div()
                    .text_size(theme::text_flow_headline())
                    .font_weight(FontWeight::BOLD)
                    .text_color(theme.fg_base)
                    .child(self.loc.t("onboarding.create.securityKeyRequiredTitle")),
            )
            .child(text_field(
                "pin-field",
                theme,
                &strings,
                &dialog.value,
                dialog.request.retry,
                true,
                &dialog.focus,
                window,
                {
                    // Not `cx.listener`: that adapts gpui's own
                    // `Fn(&E, &mut Window, &mut App)` event shape, and a text
                    // field hands over its value by move rather than by
                    // reference.
                    let page = cx.entity();
                    move |next: String, _window: &mut Window, cx: &mut App| {
                        page.update(cx, |page, cx| {
                            if let Some(dialog) = page.pin.as_mut() {
                                dialog.value = next;
                                cx.notify();
                            }
                        });
                    }
                },
            ))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(FLOW_GAP_MD))
                    .child(vela_button_opts(
                        "pin-confirm",
                        ButtonVariant::Primary,
                        self.loc.t("onboarding.create.nextBtn"),
                        !value.is_empty(),
                        theme,
                        cx.listener(move |this, _, _, cx| {
                            let typed = this.pin.as_ref().map(|d| d.value.clone());
                            this.answer_pin(typed.filter(|v| !v.is_empty()), cx);
                        }),
                    ))
                    .child(vela_button(
                        "pin-cancel",
                        ButtonVariant::Row,
                        self.loc.t("common.cancel"),
                        theme,
                        cx.listener(|this, _, _, cx| this.answer_pin(None, cx)),
                    )),
            );

        Some(scrim(theme, "pin-scrim").child(card))
    }

    fn endpoint_surface(
        &self,
        theme: &Theme,
        window: &Window,
        cx: &mut Context<Self>,
    ) -> Option<Stateful<Div>> {
        let surface = self.endpoint.as_ref()?;
        let strings = NameFieldStrings {
            label: self.loc.t("onboarding.settings.endpointUrlLabel"),
            placeholder: SharedString::from(registry::DEFAULT_REGISTRY_URL),
            helper: self.loc.t("onboarding.settings.passkeyHint"),
            too_long_hint: self.loc.t("onboarding.settings.warningText"),
        };

        let mut card = div()
            .w(px(SHEET_W))
            .flex()
            .flex_col()
            .gap(px(FLOW_GAP_LG))
            .p(px(SHEET_PAD))
            .rounded(px(SHEET_RADIUS))
            .bg(theme.bg_raised)
            .border_1()
            .border_color(theme.border_card)
            .child(
                div()
                    .text_size(theme::text_flow_caption())
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(theme.fg_muted)
                    .child(self.loc.t("onboarding.settings.sectionPasskeyIndex")),
            );

        if surface.automatic || self.login_view.endpoint_unreachable {
            card = card.child(
                div()
                    .text_size(theme::text_body())
                    .line_height(theme::line_height_body())
                    .text_color(theme.warning_base)
                    .child(self.loc.t("onboarding.settings.warningText")),
            );
        }

        card = card
            .child(text_field(
                "endpoint-field",
                theme,
                &strings,
                &surface.url,
                false,
                false,
                &surface.focus,
                window,
                {
                    let page = cx.entity();
                    move |next: String, _window: &mut Window, cx: &mut App| {
                        page.update(cx, |page, cx| {
                            if let Some(surface) = page.endpoint.as_mut() {
                                surface.url = next;
                                cx.notify();
                            }
                        });
                    }
                },
            ))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(FLOW_GAP_MD))
                    .child(vela_button(
                        "endpoint-save",
                        ButtonVariant::Primary,
                        self.loc.t("onboarding.common.retry"),
                        theme,
                        cx.listener(|this, _, _, cx| this.save_endpoint(cx)),
                    ))
                    .child(vela_button(
                        "endpoint-reset",
                        ButtonVariant::Row,
                        self.loc.t("onboarding.settings.resetToDefault"),
                        theme,
                        cx.listener(|this, _, _, cx| {
                            if let Some(surface) = this.endpoint.as_mut() {
                                surface.url = registry::DEFAULT_REGISTRY_URL.to_owned();
                                cx.notify();
                            }
                        }),
                    ))
                    .child(vela_button(
                        "endpoint-close",
                        ButtonVariant::Row,
                        self.loc.t("onboarding.common.close"),
                        theme,
                        cx.listener(|this, _, _, cx| {
                            this.endpoint = None;
                            cx.notify();
                        }),
                    )),
            );

        Some(scrim(theme, "endpoint-scrim").child(card))
    }

    // -- window chrome (unchanged from spec 007) ----------------------------

    fn drag_strip(&self, cx: &mut Context<Self>) -> Stateful<Div> {
        div()
            .id("drag-strip")
            .absolute()
            .top_0()
            .left_0()
            .w_full()
            .h(px(DRAG_STRIP_H))
            .window_control_area(WindowControlArea::Drag)
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|this, _, _, _| this.drag_pending = true),
            )
            .on_mouse_up(
                MouseButton::Left,
                cx.listener(|this, _, _, _| this.drag_pending = false),
            )
            .on_mouse_down_out(cx.listener(|this, _, _, _| this.drag_pending = false))
            // Press-then-move is a drag: hand the window to the compositor.
            .on_mouse_move(cx.listener(|this, _, window, _| {
                if this.drag_pending {
                    this.drag_pending = false;
                    window.start_window_move();
                }
            }))
            .on_click(|event, window, _| {
                if event.click_count() == 2 {
                    window.zoom_window();
                }
            })
            .on_mouse_down(MouseButton::Right, |event, window, _| {
                window.show_window_menu(event.position);
            })
    }

    fn window_controls(&self, window: &Window) -> Stateful<Div> {
        let theme = Theme::of(self.mode);
        let control = |id: &'static str, icon: &'static str, area: WindowControlArea| {
            div()
                .id(id)
                .w(px(46.))
                .h(px(34.))
                .flex_none()
                .flex()
                .items_center()
                .justify_center()
                .cursor_pointer()
                .text_size(px(18.))
                .text_color(theme.fg_base)
                .window_control_area(area)
                .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                .child(icon)
        };

        let minimize = control("window-minimize", "−", WindowControlArea::Min)
            .hover(|el| el.bg(theme.bg_sunken))
            .active(|el| el.bg(theme.border_card))
            .on_click(|_, window, cx| {
                cx.stop_propagation();
                window.minimize_window();
            });
        let maximize_icon = if window.is_maximized() { "❐" } else { "□" };
        let maximize = control("window-maximize", maximize_icon, WindowControlArea::Max)
            .hover(|el| el.bg(theme.bg_sunken))
            .active(|el| el.bg(theme.border_card))
            .on_click(|_, window, cx| {
                cx.stop_propagation();
                window.zoom_window();
            });
        let close = control("window-close", "×", WindowControlArea::Close)
            .text_size(px(22.))
            .hover(|el| el.bg(theme.accent).text_color(theme.fg_inverse))
            .active(|el| el.bg(theme.accent_active).text_color(theme.fg_inverse))
            .on_click(|_, window, cx| {
                cx.stop_propagation();
                window.remove_window();
            });

        div()
            .id("window-controls")
            .absolute()
            .top_0()
            .right_0()
            .w(px(138.))
            .h(px(34.))
            .flex()
            .flex_row()
            .children([minimize, maximize, close])
    }

    fn titlebar(&self, window: &Window, cx: &mut Context<Self>) -> Stateful<Div> {
        div()
            .id("custom-titlebar")
            .absolute()
            .top_0()
            .left_0()
            .w_full()
            .h(px(DRAG_STRIP_H))
            .child(self.drag_strip(cx))
            .child(self.window_controls(window))
    }
}

/// The full-bleed dim behind a modal. It swallows clicks and does NOT dismiss:
/// everything shown over it is something someone is waiting on an answer to,
/// and a stray click outside a card is not an answer a person meant to give.
fn scrim(theme: &Theme, id: &'static str) -> Stateful<Div> {
    div()
        .id(id)
        .absolute()
        .inset_0()
        .flex()
        .items_center()
        .justify_center()
        .bg(theme.bg_base.opacity(crate::outcome::SCRIM_OPACITY))
        .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
}

impl Render for OnboardingPage {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = Theme::of(self.mode);
        let tiling = frame_tiling(window);

        // A modal takes the keyboard on the frame it appears, and only then:
        // re-focusing every frame would fight anything else the person clicks.
        for handle in [
            self.pin.as_ref().map(|dialog| dialog.focus.clone()),
            self.endpoint.as_ref().map(|surface| surface.focus.clone()),
        ]
        .into_iter()
        .flatten()
        {
            if !handle.is_focused(window) {
                handle.focus(window, cx);
            }
        }

        // Opened by the probe, once. A person who dismissed it has answered.
        if self.login_view.endpoint_unreachable && self.endpoint.is_none() && !self.creating {
            self.open_endpoint(true, cx);
        }

        let content = if self.creating {
            let entity = cx.entity();
            let sink: FlowSink = Rc::new(move |event, window, cx| {
                entity.update(cx, |page, cx| page.on_flow_event(event, window, cx));
            });
            let host = FlowHost {
                theme: &theme,
                loc: &self.loc,
                view: &self.create_view,
                name_focus: &self.name_focus,
                picker_open: self.picker_open,
                copied: self.copied,
                touch_waiting: self.channel.touch_waiting(),
                sink,
            };
            div()
                .size_full()
                .flex()
                .items_center()
                .justify_center()
                .child(render_create_flow(&host, window))
        } else {
            self.welcome(&theme, cx)
        };

        let page = div()
            .size_full()
            .flex()
            .text_color(theme.fg_base)
            .child(content);

        // The animation centres itself on the CONTENT width; under client-side
        // decorations the viewport is wider than the window by the shadow band
        // on each untiled side.
        let mut viewport_w = f32::from(window.viewport_size().width);
        if let Some(tiling) = tiling {
            if !tiling.left {
                viewport_w -= f32::from(FRAME_SHADOW);
            }
            if !tiling.right {
                viewport_w -= f32::from(FRAME_SHADOW);
            }
        }
        let overlay = self
            .launch
            .as_mut()
            .and_then(|launch| launch.render(viewport_w, window, cx));
        let page_opacity = self.launch.as_ref().map_or(1., |l| l.page_opacity());

        let mut root = div()
            .size_full()
            .relative()
            .bg(theme.bg_base)
            .child(page.opacity(page_opacity));

        // The three modals, in the order they can stack: a PIN request belongs
        // to a ceremony that a prompt has not been raised about yet, and the
        // endpoint surface can be opened FROM a prompt — so it goes on top.
        if let Some((_, prompt)) = &self.prompt {
            let entity = cx.entity();
            root = root.child(outcome_sheet(
                &theme,
                &self.loc,
                prompt,
                move |id, _window, cx| {
                    entity.update(cx, |page, cx| page.on_sheet_action(id, cx));
                },
            ));
        }
        if let Some(dialog) = self.pin_dialog(&theme, window, cx) {
            root = root.child(dialog);
        }
        if let Some(surface) = self.endpoint_surface(&theme, window, cx) {
            root = root.child(surface);
        }

        let owns_titlebar = tiling.is_some() || cfg!(target_os = "windows");
        let root = match tiling {
            Some(tiling) => round_to_frame(root, tiling),
            None => root,
        };
        let root = root
            .track_focus(&self.focus_handle)
            .on_key_down(cx.listener(|_, event: &KeyDownEvent, window, _| {
                let ks = &event.keystroke;
                let macos_chord = cfg!(target_os = "macos")
                    && ks.key == "f"
                    && ks.modifiers.control
                    && ks.modifiers.platform;
                if ks.key == "f11" || macos_chord {
                    window.toggle_fullscreen();
                }
            }));
        let root = if owns_titlebar {
            root.child(self.titlebar(window, cx))
        } else {
            root
        };

        let root = match overlay {
            None => {
                self.launch = None;
                root
            }
            Some(overlay) => {
                let overlay = overlay.on_mouse_down(
                    MouseButton::Left,
                    cx.listener(|this, _, _, cx| {
                        if let Some(launch) = this.launch.as_mut() {
                            launch.skip();
                        }
                        cx.notify();
                    }),
                );
                let overlay = match tiling {
                    Some(tiling) => round_to_frame(overlay, tiling),
                    None => overlay,
                };
                root.child(overlay)
            }
        };

        window_frame(root, &theme, window)
    }
}
