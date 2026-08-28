//! The indeterminate spinner: an accent arc turning in place.
//!
//! Used by the progress screen's RUNNING task row. Every task on that screen
//! waits on something outside the app — a passkey prompt, a derivation, a
//! network write — and a still dot beside "writing the key index" says nothing
//! about whether anything is still happening (founder call, 2026-08-25). The
//! percentage meter that used to carry that job is gone, because it looked
//! measured and was not.
//!
//! Drawn with `PathBuilder::stroke` rather than an SVG asset, for the reason
//! `logo.rs` records: the default AssetSource resolves nothing.

use std::f32::consts::TAU;
use std::time::Duration;

use gpui::{
    Animation, AnimationExt, AnyElement, Bounds, Hsla, IntoElement, ParentElement, PathBuilder,
    Pixels, Point, Styled, Window, canvas, div, px,
};

/// One revolution. Slower than any transition in the system: this is a wait,
/// not a state change, and at transition speed it reads as a blur.
const REVOLUTION: Duration = Duration::from_millis(800);
/// How much of the circle the arc covers. A full ring would not appear to turn.
const SWEEP: f32 = 0.72;
/// Segments the arc is approximated with — enough that the curve reads as one.
const SEGMENTS: usize = 24;

pub fn spinner(color: Hsla, size: Pixels, stroke: Pixels) -> AnyElement {
    div()
        .size(size)
        .flex_none()
        .with_animation(
            "task-spinner",
            Animation::new(REVOLUTION).repeat(),
            move |element, delta| {
                element.child(
                    canvas(
                        |_, _, _| (),
                        move |bounds, _, window, _| paint_arc(bounds, color, stroke, delta, window),
                    )
                    .size_full(),
                )
            },
        )
        .into_any_element()
}

fn paint_arc(bounds: Bounds<Pixels>, color: Hsla, stroke: Pixels, delta: f32, window: &mut Window) {
    let width = f32::from(bounds.size.width);
    let height = f32::from(bounds.size.height);
    let radius = (width.min(height) - f32::from(stroke)) / 2.;
    if radius <= 0. {
        return;
    }
    let cx = f32::from(bounds.origin.x) + width / 2.;
    let cy = f32::from(bounds.origin.y) + height / 2.;
    let start = delta * TAU;

    let mut builder = PathBuilder::stroke(stroke);
    for step in 0..=SEGMENTS {
        #[allow(clippy::cast_precision_loss, clippy::allow_attributes)]
        let angle = start + SWEEP * TAU * (step as f32 / SEGMENTS as f32);
        let point = Point::new(px(cx + radius * angle.cos()), px(cy + radius * angle.sin()));
        if step == 0 {
            builder.move_to(point);
        } else {
            builder.line_to(point);
        }
    }
    if let Ok(path) = builder.build() {
        window.paint_path(path, color);
    }
}
