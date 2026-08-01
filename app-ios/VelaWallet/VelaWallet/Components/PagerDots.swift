//
//  PagerDots.swift
//  VelaWallet
//
//  Six-dot pager: active dot accent-colored and pill-widened, inactive
//  subtle; every dot is a button with an expanded hit area (FR-004).
//

import SwiftUI

struct PagerDots: View {
    @Environment(\.theme) private var theme
    let count: Int
    @Binding var current: Int

    var body: some View {
        HStack(spacing: WelcomeGeometry.dotGap) {
            ForEach(0..<count, id: \.self) { index in
                let active = index == current
                Button {
                    current = index
                } label: {
                    Capsule()
                        .fill(active ? theme.accentBase : theme.fgSubtle)
                        .frame(width: active ? WelcomeGeometry.dotActiveWidth : WelcomeGeometry.dotSize,
                               height: WelcomeGeometry.dotSize)
                        .frame(minWidth: Tokens.Space.s24, minHeight: Tokens.Space.s24) // ≥24 pt hit area
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("\(index + 1)/\(count)"))
                .accessibilityAddTraits(active ? [.isSelected] : [])
            }
        }
        .animation(.easeOut(duration: Tokens.Motion.base), value: current)
        .accessibilityElement(children: .contain)
    }
}

#Preview("PagerDots") {
    struct Host: View {
        @State var page = 0
        var body: some View {
            PagerDots(count: 6, current: $page).padding().themed(.light)
        }
    }
    return Host()
}
