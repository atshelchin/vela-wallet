import SwiftUI

/// Displays a token logo with disk-cached remote image and text fallback.
/// - Native tokens: uses chain logo (eip155-{chainId}.png)
/// - ERC20 tokens: uses token logo (eip155-{chainId}/{address}/logo.png)
/// - Fallback: first letter of symbol in a colored circle
struct TokenLogo: View {
    let token: APIToken
    var size: CGFloat = 42

    var body: some View {
        CachedAsyncImage(url: token.logoURL) {
            fallbackView
        }
        .scaledToFit()
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    private var fallbackView: some View {
        ZStack {
            Circle()
                .fill(colorForSymbol(token.symbol))
            Text(String(token.symbol.prefix(1)))
                .font(.system(size: size * 0.38, weight: .bold))
                .foregroundStyle(.white)
        }
        .frame(width: size, height: size)
    }

    /// Generate a deterministic color from a symbol string.
    private func colorForSymbol(_ symbol: String) -> Color {
        let hash = symbol.unicodeScalars.reduce(0) { $0 &+ Int($1.value) }
        let colors: [Color] = [
            Color(hex: 0x627EEA), // blue
            Color(hex: 0x2775CA), // ocean
            Color(hex: 0xF5AC37), // gold
            Color(hex: 0x8247E5), // purple
            Color(hex: 0x28A0F0), // sky
            Color(hex: 0xE84142), // red
            Color(hex: 0x2D8E5F), // green
            Color(hex: 0xF0B90B), // yellow
        ]
        return colors[abs(hash) % colors.count]
    }
}
