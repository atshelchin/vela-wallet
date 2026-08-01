//! `VelaButton` — the two CTA variants of the design system, on theme tokens
//! only. Components receive already-resolved strings; they know nothing about
//! i18n (spec 007 FR-009).

use crate::theme::{self, Theme, BTN_H_PRIMARY, BTN_H_SECONDARY};
use gpui::{
    div, px, App, ClickEvent, Div, ElementId, FontWeight, InteractiveElement, ParentElement,
    SharedString, Stateful, StatefulInteractiveElement, Styled, Window,
};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ButtonVariant {
    /// Accent-filled, inverse label. Reserved for the screen's one primary action.
    Primary,
    /// Outlined on the raised surface, base label (dark label per DV-001).
    Secondary,
}

/// Returns `Stateful<Div>` rather than `impl IntoElement`: under edition 2024
/// RPIT would capture the theme borrow and forbid a second call in one render.
pub fn vela_button(
    id: impl Into<ElementId>,
    variant: ButtonVariant,
    label: SharedString,
    theme: &Theme,
    on_click: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
) -> Stateful<Div> {
    let height = match variant {
        ButtonVariant::Primary => BTN_H_PRIMARY,
        ButtonVariant::Secondary => BTN_H_SECONDARY,
    };
    let base = div()
        .id(id)
        .h(px(height))
        .w_full()
        // Capsule: radius = height / 2.
        .rounded(px(height / 2.))
        .flex()
        .items_center()
        .justify_center()
        .cursor_pointer()
        .text_size(theme::text_button())
        .font_weight(FontWeight::SEMIBOLD);

    let styled = match variant {
        ButtonVariant::Primary => {
            let (hover, active) = (theme.accent_hover, theme.accent_active);
            base.bg(theme.accent)
                .text_color(theme.fg_inverse)
                .hover(move |s| s.bg(hover))
                .active(move |s| s.bg(active))
        }
        ButtonVariant::Secondary => {
            let (hover_bg, active_bg) = (theme.bg_sunken, theme.divider);
            base.bg(theme.bg_raised)
                .text_color(theme.fg_base)
                .border_1()
                .border_color(theme.outline_strong)
                .hover(move |s| s.bg(hover_bg))
                .active(move |s| s.bg(active_bg))
        }
    };

    styled.child(label).on_click(on_click)
}
