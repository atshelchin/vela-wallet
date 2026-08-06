//! Client-side window chrome, for compositors that make it the app's problem.
//!
//! GNOME's Mutter never implemented the xdg-decoration protocol, so under
//! Wayland gpui reports `Decorations::Client`: the compositor draws no
//! titlebar, no border and no resize grips, and every affordance the user
//! expects of "a window" is the application's job. This module is that job —
//! a shadow band that doubles as the resize handle, a border, rounded
//! corners — adapted from Zed's `client_side_decorations`
//! (crates/workspace/src/workspace.rs), where the design is proven.
//!
//! Everything is gated on `Decorations::Client` at runtime, and only the two
//! Linux backends ever report it — `window_decorations()` defaults to
//! `Server` (gpui platform.rs) and neither the macOS nor the Windows backend
//! overrides it. On those platforms `window_frame` is a transparent
//! passthrough and AppKit's transparent titlebar keeps doing what it always
//! did.

use crate::theme::Theme;
use gpui::prelude::FluentBuilder as _;
use gpui::{
    Bounds, BoxShadow, CursorStyle, Decorations, Div, Global, HitboxBehavior, Hsla,
    InteractiveElement as _, IntoElement, MouseButton, ParentElement as _, Pixels, Point,
    ResizeEdge, Size, Stateful, Styled, Tiling, Window, canvas, div, point, px,
    transparent_black,
};

/// Shadow reach outside the visible window. It is also the resize grab band —
/// which is why it is no smaller — and the compositor is told it is not part
/// of the window (`set_client_inset`), so tiling and snapping stay exact.
/// Matches Zed's `CLIENT_SIDE_DECORATION_SHADOW`.
pub const FRAME_SHADOW: Pixels = px(10.);

/// Corner radius of the floating window. Matches Zed's rounding, so the two
/// sit naturally next to each other on the same desktop.
pub const FRAME_ROUNDING: Pixels = px(10.);

const FRAME_BORDER: Pixels = px(1.);

/// `Some(tiling)` when the window draws its own chrome; `None` wherever the
/// server decorates (macOS always; KDE and most X11 WMs). Corner-hugging
/// elements use the tiling to round themselves flush with the frame, and the
/// page uses `is_some` to know whether it needs a drag strip at all.
pub fn frame_tiling(window: &Window) -> Option<Tiling> {
    match window.window_decorations() {
        Decorations::Server => None,
        Decorations::Client { tiling } => Some(tiling),
    }
}

/// Rounds each corner whose two adjacent edges are both untiled — a tiled or
/// maximized window is square exactly where it meets the screen edge.
pub fn round_to_frame<E: Styled>(mut el: E, tiling: Tiling) -> E {
    if !tiling.top && !tiling.left {
        el = el.rounded_tl(FRAME_ROUNDING);
    }
    if !tiling.top && !tiling.right {
        el = el.rounded_tr(FRAME_ROUNDING);
    }
    if !tiling.bottom && !tiling.left {
        el = el.rounded_bl(FRAME_ROUNDING);
    }
    if !tiling.bottom && !tiling.right {
        el = el.rounded_br(FRAME_ROUNDING);
    }
    el
}

/// The resize edge the cursor was over on the previous frame. A change means
/// the cursor style is stale, so the frame repaints (Zed's `GlobalResizeEdge`
/// device, minus the workspace entity it notifies).
struct LastResizeEdge(Option<ResizeEdge>);
impl Global for LastResizeEdge {}

