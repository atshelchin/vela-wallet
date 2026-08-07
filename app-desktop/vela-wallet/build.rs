//! Embeds the Windows application icon. No-op on every other platform.
//!
//! gpui does not take an icon from `WindowOptions`; on Windows it calls
//! `LoadImageW(module, MAKEINTRESOURCE(1), IMAGE_ICON, ..)` against the running
//! executable's own resources, and the call site is
//! `load_icon().unwrap_or_default()`. A miss is therefore silent: the window
//! class registers a null HICON and Windows substitutes its generic
//! application icon in the title bar, the taskbar and Alt-Tab. The Start-menu
//! and desktop shortcuts inherit the same nothing, because Inno Setup points
//! them at this executable.
//!
//! So the icon must exist AND must be resource id 1. `set_icon_with_id` states
//! that explicitly rather than relying on the default numbering.

fn main() {
    // CARGO_CFG_TARGET_OS, not #[cfg(windows)]: the latter describes the
    // machine running this build script, which is wrong when cross-compiling
    // to Windows from Linux or macOS.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return;
    }

    let icon = "packaging/icons/app.getvela.VelaWallet.ico";
    println!("cargo:rerun-if-changed={icon}");
    println!("cargo:rerun-if-changed=build.rs");

    let mut res = winresource::WindowsResource::new();
    res.set_icon_with_id(icon, "1");
    if let Err(e) = res.compile() {
        // Failing loudly here beats shipping an installer whose every shortcut
        // shows a blank icon.
        panic!("failed to embed the Windows application icon from {icon}: {e}");
    }
}
