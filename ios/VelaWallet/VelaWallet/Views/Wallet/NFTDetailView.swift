import SwiftUI

struct NFTDetailView: View {
    @Environment(\.dismiss) private var dismiss
    let nft: APINFT

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                VelaNavBar(title: "NFT", onBack: { dismiss() })

                // Image
                CachedAsyncImage(url: nft.imageURL) {
                    ZStack {
                        Rectangle().fill(VelaColor.bgWarm)
                        Image(systemName: "photo")
                            .font(.system(size: 40))
                            .foregroundStyle(VelaColor.textTertiary)
                    }
                }
                .scaledToFit()
                .frame(maxWidth: .infinity)
                .frame(maxHeight: 360)
                .clipShape(RoundedRectangle(cornerRadius: VelaRadius.card))
                .padding(.horizontal, VelaSpacing.screenH)

                // Title
                VStack(spacing: 6) {
                    Text(nft.displayName)
                        .font(VelaFont.heading(22))
                        .foregroundStyle(VelaColor.textPrimary)

                    if let collection = nft.collectionName {
                        Text(collection)
                            .font(VelaFont.body(14))
                            .foregroundStyle(VelaColor.textTertiary)
                    }
                }
                .padding(.top, 20)
                .padding(.bottom, 16)

                // Description
                if let desc = nft.description, !desc.isEmpty {
                    Text(desc)
                        .font(VelaFont.body(14))
                        .foregroundStyle(VelaColor.textSecondary)
                        .lineSpacing(4)
                        .padding(.horizontal, VelaSpacing.screenH)
                        .padding(.bottom, 16)
                }

                // Details
                VStack(spacing: 0) {
                    NFTInfoRow(label: String(localized: "token.network"), value: nft.chainName)
                    NFTInfoRow(label: String(localized: "token.type"), value: nft.tokenType)
                    NFTInfoRow(label: "Token ID", value: nft.tokenId.count > 12 ? "\(nft.tokenId.prefix(8))..." : nft.tokenId)
                    NFTInfoRow(label: String(localized: "token.contract"), value: "\(nft.contractAddress.prefix(8))...\(nft.contractAddress.suffix(6))", copyValue: nft.contractAddress, isLast: true)
                }
                .background(VelaColor.bgCard)
                .clipShape(RoundedRectangle(cornerRadius: VelaRadius.card))
                .overlay(
                    RoundedRectangle(cornerRadius: VelaRadius.card)
                        .stroke(VelaColor.border, lineWidth: 1)
                )
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
        }
        .background(VelaColor.bg)
    }
}

private struct NFTInfoRow: View {
    let label: String
    let value: String
    var copyValue: String? = nil
    var isLast: Bool = false
    @State private var copied = false

    var body: some View {
        HStack {
            Text(label)
                .font(.system(size: 13))
                .foregroundStyle(VelaColor.textTertiary)
            Spacer()

            if let cv = copyValue {
                Button {
                    UIPasteboard.general.string = cv
                    copied = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { copied = false }
                } label: {
                    HStack(spacing: 4) {
                        Text(value)
                            .font(VelaFont.mono(12))
                            .foregroundStyle(VelaColor.textPrimary)
                        Image(systemName: copied ? "checkmark" : "doc.on.doc")
                            .font(.system(size: 10))
                            .foregroundStyle(VelaColor.textTertiary)
                    }
                }
            } else {
                Text(value)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(VelaColor.textPrimary)
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 13)
        .overlay(alignment: .bottom) {
            if !isLast { VelaColor.border.frame(height: 1) }
        }
    }
}
