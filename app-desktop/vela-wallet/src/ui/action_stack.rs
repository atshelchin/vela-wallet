//! The outcome pattern's stacked actions — one authority for the primary
//! capsule + dark solid secondary rows treatment (spec 014 contract §5).
//! Presses emit the action's [`ActionId`] to the host sink; the stack never
//! decides what happens next.

use crate::onboarding_flow::{Action, ActionId, ActionRole};
use crate::theme::{FLOW_GAP_MD, Theme};
use crate::ui::{ButtonVariant, vela_button_opts};
use gpui::{App, Div, ParentElement, SharedString, Styled, Window, div, px};

pub fn action_stack(
    theme: &Theme,
    actions: &[Action],
    on_action: impl Fn(ActionId, &mut Window, &mut App) + Clone + 'static,
) -> Div {
    let mut col = div().flex().flex_col().gap(px(FLOW_GAP_MD)).w_full();
    for (ix, action) in actions.iter().enumerate() {
        let variant = match action.role {
            ActionRole::Primary => ButtonVariant::Primary,
            // NOT the outlined welcome secondary: the mock's solid rows.
            ActionRole::Secondary => ButtonVariant::Row,
        };
        let id = action.id;
        let press = on_action.clone();
        col = col.child(vela_button_opts(
            SharedString::from(format!("flow-action-{ix}")),
            variant,
            action.label.clone(),
            true,
            theme,
            move |_, window, cx| press(id, window, cx),
        ));
    }
    col
}
