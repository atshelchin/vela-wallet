//! Vela Wallet desktop entry — window management only (spec 007 FR-009).

#![cfg_attr(
    all(target_os = "windows", not(debug_assertions)),
    windows_subsystem = "windows"
)]

mod loc;
mod onboarding;
mod theme;
mod ui;
mod window_frame;

use gpui::{
    point, px, size, App, AppContext as _, Bounds, TitlebarOptions, WindowBounds, WindowOptions,
};
use onboarding::OnboardingPage;
use theme::{WINDOW_H, WINDOW_W};

fn main() {
    gpui_platform::application().run(|cx: &mut App| {
        let bounds = Bounds::centered(None, size(px(WINDOW_W), px(WINDOW_H)), cx);

        cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(bounds)),
                // The card grid does not reflow below the design size (spec 007
                // edge cases): the design size is the minimum.
                window_min_size: Some(size(px(WINDOW_W), px(WINDOW_H))),
                titlebar: Some(TitlebarOptions {
                    title: Some("Vela Wallet".into()),
                    // Content owns the full canvas, as in the mocks; only the
                    // traffic lights remain, inset to the mock's position.
                    appears_transparent: true,
                    traffic_light_position: Some(point(px(20.), px(20.))),
                }),
                ..Default::default()
            },
            |window, cx| cx.new(|cx| OnboardingPage::new(window, cx)),
        )
        .expect("failed to open the main window");

        cx.activate(true);
    });
}
