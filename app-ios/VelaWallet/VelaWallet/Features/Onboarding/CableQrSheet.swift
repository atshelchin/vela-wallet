//
//  CableQrSheet.swift
//  VelaWallet
//
//  "Sign in with your phone": the caBLE QR the OTHER device scans. Shown while
//  a Hybrid ceremony is finding and talking to that phone; replaced by the
//  touch sheet the moment the phone connects, and cleared however the ceremony
//  ends. The matrix comes from the core (cableQrMatrix, the same encoder every
//  platform draws with), so this view owns only pixels.
//

import SwiftUI
import VelaCore

struct CableQrSheet: View {
    @Environment(\.theme) private var theme
    let loc: Loc
    let payload: String

    var body: some View {
        VStack(spacing: Tokens.Space.s16) {
            // Reusing the hybrid-method copy ("Phone or tablet" / "Scan a code
            // …on a nearby device") rather than minting new corpus keys across
            // 15 locales for a first cut; dedicated copy is an i18n-gate
            // follow-up.
            Text(loc.t(I18nKeys.Create.methodHybridTitle))
                .typeRole(Typography.title)
                .foregroundStyle(theme.fgBase)
                .multilineTextAlignment(.center)

            Text(loc.t(I18nKeys.Create.methodHybridBody))
                .typeRole(Typography.body)
                .foregroundStyle(theme.fgMuted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            if let matrix = cableQrMatrix(text: payload) {
                QrView(matrix: matrix)
                    .aspectRatio(1, contentMode: .fit)
                    .frame(maxWidth: 260)
                    .padding(.top, Tokens.Space.s8)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Tokens.Layout.screenPaddingX)
        .padding(.vertical, Tokens.Space.s32)
        .presentationDetents([.large])
        .presentationDragIndicator(.hidden)
        .presentationBackground(theme.bgRaised)
        // Dismissing would strand a ceremony blocked on the scan; it times out
        // on its own instead, exactly like the touch sheet.
        .interactiveDismissDisabled(true)
    }
}

/// The module matrix as pixels: a light card with a quiet zone, dark modules
/// only. Always black-on-white regardless of theme — scanners want contrast,
/// not palette.
private struct QrView: View {
    let matrix: QrMatrix

    var body: some View {
        Canvas { context, size in
            let width = Int(matrix.width)
            let quiet = 2
            let units = CGFloat(width + quiet * 2)
            let cell = min(size.width, size.height) / units
            context.fill(
                Path(CGRect(origin: .zero, size: size)),
                with: .color(.white)
            )
            for row in 0..<width {
                for col in 0..<width {
                    guard matrix.modules[row * width + col] else { continue }
                    let rect = CGRect(
                        x: (CGFloat(col) + CGFloat(quiet)) * cell,
                        y: (CGFloat(row) + CGFloat(quiet)) * cell,
                        width: cell,
                        height: cell
                    )
                    context.fill(Path(rect), with: .color(.black))
                }
            }
        }
    }
}
