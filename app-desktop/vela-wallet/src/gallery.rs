//! Dev-only state gallery (spec 014 US1): every one of the 35 design states,
//! selectable from a fixture list grouped Create / Login (E10 under both),
//! rendered inside a 512 px replica of the Welcome action panel. Reached only
//! when `VELA_GALLERY=1` (contract §4 — the 5th env switch, same shape as
//! `VELA_THEME`); release users never see it. Interactions are the local
//! visual ones FR-011 allows; action presses are logged, never wired.

use std::rc::Rc;

use crate::loc::Loc;
use crate::onboarding_flow::{
    ActionId, CreatePanelState, FixtureFlow, FixtureState, LoginPanelState, PanelEvent, PanelHost,
    PanelSink, StateFixture, derive_can_submit, fixtures, name_too_long, render_create_panel,
    render_login_panel,
};
use crate::theme::{
    self, FLOW_GAP_LG, FLOW_GAP_MD, FLOW_GAP_SM, GALLERY_SIDEBAR_W, PANEL_W, RADIUS_CARD, Theme,
    ThemeMode,
};
use gpui::{
    Context, Div, FocusHandle, FontWeight, InteractiveElement as _, IntoElement, KeyDownEvent,
    ParentElement, Render, SharedString, StatefulInteractiveElement as _, Styled, Window, div, px,
};

/// The gallery gate. Same shape as `VELA_THEME` / `VELA_SKIP_LAUNCH_ANIMATION`.
pub fn gallery_enabled() -> bool {
    std::env::var("VELA_GALLERY").as_deref() == Ok("1")
}

/// One sidebar row: which group header it sits under and which fixture it
/// selects. E10 (flow `Shared`) appears once per group.
struct Entry {
    group: &'static str,
    fixture: usize,
}

pub struct GalleryView {
    mode: ThemeMode,
    loc: Loc,
    /// Fixture data as authored — restored whenever a state is (re-)entered,
    /// so disclosure/typing edits never leak between visits (spec edge case:
    /// collapsed is the default on every entry).
    pristine: Vec<StateFixture>,
    /// The renderable copies the local-only interactions mutate.
    fixtures: Vec<StateFixture>,
    entries: Vec<Entry>,
    selected: usize,
    /// Transient 已复制 feedback for the address strip.
    copied: bool,
    /// Host-owned focus for the name field (persists across frames).
    name_focus: FocusHandle,
    /// Keyboard target for fixture stepping.
    focus_handle: FocusHandle,
}

impl GalleryView {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let loc = Loc::from_env();
        eprintln!(
            "[vela-wallet] gallery: locale resolved to `{}`",
            loc.language()
        );
        let pristine = fixtures(&loc);
        let fixtures = pristine.clone();

        let mut entries = Vec::new();
        for (group, flows) in [
            ("Create", [FixtureFlow::Create, FixtureFlow::Shared]),
            ("Login", [FixtureFlow::Login, FixtureFlow::Shared]),
        ] {
            for (ix, fixture) in pristine.iter().enumerate() {
                if flows.contains(&fixture.flow) {
                    entries.push(Entry { group, fixture: ix });
                }
            }
        }

        let focus_handle = cx.focus_handle();
        focus_handle.focus(window, cx);

