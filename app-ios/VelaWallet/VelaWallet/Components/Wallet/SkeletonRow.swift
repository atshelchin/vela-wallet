//
//  SkeletonRow.swift
//  VelaWallet
//
//  SkeletonRow / SkeletonBlock (spec 015 vocabulary #12): loading
//  placeholders matching row geometry (mock H3). Pulse via opacity
//  oscillation; static under Reduce Motion.
//

import SwiftUI

/// Shared pulsing modifier for all skeleton shapes.
struct SkeletonPulse: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var dimmed = false

    func body(content: Content) -> some View {
        content
            .opacity(dimmed && !reduceMotion ? Tokens.Opacity.dim : 1)
            .animation(
                reduceMotion ? nil : .easeInOut(duration: Tokens.Motion.slow).repeatForever(autoreverses: true),
                value: dimmed
            )
            .onAppear { dimmed = true }
    }
}

/// A single loading bar/block.
struct SkeletonBlock: View {
    @Environment(\.theme) private var theme
    let width: CGFloat
    let height: CGFloat

    var body: some View {
        RoundedRectangle(cornerRadius: Tokens.Radius.r8)
            .fill(theme.bgRaised)
            .frame(width: width, height: height)
            .modifier(SkeletonPulse())
    }
}

/// One list-row placeholder: leading circle + title bar + trailing value bar.
struct SkeletonRow: View {
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: Tokens.Space.s12) {
            Circle()
                .fill(theme.bgRaised)
                .frame(width: WalletGeometry.rowIcon, height: WalletGeometry.rowIcon)
            RoundedRectangle(cornerRadius: Tokens.Radius.r4)
                .fill(theme.bgRaised)
                .frame(width: WalletGeometry.skeletonTitleWidth, height: WalletGeometry.skeletonBarHeight)
            Spacer(minLength: Tokens.Space.s12)
            RoundedRectangle(cornerRadius: Tokens.Radius.r4)
                .fill(theme.bgRaised)
                .frame(width: WalletGeometry.skeletonValueWidth, height: WalletGeometry.skeletonBarHeight)
        }
        .frame(minHeight: WalletGeometry.rowMinHeight)
        .modifier(SkeletonPulse())
        .accessibilityHidden(true)
    }
}

#Preview("Skeletons dark") {
    VStack(alignment: .leading, spacing: Tokens.Space.s16) {
        SkeletonBlock(width: WalletGeometry.skeletonBalanceWidth, height: WalletGeometry.skeletonBalanceHeight)
        SkeletonRow()
        SkeletonRow()
    }
    .padding(Tokens.Space.s24)
    .background(Tokens.dark.bgBase.color)
    .themed(.dark)
}

#Preview("Skeletons light") {
    VStack(alignment: .leading, spacing: Tokens.Space.s16) {
        SkeletonBlock(width: WalletGeometry.skeletonBalanceWidth, height: WalletGeometry.skeletonBalanceHeight)
        SkeletonRow()
    }
    .padding(Tokens.Space.s24)
    .themed(.light)
}
