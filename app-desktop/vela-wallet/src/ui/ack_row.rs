//! Acknowledgment row (spec 014 Form pattern): hairline checkbox square that
//! fills accent + white ✓ when checked, muted sentence text, and — for the
//! legal row — inline links that wrap across lines while staying individually
//! activatable (`InteractiveText` ranges), never toggling the checkbox.

use std::ops::Range;

use crate::theme::{self, ACK_BOX, FLOW_GAP_MD, Theme};
use gpui::{
    App, Div, FontWeight, HighlightStyle, InteractiveElement, InteractiveText, ParentElement,
    SharedString, StatefulInteractiveElement, Styled, StyledText, Window, div, px,
};

/// Generic over the link id so this atom does not have to know which screen's
/// vocabulary it is carrying — the legal row's two links mean something to the
/// create flow and nothing here.
pub fn ack_row<Link: Copy + 'static>(
    ix: usize,
    theme: &Theme,
    checked: bool,
    text: SharedString,
    links: Vec<(Range<usize>, Link)>,
    on_toggle: impl Fn(&mut Window, &mut App) + 'static,
    on_link: impl Fn(Link, &mut Window, &mut App) + 'static,
) -> Div {
    let checkbox = {
        let base = div()
            .id(("ack-box", ix as u64))
            .size(px(ACK_BOX))
            .flex_none()
            // Optical alignment with the first text line (20 px line height).
            .mt(px(1.))
            .rounded(px(ACK_BOX / 3.))
            .flex()
            .items_center()
            .justify_center()
            .cursor_pointer();
        let styled = if checked {
            base.bg(theme.accent).child(
                div()
                    .text_size(theme::text_flow_caption())
                    .font_weight(FontWeight::BOLD)
                    .text_color(theme.fg_inverse)
                    .child("✓"),
            )
        } else {
            base.border_1().border_color(theme.outline_strong)
        };
        styled.on_click(move |_, window, cx| on_toggle(window, cx))
    };

    let body = if links.is_empty() {
        div().child(text)
    } else {
        let accent = theme.accent;
        let highlights: Vec<(Range<usize>, HighlightStyle)> = links
            .iter()
            .map(|(range, _)| {
                (
                    range.clone(),
                    HighlightStyle {
                        color: Some(accent),
                        ..HighlightStyle::default()
                    },
                )
            })
            .collect();
        let ranges: Vec<Range<usize>> = links.iter().map(|(range, _)| range.clone()).collect();
        let ids: Vec<Link> = links.iter().map(|(_, id)| *id).collect();
        div().child(
            InteractiveText::new(
                ("ack-links", ix as u64),
                StyledText::new(text).with_highlights(highlights),
            )
            .on_click(ranges, move |link_ix, window, cx| {
                if let Some(id) = ids.get(link_ix) {
                    on_link(*id, window, cx);
                }
            }),
        )
    };

    div()
        .flex()
        .items_start()
        .gap(px(FLOW_GAP_MD))
        .child(checkbox)
        .child(
            div()
                .flex_1()
                .min_w(px(0.))
                .text_size(theme::text_body())
                .line_height(theme::line_height_body())
                .text_color(theme.fg_muted)
                .child(body),
        )
}
