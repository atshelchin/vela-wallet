import SwiftUI

struct TokenDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(WalletState.self) private var wallet
    let token: APIToken

    @State private var showSend = false
    @State private var showReceive = false

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                VelaNavBar(title: "\(token.symbol)", onBack: { dismiss() })

                // Token header
                VStack(spacing: 16) {
                    TokenLogo(token: token, size: 64)

                    VStack(spacing: 4) {
                        Text(token.name)
                            .font(VelaFont.heading(22))
                            .foregroundStyle(VelaColor.textPrimary)
                        Text(token.chainName)
                            .font(VelaFont.body(14))
                            .foregroundStyle(VelaColor.textTertiary)
                    }

                    // Balance
                    VStack(spacing: 2) {
                        Text("\(formatBalance(token.balanceDouble)) \(token.symbol)")
                            .font(.system(size: 32, weight: .bold))
                            .foregroundStyle(VelaColor.textPrimary)
                            .tracking(-1)
                        if token.usdValue > 0 {
                            Text("$\(token.usdValue, specifier: "%.2f")")
                                .font(VelaFont.body(16))
                                .foregroundStyle(VelaColor.textTertiary)
                        }
                    }

                    // Actions
                    HStack(spacing: 12) {
                        Button { showSend = true } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "arrow.up")
                                    .font(.system(size: 14, weight: .semibold))
                                Text("home.send")
                                    .font(VelaFont.label(14))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 13)
                            .background(VelaColor.textPrimary)
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: VelaRadius.cardSmall))
                        }

                        Button { showReceive = true } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "arrow.down")
                                    .font(.system(size: 14, weight: .semibold))
                                Text("home.receive")
                                    .font(VelaFont.label(14))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 13)
                            .background(VelaColor.bgCard)
                            .foregroundStyle(VelaColor.textPrimary)
                            .clipShape(RoundedRectangle(cornerRadius: VelaRadius.cardSmall))
                            .overlay(
                                RoundedRectangle(cornerRadius: VelaRadius.cardSmall)
                                    .stroke(VelaColor.border, lineWidth: 1)
                            )
                        }
                    }
                }
                .padding(.horizontal, VelaSpacing.screenH)
                .padding(.bottom, 24)

                // Token Info
                VStack(alignment: .leading, spacing: 12) {
                    Text("token.info")
                        .font(.system(size: 11, weight: .semibold))
                        .tracking(1.5)
                        .foregroundStyle(VelaColor.textTertiary)
                        .padding(.horizontal, VelaSpacing.screenH)

                    VStack(spacing: 0) {
                        InfoRow(label: String(localized: "token.name"), value: token.name)
                        InfoRow(label: String(localized: "token.symbol"), value: token.symbol)
                        InfoRow(label: String(localized: "token.network"), value: token.chainName)
                        InfoRow(label: String(localized: "token.decimals"), value: "\(token.decimals)")

                        if let addr = token.tokenAddress {
                            InfoRow(label: String(localized: "token.contract"), value: addr, isMono: true, copyable: true)
                        } else {
                            InfoRow(label: String(localized: "token.type"), value: "Native", isLast: true)
                        }

                        if let price = token.priceUsd {
                            InfoRow(label: String(localized: "token.price"), value: "$\(String(format: "%.4f", price))", isLast: true)
                        }
                    }
                    .background(VelaColor.bgCard)
                    .clipShape(RoundedRectangle(cornerRadius: VelaRadius.card))
                    .overlay(
                        RoundedRectangle(cornerRadius: VelaRadius.card)
                            .stroke(VelaColor.border, lineWidth: 1)
                    )
                    .padding(.horizontal, 16)
                }
                .padding(.bottom, 32)
            }
        }
        .background(VelaColor.bg)
        .sheet(isPresented: $showSend) { SendView(preselectedToken: token) }
        .sheet(isPresented: $showReceive) { ReceiveView() }
    }

    private func formatBalance(_ value: Double) -> String {
        if value == 0 { return "0" }
        if value >= 1000 { return value.formatted(.number.precision(.fractionLength(2))) }
        if value >= 1 { return value.formatted(.number.precision(.fractionLength(4))) }
        return value.formatted(.number.precision(.significantDigits(4)))
    }
}

// MARK: - Info Row

private struct InfoRow: View {
    let label: String
    let value: String
    var isMono: Bool = false
    var copyable: Bool = false
    var isLast: Bool = false

    @State private var copied = false

    var body: some View {
        HStack {
            Text(label)
                .font(.system(size: 13))
                .foregroundStyle(VelaColor.textTertiary)

            Spacer()

            if copyable {
                Button {
                    UIPasteboard.general.string = value
                    copied = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { copied = false }
                } label: {
                    HStack(spacing: 4) {
                        Text(value.count > 20 ? "\(value.prefix(8))...\(value.suffix(6))" : value)
                            .font(isMono ? VelaFont.mono(12) : .system(size: 13))
                            .foregroundStyle(VelaColor.textPrimary)
                        Image(systemName: copied ? "checkmark" : "doc.on.doc")
                            .font(.system(size: 10))
                            .foregroundStyle(VelaColor.textTertiary)
                    }
                }
            } else {
                Text(value)
                    .font(isMono ? VelaFont.mono(13) : .system(size: 13, weight: .medium))
                    .foregroundStyle(VelaColor.textPrimary)
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 13)
        .overlay(alignment: .bottom) {
            if !isLast {
                VelaColor.border.frame(height: 1)
            }
        }
    }
}
