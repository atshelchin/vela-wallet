//
//  QRPlaceholder.swift
//  VelaWallet
//
//  QRPlaceholder (spec 015 vocabulary #18, FR-009): deterministic 21×21
//  demo pattern — three standard finder squares + xorshift32(0x5EED)
//  noise, ported bit-for-bit from the web reference so screenshots diff
//  cleanly across platforms. Never encodes data; always captioned
//  演示占位图案 · 不可扫描. Drawn on an always-white card (mode-invariant
//  inks — mock D2).
//

import SwiftUI

struct QRPlaceholder: View {
    let caption: String

    /// Pure function of the fixed seed — computed once.
    private static let cells: [[Bool]] = makePattern()

    var body: some View {
        VStack(spacing: Tokens.Space.s12) {
            Canvas { context, size in
                let n = CGFloat(WalletGeometry.qrModules)
                let cell = size.width / n
                for (r, row) in Self.cells.enumerated() {
                    for (c, on) in row.enumerated() where on {
                        let rect = CGRect(
                            x: CGFloat(c) * cell,
                            y: CGFloat(r) * cell,
                            width: cell.rounded(.up),
                            height: cell.rounded(.up)
                        )
                        context.fill(Path(rect), with: .color(WalletGeometry.qrInk))
                    }
                }
            }
            .frame(width: WalletGeometry.qrSize, height: WalletGeometry.qrSize)
            .accessibilityLabel(Text(verbatim: caption))

            Text(verbatim: caption)
                .typeRole(Typography.caption)
                .foregroundStyle(WalletGeometry.qrInk)
                .opacity(Tokens.Opacity.dim)
        }
        .padding(Tokens.Space.s24)
        .background(RoundedRectangle(cornerRadius: Tokens.Radius.r16).fill(WalletGeometry.qrCard))
    }

    /// xorshift32 seeded 0x5EED over a 21×21 grid; finder rings match the
    /// web implementation exactly (JS 32-bit semantics ≙ UInt32 masking
    /// shifts). Row-major generation order is part of the contract.
    private static func makePattern() -> [[Bool]] {
        let n = WalletGeometry.qrModules
        var s: UInt32 = 0x5EED
        func next() -> UInt32 {
            s ^= s << 13
            s ^= s >> 17
            s ^= s << 5
            return s
        }
        func inFinder(_ r: Int, _ c: Int) -> Bool {
            (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7)
        }
        func finderOn(_ r: Int, _ c: Int) -> Bool {
            let lr = r < 7 ? r : r - (n - 7)
            let lc = c < 7 ? c : c - (n - 7)
            let ring = min(lr, lc, 6 - lr, 6 - lc)
            return ring != 1
        }
        return (0..<n).map { r in
            (0..<n).map { c in
                if inFinder(r, c) { return finderOn(r, c) }
                if next() & 3 == 0 { return false }
                return next() % 2 == 0
            }
        }
    }
}

#Preview("QR placeholder") {
    VStack(spacing: Tokens.Space.s24) {
        QRPlaceholder(caption: "演示占位图案 · 不可扫描")
    }
    .padding(Tokens.Space.s24)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Tokens.dark.bgBase.color)
    .themed(.dark)
}
