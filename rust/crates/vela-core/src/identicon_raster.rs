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
use crate::identicon::{assemble_svg_circular, identicon_params, IDENTICON_PLACEHOLDER};

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
        CoreError::Internal(format!(
            "identicon raster: pixmap alloc failed at {size_px} px"
        ))
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

/// **A passkey provider's mark, as PNG bytes.**
///
/// Same argument as the identicon below: SwiftUI, Compose and gpui have no SVG
/// renderer, so the one renderer that already lives here draws the catalog's
/// artwork for them, while the web takes the same markup as a data URI.
///
/// `Ok(None)` when the AAGUID is unknown or the provider ships no mark — the
/// caller degrades to what it knew before it asked, which is never an error.
pub fn passkey_provider_png(
    aaguid: &str,
    dark: bool,
    size_px: u32,
) -> Result<Option<Vec<u8>>, CoreError> {
    let Some(svg) = crate::passkey::provider(aaguid).and_then(|p| p.icon_svg(dark)) else {
        return Ok(None);
    };
    rasterize(svg, size_px).map(Some)
}

/// **A fallback mark as PNG bytes** — the security-key artwork for a key the
/// provider catalog cannot name. `Ok(None)` when the row deserves no mark of
/// this kind (a platform authenticator), which the caller already draws.
pub fn passkey_fallback_png(
    authenticator_attachment: &str,
    transports: &str,
    chose_security_key: bool,
    palette: crate::passkey::MarkPalette,
    size_px: u32,
) -> Result<Option<Vec<u8>>, CoreError> {
    let Some(mark) =
        crate::passkey::fallback_mark(authenticator_attachment, transports, chose_security_key)
    else {
        return Ok(None);
    };
    rasterize(&crate::passkey::fallback_svg(mark, palette), size_px).map(Some)
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

/// Rasterize an app-authored SVG document (the spec 015 icon corpus) to a
/// square PNG. Exists for the platforms without an SVG renderer whose icons
/// must match the lucide corpus exactly (research.md D2 revision): callers pass
/// compile-time constant markup, tint by substituting the color before calling,
/// and treat the output as a template image. Same size cap as the identicon
/// path.
pub fn rasterize_svg_png(svg: &str, size_px: u32) -> Result<Vec<u8>, CoreError> {
    rasterize(svg, size_px)
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;

    const PNG_MAGIC: [u8; 8] = [0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1A, b'\n'];
    const SEED: &str = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";

    /// Width and height from the IHDR chunk, which always follows the magic.
    /// Out-of-range reads yield 0, which no assertion below accepts.
    fn ihdr_dimensions(png: &[u8]) -> (u32, u32) {
        let word = |at: usize| -> u32 {
            png.get(at..at + 4)
                .and_then(|bytes| <[u8; 4]>::try_from(bytes).ok())
                .map_or(0, u32::from_be_bytes)
        };
        (word(16), word(20))
    }

    #[test]
    fn a_fallback_mark_renders_only_for_the_keys_that_have_one() {
        let palette = crate::passkey::MarkPalette {
            strong: "#6E6B62",
            soft: "#D8D4CB",
            hole: "#FAFAF8",
        };
        let png = passkey_fallback_png("cross-platform", "usb", false, palette, 40)
            .expect("renders")
            .expect("a usb key has a mark");
        assert_eq!(png[..8], PNG_MAGIC);
        assert_eq!(ihdr_dimensions(&png), (40, 40));

        assert!(
            passkey_fallback_png("platform", "internal", false, palette, 40)
                .expect("renders")
                .is_none(),
            "a platform authenticator keeps the client's own glyph"
        );
    }

    #[test]
    fn a_provider_mark_renders_at_the_requested_size() {
        // Windows Hello: four blue squares, published in both themes.
        let png = passkey_provider_png("08987058-cadc-4b81-b6e1-30de50dcbe96", false, 48)
            .expect("known provider rasterizes")
            .expect("and ships a mark");
        assert_eq!(png[..8], PNG_MAGIC);
        assert_eq!(ihdr_dimensions(&png), (48, 48));
    }

    #[test]
    fn an_unknown_aaguid_is_none_not_an_error() {
        assert!(passkey_provider_png("", false, 48)
            .expect("no error")
            .is_none());
        assert!(
            passkey_provider_png("2fc0579f-8113-47ea-b116-bb5a8db9202a", true, 48)
                .expect("no error")
                .is_none(),
            "hardware keys are not in this catalog"
        );
    }

    #[test]
    fn renders_a_png_at_the_requested_size() {
        for size in [1_u32, 40, 160, IDENTICON_RASTER_MAX_PX] {
            let png = identicon_png(SEED, size).unwrap_or_default();
            assert!(png.len() > 24, "no PNG produced at {size} px");
            assert_eq!(png[..8], PNG_MAGIC, "not a PNG at {size} px");
            assert_eq!(ihdr_dimensions(&png), (size, size));
        }
    }

    #[test]
    fn output_is_deterministic() {
        let a = identicon_png(SEED, 80).unwrap_or_default();
        let b = identicon_png(SEED, 80).unwrap_or_default();
        assert!(!a.is_empty(), "rasterization must succeed for a valid seed");
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
        let png = identicon_placeholder_png(64).unwrap_or_default();
        assert!(png.len() > 24, "placeholder must rasterize");
        assert_eq!(png[..8], PNG_MAGIC);
        assert_eq!(ihdr_dimensions(&png), (64, 64));
    }
}
