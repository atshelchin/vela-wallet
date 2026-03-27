import SwiftUI
import CoreImage.CIFilterBuiltins

struct ReceiveView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(WalletState.self) private var wallet
    @State private var copied = false
    @State private var qrImage: UIImage?
    @State private var depositDetected = false
    @State private var depositInfo: String?
    @State private var initialBalances: [String: Double] = [:]
    @State private var isPolling = true

    private let supportedNetworks = Network.defaults

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                VelaNavBar(title: "receive.title", onBack: { dismiss() })

                VStack(spacing: 20) {
                    // QR Code
                    ZStack {
                        RoundedRectangle(cornerRadius: 24)
                            .fill(VelaColor.bgCard)
                            .overlay(
                                RoundedRectangle(cornerRadius: 24)
                                    .stroke(VelaColor.border, lineWidth: 1)
                            )
                            .shadow(color: .black.opacity(0.03), radius: 12, y: 4)

                        if let img = qrImage {
                            Image(uiImage: img)
                                .interpolation(.none)
                                .resizable()
                                .scaledToFit()
                                .padding(20)
                        }
                    }
                    .frame(width: 240, height: 240)

                    // Address + copy
                    Button {
                        UIPasteboard.general.string = wallet.address
                        copied = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { copied = false }
                    } label: {
                        HStack(spacing: 10) {
                            Text(wallet.address)
                                .font(VelaFont.mono(12))
                                .foregroundStyle(VelaColor.textSecondary)
                                .lineLimit(1)
                                .truncationMode(.middle)

                            Image(systemName: copied ? "checkmark" : "doc.on.doc")
                                .font(.system(size: 13))
                                .foregroundStyle(copied ? VelaColor.green : VelaColor.textTertiary)
                        }
                        .padding(.horizontal, 18)
                        .padding(.vertical, 14)
                        .frame(maxWidth: .infinity)
                        .background(VelaColor.bgWarm)
                        .clipShape(RoundedRectangle(cornerRadius: VelaRadius.card))
                    }

                    // Supported Networks — compact logo row
                    VStack(spacing: 10) {
                        Text("receive.supported_networks")
                            .font(.system(size: 11, weight: .semibold))
                            .tracking(1.5)
                            .foregroundStyle(VelaColor.textTertiary)

                        HStack(spacing: 10) {
                            ForEach(supportedNetworks) { network in
                                ChainLogo(
                                    chainId: network.chainId,
                                    fallbackLabel: network.iconLabel,
                                    fallbackColor: network.iconColor,
                                    fallbackBg: network.iconBg,
                                    size: 30
                                )
                            }
                        }
                    }

                    // Deposit detection banner
                    if depositDetected, let info = depositInfo {
                        HStack(spacing: 10) {
                            Image(systemName: "arrow.down.circle.fill")
                                .font(.system(size: 20))
                                .foregroundStyle(VelaColor.green)

                            VStack(alignment: .leading, spacing: 2) {
                                Text("receive.deposit_detected")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(VelaColor.green)
                                Text(info)
                                    .font(.system(size: 12))
                                    .foregroundStyle(VelaColor.textSecondary)
                            }

                            Spacer()
                        }
                        .padding(14)
                        .background(VelaColor.greenSoft)
                        .clipShape(RoundedRectangle(cornerRadius: VelaRadius.card))
                        .transition(.move(edge: .top).combined(with: .opacity))
                    }

                    // Listening indicator
                    if !depositDetected {
                        HStack(spacing: 6) {
                            Circle()
                                .fill(VelaColor.green)
                                .frame(width: 7, height: 7)
                                .opacity(isPolling ? 1 : 0.3)
                                .animation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true), value: isPolling)
                            Text("receive.listening")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(VelaColor.textTertiary)
                        }
                        .padding(.top, 4)
                    }

                    // Risk warning
                    Text("receive.warning")
                        .font(.system(size: 12))
                        .foregroundStyle(VelaColor.textTertiary)
                        .multilineTextAlignment(.center)
                        .lineSpacing(3)
                        .padding(.horizontal, 8)
                        .padding(.top, 4)

                    // Share button
                    ShareLink(item: wallet.address) {
                        HStack(spacing: 6) {
                            Image(systemName: "square.and.arrow.up")
                                .font(.system(size: 14))
                            Text("receive.share")
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
                .padding(.horizontal, 28)
                .padding(.top, 8)
                .padding(.bottom, 32)
            }
        }
        .background(VelaColor.bg)
        .onAppear {
            qrImage = generateQR(from: wallet.address)
        }
        .task {
            await startListening()
        }
        .onDisappear {
            isPolling = false
        }
    }

    // MARK: - Deposit Listening

    private func startListening() async {
        guard !wallet.address.isEmpty else { return }
        let api = WalletAPIService()

        // Snapshot initial balances
        if let tokens = try? await api.fetchTokens(address: wallet.address) {
            for token in tokens {
                initialBalances[token.id] = token.usdValue
            }
        }

        // Poll every 10 seconds
        while isPolling {
            try? await Task.sleep(for: .seconds(10))
            guard isPolling else { break }

            if let tokens = try? await api.fetchTokens(address: wallet.address) {
                for token in tokens {
                    let oldValue = initialBalances[token.id] ?? 0
                    if token.usdValue > oldValue + 0.001 {
                        // New deposit detected
                        let diff = token.balanceDouble - (oldValue / (token.priceUsd ?? 1))
                        withAnimation(.spring(duration: 0.4)) {
                            depositDetected = true
                            if diff > 0 {
                                depositInfo = "+\(formatBalance(diff)) \(token.symbol) on \(token.chainName)"
                            } else {
                                depositInfo = "\(token.symbol) on \(token.chainName)"
                            }
                        }
                        // Update snapshot
                        initialBalances[token.id] = token.usdValue

                        // Haptic feedback
                        let generator = UINotificationFeedbackGenerator()
                        generator.notificationOccurred(.success)

                        // Reset after 15 seconds
                        try? await Task.sleep(for: .seconds(15))
                        withAnimation { depositDetected = false; depositInfo = nil }
                        break
                    }
                }
            }
        }
    }

    private func formatBalance(_ value: Double) -> String {
        if value >= 1000 { return value.formatted(.number.precision(.fractionLength(2))) }
        if value >= 1 { return value.formatted(.number.precision(.fractionLength(4))) }
        return value.formatted(.number.precision(.significantDigits(4)))
    }

    private func generateQR(from string: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        filter.correctionLevel = "M"

        guard let ciImage = filter.outputImage else { return nil }
        let transform = CGAffineTransform(scaleX: 10, y: 10)
        let scaledImage = ciImage.transformed(by: transform)

        let context = CIContext()
        guard let cgImage = context.createCGImage(scaledImage, from: scaledImage.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}

#Preview {
    let state = WalletState()
    state.address = "0x7a3F8c2D1b4E9f6A5d3C0e8B7a2F4d6E1c9e92B"
    state.accounts = [Account(id: "1", name: "Personal", address: state.address, createdAt: Date())]
    return ReceiveView()
        .environment(state)
}
