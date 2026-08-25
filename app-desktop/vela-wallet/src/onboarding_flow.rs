//! The create journey, as five screens.
//!
//! Everything here is a rendering of `CreateView`. **The mapping in
//! [`Screen::of`] is the whole of the create UI's logic** — there is no other
//! decision in this file, and a client that implements that table has no create
//! logic of its own (data-model §3).
//!
//! What spec 014 had here is gone: the in-place action-column swap, the five
//! `CreatePanelState` variants, the elapsed-seconds ring. The v2 design makes
//! the flow the whole page and keeps a modal for FAILURES only, which is
//! [`crate::outcome`]. What survived is the `ui/` atoms, unchanged — they were
//! built against the same tokens the redesign kept.
//!
//! ## The three gates, and why they are visible
//!
//! The core enforces at most seven keys, every key confirmed, and a second key
//! when the only one is not backed up. Each surfaces here as a disabled control
//! WITH ITS REASON WRITTEN NEXT TO IT rather than as a press that quietly does
//! nothing. A person who cannot finish is owed the sentence that says why.

use std::rc::Rc;

use gpui::{
    AnyElement, App, Div, FocusHandle, FontWeight, InteractiveElement as _, IntoElement as _,
    ParentElement, SharedString, StatefulInteractiveElement as _, Styled, Window, div, px,
    relative,
};

use vela_core::app::create_wallet::{CreateKeyRow, CreateStage, CreateView, SubmitLabel};
use vela_core::app::{KeyMethod, StatusKey};

use crate::loc::Loc;
use crate::theme::{
    self, FLOW_GAP_LG, FLOW_GAP_MD, FLOW_GAP_SM, HAIRLINE, OPACITY_DISABLED, RADIUS_FIELD,
    STEP_BAR_H, Theme,
};
use crate::ui::{
    ButtonVariant, NameFieldStrings, ack_row, address_strip, name_field, vela_button_opts,
};

/// The founding-set cap, mirroring the core's `MAX_MULTI_KEYS`.
pub const MAX_KEYS: usize = 7;

/// The flow's column width. Wider than 014's 512 px panel because the flow is
/// no longer beside anything.
pub const FLOW_COLUMN_W: f32 = 560.;
/// The shell's header row. Fixed so the screen below never moves when the back
/// affordance is not there to hold the row open.
const FLOW_HEADER_H: f32 = 32.;

/// The privacy and terms URLs the legal acknowledgement links to. Absolute,
/// because they are the marketing site's pages and not app routes.
pub const PRIVACY_URL: &str = "https://getvela.app/privacy";
pub const TERMS_URL: &str = "https://getvela.app/terms";

// ---------------------------------------------------------------------------
// Screen selection — the whole of the create UI's logic
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Screen {
    Name,
    Keys,
    Progress,
    Retry,
    Done,
}

impl Screen {
    /// data-model §3's table, verbatim.
    ///
    /// The one refinement over `stage` alone: a busy machine reporting a
    /// PROGRESS status has left the key list and is deriving, so the progress
    /// screen takes over until it lands. `setting_up_identity` is deliberately
    /// not a progress status — it happens before the key list exists, and
    /// belongs to the Name screen's status line.
    pub fn of(view: &CreateView) -> Self {
        match view.stage {
            CreateStage::Created => Self::Done,
            CreateStage::SyncFailed => Self::Retry,
            CreateStage::AddKeys if view.busy && progress_for(view.status).is_some() => {
                Self::Progress
            }
            CreateStage::AddKeys => Self::Keys,
            CreateStage::Form if view.busy && progress_for(view.status).is_some() => Self::Progress,
            CreateStage::Form => Self::Name,
        }
    }
}

/// The progress screen's active row and percentage (data-model §3, research D9).
///
/// Derived from the stage the core reported, never from elapsed time: a bar
/// that advances on a timer tells the person something the wallet does not
/// know, and the moment they are most owed the truth is while their key set is
/// being frozen.
pub fn progress_for(status: Option<StatusKey>) -> Option<(usize, u32)> {
    match status? {
        StatusKey::VerifyingIdentity | StatusKey::ExtractingKey => Some((0, 33)),
        StatusKey::ComputingAddress => Some((1, 62)),
        StatusKey::SyncingKey => Some((2, 100)),
        _ => None,
    }
}

/// The three task rows, in order.
const PROGRESS_TASKS: [&str; 3] = [
    "onboarding.create.taskVerifyKey",
    "onboarding.create.taskDeriveAddress",
    "onboarding.create.taskWriteIndex",
];

