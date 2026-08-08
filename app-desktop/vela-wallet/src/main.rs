//! Vela Wallet desktop entry — window management only (spec 007 FR-009).

#![cfg_attr(
    all(target_os = "windows", not(debug_assertions)),
    windows_subsystem = "windows"
)]

mod gallery;
mod loc;
mod onboarding;
mod onboarding_flow;
mod theme;
mod ui;
mod window_frame;

use gallery::GalleryView;
use gpui::{
    App, AppContext as _, Bounds, KeyBinding, Menu, MenuItem, QuitMode, TitlebarOptions,
    WindowBounds, WindowOptions, actions, point, px, size,
};
use onboarding::OnboardingPage;
use theme::{WINDOW_H, WINDOW_W};

// TODO(i18n): menu labels are English-only until the corpus grows menu keys.
actions!(vela, [Quit, HideApp, HideOthers, ShowAll, ToggleFullScreen]);

/// Open the (only) application window. Called at startup, and again from the
/// reopen handler when the Dock icon is clicked after the window was closed.
fn open_main_window(cx: &mut App) {
    let bounds = Bounds::centered(None, size(px(WINDOW_W), px(WINDOW_H)), cx);

    let options = WindowOptions {
        window_bounds: Some(WindowBounds::Windowed(bounds)),
        // The card grid does not reflow below the design size (spec 007
        // edge cases): the design size is the minimum.
        window_min_size: Some(size(px(WINDOW_W), px(WINDOW_H))),
        // Sets the Wayland `xdg_toplevel.app_id` and the X11 `WM_CLASS`.
        // Both are how a desktop shell matches a running window to its
        // installed `.desktop` file, so this string, the file name
        // `packaging/app.getvela.VelaWallet.desktop` and the
        // `StartupWMClass` inside it must stay identical — otherwise
        // GNOME shows the app with a generic icon and the binary name.
        app_id: Some("app.getvela.VelaWallet".into()),
        titlebar: Some(TitlebarOptions {
            title: Some("Vela Wallet".into()),
            // Content owns the full canvas, as in the mocks; only the
            // traffic lights remain, inset to the mock's position.
            appears_transparent: true,
            traffic_light_position: Some(point(px(20.), px(20.))),
        }),
        ..Default::default()
    };

    // Dev-only state gallery (spec 014 FR-013): `VELA_GALLERY=1` replaces the
    // Welcome root with the fixture browser. Env-gated, never a release path.
    if gallery::gallery_enabled() {
        cx.open_window(options, |window, cx| {
            cx.new(|cx| GalleryView::new(window, cx))
        })
        .expect("failed to open the main window");
    } else {
        cx.open_window(options, |window, cx| {
            cx.new(|cx| OnboardingPage::new(window, cx))
        })
        .expect("failed to open the main window");
    }
}

fn main() {
    // LastWindowClosed instead of gpui's macOS default (keep running): a
    // keep-running single-window app must reopen its window from the Dock
    // icon, and that path is dead on macOS 26 — AppKit's TextInputUI panel
    // stays `isVisible` after the last real window closes, the system then
    // reports hasVisibleWindows=YES on a Dock click, and gpui's
    // `should_handle_reopen` swallows the event before any on_reopen callback
    // (README, "Known gpui quirks"). Closing the window therefore quits, the
    // same behaviour gpui already defaults to on Windows and Linux.
    let app = gpui_platform::application().with_quit_mode(QuitMode::LastWindowClosed);

    // Insurance, not the fix: unreachable while LastWindowClosed holds, but
    // if a future gpui or quit-mode change ever leaves the app running with
    // no window, a Dock-icon click should build one rather than nothing.
    app.on_reopen(|cx| {
        if cx.windows().is_empty() {
            open_main_window(cx);
        }
    });

    app.run(|cx: &mut App| {
        cx.on_action(|_: &Quit, cx| cx.quit());
        cx.on_action(|_: &HideApp, cx| cx.hide());
        cx.on_action(|_: &HideOthers, cx| cx.hide_other_apps());
        cx.on_action(|_: &ShowAll, cx| cx.unhide_other_apps());
        cx.on_action(|_: &ToggleFullScreen, cx| {
            if let Some(window) = cx.active_window() {
                window
                    .update(cx, |_, window, _| window.toggle_fullscreen())
                    .ok();
            }
        });

        // The main menu is not just convention on macOS: with a nil
        // NSApp.mainMenu, the menu-bar/titlebar reveal on a fullscreen Space
        // never engages on secondary displays, so a fullscreened window there
        // shows no titlebar on hover and offers no way back out. gpui installs
        // no menu of its own — Zed always sets one, which is why upstream
        // never trips over this.
        if cfg!(target_os = "macos") {
            cx.bind_keys([
                KeyBinding::new("cmd-q", Quit, None),
                KeyBinding::new("cmd-h", HideApp, None),
                KeyBinding::new("alt-cmd-h", HideOthers, None),
                KeyBinding::new("ctrl-cmd-f", ToggleFullScreen, None),
            ]);
            cx.set_menus(vec![
                // The first menu is the application menu; macOS titles it with
                // the bundle name, not this string.
                Menu::new("Vela Wallet").items(vec![
                    MenuItem::action("Hide Vela Wallet", HideApp),
                    MenuItem::action("Hide Others", HideOthers),
                    MenuItem::action("Show All", ShowAll),
                    MenuItem::separator(),
                    MenuItem::action("Quit Vela Wallet", Quit),
                ]),
                Menu::new("View").items(vec![MenuItem::action(
                    "Toggle Full Screen",
                    ToggleFullScreen,
                )]),
            ]);
        }
        open_main_window(cx);

        cx.activate(true);
    });
}
