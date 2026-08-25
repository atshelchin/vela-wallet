//! The onboarding rail (design/onboarding-desktop-b.html) — the left column
//! of every onboarding screen.
//!
//! It exists to use the desktop's width for ORIENTATION rather than for
//! padding. Three things live in it, and the middle one is the whole idea:
//!
//!   * the brand, which never moves;
//!   * one slot that says where you are — the step's ordinal, name and what it
//!     decides while the journey runs, the product's own line before it starts
//!     and after it ends;
//!   * the settings affordance, which had no permanent home before this and
//!     was reachable only from a warning that appears when the index is down.
//!
//! The ordinal is set as TYPE, not drawn as a stepper. A vertical stepper here
//! reads as a control bolted to the side of the page; a mono numeral at
//! display size reads as part of the page, carries the same fact, and gives
//! the rail something to be composed around.

use crate::icons::{Icon, IconCache};
use crate::theme::{
    self, GAP_LOGO_WORDMARK, LOGO_SIZE, RAIL_PAD_X, RAIL_PAD_Y, RAIL_RULE_H, RAIL_RULE_W,
    RAIL_TEXT_W, RAIL_W, Theme,
};
use crate::ui::{vela_mark, vela_wordmark};
use gpui::{
    App, ClickEvent, Div, FontWeight, ImageSource, InteractiveElement, ParentElement, SharedString,
    Stateful, StatefulInteractiveElement, Styled, Window, div, img, px,
};

/// What the rail's middle slot says. Same position and size either way — the
/// rail's composition does not move between screens, only its content.
pub enum RailSlot {
    /// Outside the journey: the product's own line. Welcome opens with it and
    /// Done returns to it, so the whole sequence reads brand → 01 → 02 → 03 →
    /// brand. On Done a person is no longer asking where they are; they are
    /// asking what they got, and the rail has nothing left to answer.
    Tagline(SharedString),
    /// Inside it: which step, what it is called, what it decides.
    Step {
        ordinal: usize,
        total: usize,
        name: SharedString,
        detail: SharedString,
    },
}

pub fn onboarding_rail(
    theme: &Theme,
    icons: &mut IconCache,
    slot: RailSlot,
    settings_label: SharedString,
    on_settings: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
) -> Stateful<Div> {
    let middle = match slot {
        RailSlot::Tagline(text) => div()
            .child(
                div()
                    .text_size(theme::text_rail_tagline())
                    .line_height(theme::line_height_rail_tagline())
                    .font_weight(FontWeight::BOLD)
                    .text_color(theme.fg_base)
                    .child(text),
            )
            .child(
                div()
                    .mt(px(theme::FLOW_GAP_LG))
                    .w(px(RAIL_RULE_W))
                    .h(px(RAIL_RULE_H))
                    .rounded_full()
                    .bg(theme.accent),
            ),
        RailSlot::Step {
            ordinal,
            total,
            name,
            detail,
        } => div()
            .child(
                div()
                    .flex()
                    .items_baseline()
                    .gap(px(6.))
                    .font_family(theme::font_mono())
                    .child(
                        div()
                            .text_size(theme::text_step_ordinal())
                            .line_height(theme::line_height_step_ordinal())
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(theme.rail_ordinal)
                            .child(SharedString::from(format!("{ordinal:02}"))),
                    )
                    .child(
                        div()
                            .text_size(theme::text_step_total())
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(theme.rail_ordinal_soft)
                            .child(SharedString::from(format!("/{total:02}"))),
                    ),
            )
            .child(
                div()
                    .mt(px(22.))
                    .text_size(theme::text_step_name())
                    .font_weight(FontWeight::BOLD)
                    .text_color(theme.fg_base)
                    .child(name),
            )
            .child(
                div()
                    .mt(px(6.))
                    .max_w(px(RAIL_TEXT_W))
                    .text_size(theme::text_body())
                    .line_height(theme::line_height_rail_detail())
                    .text_color(theme.fg_muted)
                    .child(detail),
            ),
    };

    let settings = div()
        .id("rail-settings")
        .flex()
        .items_center()
        .gap(px(theme::FLOW_GAP_SM))
        .cursor_pointer()
        .text_size(theme::text_row_meta())
        .text_color(theme.fg_subtle)
        .hover(|s| s.text_color(theme.fg_base))
        .on_click(on_settings)
        .child(
            img(ImageSource::Render(icons.image(
                Icon::NavSettings,
                false,
                theme.fg_subtle,
                15,
            )))
            .w(px(15.))
            .h(px(15.))
            .flex_none(),
        )
        .child(div().child(settings_label));

    div()
        .id("onboarding-rail")
        .w(px(RAIL_W))
        .h_full()
        .flex_none()
        .flex()
        .flex_col()
        .justify_between()
        .px(px(RAIL_PAD_X))
        .py(px(RAIL_PAD_Y))
        // Light steps DOWN to the sunken surface, dark stays on the base — the
        // same pair the wallet home's sidebar uses, so the two are one app.
        .bg(theme.rail_surface)
        .border_r_1()
        .border_color(theme.divider)
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(GAP_LOGO_WORDMARK))
                .child(vela_mark(theme, px(LOGO_SIZE)))
                .child(vela_wordmark(theme)),
        )
        .child(middle)
        .child(settings)
}
