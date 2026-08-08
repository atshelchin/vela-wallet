//! Copyable address strip (spec 014, mock A11): full-width well row, the
//! address tail-truncated, a trailing copy affordance. Activating it copies
//! the FULL untruncated address to the clipboard and asks the host to show
//! the transient 已复制 feedback (a bool + notify — no timers, FR-011).

use crate::theme::{
    self, FLOW_GAP_MD, FLOW_GAP_SM, FLOW_ICON_MD, INPUT_H, RADIUS_FIELD, RING_STROKE, Theme,
};
use gpui::{
    App, Bounds, ClipboardItem, Div, FontWeight, Hsla, InteractiveElement, ParentElement,
    PathBuilder, Pixels, Point, SharedString, Stateful, StatefulInteractiveElement, Styled, Window,
    canvas, div, px,
};

pub fn address_strip(
    theme: &Theme,
    address: SharedString,
    copied: bool,
    copied_label: SharedString,
    on_copied: impl Fn(&mut Window, &mut App) + 'static,
) -> Stateful<Div> {
    let icon_color = theme.fg_muted;
    let affordance = if copied {
        div()
            .flex_none()
            .text_size(theme::text_flow_caption())
            .font_weight(FontWeight::MEDIUM)
            .text_color(theme.success_base)
            .child(copied_label)
    } else {
        div().flex_none().size(px(FLOW_ICON_MD)).child(
            canvas(
                |_, _, _| (),
                move |bounds, _, window, _| {
                    paint_copy_icon(bounds, icon_color, window);
                },
            )
            .size_full(),
        )
    };

    div()
        .id("address-strip")
        .w_full()
        .h(px(INPUT_H))
        .flex_none()
        .rounded(px(RADIUS_FIELD))
        .bg(theme.bg_well)
        .px(px(FLOW_GAP_MD))
        .flex()
        .items_center()
        .gap(px(FLOW_GAP_SM))
        .cursor_pointer()
        .child(
            div()
                .flex_1()
                .min_w(px(0.))
                .overflow_hidden()
                .whitespace_nowrap()
                .text_ellipsis()
                .text_size(theme::text_body())
                .font_weight(FontWeight::MEDIUM)
                .text_color(theme.fg_base)
                .child(address.clone()),
        )
        .child(affordance)
        .on_click(move |_, window, cx| {
            cx.write_to_clipboard(ClipboardItem::new_string(address.to_string()));
            on_copied(window, cx);
        })
}

/// Two offset stroked squares — the conventional copy glyph, PathBuilder-drawn
/// (no SVG assets in this shell).
fn paint_copy_icon(b: Bounds<Pixels>, color: Hsla, window: &mut Window) {
    let s = f32::from(b.size.width).min(f32::from(b.size.height));
    let ox = f32::from(b.origin.x);
    let oy = f32::from(b.origin.y);
    let stroke = RING_STROKE / 3.;
    let square = s * 0.62;
    let mut rect = |x0: f32, y0: f32| {
        let mut pb = PathBuilder::stroke(px(stroke));
        pb.move_to(Point::new(px(ox + x0), px(oy + y0)));
        pb.line_to(Point::new(px(ox + x0 + square), px(oy + y0)));
        pb.line_to(Point::new(px(ox + x0 + square), px(oy + y0 + square)));
        pb.line_to(Point::new(px(ox + x0), px(oy + y0 + square)));
        pb.close();
        if let Ok(path) = pb.build() {
            window.paint_path(path, color);
        }
    };
    rect(s * 0.30, s * 0.08);
    rect(s * 0.08, s * 0.30);
}
