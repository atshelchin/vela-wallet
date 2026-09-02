//
//  LetterAvatarView.swift
//  VelaWallet
//
//  A site or token's mark (spec 022): its first letter on a wash of its own
//  brand colour. Deliberately NOT a fetched favicon — a wallet that
//  downloads an icon from the site it is about to warn you about has handed
//  that site a tracking pixel and a way to impersonate a brand.
//

import SwiftUI

struct LetterAvatarView: View {
    @Environment(\.theme) private var theme

    let letter: String
    let tint: Color
    var size: CGFloat = ExploreGeometry.rowAvatar
    /// Muted rendering for the unknown-site case.
    var muted = false

    var body: some View {
        Text(verbatim: letter)
            .font(.custom(FontName.bold, size: size * 0.42))
            .foregroundStyle(muted ? theme.fgMuted : tint)
            .frame(width: size, height: size)
            .background(muted ? AnyShapeStyle(theme.bgSunken) : AnyShapeStyle(tint.opacity(0.16)),
                        in: Circle())
            .accessibilityHidden(true)
    }
}