/// The transient status line's corpus key. Exhaustive: a new `StatusKey` in the
/// core stops this compiling rather than rendering a blank line.
pub fn status_key(status: StatusKey) -> &'static str {
    match status {
        StatusKey::SettingUpIdentity => "onboarding.create.statusSettingUpIdentity",
        StatusKey::VerifyingIdentity => "onboarding.create.statusVerifyingIdentity",
        StatusKey::ExtractingKey => "onboarding.create.statusExtractingKey",
        StatusKey::ComputingAddress => "onboarding.create.statusComputingAddress",
        StatusKey::SyncingKey => "onboarding.create.statusSyncingKey",
        StatusKey::SetupCancelled => "onboarding.create.statusSetupCancelled",
        StatusKey::VerifyCancelled => "onboarding.create.statusVerifyCancelled",
    }
}

/// A key row's provider line.
///
/// Keyed off what the AUTHENTICATOR REPORTED, not off the method the person
/// chose — which is the opposite of the web client, and for a reason the row's
/// own type spells out: `method` is the choice, the other three fields are what
/// the device said about itself, and on desktop the two legitimately disagree.
/// The FIRST key is minted before the key screen exists, so it carries
/// `KeyMethod::default()` (platform) while being, unavoidably, a USB security
/// key. Labelling that row "Platform passkey" would be the shell repeating a
/// default back to the person as though it were a fact.
///
/// The design draws a richer line («YubiKey 5C · USB»), which needs the AAGUID
/// resolved to a model name — a lookup the flow does not make. Until it does,
/// this is the honest version of the same fact.
fn provider_line(key: &CreateKeyRow) -> &'static str {
    if key.authenticator_attachment == "cross-platform"
        || key.transports.split(',').any(|t| t.trim() == "usb")
    {
        return "onboarding.create.providerSecurityKey";
    }
    match key.method {
        KeyMethod::Platform => "onboarding.create.providerPlatform",
        KeyMethod::Hybrid => "onboarding.create.providerGeneric",
        KeyMethod::SecurityKey => "onboarding.create.providerSecurityKey",
    }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/// What a control on these screens can ask for. The host translates each into a
/// core event (or, for the three presentation-only ones, into its own state).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FlowEvent {
    NameChanged(String),
    AckToggled(usize),
    Submit,
    StartOver,
    AddKey(KeyMethod),
    ConfirmKey(usize),
    RemoveKey(usize),
    FinishKeys,
    RetryUpload,
    EnterWallet,
    /// The top-left affordance. The CORE owns whether there is a step to go
    /// back to (`can_go_back`); leaving the flow entirely is the host's,
    /// because the core has no idea what contains it.
    Back,
    /// Presentation only: expand or collapse the add-method list.
    TogglePicker,
    /// Presentation only: the address was copied.
    CopyAddress,
    /// Presentation only: a method the desktop cannot run was pressed.
    MethodUnavailable(KeyMethod),
}

pub type FlowSink = Rc<dyn Fn(FlowEvent, &mut Window, &mut App)>;

/// Everything the screens read. All of it is either `CreateView` or the host's
/// own presentation state — there is no third source.
pub struct FlowHost<'a> {
    pub theme: &'a Theme,
    pub loc: &'a Loc,
    pub view: &'a CreateView,
    pub name_focus: &'a FocusHandle,
    /// The add-method list is expanded.
    pub picker_open: bool,
    /// The Done screen's transient 已复制 feedback.
    pub copied: bool,
    pub sink: FlowSink,
}

fn emit(sink: &FlowSink, event: FlowEvent) -> impl Fn(&mut Window, &mut App) + 'static {
    let sink = sink.clone();
    move |window, cx| sink(event.clone(), window, cx)
}

// ---------------------------------------------------------------------------
// The shell
// ---------------------------------------------------------------------------

/// The whole flow: a back affordance and one screen.
///
/// The three-segment bar and the flow's name that used to head every step are
/// gone (founder call, 2026-08-25): a meter over a journey whose every screen
/// already says what it is measured decoration rather than progress, and the
/// label repeated the heading directly under it.
pub fn render_create_flow(host: &FlowHost<'_>, window: &Window) -> Div {
    let screen = Screen::of(host.view);
    let theme = host.theme;

    // No way back out of a running ceremony: the keys are being frozen, and the
    // only honest control is none.
    let can_leave = screen != Screen::Progress && screen != Screen::Done;
    let back: AnyElement = if can_leave {
        let on_back = emit(&host.sink, FlowEvent::Back);
        div()
            .id("flow-back")
            .flex()
            .items_center()
            .gap(px(FLOW_GAP_SM))
            .cursor_pointer()
            .text_size(theme::text_body())
            .font_weight(FontWeight::SEMIBOLD)
            .text_color(theme.fg_muted)
            .hover(|s| s.text_color(theme.fg_base))
            .on_click(move |_, window, cx| on_back(window, cx))
            .child("‹")
            .child(host.loc.t("onboarding.common.back"))
            .into_any_element()
    } else {
        // An empty leading cell, so the flow label stays where it was: a row
        // that re-centres when the affordance disappears reads as a jump.
        div().into_any_element()
    };

    let body = match screen {
        Screen::Name => render_name(host, window),
        Screen::Keys => render_keys(host),
        Screen::Progress => render_progress(host),
        Screen::Retry => render_retry(host),
        Screen::Done => render_done(host),
    };

    div()
        .w(px(FLOW_COLUMN_W))
        .flex()
        .flex_col()
        .gap(px(FLOW_GAP_LG))
        .child(
            // The row keeps its height with or without the affordance, so the
            // screen below never moves when back disappears.
            div()
                .w_full()
                .h(px(FLOW_HEADER_H))
                .flex()
                .items_center()
                .child(back),
        )
        .child(body)
}

