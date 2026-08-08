//
//  LucideIcon.swift
//  VelaWallet
//
//  Renders a `LucideGlyph` via vela-core's `rasterizeSvgPng` (spec 015,
//  research.md D2 rev): the white-painted corpus SVG becomes a template
//  UIImage, tinted by whatever `.foregroundStyle` the call site sets — the
//  same tinting contract SF Symbols had, so call sites only swapped the
//  image source. Rasterizations are cached per glyph + pixel size; the
//  renderer is environment-injectable so #Previews run without the dylib
//  (mirrors IdenticonProvider).
//

import SwiftUI
import VelaCore

/// PNG renderer contract. `.live` calls vela-core; `.previewSafe` returns nil
/// so the icon renders its placeholder shape.
struct LucideIconProvider {
    let png: (_ svg: String, _ sizePx: UInt32) -> Data?

    static let live = LucideIconProvider { svg, sizePx in
        try? rasterizeSvgPng(svg: svg, sizePx: sizePx)
    }

    static let previewSafe = LucideIconProvider { _, _ in nil }
}

private struct LucideIconProviderKey: EnvironmentKey {
    static let defaultValue = LucideIconProvider.live
}

extension EnvironmentValues {
    var lucideIconProvider: LucideIconProvider {
        get { self[LucideIconProviderKey.self] }
        set { self[LucideIconProviderKey.self] = newValue }
    }
}

/// Template-image cache keyed by glyph + pixel size (glyphs are pure
/// functions of both, so entries never invalidate).
@MainActor
private enum LucideIconCache {
    private static let cache = NSCache<NSString, UIImage>()

    static func image(
        glyph: LucideGlyph,
        sizePx: UInt32,
        scale: CGFloat,
        provider: LucideIconProvider
    ) -> UIImage? {
        let key = "\(glyph.rawValue)|\(sizePx)" as NSString
        if let hit = cache.object(forKey: key) { return hit }
        guard let data = provider.png(glyph.svg, sizePx),
              let image = UIImage(data: data, scale: scale)?
                  .withRenderingMode(.alwaysTemplate) else { return nil }
        cache.setObject(image, forKey: key)
        return image
    }
}

struct LucideIcon: View {
    @Environment(\.displayScale) private var displayScale
    @Environment(\.lucideIconProvider) private var provider

    let glyph: LucideGlyph
    let size: CGFloat

    init(_ glyph: LucideGlyph, size: CGFloat) {
        self.glyph = glyph
        self.size = size
    }

    var body: some View {
        let sizePx = UInt32(max(1, (size * displayScale).rounded()))
        if let image = LucideIconCache.image(
            glyph: glyph, sizePx: sizePx, scale: displayScale, provider: provider
        ) {
            Image(uiImage: image)
                .renderingMode(.template)
                .resizable()
                .frame(width: size, height: size)
        } else {
            // Renderer unavailable (previews): a quiet placeholder in the
            // inherited tint, no crash.
            RoundedRectangle(cornerRadius: size / 6)
                .opacity(Tokens.Opacity.dim)
                .frame(width: size, height: size)
        }
    }
}

#Preview("Lucide icons (placeholder-safe)") {
    HStack(spacing: Tokens.Space.s12) {
        LucideIcon(.navWalletSolid, size: LucideIconSize.tab)
        LucideIcon(.navContactsOutline, size: LucideIconSize.tab)
        LucideIcon(.navExploreOutline, size: LucideIconSize.tab)
        LucideIcon(.navSettingsOutline, size: LucideIconSize.tab)
    }
    .padding()
    .environment(\.lucideIconProvider, .previewSafe)
    .themed(.light)
}
