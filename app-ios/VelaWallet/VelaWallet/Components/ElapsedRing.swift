//
//  ElapsedRing.swift
//  VelaWallet
//
//  The single authoritative elapsed-seconds ring (spec 014): a frozen
//  open arc with the centered 1–2 digit value — the ring never resizes
//  between digit counts and NO timer drives it (FR-011); the value comes
//  from state, the a11y label from onboarding.common.waitedSeconds.
//

import SwiftUI

struct ElapsedRing: View {
    @Environment(\.theme) private var theme
    let seconds: Int
    /// Resolved 已等待 N 秒 label.
    let a11yLabel: String

    var body: some View {
        ZStack {
            Circle()
                .stroke(theme.borderBase, lineWidth: FlowGeometry.ringLineWidth)
            Circle()
                .trim(from: 0, to: FlowGeometry.ringSweep)
                .stroke(
                    theme.accentBase,
                    style: StrokeStyle(lineWidth: FlowGeometry.ringLineWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(FlowGeometry.ringStartDegrees))
            Text(verbatim: "\(seconds)")
                .monospacedDigit()
                .typeRole(Typography.label)
                .foregroundStyle(theme.fgBase)
                .lineLimit(1)
        }
        .frame(width: FlowGeometry.ringSize, height: FlowGeometry.ringSize)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(a11yLabel)
    }
}

#Preview("Elapsed ring") {
    HStack(spacing: Tokens.Space.s24) {
        ElapsedRing(seconds: 8, a11yLabel: "已等待 8 秒")
        ElapsedRing(seconds: 19, a11yLabel: "已等待 19 秒")
        ElapsedRing(seconds: 41, a11yLabel: "已等待 41 秒")
    }
    .padding(Tokens.Space.s24)
    .themed(.light)
}

#Preview("Elapsed ring dark") {
    HStack(spacing: Tokens.Space.s24) {
        ElapsedRing(seconds: 8, a11yLabel: "已等待 8 秒")
        ElapsedRing(seconds: 19, a11yLabel: "已等待 19 秒")
        ElapsedRing(seconds: 41, a11yLabel: "已等待 41 秒")
    }
    .padding(Tokens.Space.s24)
    .background(Tokens.dark.bgRaised.color)
    .themed(.dark)
}
