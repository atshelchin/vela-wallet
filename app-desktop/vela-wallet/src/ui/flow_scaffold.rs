//! Flow scaffold — the desktop/web-wide anatomy of every flow state (spec 014
//! contract §3): header row (state title leading, close × trailing), hairline
//! divider, pattern content. No drag handle on this form factor. Content hugs
//! its height; the host decides vertical placement inside the 512 px panel.

use crate::theme::{self, FLOW_CLOSE_HIT, FLOW_GAP_LG, HAIRLINE, PANEL_INSET, Theme};
use gpui::{
    App, Div, FontWeight, InteractiveElement, ParentElement, SharedString,
    StatefulInteractiveElement, Styled, Window, div, px,
};

pub fn flow_scaffold(
    theme: &Theme,
    title: SharedString,
    on_close: impl Fn(&mut Window, &mut App) + 'static,
    content: Div,
) -> Div {
    let hover_bg = theme.bg_sunken;
    let close = div()
        .id("flow-close")
        .size(px(FLOW_CLOSE_HIT))
        .flex_none()
        .rounded_full()
        .flex()
        .items_center()
        .justify_center()
        .cursor_pointer()
        .text_size(theme::text_flow_title())
        .text_color(theme.fg_muted)
        .hover(move |s| s.bg(hover_bg))
        .on_click(move |_, window, cx| on_close(window, cx))
        .child("×");

    div()
        .w_full()
        .flex()
        .flex_col()
        .child(
            div()
                .px(px(PANEL_INSET))
                .py(px(FLOW_GAP_LG))
                .flex()
                .items_center()
                .justify_between()
                .gap(px(FLOW_GAP_LG))
                .child(
                    div()
                        .min_w(px(0.))
                        .text_size(theme::text_flow_title())
                        .font_weight(FontWeight::BOLD)
                        .text_color(theme.fg_base)
                        .child(title),
                )
                .child(close),
        )
        .child(div().h(px(HAIRLINE)).w_full().bg(theme.divider))
        .child(div().px(px(PANEL_INSET)).py(px(FLOW_GAP_LG)).child(content))
}