fn title(theme: &Theme, text: SharedString) -> Div {
    div()
        .text_size(theme::text_tagline())
        .font_weight(FontWeight::BOLD)
        .text_color(theme.fg_base)
        .child(text)
}

fn subtitle(theme: &Theme, text: SharedString) -> Div {
    div()
        .text_size(theme::text_card_title())
        .line_height(theme::line_height_body())
        .text_color(theme.fg_muted)
        .child(text)
}

fn caption(theme: &Theme, text: SharedString) -> Div {
    div()
        .text_size(theme::text_flow_caption())
        .text_color(theme.fg_subtle)
        .child(text)
}

// ---------------------------------------------------------------------------
// Name
// ---------------------------------------------------------------------------

/// Which link inside the legal acknowledgement was pressed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LegalLink {
    Privacy,
    Terms,
}

impl LegalLink {
    pub fn url(self) -> &'static str {
        match self {
            Self::Privacy => PRIVACY_URL,
            Self::Terms => TERMS_URL,
        }
    }
}

fn render_name(host: &FlowHost<'_>, window: &Window) -> Div {
    let theme = host.theme;
    let loc = host.loc;
    let view = host.view;

    // No label and no helper (spec 019). The heading directly above the field
    // already says "name your wallet", so a label restated it — and what the
    // helper said, that the name is stored on-chain, is now `ack0`, where a
    // person has to look at it rather than past it. Both render as nothing when
    // empty rather than as an empty line box.
    let strings = NameFieldStrings {
        label: SharedString::default(),
        placeholder: loc.t("onboarding.create.accountNamePlaceholder"),
        helper: SharedString::default(),
        too_long_hint: loc.t("onboarding.create.nameTooLong"),
    };
    let sink = host.sink.clone();
    let editable = view.name_editable;
    let field = name_field(
        theme,
        &strings,
        &view.name,
        view.name_too_long,
        host.name_focus,
        window,
        move |value, window, cx| {
            if editable {
                sink(FlowEvent::NameChanged(value), window, cx);
            }
        },
    );

    // The legal row's two inline links, located by byte range in the assembled
    // sentence. Built by concatenation rather than by interpolation because the
    // ranges have to be exact, and `{{var}}` fills would move them per locale.
    let ack2_lead = loc.t("onboarding.create.ack2");
    let ack2_privacy = loc.t("onboarding.create.ack2PrivacyPolicy");
    let ack2_and = loc.t("onboarding.create.ack2And");
    let ack2_terms = loc.t("onboarding.create.ack2Terms");
    let ack2_period = loc.t("onboarding.create.ack2Period");
    let privacy_at = ack2_lead.len();
    let and_at = privacy_at + ack2_privacy.len();
    let terms_at = and_at + ack2_and.len();
    let legal = SharedString::from(format!(
        "{ack2_lead}{ack2_privacy}{ack2_and}{ack2_terms}{ack2_period}"
    ));

    let sink_ack0 = host.sink.clone();
    let sink_ack1 = host.sink.clone();
    let sink_ack2 = host.sink.clone();
    let acks = div()
        .w_full()
        .flex()
        .flex_col()
        .gap(px(FLOW_GAP_LG))
        .child(ack_row::<LegalLink>(
            0,
            theme,
            view.acks.first().copied().unwrap_or(false),
            loc.t("onboarding.create.ack0"),
            Vec::new(),
            move |window, cx| sink_ack0(FlowEvent::AckToggled(0), window, cx),
            |_, _, _| {},
        ))
        // Three gates, each a FACT about where something ends up (`ACK_COUNT`).
        // The recovery assurance that used to sit here described a BENEFIT, and
        // mixing one of those into a list of consequences teaches people to skim
        // the list — so it is gone, and row 1 now names where the PRIVATE key
        // stays, which the old pair never said out loud.
        .child(ack_row::<LegalLink>(
            1,
            theme,
            view.acks.get(1).copied().unwrap_or(false),
            loc.t("onboarding.create.ack1"),
            Vec::new(),
            move |window, cx| sink_ack1(FlowEvent::AckToggled(1), window, cx),
            |_, _, _| {},
        ))
        .child(ack_row(
            2,
            theme,
            view.acks.get(2).copied().unwrap_or(false),
            legal,
            vec![
                (privacy_at..and_at, LegalLink::Privacy),
                (terms_at..terms_at + ack2_terms.len(), LegalLink::Terms),
            ],
            move |window, cx| sink_ack2(FlowEvent::AckToggled(2), window, cx),
            // The links open a browser and are NOT the checkbox: pressing one
            // must not tick the box the sentence belongs to.
            move |link: LegalLink, _window, cx| cx.open_url(link.url()),
        ));

    // The gates sit against the button they gate: the spacer between the field
    // and them absorbs the free height, so they are never stranded mid-screen.
    // A checklist a cursor reaches before the sentence does is one nobody reads.
    let mut column = div()
        .w_full()
        .flex_1()
        .flex()
        .flex_col()
        .gap(px(FLOW_GAP_LG))
        .child(title(theme, loc.t("onboarding.create.nameTitle")))
        .child(field)
        .child(div().flex_1())
        .child(acks);

    // A cancelled ceremony is a quiet status line with the draft intact, never
    // a sheet: there is a form to come back to, and the design reserves the
    // modal for the sign-in path where there is not.
    if let Some(status) = view.status
        && progress_for(Some(status)).is_none()
    {
        column = column.child(caption(theme, loc.t(status_key(status))));
    }

    let submit_key = match view.submit_label {
        SubmitLabel::Create => "onboarding.create.nextBtn",
        SubmitLabel::FinishVerify => "onboarding.create.finishVerifyBtn",
    };
    let sink_submit = host.sink.clone();
    column = column.child(vela_button_opts(
        "flow-submit",
        ButtonVariant::Primary,
        loc.t(submit_key),
        view.can_submit && !view.busy,
        theme,
        move |_, window, cx| sink_submit(FlowEvent::Submit, window, cx),
    ));

    if view.show_start_over {
        let on_start_over = emit(&host.sink, FlowEvent::StartOver);
        column = column.child(
            div()
                .id("flow-start-over")
                .w_full()
                .flex()
                .justify_center()
                .cursor_pointer()
                .text_size(theme::text_body())
                .text_color(theme.fg_muted)
                .hover(|s| s.text_color(theme.fg_base))
                .on_click(move |_, window, cx| on_start_over(window, cx))
                .child(loc.t("onboarding.create.startOverBtn")),
        );
    }

    column
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

fn render_keys(host: &FlowHost<'_>) -> Div {
    let theme = host.theme;
    let loc = host.loc;
    let view = host.view;
    let full = view.keys.len() >= MAX_KEYS;

    let headline = if view.needs_second_key {
        loc.t("onboarding.create.keysTitleBlocked")
    } else {
        loc.t("onboarding.create.keysTitle")
    };
    let sub = if view.needs_second_key {
        loc.t("onboarding.create.keysSubtitleBlocked")
    } else if full {
        loc.t("onboarding.create.keysSubtitleFull")
    } else {
        loc.t("onboarding.create.keysSubtitle")
    };

    let mut column = div().w_full().flex().flex_col().gap(px(FLOW_GAP_LG)).child(
        div()
            .flex()
            .flex_col()
            .gap(px(FLOW_GAP_SM))
            .child(title(theme, headline))
            .child(subtitle(theme, sub)),
    );

    if view.needs_second_key {
        column = column.child(
            div()
                .w_full()
                .flex()
                .items_start()
                .gap(px(FLOW_GAP_MD))
                .p(px(FLOW_GAP_MD))
                .rounded(px(RADIUS_FIELD))
                .bg(theme.warning_soft)
                .child(
                    div()
                        .size(px(FLOW_GAP_SM))
                        .flex_none()
                        .mt(px(6.))
                        .rounded_full()
                        .bg(theme.warning_base),
                )
                .child(
                    div()
                        .flex_1()
                        .min_w(px(0.))
                        .text_size(theme::text_body())
                        .line_height(theme::line_height_body())
                        .text_color(theme.fg_base)
                        .child(loc.t("onboarding.create.needSecondKeyHint")),
                ),
        );
    }

    #[allow(clippy::cast_precision_loss, clippy::allow_attributes)]
    let counter = loc.t_vars(
        "onboarding.create.keyCount",
        &[
            ("current", view.keys.len() as f64),
            ("max", MAX_KEYS as f64),
        ],
    );
    let mut list = div().w_full().flex().flex_col().child(
        div()
            .w_full()
            .flex()
            .items_center()
            .justify_between()
            .pb(px(FLOW_GAP_SM))
            .child(caption(theme, loc.t("onboarding.create.keysLabel")))
            .child(caption(theme, counter)),
    );
    for (index, key) in view.keys.iter().enumerate() {
        list = list.child(key_row(host, index, key));
    }
    column = column.child(list);

    // Add-key control, with the cap stated on it rather than behind it.
    let on_toggle = emit(&host.sink, FlowEvent::TogglePicker);
    let add_label = if full {
        loc.t("onboarding.create.keyLimitReached")
    } else {
        loc.t("onboarding.create.addKeyBtn")
    };
    let mut add = div().w_full().flex().flex_col().child({
        let row = div()
            .id("flow-add-key")
            .w_full()
            .flex()
            .items_center()
            .gap(px(FLOW_GAP_MD))
            .py(px(FLOW_GAP_MD))
            .text_size(theme::text_card_title())
            .child(div().text_color(theme.accent).child("+"))
            .child(div().text_color(theme.fg_base).child(add_label));
        if view.can_add_key {
            row.cursor_pointer()
                .hover(|s| s.bg(theme.bg_sunken))
                .on_click(move |_, window, cx| on_toggle(window, cx))
        } else {
            row.opacity(OPACITY_DISABLED)
        }
    });
    if host.picker_open && view.can_add_key {
        add = add.child(method_picker(host));
    }
    column = column.child(add);

    column = column.child(caption(theme, loc.t("onboarding.create.keysHint")));

    let finish_label = if view.needs_second_key {
        loc.t("onboarding.create.addSecondKeyBtn")
    } else {
        loc.t("onboarding.create.createWalletBtn")
    };
    let sink_finish = host.sink.clone();
    column.child(vela_button_opts(
        "flow-finish",
        ButtonVariant::Primary,
        finish_label,
        view.can_finish && !view.busy,
        theme,
        move |_, window, cx| sink_finish(FlowEvent::FinishKeys, window, cx),
    ))
}

fn key_row(host: &FlowHost<'_>, index: usize, key: &CreateKeyRow) -> Div {
    let theme = host.theme;
    let loc = host.loc;
    let busy = host.view.busy;

    // ONE trailing slot, as the design draws it. A key that has not confirmed
    // its membership has no status to show yet, so the retry TAKES that slot
    // rather than crowding in beside it.
    let trailing: AnyElement = if key.confirmed {
        let (label, fg, bg) = if key.synced {
            (
                loc.t("onboarding.create.keySyncedBadge"),
                theme.success_base,
                theme.success_soft,
            )
        } else {
            (
                loc.t("onboarding.create.keyDeviceOnlyBadge"),
                theme.fg_muted,
                theme.bg_well,
            )
        };
        div()
            .flex_none()
            .px(px(FLOW_GAP_SM))
            .py(px(2.))
            .rounded_full()
            .bg(bg)
            .text_size(theme::text_flow_caption())
            .text_color(fg)
            .child(label)
            .into_any_element()
    } else {
        let on_confirm = emit(&host.sink, FlowEvent::ConfirmKey(index));
        let row = div()
            .id(("flow-confirm-key", index as u64))
            .flex_none()
            .px(px(FLOW_GAP_SM))
            .py(px(2.))
            .rounded_full()
            .bg(theme.warning_soft)
            .text_size(theme::text_flow_caption())
            .text_color(theme.warning_base)
            .child(loc.t("onboarding.create.confirmKeyBtn"));
        if busy {
            row.opacity(OPACITY_DISABLED).into_any_element()
        } else {
            row.cursor_pointer()
                .on_click(move |_, window, cx| on_confirm(window, cx))
                .into_any_element()
        }
    };

    let mut row = div()
        .w_full()
        .flex()
        .items_center()
        .gap(px(FLOW_GAP_MD))
        .py(px(FLOW_GAP_MD))
        .border_b_1()
        .border_color(theme.divider)
        .child(
            div()
                .flex_1()
                .min_w(px(0.))
                .flex()
                .flex_col()
                .gap(px(2.))
                .child(
                    div()
                        .text_size(theme::text_card_title())
                        .text_color(theme.fg_base)
                        .child(SharedString::from(key.name.clone())),
                )
                .child(caption(theme, loc.t(provider_line(key)))),
        )
        .child(trailing);

    // Row 0 is the pinned key: not removable, and its name IS the wallet name.
    if index > 0 {
        let on_remove = emit(&host.sink, FlowEvent::RemoveKey(index));
        let remove = div()
            .id(("flow-remove-key", index as u64))
            .flex_none()
            .size(px(theme::FLOW_CLOSE_HIT))
            .rounded_full()
            .flex()
            .items_center()
            .justify_center()
            .text_size(theme::text_card_title())
            .text_color(theme.fg_muted)
            .child("×");
        row = row.child(if busy {
            remove.opacity(OPACITY_DISABLED)
        } else {
            remove
                .cursor_pointer()
                .hover(|s| s.bg(theme.bg_sunken))
                .on_click(move |_, window, cx| on_remove(window, cx))
        });
    }

    row
}

/// The three ways to mint a founding key.
///
/// **Two of them cannot run here, and both say so.** `Platform` needs a system
/// passkey service, which no desktop in this app's reach provides; `Hybrid`
/// needs the QR transport a later feature adds. Hiding them would leave a
/// person wondering whether their laptop's fingerprint reader was supposed to
/// work; showing them greyed with a reason answers that in one line.
fn method_picker(host: &FlowHost<'_>) -> Div {
    let theme = host.theme;
    let loc = host.loc;

    let entry = |method: KeyMethod, title_key: &str, body: SharedString, available: bool| {
        let sink = host.sink.clone();
        let event = if available {
            FlowEvent::AddKey(method)
        } else {
            FlowEvent::MethodUnavailable(method)
        };
        let row = div()
            .id(("flow-method", method as u64))
            .w_full()
            .flex()
            .items_center()
            .gap(px(FLOW_GAP_MD))
            .py(px(FLOW_GAP_MD))
            .border_b_1()
            .border_color(theme.divider)
            .child(
                div()
                    .flex_1()
                    .min_w(px(0.))
                    .flex()
                    .flex_col()
                    .gap(px(2.))
                    .child(
                        div()
                            .text_size(theme::text_card_title())
                            .text_color(theme.fg_base)
                            .child(loc.t(title_key)),
                    )
                    .child(caption(theme, body)),
            );
        if available {
            row.cursor_pointer()
                .hover(|s| s.bg(theme.bg_sunken))
                .on_click(move |_, window, cx| sink(event.clone(), window, cx))
        } else {
            row.opacity(OPACITY_DISABLED)
        }
    };

    div()
        .w_full()
        .flex()
        .flex_col()
        .child(caption(theme, loc.t("onboarding.create.addMethodLabel")))
        .child(entry(
            KeyMethod::SecurityKey,
            "onboarding.create.methodSecurityKeyTitle",
            loc.t("onboarding.create.methodSecurityKeyBody"),
            true,
        ))
        .child(entry(
            KeyMethod::Platform,
            "onboarding.create.methodPlatformTitle",
            loc.t("onboarding.create.securityKeyRequiredBody"),
            false,
        ))
        .child(entry(
            KeyMethod::Hybrid,
            "onboarding.create.methodHybridTitle",
            loc.t("onboarding.create.methodHybridUnavailable"),
            false,
        ))
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

fn render_progress(host: &FlowHost<'_>) -> Div {
    let theme = host.theme;
    let loc = host.loc;
    let (active, percent) = progress_for(host.view.status).unwrap_or((0, 0));

    #[allow(clippy::cast_precision_loss, clippy::allow_attributes)]
    let subtitle_text = loc.t_vars(
        "onboarding.create.progressSubtitle",
        &[("count", host.view.keys.len() as f64)],
    );

    let mut tasks = div().w_full().flex().flex_col().gap(px(FLOW_GAP_MD));
    for (index, key) in PROGRESS_TASKS.iter().enumerate() {
        let (mark, color) = match index {
            _ if index < active => ("✓", theme.success_base),
            _ if index == active => ("●", theme.accent),
            _ => ("○", theme.fg_subtle),
        };
        tasks = tasks.child(
            div()
                .flex()
                .items_center()
                .gap(px(FLOW_GAP_MD))
                .child(div().flex_none().text_color(color).child(mark))
                .child(
                    div()
                        .text_size(theme::text_card_title())
                        .text_color(if index <= active {
                            theme.fg_base
                        } else {
                            theme.fg_subtle
                        })
                        .child(loc.t(key)),
                ),
        );
    }

    div()
        .w_full()
        .flex()
        .flex_col()
        .gap(px(FLOW_GAP_LG))
        .child(
            div()
                .flex()
                .flex_col()
                .gap(px(FLOW_GAP_SM))
                .child(title(theme, loc.t("onboarding.create.progressTitle")))
                .child(subtitle(theme, subtitle_text)),
        )
        .child(
            div()
                .w_full()
                .flex()
                .flex_col()
                .gap(px(FLOW_GAP_SM))
                .child(
                    div()
                        .w_full()
                        .flex()
                        .items_center()
                        .justify_between()
                        .child(caption(
                            theme,
                            loc.t("onboarding.create.progressMeterLabel"),
                        ))
                        .child(caption(theme, SharedString::from(format!("{percent}%")))),
                )
                .child(
                    div()
                        .w_full()
                        .h(px(STEP_BAR_H))
                        .rounded_full()
                        .bg(theme.divider)
                        .child(
                            #[allow(clippy::cast_precision_loss, clippy::allow_attributes)]
                            div()
                                .w(relative(percent as f32 / 100.))
                                .h_full()
                                .rounded_full()
                                .bg(theme.accent),
                        ),
                ),
        )
        .child(tasks)
}

// ---------------------------------------------------------------------------
// Retry
// ---------------------------------------------------------------------------

/// The keys were minted; the group never landed.
///
/// Nothing is lost and nothing is re-minted: the core keeps the whole founding
/// set and a pending record it wrote BEFORE the first publish attempt, so retry
/// resumes at the publish. That is why the primary here is a retry, and why
/// starting over is the quiet secondary rather than the obvious escape.
fn render_retry(host: &FlowHost<'_>) -> Div {
    let theme = host.theme;
    let loc = host.loc;
    let view = host.view;

    let mut column = div().w_full().flex().flex_col().gap(px(FLOW_GAP_LG)).child(
        div()
            .flex()
            .flex_col()
            .gap(px(FLOW_GAP_SM))
            .child(title(theme, loc.t("onboarding.create.syncFailedTitle")))
            .child(subtitle(
                theme,
                loc.t("onboarding.create.syncFailedMessage"),
            ))
            .child(caption(theme, loc.t("onboarding.create.syncFailedHint"))),
    );

    if let Some(detail) = &view.sync_error_detail {
        column = column.child(
            div()
                .w_full()
                .flex()
                .flex_col()
                .gap(px(FLOW_GAP_SM))
                .child(div().h(px(HAIRLINE)).w_full().bg(theme.divider))
                .child(caption(theme, loc.t("onboarding.create.technicalDetails")))
                .child(
                    div()
                        .w_full()
                        .p(px(FLOW_GAP_MD))
                        .rounded(px(RADIUS_FIELD))
                        .bg(theme.bg_well)
                        .font_family(theme::font_mono())
                        .text_size(theme::text_flow_caption())
                        .text_color(theme.error_base)
                        .child(SharedString::from(detail.clone())),
                ),
        );
    }

    let sink_retry = host.sink.clone();
    let sink_over = host.sink.clone();
    column
        .child(vela_button_opts(
            "flow-retry-upload",
            ButtonVariant::Primary,
            loc.t("onboarding.create.retryUploadBtn"),
            !view.busy,
            theme,
            move |_, window, cx| sink_retry(FlowEvent::RetryUpload, window, cx),
        ))
        .child(vela_button_opts(
            "flow-start-over",
            ButtonVariant::Row,
            loc.t("onboarding.create.startOverBtn"),
            !view.busy,
            theme,
            move |_, window, cx| sink_over(FlowEvent::StartOver, window, cx),
        ))
}

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------

/// The wallet exists.
///
/// This is the first moment an address is shown, and that ordering is a RULE
/// rather than a layout choice: the core withholds `address` until the group
/// has landed and the account is saved, because an address shown earlier is an
/// address someone can fund before the wallet is reachable.
fn render_done(host: &FlowHost<'_>) -> Div {
    let theme = host.theme;
    let loc = host.loc;
    let view = host.view;
    let address = view.address.clone().unwrap_or_default();
    let wallet_name = view
        .keys
        .first()
        .map_or_else(|| view.name.clone(), |key| key.name.clone());

    let mut keys = div().w_full().flex().flex_col();
    for key in &view.keys {
        let (label, fg, bg) = if key.synced {
            (
                loc.t("onboarding.create.keySyncedBadge"),
                theme.success_base,
                theme.success_soft,
            )
        } else {
            (
                loc.t("onboarding.create.keyDeviceOnlyBadge"),
                theme.fg_muted,
                theme.bg_well,
            )
        };
        keys = keys.child(
            div()
                .w_full()
                .flex()
                .items_center()
                .justify_between()
                .py(px(FLOW_GAP_MD))
                .border_b_1()
                .border_color(theme.divider)
                .child(
                    div()
                        .text_size(theme::text_card_title())
                        .text_color(theme.fg_base)
                        .child(SharedString::from(key.name.clone())),
                )
                .child(
                    div()
                        .px(px(FLOW_GAP_SM))
                        .py(px(2.))
                        .rounded_full()
                        .bg(bg)
                        .text_size(theme::text_flow_caption())
                        .text_color(fg)
                        .child(label),
                ),
        );
    }

    #[allow(clippy::cast_precision_loss, clippy::allow_attributes)]
    let success_body = loc.t_vars(
        "onboarding.create.successMessage",
        &[("count", view.keys.len() as f64)],
    );
    let on_copy = emit(&host.sink, FlowEvent::CopyAddress);
    let sink_enter = host.sink.clone();

    div()
        .w_full()
        .flex()
        .flex_col()
        .gap(px(FLOW_GAP_LG))
        .child(
            div()
                .flex()
                .flex_col()
                .gap(px(FLOW_GAP_SM))
                .child(title(theme, loc.t("onboarding.create.successTitle")))
                .child(subtitle(theme, success_body)),
        )
        .child(
            div()
                .w_full()
                .flex()
                .flex_col()
                .gap(px(FLOW_GAP_MD))
                .p(px(FLOW_GAP_LG))
                .rounded(px(RADIUS_FIELD))
                .bg(theme.bg_raised)
                .border_1()
                .border_color(theme.border_card)
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .gap(px(2.))
                        .child(
                            div()
                                .text_size(theme::text_card_title())
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_color(theme.fg_base)
                                .child(SharedString::from(wallet_name)),
                        )
                        .child(caption(theme, loc.t("onboarding.create.identiconHint"))),
                )
                .child(caption(
                    theme,
                    loc.t("onboarding.create.walletAddressLabel"),
                ))
                .child(address_strip(
                    theme,
                    SharedString::from(address),
                    host.copied,
                    loc.t("onboarding.common.copied"),
                    move |window, cx| on_copy(window, cx),
                )),
        )
        .child(keys)
        .child(caption(theme, loc.t("onboarding.create.verifyHint")))
        .child(vela_button_opts(
            "flow-enter-wallet",
            ButtonVariant::Primary,
            loc.t("onboarding.create.enterWalletBtn"),
            true,
            theme,
            move |_, window, cx| sink_enter(FlowEvent::EnterWallet, window, cx),
        ))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn view(stage: CreateStage, busy: bool, status: Option<StatusKey>) -> CreateView {
        CreateView {
            stage,
            name: String::new(),
            name_editable: true,
            name_too_long: false,
            acks: vec![false, false],
            can_submit: false,
            submit_label: SubmitLabel::Create,
            busy,
            status,
            show_start_over: false,
            address: None,
            sync_error_detail: None,
            can_go_back: false,
            keys: Vec::new(),
            can_add_key: true,
            can_finish: false,
            needs_second_key: false,
        }
    }

    /// The first key is a USB key wearing the core's default method, and the
    /// row must say what it IS.
    ///
    /// `Submit` mints the founding key before the key screen exists, so the
    /// core sends `KeyMethod::default()` — platform. On this platform that is a
    /// placeholder, not a report: the thing on the desk is a security key.
    /// Rendering "Platform passkey" there is the shell repeating a default back
    /// to the person as a fact.
    #[test]
    fn a_usb_key_reads_as_a_security_key_whatever_the_method_says() {
        let usb = CreateKeyRow {
            name: "Everyday wallet".to_owned(),
            authenticator_attachment: "cross-platform".to_owned(),
            transports: "usb".to_owned(),
            confirmed: true,
            synced: false,
            aaguid: String::new(),
            method: KeyMethod::Platform,
        };
        assert_eq!(
            provider_line(&usb),
            "onboarding.create.providerSecurityKey",
            "the report outranks the default"
        );

        // With nothing reported, the choice is all there is.
        let unreported = CreateKeyRow {
            authenticator_attachment: String::new(),
            transports: String::new(),
            ..usb.clone()
        };
        assert_eq!(
            provider_line(&unreported),
            "onboarding.create.providerPlatform"
        );
    }

    /// data-model §3's screen-selection table, which is the whole of the create
    /// UI's logic. If this drifts, a screen appears at the wrong moment — and
    /// the moment that matters is the progress screen, which is the only one
    /// with no way back out.
    #[test]
    fn the_screen_table_matches_the_data_model() {
        assert_eq!(
            Screen::of(&view(CreateStage::Form, false, None)),
            Screen::Name
        );
        assert_eq!(
            Screen::of(&view(CreateStage::AddKeys, false, None)),
            Screen::Keys
        );
        assert_eq!(
            Screen::of(&view(CreateStage::SyncFailed, false, None)),
            Screen::Retry
        );
        assert_eq!(
            Screen::of(&view(CreateStage::Created, false, None)),
            Screen::Done
        );
        assert_eq!(
            Screen::of(&view(
                CreateStage::AddKeys,
                true,
                Some(StatusKey::ComputingAddress)
            )),
            Screen::Progress,
            "a busy machine deriving an address has left the key list"
        );
    }

    /// `setting_up_identity` happens BEFORE the key list exists, so it belongs
    /// to the Name screen's status line and must not take the page over.
    /// Neither may a cancellation, which is the one thing the v2 design is
    /// explicit about not making modal.
    #[test]
    fn the_pre_key_and_cancelled_statuses_stay_on_the_name_screen() {
        for status in [
            StatusKey::SettingUpIdentity,
            StatusKey::SetupCancelled,
            StatusKey::VerifyCancelled,
        ] {
            assert_eq!(progress_for(Some(status)), None, "{status:?}");
            assert_eq!(
                Screen::of(&view(CreateStage::Form, true, Some(status))),
                Screen::Name,
                "{status:?}"
            );
        }
    }

    /// The three progress rows advance only on what the core reported.
    #[test]
    fn progress_positions_come_from_the_reported_stage() {
        assert_eq!(
            progress_for(Some(StatusKey::VerifyingIdentity)),
            Some((0, 33))
        );
        assert_eq!(progress_for(Some(StatusKey::ExtractingKey)), Some((0, 33)));
        assert_eq!(
            progress_for(Some(StatusKey::ComputingAddress)),
            Some((1, 62))
        );
        assert_eq!(progress_for(Some(StatusKey::SyncingKey)), Some((2, 100)));
        assert_eq!(progress_for(None), None);
        assert_eq!(PROGRESS_TASKS.len(), 3);
    }
}
