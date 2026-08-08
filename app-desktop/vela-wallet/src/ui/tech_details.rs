//! 技术详情 disclosure — collapsed label row with a chevron, expanding to the
//! diagnostic code block (spec 014 FR-004, per mock E2x: error-colored code
//! line, context line, endpoint line). The toggle emits to the host; expanded
//! state lives with the panel state, default collapsed.

use crate::onboarding_flow::TechDetails;
use crate::theme::{
    self, FLOW_CARET_W, FLOW_GAP_MD, FLOW_GAP_SM, FLOW_ICON_SM, RADIUS_FIELD, Theme,
};
use gpui::{
    App, Bounds, Div, Hsla, InteractiveElement, ParentElement, PathBuilder, Pixels, Point,
    SharedString, StatefulInteractiveElement, Styled, Window, canvas, div, px,
};

pub fn tech_details(
    theme: &Theme,
    label: SharedString,
    details: &TechDetails,
    expanded: bool,
    on_toggle: impl Fn(&mut Window, &mut App) + 'static,
) -> Div {
    let chevron_color = theme.fg_muted;
    let header = div()
        .id("tech-details-toggle")
        .w_full()
        .py(px(FLOW_GAP_MD))
        .flex()
        .items_center()
        .justify_between()
        .cursor_pointer()
        .child(
            div()
                .text_size(theme::text_body())
                .text_color(theme.fg_muted)
                .child(label),
        )
        .child(
            div().size(px(FLOW_ICON_SM)).flex_none().child(
                canvas(
                    |_, _, _| (),
                    move |bounds, _, window, _| {
                        paint_chevron(bounds, expanded, chevron_color, window);
                    },
                )
                .size_full(),
            ),
        )
        .on_click(move |_, window, cx| on_toggle(window, cx));

    let mut col = div().flex().flex_col().child(header);
    if expanded {
        let mut block = div()
            .mb(px(FLOW_GAP_SM))
            .p(px(FLOW_GAP_MD))
            .rounded(px(RADIUS_FIELD))
            .bg(theme.bg_well)
            .flex()
            .flex_col()
            .gap(px(FLOW_GAP_SM))
            .child(
                div()
                    .text_size(theme::text_body())
                    .text_color(theme.error_base)
                    .child(SharedString::from(details.code.clone())),
            )
            .child(
                div()
                    .text_size(theme::text_flow_caption())
                    .text_color(theme.fg_muted)
                    .child(SharedString::from(details.context.clone())),
            );
        if let Some(endpoint) = &details.endpoint {
            block = block.child(
                div()
                    .text_size(theme::text_flow_caption())
                    .text_color(theme.fg_subtle)
                    .child(SharedString::from(endpoint.clone())),
            );
        }
        col = col.child(block);
    }
    col
}

/// Down-pointing when collapsed, up-pointing when expanded (mock E2 → E2x).
fn paint_chevron(b: Bounds<Pixels>, expanded: bool, color: Hsla, window: &mut Window) {
    let w = f32::from(b.size.width);
    let h = f32::from(b.size.height);
    let ox = f32::from(b.origin.x);
    let oy = f32::from(b.origin.y);
    let (near, far) = if expanded {
        (h * 0.65, h * 0.35)
    } else {
        (h * 0.35, h * 0.65)
    };
    let mut pb = PathBuilder::stroke(px(FLOW_CARET_W));
    pb.move_to(Point::new(px(ox + w * 0.15), px(oy + near)));
    pb.line_to(Point::new(px(ox + w * 0.5), px(oy + far)));
    pb.line_to(Point::new(px(ox + w * 0.85), px(oy + near)));
    if let Ok(path) = pb.build() {
        window.paint_path(path, color);
    }
}
