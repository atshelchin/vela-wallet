//! Reusable visual components. Everything here takes `&Theme` plus resolved
//! strings — no i18n, no page state, no window management.

mod ack_row;
mod action_stack;
mod address_strip;
mod button;
mod card;
mod elapsed_ring;
mod flow_scaffold;
mod launch_animation;
mod logo;
mod name_field;
mod status_badge;
mod step_progress;
mod tech_details;

pub use ack_row::ack_row;
pub use action_stack::action_stack;
pub use address_strip::address_strip;
pub use button::{ButtonVariant, vela_button, vela_button_opts};
pub use card::feature_card;
pub use elapsed_ring::elapsed_ring;
pub use flow_scaffold::flow_scaffold;
pub use launch_animation::LaunchAnimation;
pub use logo::vela_mark;
pub use name_field::{NameFieldStrings, name_field};
pub use status_badge::status_badge;
pub use step_progress::{login_progress, step_progress};
pub use tech_details::tech_details;
