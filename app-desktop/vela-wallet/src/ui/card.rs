//! Feature card — numeral, title, body on the raised surface. Grid-agnostic:
//! the page owns columns and gaps; the card owns only its interior.

use crate::theme::{
    self, Theme, CARD_GAP_NUMERAL_TITLE, CARD_GAP_TITLE_BODY, CARD_MIN_H, CARD_PAD, RADIUS_CARD,
};
use gpui::{div, px, Div, FontWeight, ParentElement, SharedString, Styled};

pub fn feature_card(
    theme: &Theme,
    numeral: SharedString,
    title: SharedString,
    body: SharedString,
) -> Div {
    div()
        // Equal share of the row (204 px at the 1280 design width; wider
        // windows widen every card equally). min_w(0) — not 204 — so a window
        // below the design minimum squeezes cards instead of pushing the
        // fixed-width action panel out of the window.
        .flex_1()
        .min_w(px(0.))
        .min_h(px(CARD_MIN_H))
        .p(px(CARD_PAD))
        .rounded(px(RADIUS_CARD))
        .bg(theme.bg_raised)
        .border_1()
        .border_color(theme.border_card)
        .flex()
        .flex_col()
        .child(
            div()
                .text_size(theme::text_numeral())
                .font_weight(FontWeight::MEDIUM)
                .text_color(theme.fg_subtle)
                .child(numeral),
        )
        .child(
            div()
                .mt(px(CARD_GAP_NUMERAL_TITLE))
                .text_size(theme::text_card_title())
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(theme.fg_base)
                .child(title),
        )
        .child(
            div()
                .mt(px(CARD_GAP_TITLE_BODY))
                .text_size(theme::text_body())
                .line_height(theme::line_height_body())
                .text_color(theme.fg_muted)
                .child(body),
        )
}
