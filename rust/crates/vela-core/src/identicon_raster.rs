//! PNG rasterization of the identicon, for platforms without an SVG renderer.
//!
//! Feature spec: `specs/015-wallet-home-ui/` (research.md D1). Compose, SwiftUI
//! and gpui all lack a full SVG renderer, and the artwork fragments use strokes,
//! ellipses and groups — a hand-written parser per platform would be three lossy
//! renderers guarding a verification signal. Instead the one renderer lives next
//! to the one generator: [`identicon_png`] rasterizes the exact string
//! [`crate::identicon::identicon_svg_circular`] emits, so a PNG on Android, iOS
//! and desktop and an inline `<svg>` on web are drawn from identical bytes.
//!
//! Seeds are NOT normalized here, mirroring `identicon_svg_circular` — callers
//! route through [`crate::identicon::normalize_seed`] first, same as every other
//! entry point.

use crate::error::CoreError;
use crate::identicon::{
    assemble_svg_circular, identicon_params, IDENTICON_PLACEHOLDER,
};

/// Upper bound on the requested edge length. 1024 px covers a 256 pt avatar at
/// 4× density; anything larger is a caller bug, not a use case, and the bound
/// keeps a bad FFI argument from allocating gigabytes.
pub const IDENTICON_RASTER_MAX_PX: u32 = 1024;

fn rasterize(svg: &str, size_px: u32) -> Result<Vec<u8>, CoreError> {
    if size_px == 0 || size_px > IDENTICON_RASTER_MAX_PX {
        return Err(CoreError::Internal(format!(
            "identicon raster size must be 1..={IDENTICON_RASTER_MAX_PX} px, got {size_px}"
        )));
    }

    // The inputs are our own compile-time strings plus palette hex colours, so a
    // parse failure is an internal invariant violation, never bad user input.
    let options = resvg::usvg::Options::default();
    let tree = resvg::usvg::Tree::from_str(svg, &options)
        .map_err(|e| CoreError::Internal(format!("identicon raster: svg parse: {e}")))?;

    let mut pixmap = resvg::tiny_skia::Pixmap::new(size_px, size_px).ok_or_else(|| {
        CoreError::Internal(format!("identicon raster: pixmap alloc failed at {size_px} px"))
    })?;

    let size = tree.size();
    #[allow(clippy::cast_precision_loss)] // size_px <= 1024, exact in f32
    let transform = resvg::tiny_skia::Transform::from_scale(
        size_px as f32 / size.width(),
        size_px as f32 / size.height(),
    );
    resvg::render(&tree, transform, &mut pixmap.as_mut());

    pixmap
        .encode_png()
        .map_err(|e| CoreError::Internal(format!("identicon raster: png encode: {e}")))
}

/// **The wallet's identicon, as PNG bytes.** Circular variant rendered at
/// `size_px` × `size_px`. Same seed contract as
/// [`crate::identicon::identicon_svg_circular`]: invalid seeds are rejected, and
/// callers normalize first.
pub fn identicon_png(seed: &str, size_px: u32) -> Result<Vec<u8>, CoreError> {
    rasterize(&assemble_svg_circular(&identicon_params(seed)?), size_px)
}

/// The shared placeholder artwork as PNG bytes — the fallback platforms show
/// when a seed is invalid or empty (spec 015 FR-006 / US3 edge case).
pub fn identicon_placeholder_png(size_px: u32) -> Result<Vec<u8>, CoreError> {
    rasterize(IDENTICON_PLACEHOLDER, size_px)
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG_MAGIC: [u8; 8] = [0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1A, b'\n'];
    const SEED: &str = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";

    /// Width and height from the IHDR chunk, which always follows the magic.
    fn ihdr_dimensions(png: &[u8]) -> (u32, u32) {
        let w = u32::from_be_bytes(png[16..20].try_into().expect("IHDR width"));
        let h = u32::from_be_bytes(png[20..24].try_into().expect("IHDR height"));
        (w, h)
    }

    #[test]
    fn renders_a_png_at_the_requested_size() {
        for size in [1_u32, 40, 160, IDENTICON_RASTER_MAX_PX] {
            let png = identicon_png(SEED, size).expect("valid seed must rasterize");
            assert_eq!(png[..8], PNG_MAGIC, "not a PNG at {size} px");
            assert_eq!(ihdr_dimensions(&png), (size, size));
        }
    }

    #[test]
    fn output_is_deterministic() {
        let a = identicon_png(SEED, 80).expect("rasterize");
        let b = identicon_png(SEED, 80).expect("rasterize");
        assert_eq!(a, b, "same seed and size must produce identical bytes");
    }

    #[test]
    fn invalid_seed_is_rejected_like_the_svg_path() {
        let degenerate = "x".repeat(2000);
        assert!(identicon_png(&degenerate, 80).is_err());
    }

    #[test]
    fn size_bounds_are_enforced() {
        assert!(identicon_png(SEED, 0).is_err());
        assert!(identicon_png(SEED, IDENTICON_RASTER_MAX_PX + 1).is_err());
    }

    #[test]
    fn placeholder_rasterizes() {
        let png = identicon_placeholder_png(64).expect("placeholder must rasterize");
        assert_eq!(png[..8], PNG_MAGIC);
        assert_eq!(ihdr_dimensions(&png), (64, 64));
    }
}
