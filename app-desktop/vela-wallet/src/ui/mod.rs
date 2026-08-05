//! Reusable visual components. Everything here takes `&Theme` plus resolved
//! strings — no i18n, no page state, no window management.

mod button;
mod card;
mod launch_animation;
mod logo;

pub use button::{ButtonVariant, vela_button};
pub use card::feature_card;
pub use launch_animation::LaunchAnimation;
pub use logo::vela_mark;
