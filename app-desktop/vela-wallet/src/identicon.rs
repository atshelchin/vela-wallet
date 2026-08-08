//! Identicon avatars (spec 015 US3, research.md D1).
//!
//! Desktop consumes vela-core's `identicon-raster` feature directly: the same
//! PNG bytes Android and iOS decode, converted once into a gpui `RenderImage`
//! and cached per (seed, size). Seeds are normalized through
//! `vela_core::normalize_seed` — never lowercased locally (spec 003's rule) —
//! and unrenderable seeds fall back to the shared placeholder artwork.

use std::collections::HashMap;
use std::sync::Arc;

use gpui::RenderImage;

use crate::raster::{empty_render_image, render_image_from_png};

/// Rasterize at 2× the logical size so avatars stay crisp on retina displays.
const RASTER_SCALE: u32 = 2;

#[derive(Default)]
pub struct IdenticonCache {
    map: HashMap<(String, u32), Arc<RenderImage>>,
}

impl IdenticonCache {
    /// The avatar image for `seed` at `logical_px` — cached for the app's
    /// lifetime (a handful of fixture seeds; no eviction needed).
    pub fn avatar(&mut self, seed: &str, logical_px: u32) -> Arc<RenderImage> {
        let normalized = vela_core::normalize_seed(seed).into_owned();
        let size = logical_px * RASTER_SCALE;
        if let Some(image) = self.map.get(&(normalized.clone(), size)) {
            return Arc::clone(image);
        }
        let png = if normalized.is_empty() {
            vela_core::identicon_placeholder_png(size)
        } else {
            vela_core::identicon_png(&normalized, size)
                .or_else(|_| vela_core::identicon_placeholder_png(size))
        };
        let image = png
            .ok()
            .as_deref()
            .and_then(render_image_from_png)
            .unwrap_or_else(empty_render_image);
        self.map.insert((normalized, size), Arc::clone(&image));
        image
    }
}
