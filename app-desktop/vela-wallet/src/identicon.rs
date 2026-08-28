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
    /// Passkey-provider marks, keyed by (aaguid, dark, size). `None` is cached
    /// too: an AAGUID the catalog does not know must not re-enter the
    /// rasterizer on every frame of a list.
    marks: HashMap<(String, bool, u32), Option<Arc<RenderImage>>>,
    /// Security-key fallback artwork, keyed by every input that shapes it.
    fallbacks: HashMap<String, Option<Arc<RenderImage>>>,
}

/// `#rrggbb` for the SVG palette slots. gpui carries colour as HSLA; the
/// artwork wants what CSS wants.
fn hex(color: gpui::Hsla) -> String {
    let rgba = gpui::Rgba::from(color);
    let channel = |v: f32| (v.clamp(0., 1.) * 255.).round() as u8;
    format!(
        "#{:02x}{:02x}{:02x}",
        channel(rgba.r),
        channel(rgba.g),
        channel(rgba.b)
    )
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

    /// The security-key mark for a key the catalog cannot name, at
    /// `logical_px`. `None` when the row deserves no mark of this kind — a
    /// platform authenticator, which says nothing more than "on this device".
    ///
    /// Keyed by every input, palette included: the artwork wears theme colours,
    /// so a cached light-mode image must not survive into dark mode.
    pub fn passkey_fallback(
        &mut self,
        attachment: &str,
        transports: &str,
        chose_security_key: bool,
        theme: &crate::theme::Theme,
        logical_px: u32,
    ) -> Option<Arc<RenderImage>> {
        let size = logical_px * RASTER_SCALE;
        let key = format!(
            "{attachment}|{transports}|{chose_security_key}|{}|{size}",
            theme.is_dark()
        );
        if let Some(hit) = self.fallbacks.get(&key) {
            return hit.clone();
        }
        let image = vela_core::identicon_raster::passkey_fallback_png(
            attachment,
            transports,
            chose_security_key,
            vela_core::passkey::MarkPalette {
                strong: &hex(theme.fg_muted),
                soft: &hex(theme.divider),
                hole: &hex(theme.bg_base),
            },
            size,
        )
        .ok()
        .flatten()
        .as_deref()
        .and_then(render_image_from_png);
        self.fallbacks.insert(key, image.clone());
        image
    }

    /// The mark of the vault holding a passkey, for `aaguid` at `logical_px`.
    ///
    /// `None` when the catalog has no entry — a hardware key, or an
    /// authenticator that reported no AAGUID. That is a normal answer, and the
    /// caller keeps saying what it said before it asked.
    pub fn passkey_mark(
        &mut self,
        aaguid: &str,
        dark: bool,
        logical_px: u32,
    ) -> Option<Arc<RenderImage>> {
        if aaguid.is_empty() {
            return None;
        }
        let size = logical_px * RASTER_SCALE;
        let key = (aaguid.to_owned(), dark, size);
        if let Some(hit) = self.marks.get(&key) {
            return hit.clone();
        }
        let image = vela_core::passkey_provider_png(aaguid, dark, size)
            .ok()
            .flatten()
            .as_deref()
            .and_then(render_image_from_png);
        self.marks.insert(key, image.clone());
        image
    }
}