        Self {
            mode: ThemeMode::detect(window),
            loc,
            pristine,
            fixtures,
            entries,
            selected: 0,
            copied: false,
            name_focus: cx.focus_handle(),
            focus_handle,
        }
    }

    /// Select a sidebar entry; the state left and the state entered are both
    /// restored to their authored fixture data.
    fn select_entry(&mut self, ix: usize, cx: &mut Context<Self>) {
        if ix >= self.entries.len() {
            return;
        }
        let leaving = self.entries[self.selected].fixture;
        self.fixtures[leaving] = self.pristine[leaving].clone();
        self.selected = ix;
        let entering = self.entries[ix].fixture;
        self.fixtures[entering] = self.pristine[entering].clone();
        self.copied = false;
        cx.notify();
    }

    fn on_panel_event(&mut self, event: PanelEvent, cx: &mut Context<Self>) {
        let fixture = self.entries[self.selected].fixture;
        match event {
            PanelEvent::NameChanged(name) => {
                if let FixtureState::Create(CreatePanelState::Form {
                    name: state_name,
                    name_too_long: too_long,
                    acks,
                    can_submit,
                    ..
                }) = &mut self.fixtures[fixture].state
                {
                    *too_long = name_too_long(&name);
                    *can_submit = derive_can_submit(&name, *too_long, acks);
                    *state_name = name;
                    cx.notify();
                }
            }
            PanelEvent::AckToggled(ix) => {
                if let FixtureState::Create(CreatePanelState::Form {
                    name,
                    name_too_long: too_long,
                    acks,
                    can_submit,
                    ..
                }) = &mut self.fixtures[fixture].state
                {
                    if let Some(ack) = acks.get_mut(ix) {
                        *ack = !*ack;
                    }
                    *can_submit = derive_can_submit(name, *too_long, acks);
                    cx.notify();
                }
            }
            PanelEvent::Action(ActionId::ToggleDetails) => {
                let spec = match &mut self.fixtures[fixture].state {
                    FixtureState::Create(CreatePanelState::Outcome(spec)) => Some(spec),
                    FixtureState::Login(LoginPanelState::Outcome(spec)) => Some(spec),
                    _ => None,
                };
                if let Some(spec) = spec {
                    spec.details_expanded = !spec.details_expanded;
                    cx.notify();
                }
            }
            PanelEvent::Action(ActionId::CopyAddress) => {
                // The strip already wrote the clipboard; this is the feedback.
                self.copied = true;
                cx.notify();
            }
            PanelEvent::Action(id) => {
                // Gallery hosts may switch fixtures; ours records the press —
                // enough to verify the sink wiring without faking progression.
                eprintln!("[vela-wallet] gallery: action {id:?}");
            }
        }
    }

    fn sidebar(&self, theme: &Theme, cx: &mut Context<Self>) -> Div {
        let toggle_label = match self.mode {
            ThemeMode::Light => "Dark",
            ThemeMode::Dark => "Light",
        };
        let hover_bg = theme.bg_sunken;
        let header = div()
            .px(px(FLOW_GAP_LG))
            .py(px(FLOW_GAP_MD))
            .flex()
            .items_center()
            .justify_between()
            .child(
                div()
                    .text_size(theme::text_card_title())
                    .font_weight(FontWeight::SEMIBOLD)
                    .child("State Gallery"),
            )
            .child(
                div()
                    .id("theme-toggle")
                    .px(px(FLOW_GAP_MD))
                    .py(px(FLOW_GAP_SM))
                    .rounded(px(RADIUS_CARD / 2.))
                    .border_1()
                    .border_color(theme.divider)
                    .text_size(theme::text_flow_caption())
                    .text_color(theme.fg_muted)
                    .cursor_pointer()
                    .hover(move |s| s.bg(hover_bg))
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.mode = match this.mode {
                            ThemeMode::Light => ThemeMode::Dark,
                            ThemeMode::Dark => ThemeMode::Light,
                        };
                        cx.notify();
                    }))
                    .child(toggle_label),
            );

        let mut list = div()
            .id("gallery-list")
            .flex_1()
            .min_h(px(0.))
            .overflow_y_scroll()
            .pb(px(FLOW_GAP_LG))
            .flex()
            .flex_col();
        let mut last_group = "";
        for (ix, entry) in self.entries.iter().enumerate() {
            if entry.group != last_group {
                last_group = entry.group;
                list = list.child(
                    div()
                        .px(px(FLOW_GAP_LG))
                        .pt(px(FLOW_GAP_LG))
                        .pb(px(FLOW_GAP_SM))
                        .text_size(theme::text_numeral())
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(theme.fg_subtle)
                        .child(entry.group),
                );
            }
            let fixture = &self.fixtures[entry.fixture];
            let selected = ix == self.selected;
            let row_bg = if selected {
                theme.bg_sunken
            } else {
                theme.bg_raised
            };
            let row_hover = theme.bg_sunken;
            list = list.child(
                div()
                    .id(("gallery-row", ix as u64))
                    .mx(px(FLOW_GAP_MD))
                    .px(px(FLOW_GAP_MD))
                    .py(px(FLOW_GAP_SM))
                    .rounded(px(RADIUS_CARD / 2.))
                    .bg(row_bg)
                    .cursor_pointer()
                    .hover(move |s| s.bg(row_hover))
                    .on_click(cx.listener(move |this, _, _, cx| this.select_entry(ix, cx)))
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(
                        div()
                            .text_size(theme::text_body())
                            .font_weight(if selected {
                                FontWeight::SEMIBOLD
                            } else {
                                FontWeight::NORMAL
                            })
                            .text_color(theme.fg_base)
                            .child(SharedString::from(fixture.code)),
                    )
                    .child(
                        div()
                            .text_size(theme::text_numeral())
                            .text_color(theme.fg_subtle)
                            .child(SharedString::from(pattern_tag(&fixture.state))),
                    ),
            );
        }

        div()
            .w(px(GALLERY_SIDEBAR_W))
            .h_full()
            .flex_none()
            .bg(theme.bg_raised)
            .border_r_1()
            .border_color(theme.divider)
            .flex()
            .flex_col()
            .child(header)
            .child(div().h(px(theme::HAIRLINE)).w_full().bg(theme.divider))
            .child(list)
    }

    fn stage(&self, theme: &Theme, window: &Window, cx: &mut Context<Self>) -> gpui::Stateful<Div> {
        let entity = cx.entity();
        let sink: PanelSink = Rc::new(move |event, _window, cx| {
            entity.update(cx, |this, cx| this.on_panel_event(event, cx));
        });
        let host = PanelHost {
            theme,
            loc: &self.loc,
            name_focus: &self.name_focus,
            copied: self.copied,
            sink,
        };
        let fixture = &self.fixtures[self.entries[self.selected].fixture];
        let panel = match &fixture.state {
            FixtureState::Create(state) => render_create_panel(state, &host, window),
            FixtureState::Login(state) => render_login_panel(state, &host),
        };

        div()
            .id("gallery-stage")
            .flex_1()
            .min_w(px(0.))
            .h_full()
            .overflow_y_scroll()
            .flex()
            .justify_center()
            .items_start()
            .py(px(FLOW_GAP_LG * 2.))
            .child(
                // The Welcome action panel's 512 px replica (contract §4);
                // height hugs the state, as the real sheets/panels do.
                div()
                    .w(px(PANEL_W))
                    .flex_none()
                    .bg(theme.bg_raised)
                    .rounded(px(RADIUS_CARD))
                    .border_1()
                    .border_color(theme.border_card)
                    .child(panel),
            )
    }
}

