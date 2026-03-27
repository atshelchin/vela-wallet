import SwiftUI

/// Displays a chain logo from remote URL with disk cache and text fallback.
struct ChainLogo: View {
    let chainId: Int
    let fallbackLabel: String
    let fallbackColor: Color
    let fallbackBg: Color
    var size: CGFloat = 32

    private var logoURL: URL? {
        URL(string: "https://ethereum-data.awesometools.dev/chainlogos/eip155-\(chainId).png")
    }

    var body: some View {
        CachedAsyncImage(url: logoURL) {
            ZStack {
                RoundedRectangle(cornerRadius: size * 0.25)
                    .fill(fallbackBg)
                Text(fallbackLabel)
                    .font(.system(size: size * 0.32, weight: .bold))
                    .foregroundStyle(fallbackColor)
            }
            .frame(width: size, height: size)
        }
        .scaledToFit()
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.25))
    }
}
