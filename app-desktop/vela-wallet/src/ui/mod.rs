//! Reusable visual components. Everything here takes `&Theme` plus resolved
//! strings — no i18n, no page state, no window management.

mod button;
mod card;
mod logo;

pub use button::{vela_button, ButtonVariant};
pub use card::feature_card;
pub use logo::vela_mark;
