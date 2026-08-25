//
//  PasskeyProviderMark.swift
//  VelaWallet
//
//  The mark of the vault holding a passkey — Apple Passwords, 1Password,
//  Windows Hello — rasterized by vela-core from the AAGUID the authenticator
//  reported at registration (spec 019, founder call 2026-08-26).
//
//  Renders NOTHING when the catalog has no entry. That is a normal answer, not
//  a failure: hardware keys live in the FIDO metadata service rather than this
//  catalog, and an authenticator may report no AAGUID at all. The caller keeps
//  the glyph it always drew, which is what `key.method` is for.
//
//  The lookup is offline by construction — a directory service would learn
//  which vault holds this wallet's key, and that is nobody's business.
//

import SwiftUI
import VelaCore

/// Decoded-image cache keyed by AAGUID + theme + pixel size (the catalog is a
/// pure function of all three, so entries never invalidate).
@MainActor
private enum PasskeyMarkCache {
    private static let cache = NSCache<NSString, UIImage>()
    /// Misses are remembered too: an unknown AAGUID must not re-enter the FFI
    /// on every redraw of a list that scrolls.
    private static var misses: Set<String> = []

    static func image(aaguid: String, dark: Bool, sizePx: UInt32, scale: CGFloat) -> UIImage? {
        let key = "\(aaguid)|\(dark)|\(sizePx)"
        if misses.contains(key) { return nil }
        if let hit = cache.object(forKey: key as NSString) { return hit }
        guard let data = try? passkeyProviderPng(aaguid: aaguid, dark: dark, sizePx: sizePx),
              let image = UIImage(data: data, scale: scale) else {
            misses.insert(key)
            return nil
        }
        cache.setObject(image, forKey: key as NSString)
        return image
    }
}

struct PasskeyProviderMark: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.displayScale) private var displayScale

    let aaguid: String
    /// The provider's name — the mark's accessible label.
    let name: String
    var size: CGFloat = Tokens.Control.sm

    var body: some View {
        if let image = mark {
            Image(uiImage: image)
                .resizable()
                .frame(width: size, height: size)
                .accessibilityLabel(name)
        }
    }

    private var mark: UIImage? {
        guard !aaguid.isEmpty else { return nil }
        let pixels = UInt32((size * displayScale).rounded())
        return PasskeyMarkCache.image(
            aaguid: aaguid,
            dark: colorScheme == .dark,
            sizePx: pixels,
            scale: displayScale
        )
    }
}
