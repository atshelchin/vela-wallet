//! Reusable visual components. Everything here takes `&Theme` plus resolved
//! strings — no i18n, no page state, no window management.

mod ack_row;
mod button;
mod launch_animation;
mod logo;
mod name_field;
mod rail;
mod status_badge;

pub use ack_row::ack_row;
pub use button::{ButtonVariant, vela_button, vela_button_opts, welcome_cta};
pub use launch_animation::LaunchAnimation;
pub use logo::{vela_mark, vela_wordmark};
pub use name_field::{NameFieldStrings, name_field, text_field};
pub use rail::{RailSlot, onboarding_rail};
pub use status_badge::status_badge;