/// Wraps the page in the window chrome. Under server decorations this is a
/// transparent passthrough; under client decorations it owns the shadow, the
/// border, the rounding and every resize interaction.
pub fn window_frame(content: impl IntoElement, theme: &Theme, window: &mut Window) -> Stateful<Div> {
    let decorations = window.window_decorations();

    // The compositor must know how much of the surface is shadow, so input
    // geometry and tiling apply to the visible window, not the whole canvas.
    match decorations {
        Decorations::Client { .. } => window.set_client_inset(FRAME_SHADOW),
        Decorations::Server => window.set_client_inset(px(0.)),
    }

    div()
        .id("window-frame")
        .bg(transparent_black())
        .map(|el| match decorations {
            Decorations::Server => el,
            Decorations::Client { tiling } => el
                .when(!tiling.top, |el| el.pt(FRAME_SHADOW))
                .when(!tiling.bottom, |el| el.pb(FRAME_SHADOW))
                .when(!tiling.left, |el| el.pl(FRAME_SHADOW))
                .when(!tiling.right, |el| el.pr(FRAME_SHADOW))
                // The shadow is the resize handle: cursor feedback on move…
                .on_mouse_move(move |e, window, cx| {
                    let size = window.window_bounds().get_bounds().size;
                    let edge = resize_edge(e.position, FRAME_SHADOW, size, tiling);
                    let last = cx.try_global::<LastResizeEdge>().and_then(|g| g.0);
                    if edge != last {
                        cx.set_global(LastResizeEdge(edge));
                        window.refresh();
                    }
                })
                // …and the compositor takes over on mouse down.
                .on_mouse_down(MouseButton::Left, move |e, window, _| {
                    let size = window.window_bounds().get_bounds().size;
                    if let Some(edge) = resize_edge(e.position, FRAME_SHADOW, size, tiling) {
                        window.start_window_resize(edge);
                    }
                }),
        })
        .size_full()
        .child(
            div()
                .map(|el| match decorations {
                    Decorations::Server => el,
                    Decorations::Client { tiling } => round_to_frame(el, tiling)
                        .border_color(theme.panel_edge)
                        .when(!tiling.top, |el| el.border_t(FRAME_BORDER))
                        .when(!tiling.bottom, |el| el.border_b(FRAME_BORDER))
                        .when(!tiling.left, |el| el.border_l(FRAME_BORDER))
                        .when(!tiling.right, |el| el.border_r(FRAME_BORDER))
                        .when(!tiling.is_tiled(), |el| {
                            el.shadow(vec![
                                BoxShadow::new(
                                    px(0.),
                                    px(0.),
                                    Hsla {
                                        h: 0.,
                                        s: 0.,
                                        l: 0.,
                                        a: 0.4,
                                    },
                                )
                                .blur_radius(FRAME_SHADOW / 2.),
                            ])
                        }),
                })
                // Hover tracking inside the window is the content's business —
                // without this, every mouse move over the page would also run
                // the shadow's edge tracking above. Mouse *down* still bubbles,
                // which is harmless: `resize_edge` is `None` inside the window.
                .on_mouse_move(|_, _, cx| cx.stop_propagation())
                .size_full()
                .child(content),
        )
        .map(|el| match decorations {
            Decorations::Server => el,
            Decorations::Client { tiling } => el.child(
                // Paint-phase cursor styling: a full-surface hitbox, and per
                // frame the cursor matching whichever resize edge the mouse is
                // over — nothing when it is over the content, so the page's
                // own cursors win there.
                canvas(
                    |_bounds, window, _| {
                        window.insert_hitbox(
                            Bounds::new(
                                point(px(0.), px(0.)),
                                window.window_bounds().get_bounds().size,
                            ),
                            HitboxBehavior::Normal,
                        )
                    },
                    move |_bounds, hitbox, window, _| {
                        let mouse = window.mouse_position();
                        let size = window.window_bounds().get_bounds().size;
                        let Some(edge) = resize_edge(mouse, FRAME_SHADOW, size, tiling) else {
                            return;
                        };
                        window.set_cursor_style(
                            match edge {
                                ResizeEdge::Top | ResizeEdge::Bottom => CursorStyle::ResizeUpDown,
                                ResizeEdge::Left | ResizeEdge::Right => {
                                    CursorStyle::ResizeLeftRight
                                }
                                ResizeEdge::TopLeft | ResizeEdge::BottomRight => {
                                    CursorStyle::ResizeUpLeftDownRight
                                }
                                ResizeEdge::TopRight | ResizeEdge::BottomLeft => {
                                    CursorStyle::ResizeUpRightDownLeft
                                }
                            },
                            &hitbox,
                        );
                    },
                )
                .size_full()
                .absolute(),
            ),
        })
}

/// Which resize handle a point in the shadow band corresponds to, if any.
/// Corner zones reach half again as deep as the edges, or they would be
/// nearly impossible to hit. Straight from Zed's `resize_edge`.
fn resize_edge(
    pos: Point<Pixels>,
    shadow_size: Pixels,
    window_size: Size<Pixels>,
    tiling: Tiling,
) -> Option<ResizeEdge> {
    let bounds = Bounds::new(Point::default(), window_size).inset(shadow_size * 1.5);
    if bounds.contains(&pos) {
        return None;
    }

    let corner_size = gpui::size(shadow_size * 1.5, shadow_size * 1.5);
    let top_left_bounds = Bounds::new(Point::new(px(0.), px(0.)), corner_size);
    if !tiling.top && top_left_bounds.contains(&pos) {
        return Some(ResizeEdge::TopLeft);
    }

    let top_right_bounds = Bounds::new(
        Point::new(window_size.width - corner_size.width, px(0.)),
        corner_size,
    );
    if !tiling.top && top_right_bounds.contains(&pos) {
        return Some(ResizeEdge::TopRight);
    }

    let bottom_left_bounds = Bounds::new(
        Point::new(px(0.), window_size.height - corner_size.height),
        corner_size,
    );
    if !tiling.bottom && bottom_left_bounds.contains(&pos) {
        return Some(ResizeEdge::BottomLeft);
    }

    let bottom_right_bounds = Bounds::new(
        Point::new(
            window_size.width - corner_size.width,
            window_size.height - corner_size.height,
        ),
        corner_size,
    );
    if !tiling.bottom && bottom_right_bounds.contains(&pos) {
        return Some(ResizeEdge::BottomRight);
    }

    if !tiling.top && pos.y < shadow_size {
        Some(ResizeEdge::Top)
    } else if !tiling.bottom && pos.y > window_size.height - shadow_size {
        Some(ResizeEdge::Bottom)
    } else if !tiling.left && pos.x < shadow_size {
        Some(ResizeEdge::Left)
    } else if !tiling.right && pos.x > window_size.width - shadow_size {
        Some(ResizeEdge::Right)
    } else {
        None
    }
}
