//! Reusable visual components. Everything here takes `&Theme` plus resolved
//! strings — no i18n, no page state, no window management.

mod ack_row;
mod address_strip;
mod button;
mod launch_animation;
mod logo;
mod name_field;
mod status_badge;

pub use ack_row::ack_row;
pub use address_strip::address_strip;
pub use button::{ButtonVariant, vela_button, vela_button_opts, welcome_cta};
pub use launch_animation::LaunchAnimation;
pub use logo::{vela_mark, vela_wordmark};
pub use name_field::{NameFieldStrings, name_field, text_field};
pub use status_badge::status_badge;
