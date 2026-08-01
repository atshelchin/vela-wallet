//! The Vela mark, drawn with `PathBuilder` from the exact geometry of
//! `design/onboarding/logo-*.svg` (viewBox 258×260).
//!
//! Not `svg()`: the default AssetSource resolves nothing (silently), and gpui
//! renders SVGs as monochrome masks anyway — the mark needs three fills
//! (research.md D2). The two sails are theme-invariant; the hull themes.

use crate::theme::Theme;
use gpui::{
    canvas, div, px, Bounds, Div, Hsla, ParentElement, PathBuilder, Pixels, Point, Styled, Window,
};

/// Logo viewBox, the coordinate space of the path constants below.
const VB_W: f32 = 258.;
const VB_H: f32 = 260.;

pub fn vela_mark(theme: &Theme, size: Pixels) -> Div {
    let (sail_a, sail_b, hull) = (theme.logo_sail_a, theme.logo_sail_b, theme.logo_hull);
    div().size(size).flex_none().child(
        canvas(
            |_, _, _| (),
            move |bounds, _, window, _| {
                paint_mark(bounds, sail_a, sail_b, hull, window);
            },
        )
        .size_full(),
    )
}

fn paint_mark(b: Bounds<Pixels>, sail_a: Hsla, sail_b: Hsla, hull: Hsla, window: &mut Window) {
    // Uniform scale, centered — the viewBox is nearly square.
    let scale = f32::from(b.size.width).min(f32::from(b.size.height)) / VB_W.max(VB_H);
    let ox = f32::from(b.origin.x) + (f32::from(b.size.width) - VB_W * scale) / 2.;
    let oy = f32::from(b.origin.y) + (f32::from(b.size.height) - VB_H * scale) / 2.;
    let at = move |x: f32, y: f32| Point::new(px(ox + x * scale), px(oy + y * scale));

    // Big sail: M122,0 C70,53 38,118 18,187 L122,187 Z
    let mut pb = PathBuilder::fill();
    pb.move_to(at(122., 0.));
    pb.cubic_bezier_to(at(18., 187.), at(70., 53.), at(38., 118.));
    pb.line_to(at(122., 187.));
    pb.close();
    if let Ok(path) = pb.build() {
        window.paint_path(path, sail_a);
    }

    // Small sail: M142,42 C193,75 225,128 240,187 L142,187 Z
    let mut pb = PathBuilder::fill();
    pb.move_to(at(142., 42.));
    pb.cubic_bezier_to(at(240., 187.), at(193., 75.), at(225., 128.));
    pb.line_to(at(142., 187.));
    pb.close();
    if let Ok(path) = pb.build() {
        window.paint_path(path, sail_b);
    }

    // Hull: M0,207 L258,207 C243,240 211,260 165,260 L92,260 C49,260 16,240 0,207 Z
    let mut pb = PathBuilder::fill();
    pb.move_to(at(0., 207.));
    pb.line_to(at(258., 207.));
    pb.cubic_bezier_to(at(165., 260.), at(243., 240.), at(211., 260.));
    pb.line_to(at(92., 260.));
    pb.cubic_bezier_to(at(0., 207.), at(49., 260.), at(16., 240.));
    pb.close();
    if let Ok(path) = pb.build() {
        window.paint_path(path, hull);
    }
}