/// Dev-only pattern tag shown next to each code (not user copy).
fn pattern_tag(state: &FixtureState) -> String {
    match state {
        FixtureState::Create(CreatePanelState::Form { .. }) => "form".into(),
        FixtureState::Create(CreatePanelState::Working { step, .. }) => format!("step {step}/5"),
        FixtureState::Create(CreatePanelState::Outcome(_)) => "outcome".into(),
        FixtureState::Login(LoginPanelState::Waiting { .. }) => "waiting".into(),
        FixtureState::Login(LoginPanelState::Outcome(_)) => "outcome".into(),
    }
}

impl Render for GalleryView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = Theme::of(self.mode);

        div()
            .size_full()
            .flex()
            .bg(theme.bg_base)
            .text_color(theme.fg_base)
            .track_focus(&self.focus_handle)
            .on_key_down(cx.listener(|this, event: &KeyDownEvent, _, cx| {
                match event.keystroke.key.as_str() {
                    "down" => {
                        let next = (this.selected + 1).min(this.entries.len().saturating_sub(1));
                        this.select_entry(next, cx);
                    }
                    "up" => {
                        let prev = this.selected.saturating_sub(1);
                        this.select_entry(prev, cx);
                    }
                    _ => {}
                }
            }))
            .child(self.sidebar(&theme, cx))
            .child(self.stage(&theme, window, cx))
    }
}
