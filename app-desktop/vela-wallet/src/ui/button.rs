//! `VelaButton` — the CTA variants of the design system, on theme tokens
//! only. Components receive already-resolved strings; they know nothing about
//! i18n (spec 007 FR-009).

use crate::theme::{self, BTN_H_PRIMARY, BTN_H_SECONDARY, OPACITY_DISABLED, Theme};
use gpui::{
    App, ClickEvent, Div, ElementId, FontWeight, InteractiveElement, ParentElement, SharedString,
    Stateful, StatefulInteractiveElement, Styled, Window, div, px,
};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ButtonVariant {
    /// Accent-filled, inverse label. Reserved for the screen's one primary action.
    Primary,
    /// Outlined on the raised surface, base label (dark label per DV-001).
    Secondary,
    /// The flow outcome stack's solid row (spec 014): filled with the `well`
    /// surface, base label — the mock's dark rows, NOT the outlined welcome
    /// secondary.
    Row,
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
    vela_button_opts(id, variant, label, true, theme, on_click)
}

/// `vela_button` plus the disabled treatment (spec 014 form CTA): the same
/// fill at `OPACITY_DISABLED` emphasis — mock A1's dimmed accent, never a gray
/// swap — with the pointer affordance and the click handler withheld.
pub fn vela_button_opts(
    id: impl Into<ElementId>,
    variant: ButtonVariant,
    label: SharedString,
    enabled: bool,
    theme: &Theme,
    on_click: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
) -> Stateful<Div> {
    let height = match variant {
        ButtonVariant::Primary => BTN_H_PRIMARY,
        ButtonVariant::Secondary | ButtonVariant::Row => BTN_H_SECONDARY,
    };
    // The height is a MINIMUM: long-locale labels wrap inside a
    // width-constrained, centered block and grow the row instead of
    // escaping the capsule (radius stays at the single-line value).
    let label_block = div().w_full().min_w(px(0.)).text_center().child(label);
    let base = div()
        .id(id)
        .min_h(px(height))
        .w_full()
        .flex_none()
        .rounded(px(height / 2.))
        .flex()
        .items_center()
        .justify_center()
        .px(px(theme::BTN_PAD_X))
        .py(px(theme::BTN_PAD_Y))
        .text_size(theme::text_button())
        .font_weight(FontWeight::SEMIBOLD);

    if !enabled {
        let styled = match variant {
            ButtonVariant::Primary => base.bg(theme.accent).text_color(theme.fg_inverse),
            ButtonVariant::Secondary => base
                .bg(theme.bg_raised)
                .text_color(theme.fg_base)
                .border_1()
                .border_color(theme.outline_strong),
            ButtonVariant::Row => base.bg(theme.bg_well).text_color(theme.fg_base),
        };
        return styled.opacity(OPACITY_DISABLED).child(label_block);
    }

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
        ButtonVariant::Row => {
            let (hover_bg, active_bg) = (theme.divider, theme.bg_sunken);
            base.bg(theme.bg_well)
                .text_color(theme.fg_base)
                .hover(move |s| s.bg(hover_bg))
                .active(move |s| s.bg(active_bg))
        }
    };

    styled
        .cursor_pointer()
        .child(label_block)
        .on_click(on_click)
}
