//! Progress bars for the flow Working states (spec 014): the create flow's
//! 5-segment stepped bar and the login flow's single partially-filled track —
//! one authority for both modes.

use crate::theme::{STEP_BAR_GAP, STEP_BAR_H, Theme};
use gpui::{Div, ParentElement, Styled, div, px, relative};

/// `step` is 1-based: segments `< step` render filled (mock A4: step 1 fills
/// the first segment).
pub fn step_progress(theme: &Theme, step: u8, total: u8) -> Div {
    let mut row = div().flex().w_full().gap(px(STEP_BAR_GAP));
    for ix in 0..total {
        let fill = if ix < step {
            theme.accent
        } else {
            theme.divider
        };
        row = row.child(
            div()
                .flex_1()
                .min_w(px(0.))
                .h(px(STEP_BAR_H))
                .rounded_full()
                .bg(fill),
        );
    }
    row
}

/// The login waiting bar: one full-width track, `fraction` filled accent.
pub fn login_progress(theme: &Theme, fraction: f32) -> Div {
    div()
        .w_full()
        .h(px(STEP_BAR_H))
        .rounded_full()
        .bg(theme.divider)
        .child(
            div()
                .w(relative(fraction))
                .h_full()
                .rounded_full()
                .bg(theme.accent),
        )
}
