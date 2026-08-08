//! Elapsed-seconds ring (spec 014, the `c` progress variants): a frozen open
//! accent arc around a well circle with the seconds number centered. No
//! animation and no timekeeping — the value comes straight from state
//! (FR-011); 1- and 2-digit values fit without resizing the ring.

use crate::theme::{self, RING_SIZE, RING_STROKE, Theme};
use gpui::{
    Bounds, Div, FontWeight, Hsla, ParentElement, PathBuilder, Pixels, Point, SharedString, Styled,
    Window, canvas, div, px,
};

pub fn elapsed_ring(theme: &Theme, seconds: u16) -> Div {
    let track = theme.divider;
    let arc = theme.accent;
    div()
        .size(px(RING_SIZE))
        .flex_none()
        .relative()
        .rounded_full()
        .bg(theme.bg_well)
        .child(
            div().absolute().inset_0().child(
                canvas(
                    |_, _, _| (),
                    move |bounds, _, window, _| {
                        paint_ring(bounds, track, arc, window);
                    },
                )
                .size_full(),
            ),
        )
        .child(
            div()
                .absolute()
                .inset_0()
                .flex()
                .items_center()
                .justify_center()
                .text_size(theme::text_ring())
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(theme.fg_base)
                .child(SharedString::from(seconds.to_string())),
        )
}

/// A full track circle under a 270° accent arc starting at 12 o'clock —
/// the mocks' frozen sweep (nothing is being measured).
fn paint_ring(b: Bounds<Pixels>, track: Hsla, arc: Hsla, window: &mut Window) {
    let size = f32::from(b.size.width).min(f32::from(b.size.height));
    let cx = f32::from(b.origin.x) + f32::from(b.size.width) / 2.;
    let cy = f32::from(b.origin.y) + f32::from(b.size.height) / 2.;
    let r = size / 2. - RING_STROKE / 2.;
    let at = |x: f32, y: f32| Point::new(px(cx + x), px(cy + y));
    let radii = Point::new(px(r), px(r));

    // Track: two half arcs close the circle.
    let mut pb = PathBuilder::stroke(px(RING_STROKE));
    pb.move_to(at(0., -r));
    pb.arc_to(radii, px(0.), false, true, at(0., r));
    pb.arc_to(radii, px(0.), false, true, at(0., -r));
    if let Ok(path) = pb.build() {
        window.paint_path(path, track);
    }

    // Arc: top → 270° clockwise ends at 9 o'clock.
    let mut pb = PathBuilder::stroke(px(RING_STROKE));
    pb.move_to(at(0., -r));
    pb.arc_to(radii, px(0.), true, true, at(-r, 0.));
    if let Ok(path) = pb.build() {
        window.paint_path(path, arc);
    }
}
