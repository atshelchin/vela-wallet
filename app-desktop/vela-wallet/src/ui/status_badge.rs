//! Outcome status badge — the one circle behind every result state's glyph
//! (spec 014, 6 variants). Glyphs are text (✓ × !) except the timeout clock,
//! which is drawn with `PathBuilder` — no SVG assets exist in this shell
//! (research D7), and gpui would render them monochrome anyway.

use crate::onboarding_flow::BadgeVariant;
use crate::theme::{self, BADGE_CIRCLE, RING_STROKE, Theme};
use gpui::{
    Bounds, Div, FontWeight, Hsla, ParentElement, PathBuilder, Pixels, Point, Styled, Window,
    canvas, div, px,
};

pub fn status_badge(theme: &Theme, variant: BadgeVariant) -> Div {
    let (bg, fg) = match variant {
        BadgeVariant::Success => (theme.success_soft, theme.success_base),
        BadgeVariant::Warning | BadgeVariant::Timeout => (theme.warning_soft, theme.warning_base),
        BadgeVariant::Error => (theme.error_soft, theme.error_base),
        BadgeVariant::Info => (theme.info_soft, theme.info_base),
        // The mock's dark charcoal circle: the shared "well" surface.
        BadgeVariant::Neutral => (theme.bg_well, theme.fg_base),
    };

    let circle = div()
        .size(px(BADGE_CIRCLE))
        .flex_none()
        .rounded_full()
        .bg(bg)
        .flex()
        .items_center()
        .justify_center();

    match variant {
        BadgeVariant::Timeout => circle.child(
            div().size(px(BADGE_CIRCLE / 2.)).child(
                canvas(
                    |_, _, _| (),
                    move |bounds, _, window, _| {
                        paint_clock(bounds, fg, window);
                    },
                )
                .size_full(),
            ),
        ),
        _ => {
            let glyph = match variant {
                BadgeVariant::Success => "✓",
                BadgeVariant::Error => "×",
                _ => "!",
            };
            circle.child(
                div()
                    .text_size(theme::text_badge_glyph())
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(fg)
                    .child(glyph),
            )
        }
    }
}

/// Clock face: a stroked circle plus hour/minute hands at ten-past-ten-ish,
/// matching the E3 mock's simple outline glyph.
fn paint_clock(b: Bounds<Pixels>, color: Hsla, window: &mut Window) {
    let size = f32::from(b.size.width).min(f32::from(b.size.height));
    let stroke = RING_STROKE / 2.;
    let cx = f32::from(b.origin.x) + f32::from(b.size.width) / 2.;
    let cy = f32::from(b.origin.y) + f32::from(b.size.height) / 2.;
    let r = size / 2. - stroke;
    let at = |x: f32, y: f32| Point::new(px(cx + x), px(cy + y));

    // Face: two half arcs make the full circle.
    let mut pb = PathBuilder::stroke(px(stroke));
    pb.move_to(at(0., -r));
    pb.arc_to(Point::new(px(r), px(r)), px(0.), false, true, at(0., r));
    pb.arc_to(Point::new(px(r), px(r)), px(0.), false, true, at(0., -r));
    if let Ok(path) = pb.build() {
        window.paint_path(path, color);
    }

    // Hands: minute up, hour out to the right.
    let mut pb = PathBuilder::stroke(px(stroke));
    pb.move_to(at(0., -r * 0.55));
    pb.line_to(at(0., 0.));
    pb.line_to(at(r * 0.42, r * 0.12));
    if let Ok(path) = pb.build() {
        window.paint_path(path, color);
    }
}
