//! Wallet icon corpus — the desktop port of
//! `specs/015-wallet-home-ui/contracts/icons.json` (research.md D2).
//!
//! Utility glyphs are lucide (ISC, stroke-based); nav glyphs are Material
//! Symbols (Apache-2.0, fill-based) with outline/solid pairs sharing metrics so
//! selection swaps style without the row shifting. gpui's `svg()` renders
//! monochrome masks through an AssetSource this app doesn't have, so icons are
//! tinted by substituting the color into the SVG template, rasterized with
//! resvg, and cached per (icon, solid, color, size).

use std::collections::HashMap;
use std::sync::Arc;

use gpui::{Hsla, RenderImage, Rgba};

use crate::raster::{empty_render_image, render_image_from_pixmap};

/// Rasterize at 2× the logical size for retina crispness.
const RASTER_SCALE: u32 = 2;

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum Icon {
    // nav (outline/solid pairs, fill style)
    NavWallet,
    NavContacts,
    NavExplore,
    NavSettings,
    // utility (stroke style)
    ArrowDownLeft,
    ArrowUpRight,
    ScanLine,
    EyeOff,
    Search,
    X,
    Copy,
    ChevronRight,
    ChevronDown,
    Link2,
    TriangleAlert,
    RefreshCw,
    Check,
    Inbox,
    WalletOutline,
}

/// Inner SVG markup per icon. `{c}` is substituted with the tint.
fn body(icon: Icon, solid: bool) -> &'static str {
    match icon {
        Icon::NavWallet => {
            if solid {
                r##"<path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>"##
            } else {
                r##"<path d="M21 7.28V5c0-1.1-.9-2-2-2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-2.28c.59-.35 1-.98 1-1.72V9c0-.74-.41-1.37-1-1.72zM20 9v6h-7V9h7zM5 19V5h14v2h-6c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h6v2H5z"/><path d="M16 13.5c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5-1.5.67-1.5 1.5.67 1.5 1.5 1.5z"/>"##
            }
        }
        Icon::NavContacts => {
            if solid {
                r##"<path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>"##
            } else {
                r##"<path d="M16.5 12c1.38 0 2.49-1.12 2.49-2.5S17.88 7 16.5 7C15.12 7 14 8.12 14 9.5s1.12 2.5 2.5 2.5zM9 11c1.66 0 2.99-1.34 2.99-3S10.66 5 9 5C7.34 5 6 6.34 6 8s1.34 3 3 3zm7.5 3c-1.83 0-5.5.92-5.5 2.75V19h11v-2.25c0-1.83-3.67-2.75-5.5-2.75zM9 13c-2.33 0-7 1.17-7 3.5V19h7v-2.25c0-.85.33-2.34 2.37-3.47C10.5 13.1 9.66 13 9 13z"/>"##
            }
        }
        Icon::NavExplore => {
            if solid {
                r##"<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm2.19 12.19L6 18l3.81-8.19L18 6l-3.81 8.19z"/>"##
            } else {
                r##"<path d="M12 10.9c-.61 0-1.1.49-1.1 1.1s.49 1.1 1.1 1.1c.61 0 1.1-.49 1.1-1.1s-.49-1.1-1.1-1.1zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm2.19-12.19L6 18l3.81-8.19L18 6l-3.81 8.19z"/>"##
            }
        }
        Icon::NavSettings => {
            if solid {
                r##"<path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>"##
            } else {
                r##"<path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/>"##
            }
        }
        Icon::ArrowDownLeft => r##"<path d="M17 7 7 17"/><path d="M17 17H7V7"/>"##,
        Icon::ArrowUpRight => r##"<path d="M7 7h10v10"/><path d="M7 17 17 7"/>"##,
        Icon::ScanLine => {
            r##"<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>"##
        }
        Icon::EyeOff => {
            r##"<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>"##
        }
        Icon::Search => r##"<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>"##,
        Icon::X => r##"<path d="M18 6 6 18"/><path d="m6 6 12 12"/>"##,
        Icon::Copy => {
            r##"<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>"##
        }
        Icon::ChevronRight => r##"<path d="m9 18 6-6-6-6"/>"##,
        Icon::ChevronDown => r##"<path d="m6 9 6 6 6-6"/>"##,
        Icon::Link2 => {
            r##"<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/>"##
        }
        Icon::TriangleAlert => {
            r##"<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>"##
        }
        Icon::RefreshCw => {
            r##"<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>"##
        }
        Icon::Check => r##"<path d="M20 6 9 17l-5-5"/>"##,
        Icon::Inbox => {
            r##"<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>"##
        }
        Icon::WalletOutline => {
            r##"<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>"##
        }
    }
}

fn is_fill_style(icon: Icon) -> bool {
    matches!(
        icon,
        Icon::NavWallet | Icon::NavContacts | Icon::NavExplore | Icon::NavSettings
    )
}

fn svg_document(icon: Icon, solid: bool, color_hex: &str) -> String {
    let inner = body(icon, solid);
    if is_fill_style(icon) {
        format!(
            r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="{color_hex}">{inner}</svg>"##
        )
    } else {
        format!(
            r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="{color_hex}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{inner}</svg>"##
        )
    }
}

fn hex_of(color: Hsla) -> (String, u32) {
    let rgba: Rgba = color.into();
    let r = (rgba.r * 255.).round() as u32;
    let g = (rgba.g * 255.).round() as u32;
    let b = (rgba.b * 255.).round() as u32;
    (format!("#{r:02x}{g:02x}{b:02x}"), (r << 16) | (g << 8) | b)
}

#[derive(Default)]
pub struct IconCache {
    map: HashMap<(Icon, bool, u32, u32), Arc<RenderImage>>,
}

impl IconCache {
    /// Tinted icon image at `logical_px` — rasterized once per
    /// (icon, style, color, size) and cached for the app's lifetime.
    pub fn image(
        &mut self,
        icon: Icon,
        solid: bool,
        color: Hsla,
        logical_px: u32,
    ) -> Arc<RenderImage> {
        let (hex, color_key) = hex_of(color);
        let size = logical_px * RASTER_SCALE;
        let key = (icon, solid, color_key, size);
        if let Some(image) = self.map.get(&key) {
            return Arc::clone(image);
        }
        let image =
            rasterize(&svg_document(icon, solid, &hex), size).unwrap_or_else(empty_render_image);
        self.map.insert(key, Arc::clone(&image));
        image
    }
}

fn rasterize(svg: &str, size: u32) -> Option<Arc<RenderImage>> {
    let options = resvg::usvg::Options::default();
    let tree = resvg::usvg::Tree::from_str(svg, &options).ok()?;
    let mut pixmap = resvg::tiny_skia::Pixmap::new(size, size)?;
    let view = tree.size();
    let transform = resvg::tiny_skia::Transform::from_scale(
        size as f32 / view.width(),
        size as f32 / view.height(),
    );
    resvg::render(&tree, transform, &mut pixmap.as_mut());
    render_image_from_pixmap(&pixmap)
}
