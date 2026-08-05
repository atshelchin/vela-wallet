//
//  PagerDots.swift
//  VelaWallet
//
//  Six-dot pager: active dot accent-colored and pill-widened, inactive subtle.
//
//  The hit area is the WHOLE ROW, not a per-dot box (FR-004). That distinction
//  is load-bearing: the first version gave each dot a `.frame(minWidth: 24)` to
//  reach the touch-target floor, but in SwiftUI that frame expands LAYOUT too —
//  a 6 pt dot occupied 24 pt, and with the 8 pt HStack spacing the dots sat 32 pt
//  apart instead of the intended 14. Android never had the problem because it
//  makes the row the target and maps a tap to the nearest dot by x; this now
//  does the same, so the dots keep their true pitch and the target stays 44 pt.
//

import SwiftUI

struct PagerDots: View {
    @Environment(\.theme) private var theme
    let count: Int
    @Binding var current: Int

    var body: some View {
        GeometryReader { proxy in
            HStack(spacing: WelcomeGeometry.dotGap) {
                ForEach(0..<count, id: \.self) { index in
                    let active = index == current
                    Capsule()
                        .fill(active ? theme.accentBase : theme.fgSubtle)
                        .frame(
                            width: active ? WelcomeGeometry.dotActiveWidth : WelcomeGeometry.dotSize,
                            height: WelcomeGeometry.dotSize
                        )
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
            .contentShape(Rectangle())
            .onTapGesture { location in
                // Nearest dot by horizontal position, exactly as Android does it:
                // the per-dot hit rects tile the row rather than leaving gaps.
                let pitch = proxy.size.width / CGFloat(count)
                let index = Int(location.x / pitch)
                current = min(max(index, 0), count - 1)
            }
        }
        // One 44 pt-tall target for the row, instead of six inflated per-dot
        // boxes that pushed the dots apart.
        .frame(height: WelcomeGeometry.dotRowHeight)
        .animation(.easeOut(duration: Tokens.Motion.base), value: current)
        // One adjustable element rather than six buttons: the idiomatic VoiceOver
        // shape for a pager, and it reads the position out loud instead of making
        // the user swipe through six unlabelled dots.
        .accessibilityElement(children: .ignore)
        .accessibilityIdentifier("pagerDots")
        .accessibilityValue(Text(verbatim: "\(current + 1)/\(count)"))
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: if current < count - 1 { current += 1 }
            case .decrement: if current > 0 { current -= 1 }
            @unknown default: break
            }
        }
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
