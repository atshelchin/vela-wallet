//
//  StepProgress.swift
//  VelaWallet
//
//  The single authoritative flow progress bar (spec 014): 5-segment
//  stepped mode for create (filled = accent, rest = border-level
//  neutral) and single partially-filled track for login (contract §5).
//  Decorative — the step caption / headline carry meaning for a11y.
//

import SwiftUI

struct StepProgress: View {
    enum Mode {
        /// `current` is 1-based; segments `< current` render filled.
        case stepped(current: Int, total: Int)
        /// Single track filled to `fill` (0…1).
        case single(fill: CGFloat)
    }

    @Environment(\.theme) private var theme
    let mode: Mode

    var body: some View {
        Group {
            switch mode {
            case .stepped(let current, let total):
                HStack(spacing: FlowGeometry.barGap) {
                    ForEach(0..<total, id: \.self) { index in
                        Capsule()
                            .fill(index < current ? theme.accentBase : theme.borderBase)
                            .frame(maxWidth: .infinity)
                    }
                }
            case .single(let fill):
                GeometryReader { proxy in
                    ZStack(alignment: .leading) {
                        Capsule().fill(theme.borderBase)
                        Capsule()
                            .fill(theme.accentBase)
                            .frame(width: proxy.size.width * min(max(fill, 0), 1))
                    }
                }
            }
        }
        .frame(height: FlowGeometry.barHeight)
        .accessibilityHidden(true)
    }
}

#Preview("Step progress") {
    VStack(spacing: Tokens.Space.s24) {
        StepProgress(mode: .stepped(current: 1, total: 5))
        StepProgress(mode: .stepped(current: 3, total: 5))
        StepProgress(mode: .stepped(current: 5, total: 5))
        StepProgress(mode: .single(fill: FlowGeometry.loginBarFill))
    }
    .padding(Tokens.Space.s24)
    .themed(.light)
}

#Preview("Step progress dark") {
    VStack(spacing: Tokens.Space.s24) {
        StepProgress(mode: .stepped(current: 1, total: 5))
        StepProgress(mode: .stepped(current: 5, total: 5))
        StepProgress(mode: .single(fill: FlowGeometry.loginBarFill))
    }
    .padding(Tokens.Space.s24)
    .background(Tokens.dark.bgRaised.color)
    .themed(.dark)
}
